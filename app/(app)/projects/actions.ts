"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"

import { createClient as createSupabaseClient } from "@/lib/supabase/server"
import { requireOrgContext, requireCapability } from "@/lib/auth"
import { bahtToSatang } from "@/lib/money"
import { writeAudit } from "@/lib/audit"
import { Constants } from "@/lib/types/database"
import {
  getStageRequirements,
  decideStageAdvance,
  type ProjectPipelineState,
  type StageRequirement,
} from "@/lib/pipeline/stages"
import {
  generateText,
  isAIConfigured,
  AINotConfiguredError,
} from "@/lib/ai/client"

const PROJECT_STAGE = Constants.public.Enums.project_stage
const TASK_STATUS = Constants.public.Enums.task_status

/** Optional text field: trims; empty string becomes undefined. */
const optionalText = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : undefined))

/** A select that may be "none" (→ null) or a uuid. */
const optionalId = z
  .string()
  .optional()
  .transform((v) => (v && v !== "none" ? v : null))

/** A date input value: "" → null, otherwise YYYY-MM-DD. */
const optionalDate = z
  .string()
  .optional()
  .transform((v) => (v ? v : null))

const ProjectInput = z.object({
  name: z.string().trim().min(1, "Project name is required"),
  clientId: optionalId,
  stage: z.enum(PROJECT_STAGE),
  deadline: optionalDate,
  budgetBaht: z.coerce.number().min(0, "Budget cannot be negative").optional(),
  owner: optionalText,
  installationStartDate: optionalDate,
  installationEndDate: optionalDate,
  installationCrew: optionalText,
  depositReceived: z.boolean().optional(),
  handoverCompleted: z.boolean().optional(),
  warrantyRegistered: z.boolean().optional(),
})

export async function createProject(
  input: z.input<typeof ProjectInput>
): Promise<{ error?: string }> {
  const ctx = await requireOrgContext()
  const parsed = ProjectInput.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" }
  }
  const {
    name,
    clientId,
    stage,
    deadline,
    budgetBaht,
    owner,
    installationStartDate,
    installationEndDate,
    installationCrew,
    depositReceived,
    handoverCompleted,
    warrantyRegistered,
  } = parsed.data

  const supabase = await createSupabaseClient()
  const { data, error } = await supabase
    .from("projects")
    .insert({
      org_id: ctx.orgId,
      name,
      client_id: clientId,
      stage,
      deadline,
      budget_satang:
        budgetBaht !== undefined ? bahtToSatang(budgetBaht) : null,
      owner: owner ?? null,
      installation_start_date: installationStartDate,
      installation_end_date: installationEndDate,
      installation_crew: installationCrew ?? null,
      deposit_received: depositReceived ?? false,
      handover_completed: handoverCompleted ?? false,
      warranty_registered: warrantyRegistered ?? false,
    })
    .select("id")
    .single()

  if (error) return { error: error.message }

  revalidatePath("/projects")
  redirect(`/projects/${data.id}`)
}

const UpdateProjectInput = ProjectInput.extend({
  id: z.string().min(1),
})

export async function updateProject(
  input: z.input<typeof UpdateProjectInput>
): Promise<{ error?: string }> {
  const ctx = await requireOrgContext()
  const parsed = UpdateProjectInput.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" }
  }
  const {
    id,
    name,
    clientId,
    stage,
    deadline,
    budgetBaht,
    owner,
    installationStartDate,
    installationEndDate,
    installationCrew,
    depositReceived,
    handoverCompleted,
    warrantyRegistered,
  } = parsed.data

  const supabase = await createSupabaseClient()
  const { error } = await supabase
    .from("projects")
    .update({
      name,
      client_id: clientId,
      stage,
      deadline,
      budget_satang:
        budgetBaht !== undefined ? bahtToSatang(budgetBaht) : null,
      owner: owner ?? null,
      installation_start_date: installationStartDate,
      installation_end_date: installationEndDate,
      installation_crew: installationCrew ?? null,
      deposit_received: depositReceived ?? false,
      handover_completed: handoverCompleted ?? false,
      warranty_registered: warrantyRegistered ?? false,
    })
    .eq("id", id)
    .eq("org_id", ctx.orgId)

  if (error) return { error: error.message }

  revalidatePath("/projects")
  revalidatePath(`/projects/${id}`)
  redirect(`/projects/${id}`)
}

