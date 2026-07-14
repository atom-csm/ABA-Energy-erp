import { describe, it, expect } from "vitest"

import { buildStageTimeline } from "./timeline"
import type { ProjectStage } from "./stages"

type Doc = { id: string; stage: ProjectStage }

describe("buildStageTimeline", () => {
  it("returns no groups when there are no documents", () => {
    expect(buildStageTimeline<Doc>([], "site_survey")).toEqual([])
  })

  it("groups documents by stage and orders groups by pipeline order, not upload order", () => {
    const docs: Doc[] = [
      { id: "a", stage: "installation" },
      { id: "b", stage: "electric_bill_collection" },
      { id: "c", stage: "site_survey" },
    ]
    const groups = buildStageTimeline(docs, "installation")
    expect(groups.map((g) => g.stage)).toEqual([
      "electric_bill_collection",
      "site_survey",
      "installation",
    ])
  })

  it("only includes stages that have at least one document", () => {
    const docs: Doc[] = [{ id: "a", stage: "payment" }]
    const groups = buildStageTimeline(docs, "archive")
    expect(groups).toHaveLength(1)
    expect(groups[0]!.stage).toBe("payment")
  })

  it("collects multiple documents for the same stage into one group", () => {
    const docs: Doc[] = [
      { id: "a", stage: "site_survey" },
      { id: "b", stage: "site_survey" },
    ]
    const groups = buildStageTimeline(docs, "site_survey")
    expect(groups).toHaveLength(1)
    expect(groups[0]!.documents.map((d) => d.id)).toEqual(["a", "b"])
  })

  it("marks each group's relation to the current stage", () => {
    const docs: Doc[] = [
      { id: "a", stage: "electric_bill_collection" },
      { id: "b", stage: "installation" },
      { id: "c", stage: "archive" },
    ]
    const groups = buildStageTimeline(docs, "installation")
    expect(groups.map((g) => g.relation)).toEqual(["past", "current", "future"])
  })

  it("defaults the current stage's group open when it has documents", () => {
    const docs: Doc[] = [
      { id: "a", stage: "electric_bill_collection" },
      { id: "b", stage: "site_survey" },
    ]
    const groups = buildStageTimeline(docs, "site_survey")
    expect(groups.map((g) => g.defaultOpen)).toEqual([false, true])
  })

  it("defaults the furthest-along group open when the current stage has no documents yet", () => {
    const docs: Doc[] = [
      { id: "a", stage: "electric_bill_collection" },
      { id: "b", stage: "site_survey" },
    ]
    // Current stage is "installation" — no documents there yet, so the
    // furthest-along group with documents ("site_survey") should open.
    const groups = buildStageTimeline(docs, "installation")
    expect(groups.map((g) => g.defaultOpen)).toEqual([false, true])
  })
})
