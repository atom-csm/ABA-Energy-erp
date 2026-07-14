import { sumSatang, type Satang } from "@/lib/money"
import type { Enums } from "@/lib/types/database"

export type ProjectStage = Enums<"project_stage">
export type ProjectLike = { stage: ProjectStage; value_satang: number }

/**
 * Stages considered "open" pipeline (still moving, not yet archived). Archive
 * is the one closed stage — it covers done/won *and* lost/dead projects (see
 * docs/PROJECT_PIPELINE_REDESIGN.md), so unlike the old deal_stage model there
 * is no separate "won" stage to single out.
 */
export const OPEN_STAGES: readonly ProjectStage[] = [
  "electric_bill_collection",
  "site_survey",
  "quotation_and_proposal",
  "negotiation_and_followup",
  "installation",
  "payment",
  "after_sales",
]

/** Default win-probability per stage, used for weighted pipeline. */
export const STAGE_PROBABILITY: Record<ProjectStage, number> = {
  electric_bill_collection: 0.1,
  site_survey: 0.2,
  quotation_and_proposal: 0.35,
  negotiation_and_followup: 0.55,
  installation: 0.8,
  payment: 0.9,
  after_sales: 0.95,
  archive: 1,
}

export function isOpenStage(stage: ProjectStage): boolean {
  return OPEN_STAGES.includes(stage)
}

/** Total value of all open-pipeline projects (unweighted). */
export function pipelineValue(projects: ProjectLike[]): Satang {
  return sumSatang(
    projects.filter((p) => isOpenStage(p.stage)).map((p) => p.value_satang)
  )
}

/** Probability-weighted value of open-pipeline projects. */
export function weightedPipelineValue(projects: ProjectLike[]): Satang {
  const total = projects
    .filter((p) => isOpenStage(p.stage))
    .reduce((acc, p) => acc + p.value_satang * STAGE_PROBABILITY[p.stage], 0)
  return Math.round(total)
}

/**
 * Total value of archived projects. Archive conflates won/done and lost/dead
 * (there is no separate "won" stage post-merge), so this is a "closed" total,
 * not a "won" total — callers wanting a true win-rate need a signal beyond
 * `stage` (e.g. paid invoices), out of scope for this metric.
 */
export function archivedValue(projects: ProjectLike[]): Satang {
  return sumSatang(
    projects.filter((p) => p.stage === "archive").map((p) => p.value_satang)
  )
}

/** Value grouped by stage (every stage present, 0 when empty). */
export function pipelineByStage(projects: ProjectLike[]): Record<ProjectStage, Satang> {
  const totals: Record<ProjectStage, Satang> = {
    electric_bill_collection: 0,
    site_survey: 0,
    quotation_and_proposal: 0,
    negotiation_and_followup: 0,
    installation: 0,
    payment: 0,
    after_sales: 0,
    archive: 0,
  }
  for (const p of projects) totals[p.stage] += p.value_satang
  return totals
}
