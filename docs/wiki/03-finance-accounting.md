# 03 — Finance, Accounting & Billing

Covers the `finance` module (invoices, payments, costs, subscriptions), the
`settings/accounting` sync scaffold, the `reports` module, and the shared
libs that back them: `lib/accounting`, `lib/billing`, `lib/documents`,
`lib/export`, `lib/queries`, and the subscriptions cron.

Positioning (per `docs/ODOO_COMPARISON.md`): this is deliberately an
**operational finance layer, not an accounting system**. No general ledger,
no VAT/tax engine, no e-Tax Invoice — those stay in FlowAccount/PEAK/Xero.
The accounting connection here is an explicit **sync scaffold** (stubbed
push, no live HTTP).

## Money flow end-to-end

The verified chain, from code (not assumption):

```
deal (CRM)  →  quote + quote_items (Sales)  →  [accept] converts to →  invoice + invoice_items
                                                                              │
                                                                       payments (partial/full)
                                                                              │
                                                                  effective status (paid/overdue/…)
```

- Quote acceptance copies `quote.total_satang` straight into
  `invoices.amount_satang` — satang to satang, no baht round-trip —
  in `app/(app)/quotes/actions.ts:434-441`. That module is owned by the
  CRM/sales lane (see `02-crm-sales-quotes.md`); noted here only to confirm
  the handoff is unit-correct.
- Independently, **subscriptions** are a second invoice source: recurring
  billing (`lib/billing/generate.ts`, `lib/billing/recurring.ts`) creates
  invoices directly from a subscription's `amount_satang`, either via the
  "Generate invoice now" action or the daily cron
  (`app/api/cron/subscriptions/route.ts`).
- Invoices can also be created ad hoc from the Finance UI
  (`app/(app)/finance/invoices/new/page.tsx` → `createInvoice`), with an
  auto-numbering scheme (`lib/documents/numbering.ts`).
- Payments are recorded against an invoice
  (`recordPayment` in `app/(app)/finance/actions.ts:199-272`); the invoice's
  stored `status` is advanced to `paid`/`partially_paid` based on the sum of
  payments, and a separately-derived **effective status**
  (`lib/metrics/invoice-status.ts`) additionally computes `overdue` at read
  time without mutating the stored column.
- Costs are independent operational spend, not tied to invoices/payments —
  they only feed burn/runway and the Reports/Dashboard metrics.

## Invoices

**Files**
- List/detail UI: `app/(app)/finance/page.tsx` (tabbed Invoices/Costs),
  `app/(app)/finance/invoices/[id]/page.tsx`, `.../invoices/new/page.tsx`
- Mutations: `app/(app)/finance/actions.ts` (`createInvoice`, `updateInvoice`,
  `recordPayment`, `createCost`, `deleteCost`)
- Line items: `app/(app)/finance/invoice-items-actions.ts`
  (`addInvoiceItem`, `deleteInvoiceItem`)
- PDF: `app/(app)/finance/invoices/[id]/pdf/route.ts` →
  `lib/documents/printable.ts` (`renderDocumentHtml`) — a self-contained,
  print-to-PDF HTML string (no PDF binary dependency), HTML-escaped
  (`escapeHtml`, `lib/documents/printable.ts:37-44`).
- CSV export: `app/(app)/finance/invoices/export/route.ts`
- Email: `app/(app)/finance/email-actions.ts` (`sendInvoiceEmail`)
- Accounting sync: `app/(app)/finance/accounting-actions.ts`
  (`syncInvoiceToAccounting`)

**Line items and the derived total**

`invoices.amount_satang` is normally the authoritative total, but once an
invoice has ≥1 row in `invoice_items`, the amount becomes *derived*:
`recomputeInvoiceAmount` (`app/(app)/finance/invoice-items-actions.ts:25-48`)
recalculates `amount_satang = subtotalSatang(items)` after every add/delete.
An invoice with zero items keeps whatever manual amount was entered on
create — this dual-mode design lets the simple `/finance/invoices/new` form
and the itemized editor coexist without migrating old rows.

