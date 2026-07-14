import { describe, it, expect } from "vitest"

import {
  initialUploadQueueState,
  uploadQueueReducer,
  isQueueSettled,
  pendingItems,
  queueSummary,
  guessDocumentKind,
  type UploadQueueState,
} from "@/lib/pipeline/upload-queue"

type Payload = { name: string }

function addOne(
  state: UploadQueueState<Payload>,
  id: string,
  filename = "roof.jpg"
): UploadQueueState<Payload> {
  return uploadQueueReducer(state, {
    type: "add",
    items: [{ id, filename, file: { name: filename } }],
  })
}

describe("initialUploadQueueState", () => {
  it("starts empty", () => {
    expect(initialUploadQueueState<Payload>()).toEqual({ items: [] })
  })
})

describe("uploadQueueReducer — add", () => {
  it("adds one or more items as pending with zero attempts and no error", () => {
    const state = uploadQueueReducer(initialUploadQueueState<Payload>(), {
      type: "add",
      items: [
        { id: "a", filename: "roof.jpg", file: { name: "roof.jpg" } },
        { id: "b", filename: "meter.jpg", file: { name: "meter.jpg" } },
      ],
    })
    expect(state.items).toHaveLength(2)
    expect(state.items[0]).toMatchObject({
      id: "a",
      filename: "roof.jpg",
      status: "pending",
      attempts: 0,
    })
    expect(state.items[0]!.error).toBeUndefined()
    expect(state.items[1]).toMatchObject({ id: "b", status: "pending" })
  })

  it("appends to an existing queue rather than replacing it", () => {
    let state = addOne(initialUploadQueueState<Payload>(), "a")
    state = addOne(state, "b")
    expect(state.items.map((i) => i.id)).toEqual(["a", "b"])
  })
})

describe("uploadQueueReducer — start", () => {
  it("transitions a pending item to uploading", () => {
    let state = addOne(initialUploadQueueState<Payload>(), "a")
    state = uploadQueueReducer(state, { type: "start", id: "a" })
    expect(state.items[0]!.status).toBe("uploading")
  })

  it("is a no-op for an unknown id", () => {
    const before = addOne(initialUploadQueueState<Payload>(), "a")
    const after = uploadQueueReducer(before, { type: "start", id: "missing" })
    expect(after).toEqual(before)
  })

  it("is a no-op when the item is already uploading or succeeded", () => {
    let state = addOne(initialUploadQueueState<Payload>(), "a")
    state = uploadQueueReducer(state, { type: "start", id: "a" })
    const uploading = uploadQueueReducer(state, { type: "start", id: "a" })
    expect(uploading).toEqual(state)

    const succeeded = uploadQueueReducer(state, { type: "success", id: "a" })
    const stillSucceeded = uploadQueueReducer(succeeded, { type: "start", id: "a" })
    expect(stillSucceeded).toEqual(succeeded)
  })
})

describe("uploadQueueReducer — success", () => {
  it("transitions an uploading item to success", () => {
    let state = addOne(initialUploadQueueState<Payload>(), "a")
    state = uploadQueueReducer(state, { type: "start", id: "a" })
    state = uploadQueueReducer(state, { type: "success", id: "a" })
    expect(state.items[0]!.status).toBe("success")
  })

  it("is a no-op for an item that is not currently uploading", () => {
    const pending = addOne(initialUploadQueueState<Payload>(), "a")
    const after = uploadQueueReducer(pending, { type: "success", id: "a" })
    expect(after).toEqual(pending)
  })
})

describe("uploadQueueReducer — error / retry", () => {
  it("transitions an uploading item to error, recording the message and incrementing attempts", () => {
    let state = addOne(initialUploadQueueState<Payload>(), "a")
    state = uploadQueueReducer(state, { type: "start", id: "a" })
    state = uploadQueueReducer(state, {
      type: "error",
      id: "a",
      message: "network error",
    })
    expect(state.items[0]).toMatchObject({
      status: "error",
      error: "network error",
      attempts: 1,
    })
  })

  it("a failed item can be retried back to pending, clearing the error but keeping attempts", () => {
    let state = addOne(initialUploadQueueState<Payload>(), "a")
    state = uploadQueueReducer(state, { type: "start", id: "a" })
    state = uploadQueueReducer(state, { type: "error", id: "a", message: "boom" })
    state = uploadQueueReducer(state, { type: "retry", id: "a" })
    expect(state.items[0]).toMatchObject({ status: "pending", attempts: 1 })
    expect(state.items[0]!.error).toBeUndefined()
  })

  it("retry is a no-op on an item that isn't in error", () => {
    const pending = addOne(initialUploadQueueState<Payload>(), "a")
    const after = uploadQueueReducer(pending, { type: "retry", id: "a" })
    expect(after).toEqual(pending)
  })

  it("supports repeated fail -> retry cycles, accumulating attempts", () => {
    let state = addOne(initialUploadQueueState<Payload>(), "a")
    for (let i = 0; i < 3; i++) {
      state = uploadQueueReducer(state, { type: "start", id: "a" })
      state = uploadQueueReducer(state, { type: "error", id: "a", message: `try ${i}` })
      state = uploadQueueReducer(state, { type: "retry", id: "a" })
    }
    expect(state.items[0]).toMatchObject({ status: "pending", attempts: 3 })
  })
})

