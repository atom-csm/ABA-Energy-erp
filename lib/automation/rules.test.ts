import { describe, it, expect } from "vitest"

import {
  dueFollowUps,
  type ProjectFollowUp,
  type ActivityFollowUp,
} from "@/lib/automation/rules"

const TODAY = "2026-06-30"

// Projects: open stages with a follow-up date on/before today should produce
// specs; future or archived or null-date projects must be excluded.
const projects: ProjectFollowUp[] = [
  { id: "proj-today", name: "Due today project", next_follow_up_date: TODAY, stage: "quotation_and_proposal" },
  { id: "proj-overdue", name: "Overdue project", next_follow_up_date: "2026-06-28", stage: "negotiation_and_followup" },
  { id: "proj-future", name: "Future project", next_follow_up_date: "2026-07-05", stage: "electric_bill_collection" },
  { id: "proj-archived", name: "Archived project", next_follow_up_date: TODAY, stage: "archive" },
  { id: "proj-null", name: "No follow-up date", next_follow_up_date: null, stage: "site_survey" },
]

// Activities: not-done with a due date on/before today produce specs; future,
// done, or null-date activities must be excluded. `type` is NOT a filter.
const activities: ActivityFollowUp[] = [
  { id: "act-today", title: "Due today call", due_date: TODAY, done: false, type: "follow_up" },
  { id: "act-overdue", title: "Overdue call", due_date: "2026-06-28", done: false, type: "call" },
  { id: "act-future", title: "Future meeting", due_date: "2026-07-03", done: false, type: "meeting" },
  { id: "act-done", title: "Already done", due_date: "2026-06-20", done: true, type: "follow_up" },
  { id: "act-null", title: "No due date", due_date: null, done: false, type: "note" },
]

describe("dueFollowUps", () => {
  it("returns an empty list for empty input", () => {
    expect(dueFollowUps([], [], TODAY)).toEqual([])
  })

  it("includes projects due today and overdue, excluding future/archived/null", () => {
    const specs = dueFollowUps(projects, [], TODAY)
    const ids = specs.map((s) => s.entityId).sort()
    expect(ids).toEqual(["proj-overdue", "proj-today"])
    expect(specs.every((s) => s.entity === "project")).toBe(true)
  })

  it("includes activities due today and overdue, excluding future/done/null", () => {
    const specs = dueFollowUps([], activities, TODAY)
    const ids = specs.map((s) => s.entityId).sort()
    expect(ids).toEqual(["act-overdue", "act-today"])
    expect(specs.every((s) => s.entity === "activity")).toBe(true)
  })

  it("does not filter activities by type (a 'call' still counts when due)", () => {
    const callOnly: ActivityFollowUp[] = [
      { id: "act-call", due_date: "2026-06-29", done: false, type: "call" },
    ]
    const specs = dueFollowUps([], callOnly, TODAY)
    expect(specs).toHaveLength(1)
    expect(specs[0]!.entityId).toBe("act-call")
  })

  it("combines projects and activities and carries through title + dueDate", () => {
    const specs = dueFollowUps(projects, activities, TODAY)
    expect(specs).toHaveLength(4)

    const today = specs.find((s) => s.entityId === "proj-today")
    expect(today).toEqual({
      entity: "project",
      entityId: "proj-today",
      title: "Due today project",
      dueDate: TODAY,
    })

    const overdueAct = specs.find((s) => s.entityId === "act-overdue")
    expect(overdueAct).toEqual({
      entity: "activity",
      entityId: "act-overdue",
      title: "Overdue call",
      dueDate: "2026-06-28",
    })
  })

  it("falls back to a derived title when an activity has no title", () => {
    const noTitle: ActivityFollowUp[] = [
      { id: "act-x", due_date: TODAY, done: false, type: "follow_up" },
    ]
    const specs = dueFollowUps([], noTitle, TODAY)
    expect(specs[0]!.title.length).toBeGreaterThan(0)
    // Derived from the activity type so the reminder is still meaningful.
    expect(specs[0]!.title.toLowerCase()).toContain("follow")
  })

  it("treats a follow-up dated exactly today as due (boundary)", () => {
    const boundary: ProjectFollowUp[] = [
      { id: "p", name: "Boundary", next_follow_up_date: TODAY, stage: "site_survey" },
    ]
    expect(dueFollowUps(boundary, [], TODAY)).toHaveLength(1)
  })
})
