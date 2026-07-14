/**
 * Pure, DB-independent helpers for CR-001 ST-3 (real project document
 * uploads — see docs/PROJECT_PIPELINE_REDESIGN.md). Filename/path validation
 * and the "delete storage then the DB row, never the reverse" ordering
 * decision live here, with no I/O, so they're covered by this repo's existing
 * Vitest convention (`vitest.config.ts` only runs `lib/**\/*.test.ts`).
 *
 * The actual Supabase Storage + `project_documents` calls are thin glue in
 * `app/(app)/projects/documents-actions.ts`. That glue is deliberately not
 * unit-tested itself, matching the pattern already documented for other
 * thin DB/IO wrappers in docs/wiki/06-testing-and-tooling.md's "Coverage
 * gaps" section (e.g. `lib/auth.ts`, `lib/audit.ts`) — mocking the Supabase
 * client there would just be re-testing the mock. True cross-org isolation
 * for the storage bucket/table can only be verified against a live Supabase
 * instance (RLS); see the migration file for the policies and the ST-3
 * report for the manual verification note.
 */

export const DOCUMENT_KINDS = ["photo", "video", "document"] as const
export type DocumentKind = (typeof DOCUMENT_KINDS)[number]

/**
 * Allowed extensions per kind. Defense-in-depth alongside the storage
 * bucket's own `allowed_mime_types` (see migration) — rejecting here means a
 * disallowed file gets a clean app-level error instead of a bucket-level
 * rejection after a round trip to Storage.
 */
const ALLOWED_EXTENSIONS: Record<DocumentKind, readonly string[]> = {
  photo: ["jpg", "jpeg", "png", "webp", "heic", "heif"],
  video: ["mp4", "mov"],
  document: ["pdf"],
}

function extensionOf(filename: string): string | null {
  const match = /\.([a-zA-Z0-9]+)$/.exec(filename.trim())
  return match ? match[1]!.toLowerCase() : null
}

/** True when `filename`'s (last) extension is allowed for `kind`. */
export function isAllowedFilename(kind: DocumentKind, filename: string): boolean {
  const ext = extensionOf(filename)
  if (!ext) return false
  return ALLOWED_EXTENSIONS[kind].includes(ext)
}

/**
 * Strips characters that would let a filename escape its
 * `{org_id}/{project_id}/{stage}/` prefix or inject extra path segments into
 * the storage key (path separators, leading dots). Anything else unsafe for
 * a storage key collapses to `_`. Falls back to a safe default if nothing
 * usable is left.
 */
export function sanitizeFilename(filename: string): string {
  const noLeadingDots = filename.trim().replace(/^\.+/, "")
  const safe = noLeadingDots.replace(/[^a-zA-Z0-9._-]/g, "_")
  return safe.length > 0 ? safe : "file"
}

/**
 * Builds the `{org_id}/{project_id}/{stage}/{filename}` storage key (see
 * docs/PROJECT_PIPELINE_REDESIGN.md's path convention). A random prefix is
 * added ahead of the sanitized filename so two uploads that happen to share
 * a name (e.g. a phone's default `IMG_0001.jpg`) never silently overwrite
 * each other — evidence should accumulate, not clobber. Pass `uniqueId` to
 * pin it (used by tests); omit it to get a fresh `crypto.randomUUID()`.
 */
export function buildStoragePath(args: {
  orgId: string
  projectId: string
  stage: string
  filename: string
  uniqueId?: string
}): string {
  const unique = args.uniqueId ?? crypto.randomUUID()
  const safeName = `${unique}-${sanitizeFilename(args.filename)}`
  return `${args.orgId}/${args.projectId}/${args.stage}/${safeName}`
}

export type StorageOpResult = { error: string | null }

/**
 * Orchestrates "delete the storage object, then the DB row" so a document
 * never ends up with a DB row pointing at a file that's already gone (an
 * orphaned record). Storage removal runs first: if it fails, the DB row is
 * left untouched and the storage error is surfaced. Only once the file is
 * confirmed gone do we delete the row — if that fails too, we surface it
 * rather than silently leaving the inconsistency unreported.
 *
 * Takes the two operations as callbacks (not a Supabase client) so this
 * ordering/error-surfacing logic is testable without mocking Supabase.
 */
export async function deleteWithOrphanGuard(
  removeStorageObject: () => Promise<StorageOpResult>,
  removeRow: () => Promise<StorageOpResult>
): Promise<{ error?: string }> {
  const storageResult = await removeStorageObject()
  if (storageResult.error) {
    return { error: `Failed to delete file from storage: ${storageResult.error}` }
  }

  const rowResult = await removeRow()
  if (rowResult.error) {
    return {
      error: `File was deleted from storage but its record could not be removed: ${rowResult.error}`,
    }
  }

  return {}
}
