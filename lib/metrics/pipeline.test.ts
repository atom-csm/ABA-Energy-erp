import { describe, it, expect } from "vitest"

import {
  pipelineValue,
  weightedPipelineValue,
  archivedValue,
  pipelineByStage,
  isOpenStage,
  type ProjectLike,
} from "@/lib/metrics/pipeline"

const projects: ProjectLike[] = [
  { stage: "electric_bill_collection", value_satang: 100_000 },
  { stage: "quotation_and_proposal", value_satang: 200_000 },
  { stage: "negotiation_and_followup", value_satang: 300_000 },
  { stage: "installation", value_satang: 500_000 },
  { stage: "archive", value_satang: 400_000 },
]

describe("pipeline metrics", () => {
  it("pipelineValue sums every stage except archive", () => {
    expect(pipelineValue(projects)).toBe(1_100_000)
  })

  it("weightedPipelineValue applies stage probabilities", () => {
    // 0.1*100000 + 0.35*200000 + 0.55*300000 + 0.8*500000 = 645000
    expect(weightedPipelineValue(projects)).toBe(645_000)
  })

  it("archivedValue sums archived (done/won/lost) projects", () => {
    expect(archivedValue(projects)).toBe(400_000)
  })

  it("pipelineByStage groups values across all 8 stages", () => {
    const g = pipelineByStage(projects)
    expect(g.electric_bill_collection).toBe(100_000)
    expect(g.quotation_and_proposal).toBe(200_000)
    expect(g.installation).toBe(500_000)
    expect(g.archive).toBe(400_000)
    expect(g.site_survey).toBe(0)
    expect(g.payment).toBe(0)
    expect(g.after_sales).toBe(0)
    expect(g.negotiation_and_followup).toBe(300_000)
  })

  it("isOpenStage classifies every stage but archive as open", () => {
    expect(isOpenStage("electric_bill_collection")).toBe(true)
    expect(isOpenStage("installation")).toBe(true)
    expect(isOpenStage("after_sales")).toBe(true)
    expect(isOpenStage("archive")).toBe(false)
  })
})
