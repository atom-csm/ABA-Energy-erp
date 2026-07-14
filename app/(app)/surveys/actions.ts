"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"

import { requireOrgContext } from "@/lib/auth"
import { createClient as createSupabaseClient } from "@/lib/supabase/server"

const STATUSES = ["scheduled", "completed", "needs_engineer", "blocked", "cancelled"] as const

const optionalId = z.string().optional().transform((v) => (v && v !== "none" ? v : null))
const optionalDate = z.string().optional().transform((v) => (v ? v : null))
const optionalText = z.string().trim().optional().transform((v) => (v ? v : null))
const optionalNumber = z.coerce.number().min(0).optional().transform((v) => (Number.isFinite(v) ? v : null))

const SurveyInput = z.object({
  title: z.string().trim().min(1, "Survey title is required"),
  status: z.enum(STATUSES),
  projectId: optionalId,
  scheduledDate: optionalDate,
  completedDate: optionalDate,
  roofType: optionalText,
  roofAreaSqm: optionalNumber,
  meterPhase: optionalText,
  mainBreakerAmp: optionalNumber,
  shadingNotes: optionalText,
  structuralNotes: optionalText,
  photoFolderUrl: optionalText,
  resultSummary: optionalText,
})

export type SurveyInput = z.input<typeof SurveyInput>

function toDb(d: z.output<typeof SurveyInput>, orgId: string) {
  return {
    org_id: orgId,
    title: d.title,
    status: d.status,
    project_id: d.projectId,
    scheduled_date: d.scheduledDate,
    completed_date: d.completedDate,
    roof_type: d.roofType,
    roof_area_sqm: d.roofAreaSqm,
    meter_phase: d.meterPhase,
    main_breaker_amp: d.mainBreakerAmp,
    shading_notes: d.shadingNotes,
    structural_notes: d.structuralNotes,
    photo_folder_url: d.photoFolderUrl,
    result_summary: d.resultSummary,
  }
}

export async function createSurvey(input: SurveyInput): Promise<{ error?: string }> {
  const ctx = await requireOrgContext()
  const parsed = SurveyInput.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid survey" }

  const supabase = await createSupabaseClient()
  const { data, error } = await supabase
    .from("solar_surveys")
    .insert(toDb(parsed.data, ctx.orgId))
    .select("id")
    .single()

  if (error) return { error: error.message }
  revalidatePath("/surveys")
  redirect(`/surveys/${data.id}`)
}

export async function updateSurvey(id: string, input: SurveyInput): Promise<{ error?: string }> {
  const ctx = await requireOrgContext()
  const parsed = SurveyInput.safeParse(input)
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Invalid survey" }

  const supabase = await createSupabaseClient()
  const { error } = await supabase
    .from("solar_surveys")
    .update(toDb(parsed.data, ctx.orgId))
    .eq("id", id)
    .eq("org_id", ctx.orgId)

  if (error) return { error: error.message }
  revalidatePath("/surveys")
  revalidatePath(`/surveys/${id}`)
  redirect(`/surveys/${id}`)
}
