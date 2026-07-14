/**
 * CR-001 ST-5 — pure upload-queue state machine backing the project
 * document/photo/video upload UI (see docs/PROJECT_PIPELINE_REDESIGN.md's
 * "upload queue with progress + retry" mobile requirement, and ST-3's
 * `createUploadUrl`/`confirmUpload` in `app/(app)/projects/documents-actions.ts`
 * that this queue drives).
 *
 * This module has no DOM/React/Supabase dependency by design — the actual
 * upload component (thin, untested, matching this repo's established
 * convention for DB/IO glue) owns a `useReducer(uploadQueueReducer, ...)` and
 * calls `createUploadUrl`/`uploadToSignedUrl`/`confirmUpload` from its
 * effects, dispatching `start`/`success`/`error` as those calls settle. Every
 * transition below is a pure function of (state, action), so the whole
 * pending→uploading→success/error→retry→settled lifecycle is testable
 * without mocking React or Supabase.
 *
 * `T` is the caller's file-payload type (a browser `File` in the real
 * component); this module never inspects it, so tests can pass plain objects.
 */

export type UploadStatus = "pending" | "uploading" | "success" | "error"

export type UploadQueueItem<T = unknown> = {
  id: string
  file: T
  filename: string
  status: UploadStatus
  /** Set on the most recent failure; cleared on retry. */
  error?: string
  /** How many times this item has entered the "error" state. */
  attempts: number
}

export type UploadQueueState<T = unknown> = {
  items: UploadQueueItem<T>[]
}

/**
 * A best-effort guess at the document "kind" (photo/video/document) from a
 * picked file's MIME type, falling back to its extension. This is only a
 * *hint* for which kind to request an upload URL for — `isAllowedFilename`
 * (`lib/pipeline/documents.ts`) remains the authoritative validator, and the
 * server re-validates regardless. The fallback matters because some mobile
 * camera apps hand back an empty/generic `file.type` for HEIC captures.
 */
export function guessDocumentKind(filename: string, mimeType: string): "photo" | "video" | "document" {
  if (mimeType.startsWith("image/")) return "photo"
  if (mimeType.startsWith("video/")) return "video"
  if (mimeType === "application/pdf") return "document"

  const ext = /\.([a-zA-Z0-9]+)$/.exec(filename.trim())?.[1]?.toLowerCase()
  if (ext && ["jpg", "jpeg", "png", "webp", "heic", "heif"].includes(ext)) return "photo"
  if (ext && ["mp4", "mov"].includes(ext)) return "video"
  return "document"
}

export type NewUploadQueueItem<T> = {
  id: string
  file: T
  filename: string
}

export type UploadQueueAction<T = unknown> =
  | { type: "add"; items: NewUploadQueueItem<T>[] }
  | { type: "start"; id: string }
  | { type: "success"; id: string }
  | { type: "error"; id: string; message: string }
  | { type: "retry"; id: string }
  | { type: "remove"; id: string }
  | { type: "clearSettled" }

/** A fresh, empty queue. */
export function initialUploadQueueState<T = unknown>(): UploadQueueState<T> {
  return { items: [] }
}

function updateItem<T>(
  state: UploadQueueState<T>,
  id: string,
  when: (item: UploadQueueItem<T>) => boolean,
  update: (item: UploadQueueItem<T>) => UploadQueueItem<T>
): UploadQueueState<T> {
  const index = state.items.findIndex((i) => i.id === id)
  if (index === -1) return state
  const item = state.items[index]!
  if (!when(item)) return state

  const items = state.items.slice()
  items[index] = update(item)
  return { items }
}

/**
 * The queue's state machine. Every transition is guarded by the item's
 * current status — an action that doesn't make sense from the current state
 * (e.g. `success` on an item that isn't `uploading`) is a no-op returning the
 * same state reference, so callers/tests can assert "nothing changed" with a
 * plain equality check.
 */
export function uploadQueueReducer<T>(
  state: UploadQueueState<T>,
  action: UploadQueueAction<T>
): UploadQueueState<T> {
  switch (action.type) {
    case "add": {
      if (action.items.length === 0) return state
      const newItems: UploadQueueItem<T>[] = action.items.map((i) => ({
        id: i.id,
        file: i.file,
        filename: i.filename,
        status: "pending",
        attempts: 0,
      }))
      return { items: [...state.items, ...newItems] }
    }

    case "start":
      return updateItem(
        state,
        action.id,
        (item) => item.status === "pending" || item.status === "error",
        (item) => ({ ...item, status: "uploading", error: undefined })
      )

    case "success":
      return updateItem(
        state,
        action.id,
        (item) => item.status === "uploading",
        (item) => ({ ...item, status: "success", error: undefined })
      )

    case "error":
      return updateItem(
        state,
        action.id,
        (item) => item.status === "uploading",
        (item) => ({
          ...item,
          status: "error",
          error: action.message,
          attempts: item.attempts + 1,
        })
      )

    case "retry":
      return updateItem(
        state,
        action.id,
        (item) => item.status === "error",
        (item) => ({ ...item, status: "pending", error: undefined })
      )

    case "remove": {
      if (!state.items.some((i) => i.id === action.id)) return state
      return { items: state.items.filter((i) => i.id !== action.id) }
    }

    case "clearSettled": {
      const remaining = state.items.filter(
        (i) => i.status !== "success" && i.status !== "error"
      )
      if (remaining.length === state.items.length) return state
      return { items: remaining }
    }

    default:
      return state
  }
}

/**
 * True once every item is in a terminal state (`success` or `error`) — i.e.
 * nothing is still `pending`/`uploading`. An empty queue counts as settled
 * (there's nothing to wait for). An item sitting in `error` counts as
 * settled even without being retried or dismissed — "settled" means "not
 * actively in flight," not "fully successful."
 */
export function isQueueSettled<T>(state: UploadQueueState<T>): boolean {
  return state.items.every((i) => i.status === "success" || i.status === "error")
}

/** Items currently `pending` — what an upload loop should pick up next. */
export function pendingItems<T>(state: UploadQueueState<T>): UploadQueueItem<T>[] {
  return state.items.filter((i) => i.status === "pending")
}

export type QueueSummary = {
  total: number
  pending: number
  uploading: number
  success: number
  error: number
}

/** Per-status counts, handy for a compact "2 uploading, 1 failed" label. */
export function queueSummary<T>(state: UploadQueueState<T>): QueueSummary {
  const summary: QueueSummary = { total: state.items.length, pending: 0, uploading: 0, success: 0, error: 0 }
  for (const item of state.items) {
    summary[item.status]++
  }
  return summary
}