A `paid` invoice is **locked**: both `addInvoiceItem` and `deleteInvoiceItem`
check `parent.status === "paid"` and refuse the mutation
(`invoice-items-actions.ts:77-79`, `152-154`), so the derived total can't
drift after settlement. The UI mirrors this via
`InvoiceItemsEditor`'s `locked` prop (`app/(app)/finance/invoices/[id]/page.tsx:300`).

**Status model — two layers, don't confuse them**

1. **Stored `status`** column: set explicitly on create/update, and advanced
   by `recordPayment` to `paid`/`partially_paid` (never to `overdue` —
   nothing writes `overdue` to the DB). `draft`/`cancelled` are treated as
   terminal and `recordPayment` skips status transitions for them
   (`actions.ts:243`).
2. **Effective status**: `deriveInvoiceStatus` in
   `lib/metrics/invoice-status.ts:24-32` — a pure function of
   `(stored status, total paid, due_date, today)` that additionally derives
   `overdue` (past due + not fully paid) at read time. This is what the
   Finance list, invoice detail page, and dashboard overdue count all
   display — the *stored* status is shown separately in the invoice detail
   page as "Stored status" (`invoices/[id]/page.tsx:256-259`) so the two
   never get silently conflated.

Both the Finance page and the CSV export status **filter** operate on the
*stored* column, not the effective one (`invoices/export/route.ts:14-15`
docstring is explicit about this) — worth knowing if a filtered export looks
like it's missing an "overdue" row that the UI badge shows as overdue.

**Numbering**: `lib/documents/numbering.ts` (`nextDocumentNumber`) scans the
org's existing numbers matching `PREFIX-YEAR-NNN`, takes the max counter, and
increments — pure and unit-tested (`numbering.test.ts`). `createInvoice`
(`actions.ts:93-105`) only auto-generates when the user left the number
blank; a manual number collision surfaces as the DB's
`unique(org_id, number)` constraint violation.

**Auth/org scoping**: every action calls `requireOrgContext()` first and
scopes every query/mutation with `.eq("org_id", ctx.orgId)` in addition to
RLS. Destructive/financial gates use `requireCapability`:
`cost:delete` (deleteCost), `subscription:manage` (delete/generate/status on
subscriptions), `accounting:manage` (connect/disconnect/sync). Payments and
invoice creation/edits are open to any org member (no capability gate) —
consistent with the module contract's "members can do normal CRUD."

## Subscriptions (recurring billing)

**Files**
- UI: `app/(app)/finance/subscriptions/page.tsx`,
  `.../subscriptions/[id]/page.tsx`, `.../subscriptions/new/page.tsx`
- Actions: `app/(app)/finance/subscription-actions.ts` (create/update/
  setStatus/delete/`generateInvoiceNow`)
- Pure billing math: `lib/billing/recurring.ts` (`addInterval`, `nextRunAfter`,
  `isDue`, `dueSubscriptions`) — date-only math via `date-fns`, no timezone
  handling needed since cadences are whole-day.
- Pure invoice-shape builder: `lib/billing/generate.ts`
  (`invoiceNumberFor`, `buildGeneratedInvoice`, `alreadyGeneratedForPeriod`,
  `isUniqueViolation`) — shared verbatim by both `generateInvoiceNow` and the
  cron so manual and automated generation emit an identical invoice.
- Cron: `app/api/cron/subscriptions/route.ts`

**Idempotency**: the generated invoice number is deterministic per period —
`"{subscription.name}-{YYYYMM}"` (`lib/billing/generate.ts:12-15`) — and
`invoices` has `unique(org_id, number)`. Both the manual action and the cron
first query for an existing invoice with that computed number
(`alreadyGeneratedForPeriod`) and, as a last-resort race guard, treat a
Postgres `23505` unique-violation on insert as a benign "already generated,
just advance the schedule" case (`isUniqueViolation`). `subscriptions` itself
has `unique(org_id, name)` (`supabase/migrations/20260702090000_v3_sales_docs.sql:103`),
so the name-derived number can't collide across two different subscriptions
in the same org.

