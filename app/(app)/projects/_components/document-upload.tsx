"use client"

/**
 * CR-001 ST-5 — camera/upload button + queue UI for project stage evidence.
 * See docs/PROJECT_PIPELINE_REDESIGN.md ("big camera/upload button... upload
 * queue with progress + retry — site wifi/cellular is unreliable, so a photo
 * that fails to upload shouldn't just vanish").
 *
 * Not wired into any page yet (that's ST-7) — self-contained and ready to be
 * dropped into the project detail page's Documents section with a
 * `projectId`/`stage` and, once landed, an `onUploaded` refetch callback.
 *
 * All queue state transitions (pending → uploading → success/error → retry)
 * are delegated to the pure `uploadQueueReducer` in
 * `lib/pipeline/upload-queue.ts`, which is exhaustively unit-tested. This
 * component is the thin, deliberately-untested glue that calls the actual
 * upload APIs and dispatches into that reducer — matching the pattern
 * already established for `documents-actions.ts` itself.
 */

import { useReducer, useRef } from "react"
import { Camera, Loader2, RotateCw, X, AlertCircle, CheckCircle2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { createClient } from "@/lib/supabase/client"
import { isAllowedFilename } from "@/lib/pipeline/documents"
import {
  initialUploadQueueState,
  uploadQueueReducer,
  guessDocumentKind,
  isQueueSettled,
  queueSummary,
  type UploadQueueItem,
} from "@/lib/pipeline/upload-queue"
import type { ProjectStage } from "@/lib/pipeline/stages"
import { createUploadUrl, confirmUpload } from "../documents-actions"

/**
 * Must match `DOCUMENTS_BUCKET` in `../documents-actions.ts`. Can't import it
 * from there: that file has `"use server"` at the top, which only allows
 * async-function exports, so a plain string constant can't be re-exported
 * from it. Duplicated here deliberately rather than refactoring the
 * already-merged/reviewed ST-3 file for this.
 */
const DOCUMENTS_BUCKET = "project-media"

export function DocumentUpload({
  projectId,
  stage,
  onUploaded,
  className,
}: {
  projectId: string
  stage: ProjectStage
  /** Called after each file successfully uploads — hook to refetch the list. */
  onUploaded?: () => void
  className?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [state, dispatch] = useReducer(
    uploadQueueReducer<File>,
    initialUploadQueueState<File>()
  )

  async function performUpload(id: string, file: File) {
    dispatch({ type: "start", id })
    try {
      const kind = guessDocumentKind(file.name, file.type)
      if (!isAllowedFilename(kind, file.name)) {
        throw new Error(`"${file.name}" isn't a supported photo, video, or PDF.`)
      }

      const created = await createUploadUrl({ projectId, stage, kind, filename: file.name })
      // Narrow on the presence of `path` (only on the success variant)
      // rather than the truthiness of `error` — `error` is typed as `string`
      // on the failure variant, so TS can't rule out an (impossible but
      // type-legal) empty string there and won't narrow on truthiness alone.
      if (!("path" in created)) throw new Error(created.error)

      const supabase = createClient()
      const { error: uploadError } = await supabase.storage
        .from(DOCUMENTS_BUCKET)
        .uploadToSignedUrl(created.path, created.token, file)
      if (uploadError) throw new Error(uploadError.message)

      const confirmed = await confirmUpload({
        projectId,
        stage,
        kind,
        storagePath: created.path,
      })
      if (confirmed.error) throw new Error(confirmed.error)

      dispatch({ type: "success", id })
      onUploaded?.()
    } catch (err) {
      dispatch({
        type: "error",
        id,
        message: err instanceof Error ? err.message : "Upload failed",
      })
    }
  }

  function handleFiles(fileList: FileList | null) {
    if (!fileList || fileList.length === 0) return
    const items = Array.from(fileList).map((file) => ({
      id: crypto.randomUUID(),
      file,
      filename: file.name,
    }))
    dispatch({ type: "add", items })
    for (const item of items) {
      void performUpload(item.id, item.file)
    }
    // Reset so picking the same file again (e.g. after removing it from the
    // queue) still fires a change event.
    if (inputRef.current) inputRef.current.value = ""
  }

  function retry(item: UploadQueueItem<File>) {
    dispatch({ type: "retry", id: item.id })
    void performUpload(item.id, item.file)
  }

  const summary = queueSummary(state)
  const settled = isQueueSettled(state)

  return (
    <div className={cn("space-y-3", className)}>
      {/* `capture="environment"` opens the phone's camera directly when
          tapped; picking from the gallery instead is still available since
          that's the browser's normal file-input behavior. */}
      <input
        ref={inputRef}
        type="file"
        accept="image/*,video/*,application/pdf"
        capture="environment"
        multiple
        className="sr-only"
        onChange={(e) => handleFiles(e.target.files)}
      />
      <Button type="button" onClick={() => inputRef.current?.click()}>
        <Camera className="size-4" /> Add photo or file
      </Button>

      {state.items.length > 0 ? (
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {summary.uploading > 0 ? `Uploading ${summary.uploading}… ` : ""}
              {summary.success > 0 ? `${summary.success} done. ` : ""}
              {summary.error > 0 ? `${summary.error} failed.` : ""}
            </span>
            {settled ? (
              <button
                type="button"
                className="hover:underline"
                onClick={() => dispatch({ type: "clearSettled" })}
              >
                Clear
              </button>
            ) : null}
          </div>
          <ul className="space-y-1.5">
            {state.items.map((item) => (
              <li key={item.id} className="rounded-md border bg-card px-2.5 py-2 text-sm">
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate">{item.filename}</span>
                  {item.status === "uploading" ? (
                    <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" />
                  ) : item.status === "success" ? (
                    <CheckCircle2 className="size-4 shrink-0 text-emerald-600" />
                  ) : item.status === "error" ? (
                    <Button
                      type="button"
                      size="icon"
                      variant="ghost"
                      aria-label={`Retry uploading ${item.filename}`}
                      onClick={() => retry(item)}
                    >
                      <RotateCw className="size-4" />
                    </Button>
                  ) : (
                    <span className="shrink-0 text-xs text-muted-foreground">Waiting…</span>
                  )}
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    aria-label={`Remove ${item.filename} from the upload queue`}
                    onClick={() => dispatch({ type: "remove", id: item.id })}
                  >
                    <X className="size-4" />
                  </Button>
                </div>
                {item.status === "error" && item.error ? (
                  <p className="mt-1 flex items-center gap-1 text-xs text-destructive">
                    <AlertCircle className="size-3.5 shrink-0" />
                    {item.error}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
