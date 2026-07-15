import { describe, it, expect } from "vitest"

import { selectHeadlineQuote, type QuoteForValue } from "./quote-value"

function quote(overrides: Partial<QuoteForValue>): QuoteForValue {
  return {
    id: "q1",
    status: "sent",
    totalSatang: 100_000,
    issueDate: "2026-01-01",
    ...overrides,
  }
}

describe("selectHeadlineQuote", () => {
  it("returns null when there are no quotes", () => {
    expect(selectHeadlineQuote([])).toBeNull()
  })

  it("returns the only quote when there is exactly one", () => {
    const q = quote({ id: "q1", status: "draft", totalSatang: 50_000 })
    expect(selectHeadlineQuote([q])).toEqual({
      id: "q1",
      status: "draft",
      totalSatang: 50_000,
    })
  })

  it("prefers an accepted quote over a merely sent one", () => {
    const sent = quote({ id: "sent", status: "sent", totalSatang: 100_000 })
    const accepted = quote({ id: "accepted", status: "accepted", totalSatang: 120_000 })
    expect(selectHeadlineQuote([sent, accepted])?.id).toBe("accepted")
  })

  it("prefers converted over sent, but accepted over converted", () => {
    const converted = quote({ id: "converted", status: "converted" })
    const sent = quote({ id: "sent", status: "sent" })
    const accepted = quote({ id: "accepted", status: "accepted" })
    expect(selectHeadlineQuote([sent, converted])?.id).toBe("converted")
    expect(selectHeadlineQuote([converted, accepted])?.id).toBe("accepted")
  })

  it("breaks ties within the same status by the latest issue date", () => {
    const older = quote({ id: "older", status: "accepted", issueDate: "2026-01-01" })
    const newer = quote({ id: "newer", status: "accepted", issueDate: "2026-03-01" })
    expect(selectHeadlineQuote([older, newer])?.id).toBe("newer")
  })

  it("still returns a headline quote when every quote is declined or expired", () => {
    const declined = quote({ id: "declined", status: "declined", issueDate: "2026-01-01" })
    const expired = quote({ id: "expired", status: "expired", issueDate: "2026-02-01" })
    const result = selectHeadlineQuote([declined, expired])
    expect(result).not.toBeNull()
    expect(result?.id).toBe("expired")
  })

  it("does not mutate the input array", () => {
    const quotes = [quote({ id: "a", issueDate: "2026-01-01" }), quote({ id: "b", issueDate: "2026-02-01" })]
    const copy = [...quotes]
    selectHeadlineQuote(quotes)
    expect(quotes).toEqual(copy)
  })
})
