import { describe, it, expect } from "vitest"

import {
  DOCUMENT_KINDS,
  isAllowedFilename,
  sanitizeFilename,
  buildStoragePath,
  deleteWithOrphanGuard,
} from "@/lib/pipeline/documents"

describe("DOCUMENT_KINDS", () => {
  it("is exactly photo/video/document", () => {
    expect(DOCUMENT_KINDS).toEqual(["photo", "video", "document"])
  })
})

describe("isAllowedFilename", () => {
  it("accepts every allowed photo extension, case-insensitively", () => {
    for (const ext of ["jpg", "JPG", "jpeg", "png", "PNG", "webp", "heic", "heif"]) {
      expect(isAllowedFilename("photo", `roof.${ext}`)).toBe(true)
    }
  })

  it("accepts every allowed video extension", () => {
    expect(isAllowedFilename("video", "install.mp4")).toBe(true)
    expect(isAllowedFilename("video", "install.MOV")).toBe(true)
  })

  it("accepts pdf for document kind", () => {
    expect(isAllowedFilename("document", "electric-bill.pdf")).toBe(true)
  })

  it("rejects an extension not allowed for the given kind", () => {
    expect(isAllowedFilename("photo", "bill.pdf")).toBe(false)
    expect(isAllowedFilename("document", "roof.jpg")).toBe(false)
    expect(isAllowedFilename("video", "roof.jpg")).toBe(false)
  })

  it("rejects a filename with no extension", () => {
    expect(isAllowedFilename("photo", "roofphoto")).toBe(false)
  })

  it("rejects an empty filename", () => {
    expect(isAllowedFilename("photo", "")).toBe(false)
    expect(isAllowedFilename("photo", "   ")).toBe(false)
  })

  it("rejects a disguised double extension trying to smuggle a script", () => {
    // ".jpg.exe" — the real (last) extension is what's checked, and "exe" is
    // not in any allow-list, so this is correctly rejected.
    expect(isAllowedFilename("photo", "roof.jpg.exe")).toBe(false)
  })
})

describe("sanitizeFilename", () => {
  it("keeps a normal filename unchanged", () => {
    expect(sanitizeFilename("roof-photo_1.jpg")).toBe("roof-photo_1.jpg")
  })

  it("replaces forward slashes so no extra path segment can be smuggled in", () => {
    const sanitized = sanitizeFilename("../../etc/passwd.jpg")
    expect(sanitized).not.toContain("/")
  })

  it("replaces backslashes too", () => {
    expect(sanitizeFilename("evil\\path.jpg")).not.toContain("\\")
  })

  it("strips leading dots (hidden-file / traversal prefix)", () => {
    expect(sanitizeFilename("...secret.jpg").startsWith(".")).toBe(false)
  })

  it("replaces spaces and other unsafe characters", () => {
    expect(sanitizeFilename("roof photo (1)!.jpg")).toBe("roof_photo__1__.jpg")
  })

  it("falls back to a safe default when nothing is left after sanitizing", () => {
    expect(sanitizeFilename("...")).toBe("file")
  })
})

describe("buildStoragePath", () => {
  it("builds the {org_id}/{project_id}/{stage}/{filename} convention with a unique prefix", () => {
    const path = buildStoragePath({
      orgId: "11111111-1111-1111-1111-111111111111",
      projectId: "22222222-2222-2222-2222-222222222222",
      stage: "site_survey",
      filename: "roof.jpg",
      uniqueId: "fixed-id",
    })
    expect(path).toBe(
      "11111111-1111-1111-1111-111111111111/22222222-2222-2222-2222-222222222222/site_survey/fixed-id-roof.jpg"
    )
  })

  it("always produces exactly four path segments even with a hostile filename", () => {
    const path = buildStoragePath({
      orgId: "org-1",
      projectId: "proj-1",
      stage: "installation",
      filename: "../../etc/passwd.jpg",
      uniqueId: "fixed-id",
    })
    expect(path.split("/")).toHaveLength(4)
  })

  it("generates a random unique id when none is supplied, so repeated filenames never collide", () => {
    const a = buildStoragePath({
      orgId: "org-1",
      projectId: "proj-1",
      stage: "installation",
      filename: "IMG_0001.jpg",
    })
    const b = buildStoragePath({
      orgId: "org-1",
      projectId: "proj-1",
      stage: "installation",
      filename: "IMG_0001.jpg",
    })
    expect(a).not.toBe(b)
  })
})

describe("deleteWithOrphanGuard", () => {
  it("deletes the row only after storage removal succeeds", async () => {
    let rowDeleted = false
    const result = await deleteWithOrphanGuard(
      async () => ({ error: null }),
      async () => {
        rowDeleted = true
        return { error: null }
      }
    )
    expect(result).toEqual({})
    expect(rowDeleted).toBe(true)
  })

  it("does NOT delete the row when storage removal fails, and surfaces the error", async () => {
    let rowDeleted = false
    const result = await deleteWithOrphanGuard(
      async () => ({ error: "network error" }),
      async () => {
        rowDeleted = true
        return { error: null }
      }
    )
    expect(rowDeleted).toBe(false)
    expect(result.error).toMatch(/storage/i)
    expect(result.error).toMatch(/network error/)
  })

  it("surfaces an error (does not silently succeed) when the row delete fails after a successful storage delete", async () => {
    const result = await deleteWithOrphanGuard(
      async () => ({ error: null }),
      async () => ({ error: "db unavailable" })
    )
    expect(result.error).toBeTruthy()
    expect(result.error).toMatch(/db unavailable/)
  })
})