describe("uploadQueueReducer — remove", () => {
  it("removes an item regardless of its status", () => {
    let state = addOne(initialUploadQueueState<Payload>(), "a")
    state = addOne(state, "b")
    state = uploadQueueReducer(state, { type: "remove", id: "a" })
    expect(state.items.map((i) => i.id)).toEqual(["b"])
  })

  it("is a no-op for an unknown id", () => {
    const before = addOne(initialUploadQueueState<Payload>(), "a")
    const after = uploadQueueReducer(before, { type: "remove", id: "missing" })
    expect(after).toEqual(before)
  })
})

describe("uploadQueueReducer — clearSettled", () => {
  it("removes only items in a terminal state (success/error), keeping pending/uploading", () => {
    let state = addOne(initialUploadQueueState<Payload>(), "a")
    state = addOne(state, "b")
    state = addOne(state, "c")
    state = uploadQueueReducer(state, { type: "start", id: "a" })
    state = uploadQueueReducer(state, { type: "success", id: "a" })
    state = uploadQueueReducer(state, { type: "start", id: "b" })
    state = uploadQueueReducer(state, { type: "error", id: "b", message: "x" })
    // "c" stays pending
    const after = uploadQueueReducer(state, { type: "clearSettled" })
    expect(after.items.map((i) => i.id)).toEqual(["c"])
  })

  it("is a no-op on an empty queue", () => {
    const empty = initialUploadQueueState<Payload>()
    expect(uploadQueueReducer(empty, { type: "clearSettled" })).toEqual(empty)
  })
})

describe("isQueueSettled", () => {
  it("is true for an empty queue", () => {
    expect(isQueueSettled(initialUploadQueueState<Payload>())).toBe(true)
  })

  it("is false while any item is pending or uploading", () => {
    let state = addOne(initialUploadQueueState<Payload>(), "a")
    expect(isQueueSettled(state)).toBe(false)
    state = uploadQueueReducer(state, { type: "start", id: "a" })
    expect(isQueueSettled(state)).toBe(false)
  })

  it("is true once every item is success or error (a failed-but-not-retried item still counts as settled)", () => {
    let state = addOne(initialUploadQueueState<Payload>(), "a")
    state = addOne(state, "b")
    state = uploadQueueReducer(state, { type: "start", id: "a" })
    state = uploadQueueReducer(state, { type: "success", id: "a" })
    state = uploadQueueReducer(state, { type: "start", id: "b" })
    state = uploadQueueReducer(state, { type: "error", id: "b", message: "x" })
    expect(isQueueSettled(state)).toBe(true)
  })

  it("goes back to false if a settled-error item is retried", () => {
    let state = addOne(initialUploadQueueState<Payload>(), "a")
    state = uploadQueueReducer(state, { type: "start", id: "a" })
    state = uploadQueueReducer(state, { type: "error", id: "a", message: "x" })
    expect(isQueueSettled(state)).toBe(true)
    state = uploadQueueReducer(state, { type: "retry", id: "a" })
    expect(isQueueSettled(state)).toBe(false)
  })
})

describe("pendingItems", () => {
  it("returns only items currently pending, in queue order", () => {
    let state = addOne(initialUploadQueueState<Payload>(), "a")
    state = addOne(state, "b")
    state = addOne(state, "c")
    state = uploadQueueReducer(state, { type: "start", id: "b" })
    expect(pendingItems(state).map((i) => i.id)).toEqual(["a", "c"])
  })
})

describe("guessDocumentKind", () => {
  it("uses the MIME type when present", () => {
    expect(guessDocumentKind("roof.jpg", "image/jpeg")).toBe("photo")
    expect(guessDocumentKind("install.mp4", "video/mp4")).toBe("video")
    expect(guessDocumentKind("bill.pdf", "application/pdf")).toBe("document")
  })

  it("falls back to the extension when the MIME type is empty (e.g. some phones' HEIC captures)", () => {
    expect(guessDocumentKind("IMG_1234.HEIC", "")).toBe("photo")
    expect(guessDocumentKind("clip.mov", "")).toBe("video")
  })

  it("falls back to 'document' when neither MIME type nor extension is recognized", () => {
    expect(guessDocumentKind("mystery", "")).toBe("document")
    expect(guessDocumentKind("data.xyz", "application/octet-stream")).toBe("document")
  })
})

describe("queueSummary", () => {
  it("counts items per status plus a total", () => {
    let state = addOne(initialUploadQueueState<Payload>(), "a")
    state = addOne(state, "b")
    state = addOne(state, "c")
    state = uploadQueueReducer(state, { type: "start", id: "a" })
    state = uploadQueueReducer(state, { type: "success", id: "a" })
    state = uploadQueueReducer(state, { type: "start", id: "b" })
    state = uploadQueueReducer(state, { type: "error", id: "b", message: "x" })
    expect(queueSummary(state)).toEqual({
      total: 3,
      pending: 1,
      uploading: 0,
      success: 1,
      error: 1,
    })
  })
})
