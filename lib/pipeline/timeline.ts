/**
 * CR-001 ST-7 — pure grouping logic for the project detail page's "stage
 * timeline" section. See docs/PROJECT_PIPELINE_REDESIGN.md: "Stage timeline —
 * tap any past stage to see what was uploaded/logged during it."
 *
 * The simplest honest implementation of that is grouping `project_documents`
 * (already fetched via `listDocuments(projectId)`, no stage filter — see
 * `app/(app)/projects/documents-actions.ts`) by their `stage` column, one
 * section per stage that actually has at least one document, ordered to match
 * the pipeline (`STAGES`) rather than upload recency. No I/O here — callers
 * fetch the documents and pass them in.
 */

import { STAGES, type ProjectStage } from "./stages"
import { compareStageToCurrent, type StageRelation } from "./progress"

export type StageTimelineGroup<T> = {
  stage: ProjectStage
  label: string
  documents: T[]
  relation: StageRelation
  /** True for the single group the UI should expand by default. */
  defaultOpen: boolean
}

/**
 * Groups `documents` by their `stage` field, in pipeline order, keeping only
 * stages that have at least one document. The group matching `currentStage`
 * (if any has documents) is marked as the default-open one — "most relevant"
 * per the design doc. If the current stage has no documents yet, the group
 * furthest along the pipeline (closest to the current stage) is expanded
 * instead, so the timeline never opens on an arbitrary/empty-feeling section.
 */
export function buildStageTimeline<T extends { stage: ProjectStage }>(
  documents: T[],
  currentStage: ProjectStage
): StageTimelineGroup<T>[] {
  const byStage = new Map<ProjectStage, T[]>()
  for (const doc of documents) {
    byStage.set(doc.stage, [...(byStage.get(doc.stage) ?? []), doc])
  }

  const groups: StageTimelineGroup<T>[] = STAGES.filter((s) =>
    byStage.has(s.value)
  ).map((s) => ({
    stage: s.value,
    label: s.label,
    documents: byStage.get(s.value)!,
    relation: compareStageToCurrent(s.value, currentStage),
    defaultOpen: false,
  }))

  if (groups.length === 0) return groups

  const currentIndex = groups.findIndex((g) => g.relation === "current")
  const openIndex = currentIndex !== -1 ? currentIndex : groups.length - 1
  groups[openIndex] = { ...groups[openIndex]!, defaultOpen: true }

  return groups
}