**Cron auth**: `POST /api/cron/subscriptions` verifies `X-Cron-Secret`
against `process.env.CRON_SECRET` via `lib/webhooks/verify.ts`
(`verifyWebhookSecret`), then uses `createAdminClient()` — a service-role
client that bypasses RLS, since there's no user session. `org_id` on every
write comes from the subscription row itself, never from a caller-supplied
value. `GET` is aliased to `POST` for scheduler health-checks. **Open gap**:
`docs/ODOO_TODO.md:19` still has `[ ] Schedule /api/cron/subscriptions
(Vercel Cron / GitHub Action)` unchecked — the endpoint exists and is
tested, but nothing is confirmed wired to call it on a timer yet.

**MRR**: computed two ways for reference —
`subscriptionMrr` (active subscriptions, source of truth, shown on both
Finance and the dashboard) and `mrr` (legacy, from `is_recurring` invoices,
kept for back-compat) — both in `lib/metrics/finance.ts:66-93`, both
normalizing weekly/quarterly/yearly amounts to a monthly figure via
`MONTHLY_FACTOR` and rounding once at the end (`Math.round`).

## Costs

**Files**: `app/(app)/finance/_components/cost-form.tsx`,
`createCost`/`deleteCost` in `app/(app)/finance/actions.ts:278-349`,
export at `app/(app)/finance/costs/export/route.ts`.

Simple entity — category enum, `amount_satang`, `incurred_on`, optional
vendor/project/notes. Feeds `costsForMonth` (burn) and the Reports/Dashboard
aggregates. Deletion is gated to `cost:delete` capability
(owner/admin per `lib/auth.ts`). **Gap noted in `docs/ODOO_TODO.md:76`**:
`[ ] Expense approval workflow on costs` — not built; any org member can log
and (if capable) delete a cost with no approval step.

## Accounting sync scaffold

**Files**: `app/(app)/settings/accounting/page.tsx` + `actions.ts` +
`_components/accounting-connection-form.tsx`; `lib/accounting/provider.ts`;
`lib/accounting/mapping.ts`; invoked from
`app/(app)/finance/accounting-actions.ts` (`syncInvoiceToAccounting`) via
`SyncInvoiceButton`.

Explicitly documented as a **stub** — the page banner says so
(`accounting/page.tsx:66-74`), and `lib/accounting/provider.ts:1-13` spells
out that `pushInvoice` does no network I/O and returns a deterministic fake
id (`{PROVIDER}-{invoice.number}`). The clean seam for a real HTTP/OAuth
client is marked in the same file (`provider.ts:47-55`). `invoiceToExternalPayload`
(`lib/accounting/mapping.ts:33-46`) is the one conversion point from our
integer satang to the provider's expected whole-baht decimal
(`satangToBaht`, called exactly once) — well covered by
`mapping.test.ts` (exact division, no drift, at ฿0/฿1/฿50,000/฿1,234.56).

Connection state lives in `accounting_connections` (one row per org, `unique
(org_id)`); sync results are recorded per-invoice in `accounting_sync_map`
with `unique(org_id, provider, local_entity, local_id)` so re-syncing (or
switching providers) upserts rather than duplicating
(`accounting-actions.ts:64-76`). Gated to `accounting:manage`
(owner/admin) in both the settings actions and the sync action.

## Reports (pivots + printable export)

**Files**: `app/(app)/reports/page.tsx`, `app/(app)/reports/_data.ts`
(`getReportData`), `app/(app)/reports/print/route.ts`, backed by
`lib/metrics/reports.ts` (generic `pivot()`, `revenueByClientMonth`,
`hoursByProject`, `totalRevenueSatang`) and `lib/documents/report.ts`
(`renderReportHtml`).

