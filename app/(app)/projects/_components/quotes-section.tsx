/**
 * CR-001 ST-7 — "Quotes section: every quote tied to this project, with a
 * '+ New quote' button" (docs/PROJECT_PIPELINE_REDESIGN.md). `quotes.
 * project_id` already supports multiple quotes per project; this is just the
 * first place that surfaces "here are all the quotes for this project."
 */

import Link from "next/link"
import { FilePlus2, FileText } from "lucide-react"

import { EmptyState } from "@/components/empty-state"
import { Button } from "@/components/ui/button"
import { formatTHB } from "@/lib/money"
import { formatDate } from "../_lib/dates"
import { QuoteStatusBadge } from "@/app/(app)/quotes/_components/quote-status-badge"
import type { Enums } from "@/lib/types/database"

export type ProjectQuote = {
  id: string
  number: string
  status: Enums<"quote_status">
  total_satang: number
  issue_date: string
}

export function QuotesSection({
  projectId,
  quotes,
}: {
  projectId: string
  quotes: ProjectQuote[]
}) {
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          size="sm"
          render={<Link href={`/quotes/new?projectId=${projectId}`} />}
        >
          <FilePlus2 data-icon="inline-start" /> New quote
        </Button>
      </div>

      {quotes.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No quotes yet"
          description="Create a proposal for this project to send to the customer."
          className="border-0 p-6"
        />
      ) : (
        <ul className="divide-y rounded-md border">
          {quotes.map((q) => (
            <li key={q.id} className="flex items-center gap-3 px-3 py-2.5">
              <Link
                href={`/quotes/${q.id}`}
                className="min-w-0 flex-1 truncate text-sm font-medium hover:underline"
              >
                {q.number}
              </Link>
              <span className="text-muted-foreground hidden shrink-0 text-xs sm:inline">
                {formatDate(q.issue_date)}
              </span>
              <QuoteStatusBadge status={q.status} />
              <span className="shrink-0 text-sm tabular-nums">
                {formatTHB(q.total_satang)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
