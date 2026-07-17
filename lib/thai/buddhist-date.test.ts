import { describe, it, expect } from "vitest"

import { formatThaiDate } from "./buddhist-date"

describe("formatThaiDate (ISO CE date → Thai Buddhist-calendar display)", () => {
  it("matches the real quotation's header format", () => {
    expect(formatThaiDate("2026-07-07")).toBe("07 ก.ค. 2569")
  })

  it("converts the year by +543", () => {
    expect(formatThaiDate("2025-01-31")).toBe("31 ม.ค. 2568")
  })

  it("covers every month abbreviation", () => {
    const months = [
      "ม.ค.",
      "ก.พ.",
      "มี.ค.",
      "เม.ย.",
      "พ.ค.",
      "มิ.ย.",
      "ก.ค.",
      "ส.ค.",
      "ก.ย.",
      "ต.ค.",
      "พ.ย.",
      "ธ.ค.",
    ]
    months.forEach((abbr, i) => {
      const mm = String(i + 1).padStart(2, "0")
      expect(formatThaiDate(`2026-${mm}-15`)).toBe(`15 ${abbr} 2569`)
    })
  })

  it("keeps the day zero-padded", () => {
    expect(formatThaiDate("2026-06-07")).toBe("07 มิ.ย. 2569")
  })

  it("returns null for null/empty input", () => {
    expect(formatThaiDate(null)).toBeNull()
    expect(formatThaiDate("")).toBeNull()
  })
})
