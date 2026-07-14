import { describe, it, expect } from "vitest"

import { getStageProgress, compareStageToCurrent } from "./progress"
import { STAGES } from "./stages"

describe("getStageProgress", () => {
  it("reports the first stage as 1 of 8", () => {
    expect(getStageProgress("electric_bill_collection")).toEqual({
      stage: "electric_bill_collection",
      index: 0,
      position: 1,
      total: 8,
    })
  })

  it("reports the last stage as 8 of 8", () => {
    expect(getStageProgress("archive")).toEqual({
      stage: "archive",
      index: 7,
      position: 8,
      total: 8,
    })
  })

  it("assigns strictly increasing positions matching STAGES order", () => {
    const positions = STAGES.map((s) => getStageProgress(s.value).position)
    expect(positions).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })

  it("total always equals STAGES.length regardless of which stage is asked about", () => {
    for (const s of STAGES) {
      expect(getStageProgress(s.value).total).toBe(STAGES.length)
    }
  })
})

describe("compareStageToCurrent", () => {
  it("returns 'current' when the stage matches", () => {
    expect(compareStageToCurrent("installation", "installation")).toBe(
      "current"
    )
  })

  it("returns 'past' for a stage earlier in the pipeline", () => {
    expect(compareStageToCurrent("site_survey", "payment")).toBe("past")
  })

  it("returns 'future' for a stage later in the pipeline", () => {
    expect(compareStageToCurrent("archive", "site_survey")).toBe("future")
  })
})
