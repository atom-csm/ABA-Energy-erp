"use server"

/**
 * CR-001 ST-3 — real project document/photo/video uploads. See
 * docs/PROJECT_PIPELINE_REDESIGN.md for the design rationale and
 * lib/pipeline/documents.ts for the pure path/validation helpers this file
 * is thin glue around.
 *
 * Upload flow is deliberately split in two (`createUploadUrl` /
 * `confirmUpload`) so the client uploads bytes directly to Storage via a
 * signed URL instead of proxying potentially large photo/video payloads
 * through a serverless function — important given this app's mobile/
 * poor-connectivity focus. The `project_documents` row is only created once
 * the file has actually landed.
 *
 * This file is intentionally not unit-tested itself: it's thin DB/IO glue
 * around Supabase Storage + Postgres, matching the pattern already
 * documented for other thin wrappers in
 * docs/wiki/06-testing-and-tooling.md's "Coverage gaps" (e.g. `lib/auth.ts`,
 * `lib/audit.ts`) — mocking the Supabase client here would just be
 * re-testing the mock. The logic worth testing (filename/extension
 * validation, path construction, the delete-ordering/orphan-guard decision)
 * is pure and fully covered by lib/pipeline/documents.test.ts. True
 * cross-org isolation (storage + table RLS) can only be verified against a
 * live Supabase instance — see the ST-3 report for that manual-verification
 * note.
 */

import { revalidatePath } from "next/cache"
import { z } from "zod"

import { createClient as createSupabaseClient } from "@/lib/supabase/server"
import { requireOrgContext } from "@/lib/auth"
import { Constants } from "@/lib/types/database"
import type { Tables } from "@/lib/types/database"
import {
  DOCUMENT_KINDS,
  isAllowedFilename,
  buildStoragePath,
  deleteWithOrphanGuard,
} from "@/lib/pipeline/documents"

const PROJECT_STAGE = Constants.public.Enums.project_stage
const DOCUMENTS_BUCKET = "project-media"
/** How long a generated read URL stays valid before a fresh one is needed. */
const SIGNED_READ_TTL_SECONDS = 60 * 60 // 1 hour

const optionalText = z
  .string()
  .trim()
  .max(500)
  .optional()
  .transform((v) => (v ? v : undefined))

// ── createUploadUrl ──────────────────────────────────────────────────────────

const CreateUploadUrlInput = z.object({
  projectId: z.string().min(1),
  stage: z.enum(PROJECT_STAGE),
  kind: z.enum(DOCUMENT_KINDS),
  filename: z.string().trim().min(1, "Filename is required"),
})

export type CreateUploadUrlResult =
  | { error: string }
  | { error?: undefined; path: string; token: string; signedUrl: string }

/**
 * Validates the project belongs to the caller's org (RLS enforces this too,
 * but checking early gives a clean error message instead of an opaque
 * storage-level denial), rejects disallowed kind/extension combinations,
 * builds the `{org_id}/{project_id}/{stage}/{filename}` path, and returns a
 * signed upload URL the *client* uploads directly to.
 */
export async function createUploadUrl(
  input: z.input<typeof CreateUploadUrlInput>
): Promise<CreateUploadUrlResult> {
  const ctx = await requireOrgContext()
  const parsed = CreateUploadUrlInput.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" }
  }
  const { projectId, stage, kind, filename } = parsed.data

  if (!isAllowedFilename(kind, filename)) {
    return { error: `"${filename}" is not an allowed file type for ${kind}.` }
  }

  const supabase = await createSupabaseClient()
  const { data: project, error: projectErr } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("org_id", ctx.orgId)
    .maybeSingle()
  if (projectErr) return { error: projectErr.message }
  if (!project) return { error: "Project not found" }

  const path = buildStoragePath({ orgId: ctx.orgId, projectId, stage, filename })

  const { data, error } = await supabase.storage
    .from(DOCUMENTS_BUCKET)
    .createSignedUploadUrl(path)
  if (error) return { error: error.message }

  return { path: data.path, token: data.token, signedUrl: data.signedUrl }
}

// ── confirmUpload ────────────────────────────────────────────────────────────

const ConfirmUploadInput = z.object({
  projectId: z.string().min(1),
  stage: z.enum(PROJECT_STAGE),
  kind: z.enum(DOCUMENT_KINDS),
  storagePath: z.string().min(1),
  caption: optionalText,
})

/**
 * Called by the client after the direct-to-storage upload succeeds, to
 * insert the `project_documents` row. Splitting create-URL/confirm this way
 * means the DB row only exists once the file has actually landed.
 */