const UpdateStageInput = z
  .object({
    id: z.string().min(1),
    stage: z.enum(PROJECT_STAGE),
    /**
     * Soft-gate override (CR-001 ST-4 / decision #2 in
     * docs/PROJECT_PIPELINE_REDESIGN.md): when `getStageRequirements()`
     * reports the project's current stage isn't ready to leave, the caller
     * must explicitly pass `override: true` plus a non-empty
     * `overrideReason` to proceed anyway. Omitting the override (or leaving
     * the reason blank) turns an unmet-requirement stage change into a
     * no-op warning instead of a write.
     */
    override: z.boolean().optional(),
    overrideReason: z.string().trim().max(500).optional(),
  })
  .refine((v) => !v.override || !!v.overrideReason, {
    message: "An override reason is required to bypass an unmet requirement.",
    path: ["overrideReason"],
  })

/**
 * `warning` surfaces the unmet requirements for the current stage so the
 * caller can show them and re-submit with `{ override: true, overrideReason }`.
 * No actual write happens in that case — this is why `warning` and the
 * legacy bare-success `{}` shape are both possible non-error returns. The
 * checklist/"confirm override" UI itself is ST-7; for now callers that don't
 * yet build that UI can treat `warning` as a no-op and surface it via a
 * toast (see `stage-select.tsx`).
 */
export type UpdateProjectStageResult = {
  error?: string
  warning?: { requirements: StageRequirement[] }
}

/**
 * Assembles the `ProjectPipelineState` needed to evaluate
 * `getStageRequirements()` for one project's *current* stage, from the
 * tables CR-001 ST-4 specifies: `projects` itself, `solar_surveys`,
 * `quotes`, `invoices`, and `project_handover_evidence`. Thin DB glue, left
 * untested per this repo's convention (see lib/pipeline/stages.ts's pure,
 * fully-tested `getStageRequirements`/`decideStageAdvance` for the actual
 * business logic).
 *
 * Exported (CR-001 ST-7) so the project detail page can call it too, to
 * render the live "what's needed to move forward" checklist — the same
 * assembly `updateProjectStage` uses to *gate* the stage change is reused
 * here to *display* it, rather than a third re-implementation of these five
 * queries.
 */
export async function loadProjectPipelineState(
  supabase: Awaited<ReturnType<typeof createSupabaseClient>>,
  orgId: string,
  projectId: string,
  currentStage: ProjectPipelineState["stage"],
  monthlyBillSatang: number | null,
  installationStartDate: string | null
): Promise<ProjectPipelineState> {
  const [{ data: survey }, { count: sentQuoteCount }, { count: invoiceCount }, { count: handoverEvidenceCount }] =
    await Promise.all([
      supabase
        .from("solar_surveys")
        .select("id")
        .eq("project_id", projectId)
        .eq("org_id", orgId)
        .eq("status", "completed")
        .limit(1)
        .maybeSingle(),
      supabase
        .from("quotes")
        .select("id", { count: "exact", head: true })
        .eq("project_id", projectId)
        .eq("org_id", orgId)
        .in("status", ["sent", "accepted", "converted"]),
      supabase
        .from("invoices")
        .select("id", { count: "exact", head: true })
        .eq("project_id", projectId)
        .eq("org_id", orgId),
      supabase
        .from("project_handover_evidence")
        .select("id", { count: "exact", head: true })
        .eq("project_id", projectId)
        .eq("org_id", orgId),
    ])

  return {
    stage: currentStage,
    monthlyBillSatang,
    surveyCompleted: !!survey,
    sentQuoteCount: sentQuoteCount ?? 0,
    invoiceCount: invoiceCount ?? 0,
    installationStarted: !!installationStartDate,
    handoverEvidenceCount: handoverEvidenceCount ?? 0,
  }
}

