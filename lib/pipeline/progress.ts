/**
 * CR-001 ST-7 — pure "where in the pipeline is this" math for the project
 * detail page's stage header ("stage N of 8" progress indicator) and stage
 * timeline (past/current/future section styling). See
 * docs/PROJECT_PIPELINE_REDESIGN.md's "Header: name, client, current stage
 * badge, 'stage 3 of 8' progress bar."
 *
 * No I/O — just index lookups against `STAGES` (lib/pipeline/stages.ts).
 */

import { STAGES, type ProjectStage } from "./stages"

export type StageProgress = {
  stage: ProjectStage
  /** 0-based index into `STAGES`. */
  index: number
  /** 1-based "stage N of total" position — what the UI shows. */
  position: number
  /** Total number of stages (`STAGES.length`). */
  total: number
}

/**
 * Where `stage` sits in the fixed 8-stage pipeline. `STAGES` is the single
 * source of truth for stage order — this never hand-maintains its own list.
 */
export function getStageProgress(stage: ProjectStage): StageProgress {
  const index = STAGES.findIndex((s) => s.value === stage)
  const safeIndex = index === -1 ? 0 : index
  return {
    stage,
    index: safeIndex,
    position: safeIndex + 1,
    total: STAGES.length,
  }
}

export type StageRelation = "past" | "current" | "future"

/**
 * Where `stage` sits relative to `currentStage` in pipeline order — used to
 * decide, e.g., which stage-timeline section is "the current one" versus
 * history from before it.
 */
export function compareStageToCurrent(
  stage: ProjectStage,
  currentStage: ProjectStage
): StageRelation {
  const a = getStageProgress(stage).index
  const b = getStageProgress(currentStage).index
  if (a === b) return "current"
  return a < b ? "past" : "future"
}
