"use client"

/**
 * CR-001 ST-7 — wires the already-built (ST-5) `DocumentUpload` +
 * `DocumentGallery` into the project detail page, scoped to the project's
 * *current* stage. See docs/PROJECT_PIPELINE_REDESIGN.md: "Media section for
 * the current stage — big camera/upload button first... thumbnail grid
 * below, tap-to-open full-screen swipeable photo/video viewer."
 *
 * Both `DocumentUpload`/`DocumentGallery` are server-fetched-data-as-props
 * components (`../documents-actions.ts`'s `listDocuments` is a server
 * action), so this client wrapper owns a local `documents` copy and
 * explicitly refetches via `listDocuments` after an upload, and trims its
 * local copy after a delete — the visible gallery updates immediately either
 * way, no manual page reload needed.
 */

import { useState, useTransition } from "react"

import { DocumentUpload } from "./document-upload"
import { DocumentGallery } from "./document-gallery"
import { listDocuments, type ProjectDocumentWithUrl } from "../documents-actions"
import type { ProjectStage } from "@/lib/pipeline/stages"

export function StageMediaSection({
  projectId,
  stage,
  initialDocuments,
}: {
  projectId: string
  stage: ProjectStage
  initialDocuments: ProjectDocumentWithUrl[]
}) {
  const [documents, setDocuments] = useState(initialDocuments)
  const [, startRefetch] = useTransition()

  function refetch() {
    startRefetch(async () => {
      const res = await listDocuments(projectId, stage)
      if (res.documents) setDocuments(res.documents)
    })
  }

  return (
    <div className="space-y-4">
      <DocumentUpload projectId={projectId} stage={stage} onUploaded={refetch} />
      <DocumentGallery
        documents={documents}
        onDeleted={(id) =>
          setDocuments((current) => current.filter((d) => d.id !== id))
        }
      />
    </div>
  )
}