export async function updateProjectStage(
  input: z.input<typeof UpdateStageInput>
): Promise<UpdateProjectStageResult> {
  const ctx = await requireOrgContext()
  const parsed = UpdateStageInput.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" }
  }
  const { id, stage, override, overrideReason } = parsed.data

  const supabase = await createSupabaseClient()
  // Capture the prior stage + the signals needed to evaluate its
  // requirements, before we consider overwriting anything.
  const { data: before } = await supabase
    .from("projects")
    .select("name, stage, monthly_bill_satang, installation_start_date")
    .eq("id", id)
    .eq("org_id", ctx.orgId)
    .maybeSingle()

  if (!before) return { error: "Project not found" }

  // No-op: caller re-selected the current stage. Nothing to gate or audit.
  if (before.stage === stage) return {}

  const state = await loadProjectPipelineState(
    supabase,
    ctx.orgId,
    id,
    before.stage,
    before.monthly_bill_satang,
    before.installation_start_date
  )
  const requirementsResult = getStageRequirements(state)
  const decision = decideStageAdvance(
    requirementsResult,
    override ? { overrideReason: overrideReason ?? "" } : undefined
  )

  if (!decision.proceed) {
    return { warning: { requirements: requirementsResult.requirements } }
  }

  // Overriding an unmet requirement is a deliberate bypass of an internal
  // process gate (not just an ordinary stage move), so it's restricted to
  // owner/admin via lib/permissions.ts's "project:stage_override" — see this
  // subtask's report for the reasoning. Ordinary stage changes (no unmet
  // requirement, or none being bypassed) stay open to any org member,
  // unchanged from today.
  if (decision.auditMeta.override) {
    try {
      requireCapability(ctx, "project:stage_override")
    } catch {
      return {
        error: "Only owners and admins can override an unmet stage requirement.",
      }
    }
  }

  const { error } = await supabase
    .from("projects")
    .update({ stage })
    .eq("id", id)
    .eq("org_id", ctx.orgId)

  if (error) return { error: error.message }

  await writeAudit(ctx, {
    entity: "project",
    entityId: id,
    action: "stage_changed",
    summary: `Moved project "${before.name}" from ${before.stage} → ${stage}`,
    meta: { from: before.stage, to: stage, ...decision.auditMeta },
  })

  revalidatePath("/projects")
  revalidatePath(`/projects/${id}`)
  return {}
}

const AddTaskInput = z.object({
  projectId: z.string().min(1),
  title: z.string().trim().min(1, "Task title is required"),
  status: z.enum(TASK_STATUS),
  dueDate: optionalDate,
  assignee: optionalText,
})

export async function addTask(
  input: z.input<typeof AddTaskInput>
): Promise<{ error?: string }> {
  const ctx = await requireOrgContext()
  const parsed = AddTaskInput.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" }
  }
  const { projectId, title, status, dueDate, assignee } = parsed.data

  const supabase = await createSupabaseClient()
  const { error } = await supabase.from("project_tasks").insert({
    org_id: ctx.orgId,
    project_id: projectId,
    title,
    status,
    due_date: dueDate,
    assignee: assignee ?? null,
    done: status === "done",
  })

  if (error) return { error: error.message }

  revalidatePath(`/projects/${projectId}`)
  return {}
}

// ── AI Work Breakdown (goal → preview phases/tasks → confirmed tasks) ───────

export type AiWorkBreakdownTeamMember = {
  id: string
  name: string
  skills: string[]
  openTaskCount: number
  openEstimateHours: number
}

export type AiWorkBreakdownTask = {
  clientId: string
  phaseName: string
  title: string
  estimateHours: number
  dependsOn: string[]
  suggestedAssignee: string | null
  dueDate: string
  selected: boolean
}

export type AiWorkBreakdownPhase = {
  name: string
  tasks: AiWorkBreakdownTask[]
}

export type AiWorkBreakdownResult =
  | { notConfigured: true }
  | { error: string }
  | { phases: AiWorkBreakdownPhase[]; team: AiWorkBreakdownTeamMember[] }

const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use YYYY-MM-DD")

