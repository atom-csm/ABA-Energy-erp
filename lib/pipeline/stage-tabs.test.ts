import { describe, it, expect } from "vitest"

import { swipeToAdjacentStageIndex } from "@/lib/pipeline/stage-tabs"

describe("swipeToAdjacentStageIndex", () => {
  it("advances to the next tab on a large enough leftward swipe", () => {
    expect(swipeToAdjacentStageIndex(2, 8, -80)).toBe(3)
  })

  it("goes back to the previous tab on a large enough rightward swipe", () => {
    expect(swipeToAdjacentStageIndex(2, 8, 80)).toBe(1)
  })

  it("ignores small movements below the threshold (a tap, not a swipe)", () => {
    expect(swipeToAdjacentStageIndex(2, 8, 10)).toBe(2)
    expect(swipeToAdjacentStageIndex(2, 8, -10)).toBe(2)
    expect(swipeToAdjacentStageIndex(2, 8, 0)).toBe(2)
  })

  it("clamps at the last tab instead of wrapping to the first", () => {
    expect(swipeToAdjacentStageIndex(7, 8, -80)).toBe(7)
  })

  it("clamps at the first tab instead of wrapping to the last", () => {
    expect(swipeToAdjacentStageIndex(0, 8, 80)).toBe(0)
  })

  it("respects a custom threshold", () => {
    expect(swipeToAdjacentStageIndex(2, 8, 30, 20)).toBe(1)
    expect(swipeToAdjacentStageIndex(2, 8, 15, 20)).toBe(2)
  })

  it("is a no-op when there are no tabs", () => {
    expect(swipeToAdjacentStageIndex(0, 0, -80)).toBe(0)
  })

  it("stays put with a single tab", () => {
    expect(swipeToAdjacentStageIndex(0, 1, -80)).toBe(0)
    expect(swipeToAdjacentStageIndex(0, 1, 80)).toBe(0)
  })
})
