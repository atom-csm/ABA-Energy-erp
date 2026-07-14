"use client"

/**
 * CR-001 ST-5 — thumbnail grid + full-screen lightbox for project stage
 * documents (photos/videos/PDFs uploaded via `document-upload.tsx`). See
 * docs/PROJECT_PIPELINE_REDESIGN.md's "thumbnail grid below, tap-to-open
 * full-screen swipeable photo/video viewer."
 *
 * Not wired into any page yet (that's ST-7) — this file takes
 * `ProjectDocumentWithUrl[]` as a prop (the shape `listDocuments()` in
 * `../documents-actions.ts` returns), same pattern as this codebase's other
 * `_components` that receive server-fetched data as props (e.g.
 * `handover-evidence-section.tsx`'s `items`) rather than fetching themselves.
 *
 * All index/keyboard/swipe math is delegated to the pure, unit-tested
 * `lib/pipeline/lightbox.ts`. This component is the thin, deliberately-
 * untested rendering/event-wiring layer around it.
 */

import { useEffect, useRef, useState, useTransition } from "react"
import { toast } from "sonner"
import { ChevronLeft, ChevronRight, FileText, Trash2, Video, X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { formatDateTime } from "@/lib/dates"
import {
  getNextIndex,
  getPrevIndex,
  handleLightboxKey,
  swipeDeltaToAction,
} from "@/lib/pipeline/lightbox"
import { deleteDocument } from "../documents-actions"
import type { ProjectDocumentWithUrl } from "../documents-actions"

// ── Thumbnail grid ───────────────────────────────────────────────────────────

export function DocumentThumbnailGrid({
  documents,
  onSelect,
  className,
}: {
  documents: ProjectDocumentWithUrl[]
  onSelect: (index: number) => void
  className?: string
}) {
  if (documents.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        No photos or files for this stage yet. Use the upload button above to add one.
      </p>
    )
  }

  return (
    <div
      className={cn(
        "grid grid-cols-3 gap-2 sm:grid-cols-4 md:grid-cols-6",
        className
      )}
    >
      {documents.map((doc, index) => (
        <button
          key={doc.id}
          type="button"
          onClick={() => onSelect(index)}
          aria-label={doc.caption ?? `Open ${doc.kind} ${index + 1}`}
          className="relative aspect-square overflow-hidden rounded-md border bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
        >
          {doc.kind === "photo" && doc.signedUrl ? (
            // Signed URLs are short-lived Supabase Storage URLs, not
            // something next/image's remote-pattern config should need to
            // know about.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={doc.signedUrl}
              alt={doc.caption ?? "Project photo"}
              loading="lazy"
              className="size-full object-cover"
            />
          ) : doc.kind === "video" ? (
            <div className="flex size-full items-center justify-center bg-muted-foreground/10">
              <Video className="text-muted-foreground size-6" />
            </div>
          ) : (
            <div className="flex size-full items-center justify-center bg-muted-foreground/10">
              <FileText className="text-muted-foreground size-6" />
            </div>
          )}
        </button>
      ))}
    </div>
  )
}

// ── Lightbox ─────────────────────────────────────────────────────────────────