const GenerateWorkBreakdownInput = z.object({
  projectId: z.string().min(1),
  goal: z.string().trim().min(5, "Goal is required").max(1200),
  deadline: IsoDate,
})

const RawAiTask = z.object({
  title: z.string().trim().min(1).max(160),
  estimateHours: z.coerce.number().positive().max(240).catch(4),
  dependsOn: z.array(z.string()).catch([]),
  suggestedAssignee: z.string().nullable().optional(),
  dueDate: z.string().nullable().optional(),
})

const RawAiPlan = z.object({
  phases: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(80),
        tasks: z.array(RawAiTask).min(1).max(20),
      })
    )
    .min(1)
    .max(8),
})

const ConfirmWorkBreakdownTask = z.object({
  clientId: z.string().min(1).max(40),
  phaseName: z.string().trim().min(1).max(80),
  title: z.string().trim().min(1).max(160),
  estimateHours: z.coerce.number().positive().max(240),
  dependsOn: z.array(z.string().min(1).max(40)).default([]),
  suggestedAssignee: z.string().nullable().optional(),
  selected: z.boolean().default(true),
})

const ConfirmWorkBreakdownInput = z.object({
  projectId: z.string().min(1),
  deadline: IsoDate,
  tasks: z.array(ConfirmWorkBreakdownTask).min(1).max(80),
})

type SupabaseServer = Awaited<ReturnType<typeof createSupabaseClient>>
type DraftTask = Omit<AiWorkBreakdownTask, "dueDate" | "selected"> & {
  dueDate?: string
}

type ProjectForAi = {
  id: string
  name: string
  startDate: string
  deadline: string | null
}

const HOURS_PER_WORKDAY = 6

function isoFromDateUTC(d: Date): string {
  return d.toISOString().slice(0, 10)
}

function addDaysISO(dateISO: string, days: number): string {
  const [year, month, day] = dateISO.split("-").map(Number)
  const d = new Date(Date.UTC(year, month - 1, day))
  d.setUTCDate(d.getUTCDate() + days)
  return isoFromDateUTC(d)
}

function normalizeKey(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ")
}

function pickJsonObject(modelText: string): unknown {
  const stripped = modelText
    .trim()
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim()
  const start = stripped.indexOf("{")
  const end = stripped.lastIndexOf("}")
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Model did not return JSON")
  }
  return JSON.parse(stripped.slice(start, end + 1))
}

function topoOrder(tasks: Array<{ clientId: string; dependsOn: string[] }>): string[] {
  const ids = tasks.map((t) => t.clientId)
  const idSet = new Set(ids)
  const indegree = new Map(ids.map((id) => [id, 0]))
  const next = new Map<string, string[]>()

  for (const task of tasks) {
    for (const dep of task.dependsOn) {
      if (!idSet.has(dep) || dep === task.clientId) continue
      indegree.set(task.clientId, (indegree.get(task.clientId) ?? 0) + 1)
      next.set(dep, [...(next.get(dep) ?? []), task.clientId])
    }
  }

  const order: string[] = []
  const queue = ids.filter((id) => (indegree.get(id) ?? 0) === 0)
  while (queue.length > 0) {
    const id = queue.shift()!
    order.push(id)
    for (const child of next.get(id) ?? []) {
      const n = (indegree.get(child) ?? 0) - 1
      indegree.set(child, n)
      if (n === 0) queue.push(child)
    }
  }

  // Cycle/invalid dependency fallback: keep the original order for leftovers.
  if (order.length < ids.length) {
    const seen = new Set(order)
    order.push(...ids.filter((id) => !seen.has(id)))
  }
  return order
}

