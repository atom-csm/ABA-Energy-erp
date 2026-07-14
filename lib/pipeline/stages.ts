/**
 * Pure, DB-independent pipeline-stage config for the unified Project
 * pipeline (CR-001). See docs/PROJECT_PIPELINE_REDESIGN.md for the design
 * rationale behind the 8 stages and the "soft gate" (warn, don't block)
 * advance-stage UX this powers.
 *
 * This module does no I/O. It takes a plain snapshot of a project's current
 * signals (`ProjectPipelineState`) — sourced today from `projects`,
 * `solar_surveys`, `quotes`, `invoices`, and `project_handover_evidence` — and
 * says what's required to move past the project's current stage, and whether
 * that requirement is met. Once ST-3 (real document uploads) lands, its
 * counts slot in as additional fields on this same state shape; callers
 * (server actions / UI, both out of scope here) are responsible for querying
 * the DB and assembling the state object.
 */

import type { Enums } from "@/lib/types/database"

export type ProjectStage = Enums<"project_stage">

/** Ordered stage list, matching the `project_stage` enum exactly. */
export const STAGES: readonly { value: ProjectStage; label: string }[] = [
  { value: "electric_bill_collection", label: "Electric bill collection" },
  { value: "site_survey", label: "Site survey" },
  { value: "quotation_and_proposal", label: "Quotation and Proposal" },
  { value: "negotiation_and_followup", label: "Negotiation and Follow-up" },
  { value: "installation", label: "Installation" },
  { value: "payment", label: "Payment" },
  { value: "after_sales", label: "After-sales" },
  { value: "archive", label: "Archive" },
]

/**
 * Plain snapshot of the signals needed to evaluate stage requirements for one
 * project. Deliberately not a DB row shape — callers assemble this from
 * whatever tables are relevant (see module doc).
 */
export type ProjectPipelineState = {
  stage: ProjectStage
  /**
   * The customer's monthly electric bill, in satang. `null` means "not yet
   * collected." `0` is treated as a legitimate entered value, not a stand-in
   * for unset — `projects.monthly_bill_satang`'s DB check only requires
   * `>= 0`, so a genuinely tiny (or placeholder-but-deliberately-recorded)
   * bill of 0 still counts as "collected." Only `null` blocks advancement.
   */
  monthlyBillSatang: number | null
  /** True when any `solar_surveys` row for this project has status 'completed'. */
  surveyCompleted: boolean
  /** Count of `quotes` rows for this project with status in ('sent','accepted','converted'). */
  sentQuoteCount: number
  /**
   * Count of `invoices` rows for this project. `invoices.project_id` is a
   * direct nullable FK onto `projects` (see `lib/types/database.ts`), so this
   * is a straight count of invoices linked to the project — no join through
   * client needed.
   */
  invoiceCount: number
  /** True when `projects.installation_start_date` is set. */
  installationStarted: boolean
  /** Count of `project_handover_evidence` rows for this project (any kind). */
  handoverEvidenceCount: number
}

/** One item in a "what's needed to move forward" checklist. */
export type StageRequirement = {
  label: string
  met: boolean
}

/** Result of evaluating a project's current stage against its requirements. */
export type StageRequirementsResult = {
  stage: ProjectStage
  /** Checklist items for the current stage. Empty when the stage has no hard requirement. */
  requirements: StageRequirement[]
  /** True when every requirement is met (vacuously true when there are none). */
  canAdvance: boolean
}

/**
 * Per-stage requirement definitions. A `null` entry means the stage has no
 * hard requirement and should always report as satisfied:
 *
 * - `negotiation_and_followup` is inherently about back-and-forth (calls,
 *   emails, price haggling) rather than a document/count signal, so there is
 *   nothing meaningful to gate on here. `activities` rows exist for this
 *   project but "at least one activity logged" would be a weak, easily-gamed
 *   proxy for real negotiation progress — better to leave this stage
 *   ungated and let the soft-gate override mechanism (CR-001 decision #2)
 *   handle it like every other stage's override path, just always-on.
 * - `archive` is terminal (done/won or lost/dead, see
 *   docs/PROJECT_PIPELINE_REDESIGN.md) — there's no "next" stage to gate.
 */
const STAGE_REQUIREMENTS: Record<
  ProjectStage,
  { label: string; check: (state: ProjectPipelineState) => boolean } | null
> = {
  electric_bill_collection: {
    label: "Customer's monthly electric bill recorded",
    check: (s) => s.monthlyBillSatang !== null,
  },
  site_survey: {
    label: "Site survey completed",
    check: (s) => s.surveyCompleted,
  },
  quotation_and_proposal: {
    label: "At least one quote sent",
    check: (s) => s.sentQuoteCount >= 1,
  },
  negotiation_and_followup: null,
  installation: {
    label: "Installation started",
    check: (s) => s.installationStarted,
  },
  payment: {
    label: "At least one invoice created",
    check: (s) => s.invoiceCount >= 1,
  },
  after_sales: {
    label: "Handover evidence recorded",
    check: (s) => s.handoverEvidenceCount >= 1,
  },
  archive: null,
}

/**
 * Pure function: given a project's current pipeline state, return the
 * checklist of what's required to advance past its *current* stage, and
 * whether each item is satisfied. No DB/IO — callers assemble
 * `ProjectPipelineState` and render/act on the result.
 */
export function getStageRequirements(
  state: ProjectPipelineState
): StageRequirementsResult {
  const config = STAGE_REQUIREMENTS[state.stage]

  if (!config) {
    return { stage: state.stage, requirements: [], canAdvance: true }
  }

  const met = config.check(state)
  return {
    stage: state.stage,
    requirements: [{ label: config.label, met }],
    canAdvance: met,
  }
}