export async function confirmUpload(
  input: z.input<typeof ConfirmUploadInput>
): Promise<{ error?: string; id?: string }> {
  const ctx = await requireOrgContext()
  const parsed = ConfirmUploadInput.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" }
  }
  const { projectId, stage, kind, storagePath, caption } = parsed.data

  const supabase = await createSupabaseClient()
  const { data: project, error: projectErr } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("org_id", ctx.orgId)
    .maybeSingle()
  if (projectErr) return { error: projectErr.message }
  if (!project) return { error: "Project not found" }

  const { data, error } = await supabase
    .from("project_documents")
    .insert({
      org_id: ctx.orgId,
      project_id: projectId,
      stage,
      kind,
      storage_path: storagePath,
      caption: caption ?? null,
      uploaded_by: ctx.userId,
    })
    .select("id")
    .single()
  if (error) return { error: error.message }

  revalidatePath(`/projects/${projectId}`)
  return { id: data.id }
}

// ── listDocuments ────────────────────────────────────────────────────────────

export type ProjectDocumentWithUrl = Tables<"project_documents"> & {
  signedUrl: string | null
}

/**
 * Returns documents for a project (optionally filtered to one stage), each
 * with a fresh signed *read* URL — signed URLs expire, so they're generated
 * at read time rather than stored.
 */
export async function listDocuments(
  projectId: string,
  stage?: Tables<"project_documents">["stage"]
): Promise<{ error?: string; documents?: ProjectDocumentWithUrl[] }> {
  const ctx = await requireOrgContext()
  const parsedProjectId = z.string().min(1).safeParse(projectId)
  if (!parsedProjectId.success) return { error: "Invalid input" }
  if (stage !== undefined) {
    const parsedStage = z.enum(PROJECT_STAGE).safeParse(stage)
    if (!parsedStage.success) return { error: "Invalid input" }
  }

  const supabase = await createSupabaseClient()
  let query = supabase
    .from("project_documents")
    .select("*")
    .eq("project_id", parsedProjectId.data)
    .eq("org_id", ctx.orgId)
    .order("created_at", { ascending: false })
  if (stage) query = query.eq("stage", stage)

  const { data, error } = await query
  if (error) return { error: error.message }

  const documents = await Promise.all(
    (data ?? []).map(async (doc) => {
      const { data: signed } = await supabase.storage
        .from(DOCUMENTS_BUCKET)
        .createSignedUrl(doc.storage_path, SIGNED_READ_TTL_SECONDS)
      return { ...doc, signedUrl: signed?.signedUrl ?? null }
    })
  )

  return { documents }
}

// ── deleteDocument ───────────────────────────────────────────────────────────

const DeleteDocumentInput = z.object({ id: z.string().min(1) })

/**
 * Removes both the storage object and the DB row. Storage is deleted first;
 * if that fails, the DB row is left alone and the error is surfaced. If
 * storage succeeds but the row delete then fails, that's also surfaced
 * rather than silently leaving an orphaned record (a row pointing at a file
 * that no longer exists) — see lib/pipeline/documents.ts's
 * `deleteWithOrphanGuard` for the tested ordering logic.
 *
 * No capability gate beyond org membership: deleting one's own team's
 * uploaded evidence is treated the same as deleting a task or milestone
 * elsewhere in this app (any member can), not a financial/destructive-enough
 * operation to warrant restricting to owner/admin per lib/permissions.ts's
 * capability matrix.
 */
export async function deleteDocument(
  input: z.input<typeof DeleteDocumentInput>
): Promise<{ error?: string }> {
  const ctx = await requireOrgContext()
  const parsed = DeleteDocumentInput.safeParse(input)
  if (!parsed.success) return { error: "Invalid input" }

  const supabase = await createSupabaseClient()
  const { data: doc, error: fetchErr } = await supabase
    .from("project_documents")
    .select("id, project_id, storage_path")
    .eq("id", parsed.data.id)
    .eq("org_id", ctx.orgId)
    .maybeSingle()
  if (fetchErr) return { error: fetchErr.message }
  if (!doc) return { error: "Document not found" }

  const result = await deleteWithOrphanGuard(
    async () => {
      const { error } = await supabase.storage
        .from(DOCUMENTS_BUCKET)
        .remove([doc.storage_path])
      return { error: error?.message ?? null }
    },
    async () => {
      const { error } = await supabase
        .from("project_documents")
        .delete()
        .eq("id", doc.id)
        .eq("org_id", ctx.orgId)
      return { error: error?.message ?? null }
    }
  )
  if (result.error) return { error: result.error }

  revalidatePath(`/projects/${doc.project_id}`)
  return {}
}