function assignAndSchedule(
  tasks: DraftTask[],
  team: AiWorkBreakdownTeamMember[],
  deadline: string
): AiWorkBreakdownTask[] {
  const byId = new Map(tasks.map((t) => [t.clientId, { ...t }]))
  const order = topoOrder(tasks)
  const workload = new Map(team.map((m) => [m.id, m.openEstimateHours]))
  const teamById = new Map(team.map((m) => [m.id, m]))

  for (const id of order) {
    const task = byId.get(id)
    if (!task) continue
    const preferred = task.suggestedAssignee
      ? teamById.get(task.suggestedAssignee)
      : null
    const preferredSkills = new Set(preferred?.skills ?? [])
    const candidates = preferred
      ? team.filter((m) => m.skills.some((s) => preferredSkills.has(s)))
      : team
    const pool = candidates.length > 0 ? candidates : team
    const assignee = pool
      .slice()
      .sort(
        (a, b) =>
          (workload.get(a.id) ?? 0) - (workload.get(b.id) ?? 0) ||
          a.name.localeCompare(b.name)
      )[0]
    task.suggestedAssignee = assignee?.id ?? null
    if (assignee) {
      workload.set(
        assignee.id,
        (workload.get(assignee.id) ?? 0) + task.estimateHours
      )
    }
  }

  let cursor = deadline
  for (const id of order.slice().reverse()) {
    const task = byId.get(id)
    if (!task) continue
    task.dueDate = cursor
    const days = Math.max(1, Math.ceil(task.estimateHours / HOURS_PER_WORKDAY))
    cursor = addDaysISO(cursor, -days)
  }

  return tasks.map((task) => ({
    ...byId.get(task.clientId)!,
    dueDate: byId.get(task.clientId)?.dueDate ?? deadline,
    selected: true,
  }))
}

function normalizeAiPlan(
  raw: z.infer<typeof RawAiPlan>,
  team: AiWorkBreakdownTeamMember[],
  deadline: string
): AiWorkBreakdownPhase[] {
  const teamIds = new Set(team.map((m) => m.id))
  const titleToClientId = new Map<string, string>()
  const drafts: DraftTask[] = []
  const phaseNames: string[] = []

  raw.phases.forEach((phase, phaseIndex) => {
    const phaseName = phase.name.trim()
    phaseNames.push(phaseName)
    phase.tasks.forEach((task, taskIndex) => {
      const clientId = `p${phaseIndex + 1}t${taskIndex + 1}`
      const title = task.title.trim()
      if (!titleToClientId.has(normalizeKey(title))) {
        titleToClientId.set(normalizeKey(title), clientId)
      }
      drafts.push({
        clientId,
        phaseName,
        title,
        estimateHours: Math.max(1, Math.round(task.estimateHours * 4) / 4),
        dependsOn: [],
        suggestedAssignee:
          task.suggestedAssignee && teamIds.has(task.suggestedAssignee)
            ? task.suggestedAssignee
            : null,
      })
    })
  })

  let cursor = 0
  raw.phases.forEach((phase) => {
    phase.tasks.forEach((task) => {
      const draft = drafts[cursor++]!
      draft.dependsOn = (task.dependsOn ?? [])
        .map((depTitle) => titleToClientId.get(normalizeKey(depTitle)))
        .filter((id): id is string => !!id && id !== draft.clientId)
    })
  })

  const scheduled = assignAndSchedule(drafts, team, deadline)
  const byPhase = new Map<string, AiWorkBreakdownTask[]>()
  for (const task of scheduled) {
    byPhase.set(task.phaseName, [...(byPhase.get(task.phaseName) ?? []), task])
  }
  return phaseNames.map((name) => ({ name, tasks: byPhase.get(name) ?? [] }))
}