`getReportData()` (`reports/_data.ts:50-100`) is org-scoped (`requireOrgContext`
+ `.eq("org_id", ctx.orgId)`), pulls the last 6 calendar months
(`RANGE_MONTHS = 6`, `lastNMonths`), joins `payments → invoices → clients`
for the revenue-by-client-by-month pivot and `time_entries → projects` for
the hours pivot. Both pivots are built by the same generic `pivot()`
function (`lib/metrics/reports.ts`) — rows/cols/cell/rowTotal/colTotal/
grandTotal — reused for revenue (money) and hours (non-money), which is a
nice bit of abstraction reuse. Money stays satang through the whole
aggregation; only `formatTHB` at the render edge
(`report.ts` / `reports/page.tsx`) converts to display baht. Hours are the
one legitimately-fractional, non-money number in this module
(`fmtHours`, `.toFixed(2)`) — never used for money.

`/reports/print` (`app/(app)/reports/print/route.ts`) reuses `getReportData()`
verbatim and pipes it into `renderReportHtml` for the same self-contained,
browser-print-to-PDF pattern as invoice PDFs.

## CSV export

**File**: `lib/export/csv.ts` (`toCsv`) — dependency-free RFC-4180 writer,
UTF-8 BOM prepended once (Excel + Thai text), and **CSV-injection defense**:
any string cell starting with `= + - @` or TAB/CR gets a leading apostrophe
so Excel/Sheets can't evaluate it as a formula (`csv.ts:26,42-51`) — this
matters because cost/client free-text fields flow straight into the export.
Numbers are passed through raw, un-formatted, specifically so money stays
machine-parseable in a spreadsheet. Both finance export routes
(`invoices/export/route.ts`, `costs/export/route.ts`) convert
`satang → baht` via `satangToBaht` **before** calling `toCsv` — the module
docstring is explicit that `toCsv` itself "never formats currency."

## `lib/queries/dashboard.ts` — shared, not finance-only

`getDashboardData()` pulls together metrics from every module (deals,
invoices, payments, costs, projects, activities, subscriptions, quotes, time
entries). The **finance-relevant** pieces used here (all imported from
`lib/metrics/finance.ts` and `lib/metrics/invoice-status.ts`):
`revenueForMonth`, `costsForMonth`, `mrr`, `subscriptionMrr`, `unpaidTotal`,
`unpaidCount`, `netBurnSatang`, `runwayMonths`, `deriveInvoiceStatus`. The
rest (`pipelineValue`/`weightedPipelineValue` from `lib/metrics/pipeline.ts`,
`billableValueSatang`/`utilization` from `lib/metrics/timesheets.ts`) belong
to CRM/sales and projects/timesheets respectively — flagged here only so
another module's wiki page doesn't have to re-derive which half of this file
is theirs. `cash_balance_satang` / `monthly_burn_satang` are manual overrides
from `org_settings` (owned by the settings/admin lane), falling back to
computed costs when null (`dashboard.ts:156`).

## Satang-convention audit

Verified every monetary column and computation path in this module. **No
floats found for money anywhere in scope** — the convention holds:

- **Schema**: every `*_satang` column is `bigint` — confirmed for
  `invoices.amount_satang`, `payments.amount_satang`, `costs.amount_satang`,
  `subscriptions.amount_satang`, `invoice_items.{unit_price,amount}_satang`,
  `quotes.{subtotal,discount,total}_satang`, `quote_items.{unit_price,amount}_satang`,
  `org_settings.{cash_balance,monthly_burn}_satang`
  (`supabase/migrations/20260630090000_init_schema.sql`,
  `20260702090000_v3_sales_docs.sql`, `20260630092000_settings.sql`).
  `quote_items.quantity` / `invoice_items.quantity` are `numeric(12,3)` —
  correctly *not* satang (quantity can be fractional, e.g. 1.5 hours), and
  the amount computed from it is rounded to the nearest satang exactly once
  (`lineAmountSatang`, `lib/metrics/line-items.ts:19-22`).