export function DocumentLightbox({
  documents,
  index,
  onClose,
  onNavigate,
  onDeleted,
}: {
  documents: ProjectDocumentWithUrl[]
  index: number
  onClose: () => void
  onNavigate: (index: number) => void
  onDeleted?: (id: string) => void
}) {
  const touchStartX = useRef<number | null>(null)
  const [pending, startTransition] = useTransition()
  const current = documents[index]

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const result = handleLightboxKey(e.key, documents.length, index)
      if (!result) return
      e.preventDefault()
      if (result.action === "close") onClose()
      else onNavigate(result.index)
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [documents.length, index, onClose, onNavigate])

  if (!current) return null

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0]?.clientX ?? null
  }

  function handleTouchEnd(e: React.TouchEvent) {
    const startX = touchStartX.current
    touchStartX.current = null
    if (startX === null) return
    const endX = e.changedTouches[0]?.clientX ?? startX
    const action = swipeDeltaToAction(endX - startX)
    if (action === "next") onNavigate(getNextIndex(documents.length, index))
    else if (action === "prev") onNavigate(getPrevIndex(documents.length, index))
  }

  function handleDelete() {
    startTransition(async () => {
      const res = await deleteDocument({ id: current!.id })
      if (res.error) {
        toast.error(res.error)
        return
      }
      toast.success("Deleted")
      onDeleted?.(current!.id)
      onClose()
    })
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/95 text-white"
      role="dialog"
      aria-modal="true"
      aria-label="Document viewer"
    >
      <div className="flex items-center justify-between gap-2 px-3 py-2">
        <span className="text-sm text-white/70">
          {index + 1} / {documents.length}
        </span>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label="Delete this file"
            disabled={pending}
            onClick={handleDelete}
            className="text-white hover:bg-white/10 hover:text-white"
          >
            <Trash2 className="size-4" />
          </Button>
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label="Close"
            onClick={onClose}
            className="text-white hover:bg-white/10 hover:text-white"
          >
            <X className="size-5" />
          </Button>
        </div>
      </div>

      <div
        className="relative flex flex-1 items-center justify-center overflow-hidden px-2"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {documents.length > 1 ? (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label="Previous"
            onClick={() => onNavigate(getPrevIndex(documents.length, index))}
            className="absolute left-2 hidden text-white hover:bg-white/10 hover:text-white sm:inline-flex"
          >
            <ChevronLeft className="size-6" />
          </Button>
        ) : null}

        {current.kind === "photo" ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={current.signedUrl ?? undefined}
            alt={current.caption ?? "Project photo"}
            className="max-h-full max-w-full object-contain"
          />
        ) : current.kind === "video" ? (
          <video
            key={current.id}
            src={current.signedUrl ?? undefined}
            controls
            className="max-h-full max-w-full"
          />
        ) : (
          <a
            href={current.signedUrl ?? undefined}
            target="_blank"
            rel="noreferrer"
            className="flex flex-col items-center gap-3 rounded-md border border-white/20 bg-white/5 px-8 py-10 text-white hover:bg-white/10"
          >
            <FileText className="size-10" />
            Open document
          </a>
        )}

        {documents.length > 1 ? (
          <Button
            type="button"
            size="icon"
            variant="ghost"
            aria-label="Next"
            onClick={() => onNavigate(getNextIndex(documents.length, index))}
            className="absolute right-2 hidden text-white hover:bg-white/10 hover:text-white sm:inline-flex"
          >
            <ChevronRight className="size-6" />
          </Button>
        ) : null}
      </div>

      <div className="space-y-0.5 px-3 py-2 text-center text-xs text-white/70">
        {current.caption ? <p className="text-sm text-white">{current.caption}</p> : null}
        <p>{formatDateTime(current.created_at)}</p>
      </div>
    </div>
  )
}

// ── Self-contained gallery (grid + lightbox) ────────────────────────────────

/**
 * Owns the "which index is open" state so a caller can drop in a single
 * component. Deletion updates the caller via `onDeleted` (the parent owns
 * the `documents` array/refetch, per this repo's props-down convention) —
 * the lightbox simply closes after a successful delete rather than trying to
 * keep its own index in sync with a prop array it doesn't own.
 */
export function DocumentGallery({
  documents,
  onDeleted,
  className,
}: {
  documents: ProjectDocumentWithUrl[]
  onDeleted?: (id: string) => void
  className?: string
}) {
  const [openIndex, setOpenIndex] = useState<number | null>(null)

  return (
    <>
      <DocumentThumbnailGrid
        documents={documents}
        onSelect={setOpenIndex}
        className={className}
      />
      {openIndex !== null && documents[openIndex] ? (
        <DocumentLightbox
          documents={documents}
          index={openIndex}
          onClose={() => setOpenIndex(null)}
          onNavigate={setOpenIndex}
          onDeleted={onDeleted}
        />
      ) : null}
    </>
  )
}