async function loadProjectAndTeam(
  supabase: SupabaseServer,
  orgId: string,
  projectId: string
): Promise<{
  project: ProjectForAi | null
  team: AiWorkBreakdownTeamMember[]
}> {
  const { data: project } = await supabase
    .from("projects")
    .select("id, name, deadline, created_at")
    .eq("id", projectId)
    .eq("org_id", orgId)
    .maybeSingle()

  if (!project) return { project: null, team: [] }

  const { data: memberships } = await supabase
    .from("memberships")
    .select("user_id, role")
    .eq("org_id", orgId)
    .order("created_at", { ascending: true })

  const userIds = (memberships ?? []).map((m) => m.user_id)
  const [{ data: profiles }, { data: openTasks }] = await Promise.all([
    userIds.length
      ? supabase.from("profiles").select("id, full_name").in("id", userIds)
      : Promise.resolve({ data: [] }),
    userIds.length
      ? supabase
          .from("project_tasks")
          .select("assignee, estimate_hours, done, status")
          .eq("org_id", orgId)
          .in("assignee", userIds)
          .eq("done", false)
      : Promise.resolve({ data: [] }),
  ])

  const nameById = new Map((profiles ?? []).map((p) => [p.id, p.full_name]))
  const workload = new Map<string, { count: number; hours: number }>()
  for (const row of openTasks ?? []) {
    if (!row.assignee || row.status === "done") continue
    const current = workload.get(row.assignee) ?? { count: 0, hours: 0 }
    current.count += 1
    current.hours += Number(row.estimate_hours ?? 1)
    workload.set(row.assignee, current)
  }

  return {
    project: {
      id: project.id,
      name: project.name,
      startDate: (project.created_at ?? new Date().toISOString()).slice(0, 10),
      deadline: project.deadline,
    },
    team: (memberships ?? []).map((member) => {
      const roleSkill = String(member.role ?? "member")
      const load = workload.get(member.user_id) ?? { count: 0, hours: 0 }
      return {
        id: member.user_id,
        name: nameById.get(member.user_id) ?? "Unnamed teammate",
        // There is no dedicated skills[] column in the current SSOT yet, so the
        // existing membership role is the source-backed skill tag for now.
        skills: [roleSkill],
        openTaskCount: load.count,
        openEstimateHours: load.hours,
      }
    }),
  }
}

function workBreakdownPrompt(args: {
  goal: string
  deadline: string
  project: ProjectForAi
  team: AiWorkBreakdownTeamMember[]
}) {
  const system = [
    "You are an expert project manager for a Thai SME operations system.",
    "Return ONLY strict JSON. No markdown, no prose, no code fences.",
    "Break the user's goal into realistic phases and tasks.",
    "Use only team member ids provided in team[].id for suggestedAssignee, or null.",
    "Design the work breakdown for real team execution: concise titles, clear phase boundaries, realistic estimates, and dependencies that reduce rework.",
    "dependsOn must be an array of exact task titles that appear earlier in the JSON.",
    "estimateHours must be a positive number. dueDate must be YYYY-MM-DD.",
    "Do not invent team members, ids, or private data.",
  ].join(" ")

  const prompt = [
    "Create an AI work breakdown for this project.",
    "",
    "Input JSON:",
    JSON.stringify(
      {
        goal: args.goal,
        deadline: args.deadline,
        project: args.project,
        team: args.team,
        requiredOutputShape: {
          phases: [
            {
              name: "Phase name",
              tasks: [
                {
                  title: "Task title",
                  estimateHours: 4,
                  dependsOn: ["Exact earlier task title"],
                  suggestedAssignee: args.team[0]?.id ?? null,
                  dueDate: args.deadline,
                },
              ],
            },
          ],
        },
      },
      null,
      2
    ),
  ].join("\n")

  return { system, prompt }
}

export async function generateAiWorkBreakdown(
  input: z.input<typeof GenerateWorkBreakdownInput>
): Promise<AiWorkBreakdownResult> {
  const ctx = await requireOrgContext()
  const parsed = GenerateWorkBreakdownInput.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" }
  }
  if (!isAIConfigured()) return { notConfigured: true }

  const supabase = await createSupabaseClient()
  const { project, team } = await loadProjectAndTeam(
    supabase,
    ctx.orgId,
    parsed.data.projectId
  )
  if (!project) return { error: "Project not found." }
  if (team.length === 0) return { error: "No team members found in SSOT." }

  try {
    const parts = workBreakdownPrompt({
      goal: parsed.data.goal,
      deadline: parsed.data.deadline,
      project,
      team,
    })
    const text = await generateText({ ...parts, maxTokens: 2600 })
    const rawJson = pickJsonObject(text)
    const raw = RawAiPlan.parse(rawJson)
    return {
      phases: normalizeAiPlan(raw, team, parsed.data.deadline),
      team,
    }
  } catch (e) {
    if (e instanceof AINotConfiguredError) return { notConfigured: true }
    return { error: "Could not generate a valid work breakdown. Please try again." }
  }
}

