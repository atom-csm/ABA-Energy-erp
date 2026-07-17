import { describe, it, expect } from "vitest"

import { gpPercent } from "./margin"

describe("gpPercent", () => {
  it("computes GP% = (price - cost) / price × 100", () => {
    // BOQ row: cost ฿3,486, price ฿4,000 → 12.85%
    expect(gpPercent(400000, 348600)).toBeCloseTo(12.85, 2)
  })

  it("is negative when selling below cost", () => {
    expect(gpPercent(300000, 348600)).toBeCloseTo(-16.2, 1)
  })

  it("returns null when cost is unknown", () => {
    expect(gpPercent(400000, null)).toBeNull()
  })

  it("returns null when price is zero (no division blowup)", () => {
    expect(gpPercent(0, 348600)).toBeNull()
  })

  it("is 100% when cost is zero", () => {
    expect(gpPercent(400000, 0)).toBe(100)
  })
})
