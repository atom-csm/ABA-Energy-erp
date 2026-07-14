"use client"

/**
 * CR-001 ST-7 — "Stage timeline: tap any past stage to see what was
 * uploaded/logged during it" (docs/PROJECT_PIPELINE_REDESIGN.md). Groups
 * `project_documents` by stage (pure logic in `lib/pipeline/timeline.ts`) and
 * renders one collapsible section per stage that has ≥1 document, using
 * native `<details>` so browsing is genuinely tap-to-expand without a new
 * accordion primitive. Each section reuses `DocumentGallery` (grid +
 * lightbox), so a past stage's photos are as browsable as the current
 * stage's — same tap-to-open, swipe, and delete affordances.
 */

import { useState } from "react"
import { History } from "lucide-react"

import { EmptyState } from "@/components/empty-state"
import { buildStageTimeline } from "@/lib/pipeline/timeline"
import type { ProjectStage } from "@/lib/pipeline/stages"
import { DocumentGallery } from "./document-gallery"
import type { ProjectDocumentWithUrl } from "../documents-actions"

export function StageTimeline({
  documents,
  currentStage,
}: {
  documents: ProjectDocumentWithUrl[]
  currentStage: ProjectStage
}) {
  const [docs, setDocs] = useState(documents)
  const groups = buildStageTimeline(docs, currentStage)

  if (groups.length === 0) {
    return (
      <EmptyState
        icon={History}
        title="No stage history yet"
        description="Photos, videos, and documents uploaded at each stage will show up here, grouped by the stage they were taken during."
        className="border-0 p-6"
      />
    )
  }

  return (
    <div className="space-y-2">
      {groups.map((group) => (
        <details
          key={group.stage}
          open={group.defaultOpen}
          className="group rounded-md border"
        >
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5 text-sm font-medium marker:content-none">
            <span className="flex items-center gap-2">
              {group.label}
              {group.relation === "current" ? (
                <span className="text-muted-foreground text-xs font-normal">
                  (current)
                </span>
              ) : null}
            </span>
            <span className="text-muted-foreground text-xs font-normal">
              {group.documents.length} file{group.documents.length === 1 ? "" : "s"}
            </span>
          </summary>
          <div className="border-t px-3 py-3">
            <DocumentGallery
              documents={group.documents}
              onDeleted={(id) =>
                setDocs((current) => current.filter((d) => d.id !== id))
              }
            />
          </div>
        </details>
      ))}
    </div>
  )
}