export async function createAiWorkBreakdownTasks(
  input: z.input<typeof ConfirmWorkBreakdownInput>
): Promise<{ error?: string; created?: number }> {
  const ctx = await requireOrgContext()
  const parsed = ConfirmWorkBreakdownInput.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" }
  }

  const selected = parsed.data.tasks.filter((task) => task.selected)
  if (selected.length === 0) return { error: "Select at least one task." }

  const supabase = await createSupabaseClient()
  const { project, team } = await loadProjectAndTeam(
    supabase,
    ctx.orgId,
    parsed.data.projectId
  )
  if (!project) return { error: "Project not found." }

  const selectedIds = new Set(selected.map((task) => task.clientId))
  const drafts: DraftTask[] = selected.map((task) => ({
    clientId: task.clientId,
    phaseName: task.phaseName,
    title: task.title,
    estimateHours: Math.max(1, Math.round(task.estimateHours * 4) / 4),
    dependsOn: task.dependsOn.filter((id) => selectedIds.has(id)),
    suggestedAssignee: task.suggestedAssignee ?? null,
  }))
  const finalTasks = assignAndSchedule(drafts, team, parsed.data.deadline)
  const byId = new Map(finalTasks.map((task) => [task.clientId, task]))
  const createdIds = new Map<string, string>()

  for (const clientId of topoOrder(finalTasks)) {
    const task = byId.get(clientId)
    if (!task) continue
    const dependencyIds = task.dependsOn
      .map((depClientId) => createdIds.get(depClientId))
      .filter((id): id is string => !!id)

    const { data, error } = await supabase
      .from("project_tasks")
      .insert({
        org_id: ctx.orgId,
        project_id: parsed.data.projectId,
        title: task.title,
        status: "todo",
        done: false,
        assignee: task.suggestedAssignee,
        due_date: task.dueDate,
        estimate_hours: task.estimateHours,
        phase_name: task.phaseName,
        depends_on: dependencyIds,
      })
      .select("id")
      .single()

    if (error) return { error: error.message }
    createdIds.set(clientId, data.id)
  }

  revalidatePath(`/projects/${parsed.data.projectId}`)
  return { created: createdIds.size }
}

const ToggleTaskInput = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  done: z.boolean(),
})

export async function toggleTask(
  input: z.input<typeof ToggleTaskInput>
): Promise<{ error?: string }> {
  const ctx = await requireOrgContext()
  const parsed = ToggleTaskInput.safeParse(input)
  if (!parsed.success) return { error: "Invalid input" }
  const { id, projectId, done } = parsed.data

  const supabase = await createSupabaseClient()
  // Keep status coherent with the done flag.
  const { error } = await supabase
    .from("project_tasks")
    .update({ done, status: done ? "done" : "todo" })
    .eq("id", id)
    .eq("org_id", ctx.orgId)

  if (error) return { error: error.message }

  revalidatePath(`/projects/${projectId}`)
  return {}
}

const AddMilestoneInput = z.object({
  projectId: z.string().min(1),
  title: z.string().trim().min(1, "Milestone title is required"),
  dueDate: optionalDate,
})

export async function addMilestone(
  input: z.input<typeof AddMilestoneInput>
): Promise<{ error?: string }> {
  const ctx = await requireOrgContext()
  const parsed = AddMilestoneInput.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" }
  }
  const { projectId, title, dueDate } = parsed.data

  const supabase = await createSupabaseClient()
  const { error } = await supabase.from("milestones").insert({
    org_id: ctx.orgId,
    project_id: projectId,
    title,
    due_date: dueDate,
  })

  if (error) return { error: error.message }

  revalidatePath(`/projects/${projectId}`)
  return {}
}

const ToggleMilestoneInput = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
  done: z.boolean(),
})

export async function toggleMilestone(
  input: z.input<typeof ToggleMilestoneInput>
): Promise<{ error?: string }> {
  const ctx = await requireOrgContext()
  const parsed = ToggleMilestoneInput.safeParse(input)
  if (!parsed.success) return { error: "Invalid input" }
  const { id, projectId, done } = parsed.data

  const supabase = await createSupabaseClient()
  const { error } = await supabase
    .from("milestones")
    .update({ done })
    .eq("id", id)
    .eq("org_id", ctx.orgId)

  if (error) return { error: error.message }

  revalidatePath(`/projects/${projectId}`)
  return {}
}