- **Conversion edges are centralized**: every baht→satang conversion in this
  module goes through `bahtToSatang()` from `lib/money.ts`, and every
  satang→baht/display conversion goes through `satangToBaht()` /
  `formatTHB()` / `formatTHBWhole()`. Grepped every action file
  (`finance/actions.ts`, `subscription-actions.ts`,
  `invoice-items-actions.ts`) — no hand-rolled `× 100` or `/ 100` anywhere;
  all forms collect `amountBaht`/`unitPriceBaht` (named to make the unit
  explicit) and convert exactly once at the server-action boundary.
- **Aggregation stays integer**: `sumSatang` (plain reduce over integers,
  `lib/money.ts:26-28`) is used throughout `lib/metrics/finance.ts` and
  `lib/metrics/reports.ts`; the only place non-integer math touches a satang
  value is `subscriptionMrr`/`mrr`'s per-interval normalization
  (`amount_satang * MONTHLY_FACTOR[...]`, e.g. `× 1/3` for quarterly), which
  is immediately closed back to an integer via a single `Math.round` at the
  end of the reduce (`lib/metrics/finance.ts:80`, `92`) — not compounded
  across multiple operations, so no accumulating rounding drift.
- **CSV export** converts to baht **before** calling `toCsv`
  (`satangToBaht(inv.amount_satang)` in both export routes) so the
  spreadsheet gets a real decimal, and `toCsv` itself never touches currency
  formatting — the boundary is explicit and tested
  (`csv.test.ts:47-51` asserts numbers pass through raw).
- **Provider payload**: `invoiceToExternalPayload` converts once to
  `totalBaht` for the (stubbed) external accounting provider — correct,
  since external providers expect whole-baht decimals, not satang;
  `mapping.test.ts` explicitly checks this conversion is exact for whole and
  fractional baht amounts.

**Nothing to flag as a bug** in this module's money handling — this is the
cleanest-looking area from a satang-discipline standpoint of what was
reviewed. The one soft spot is *not* a satang bug but a design tradeoff worth
knowing: `amount_satang` on an invoice is **either** manually entered **or**
derived from `invoice_items`, decided implicitly by "does this invoice have
any items" (`recomputeInvoiceAmount`, `invoice-items-actions.ts:36-37`
returns early with no update when `items.length === 0`). If someone deletes
the *last* remaining line item on an invoice, `recomputeInvoiceAmount` is
never called with a non-empty set, so the stored `amount_satang` silently
reverts to whatever manual value predates the first item add (usually 0
for invoices that were always itemized) — not a type-safety/float bug, but
a state-machine edge case worth a test if it isn't already covered.

## Other gaps vs. stated intent (ODOO_COMPARISON.md / ODOO_TODO.md)

- Subscriptions cron exists and is unit-tested but **not confirmed scheduled**
  in any deploy config seen in this module (`ODOO_TODO.md:19`, unchecked).
- No expense-approval workflow on costs (`ODOO_TODO.md:76`, unchecked) —
  intentionally deferred, any member can log/delete a cost (delete gated to
  owner/admin only).
- Accounting sync is explicitly a scaffold, not a real integration — by
  design, not a gap (`ODOO_COMPARISON.md:66` lists full Accounting as an
  intentional non-goal).
- Everything else finance-related listed in `ODOO_COMPARISON.md` (quotes →
  invoice conversion, invoice line items + printable PDF, recurring
  invoices/subscriptions) is marked ✅ and matches what's actually
  implemented — no discrepancy found between the doc's claims and the code.

## See also

- `00-architecture.md`
- `01-data-model-and-auth.md`
- `02-crm-sales-quotes.md`
- `04-projects-timesheets-calendar-reports.md`
- `05-automation-integrations.md`
- `06-testing-and-tooling.md`
