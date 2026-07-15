/**
 * Pure "what's this project actually worth" logic. Replaces the old
 * manually-typed `projects.budget_satang` field: instead of a single
 * hand-entered number, the project's headline price is derived from its
 * real `quotes` rows (see `../_components/quotes-section.tsx`), preferring
 * whichever quote best reflects the customer's committed price.
 *
 * No I/O — callers fetch `quotes` and pass them in.
 */

import type { Enums } from "@/lib/types/database"

export type QuoteStatus = Enums<"quote_status">

export type QuoteForValue = {
  id: string
  status: QuoteStatus
  totalSatang: number
  issueDate: string
}

export type HeadlineQuote = {
  id: string
  status: QuoteStatus
  totalSatang: number
}

/**
 * Lower rank wins. An accepted quote is the customer's actual committed
 * price; `converted` (already turned into an invoice) is the next best
 * signal; `sent`/`draft` are still in play; `declined`/`expired` are last
 * resort — only shown when nothing better exists, so a project with only a
 * lapsed quote still surfaces its last known price instead of nothing.
 */
const STATUS_RANK: Record<QuoteStatus, number> = {
  accepted: 0,
  converted: 1,
  sent: 2,
  draft: 3,
  expired: 4,
  declined: 5,
}

export function selectHeadlineQuote(
  quotes: QuoteForValue[]
): HeadlineQuote | null {
  if (quotes.length === 0) return null

  const best = [...quotes].sort((a, b) => {
    const rankDiff = STATUS_RANK[a.status] - STATUS_RANK[b.status]
    if (rankDiff !== 0) return rankDiff
    return b.issueDate.localeCompare(a.issueDate)
  })[0]

  return { id: best.id, status: best.status, totalSatang: best.totalSatang }
}