// ── Handover evidence (audit-trail for project handover / warranty) ─────────

const HandoverKind = z.enum(["handover", "warranty", "commissioning", "after_sale"])

const AddHandoverEvidenceInput = z.object({
  projectId: z.string().min(1),
  kind: HandoverKind,
  note: optionalText,
  evidenceUrl: optionalText,
  signedBy: optionalText,
  signedAt: optionalText,
})

export async function addHandoverEvidence(
  input: z.input<typeof AddHandoverEvidenceInput>
): Promise<{ error?: string }> {
  const ctx = await requireOrgContext()
  const parsed = AddHandoverEvidenceInput.safeParse(input)
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" }
  }
  const { projectId, kind, note, evidenceUrl, signedBy, signedAt } = parsed.data

  // Verify the project belongs to this org before writing audit-trail data.
  const supabase = await createSupabaseClient()
  const { data: project, error: projectErr } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("org_id", ctx.orgId)
    .maybeSingle()
  if (projectErr) return { error: projectErr.message }
  if (!project) return { error: "Project not found" }

  const { error } = await supabase.from("project_handover_evidence").insert({
    org_id: ctx.orgId,
    project_id: projectId,
    kind,
    note: note ?? null,
    evidence_url: evidenceUrl ?? null,
    signed_by: signedBy ?? null,
    signed_at: signedAt ?? null,
    created_by: ctx.userId ?? null,
  })

  if (error) return { error: error.message }

  // Mirror the canonical handover / warranty booleans so the project header
  // reflects what the evidence actually records.
  if (kind === "handover" || kind === "warranty") {
    const { data: existing } = await supabase
      .from("project_handover_evidence")
      .select("kind")
      .eq("project_id", projectId)
      .eq("org_id", ctx.orgId)
    const kinds = new Set((existing ?? []).map((r) => r.kind as string))
    kinds.add(kind)
    await supabase
      .from("projects")
      .update({
        handover_completed: kinds.has("handover"),
        warranty_registered: kinds.has("warranty"),
      })
      .eq("id", projectId)
      .eq("org_id", ctx.orgId)
  }

  revalidatePath(`/projects/${projectId}`)
  return {}
}

const RemoveHandoverEvidenceInput = z.object({
  id: z.string().min(1),
  projectId: z.string().min(1),
})

export async function removeHandoverEvidence(
  input: z.input<typeof RemoveHandoverEvidenceInput>
): Promise<{ error?: string }> {
  const ctx = await requireOrgContext()
  const parsed = RemoveHandoverEvidenceInput.safeParse(input)
  if (!parsed.success) return { error: "Invalid input" }
  const { id, projectId } = parsed.data

  const supabase = await createSupabaseClient()
  // Read kind before delete so we can re-evaluate the booleans afterwards.
  const { data: existing } = await supabase
    .from("project_handover_evidence")
    .select("kind")
    .eq("id", id)
    .eq("org_id", ctx.orgId)
    .maybeSingle()
  if (!existing) return { error: "Evidence not found" }

  const { error } = await supabase
    .from("project_handover_evidence")
    .delete()
    .eq("id", id)
    .eq("org_id", ctx.orgId)
  if (error) return { error: error.message }

  if (existing.kind === "handover" || existing.kind === "warranty") {
    const { data: remaining } = await supabase
      .from("project_handover_evidence")
      .select("kind")
      .eq("project_id", projectId)
      .eq("org_id", ctx.orgId)
    const kinds = new Set((remaining ?? []).map((r) => r.kind as string))
    await supabase
      .from("projects")
      .update({
        handover_completed: kinds.has("handover"),
        warranty_registered: kinds.has("warranty"),
      })
      .eq("id", projectId)
      .eq("org_id", ctx.orgId)
  }

  revalidatePath(`/projects/${projectId}`)
  return {}
}
