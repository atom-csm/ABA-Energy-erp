# ABA Energy Company OS — Codebase Wiki

Generated 2026-07-14 by reading the full codebase (all 251 `.ts`/`.tsx` files, every
SQL migration, every test). Each page below was researched independently and in
full — not skimmed — so file:line references should be trustworthy, but code
moves faster than docs: if something here contradicts the code, trust the code
and update the page.

Start with **00-architecture** if you're new to the repo — it explains the
conventions every other module follows (`docs/MODULE_CONTRACT.md` in code form).
Then jump to whichever module you're touching.

## Pages

1. [00-architecture.md](./00-architecture.md) — tech stack, folder-layout
   convention, app shell/nav, the org+auth context pattern, money-as-satang
   convention, shared utils reference, Supabase client setup, gotchas for new
   engineers.
2. [01-data-model-and-auth.md](./01-data-model-and-auth.md) — every table,
   every RLS policy, the org/role model, audit logging, security gotchas.
3. [02-crm-sales-quotes.md](./02-crm-sales-quotes.md) — clients, deals,
   quotes, templates, client portal, intake, document numbering/PDF generation.
4. [03-finance-accounting.md](./03-finance-accounting.md) — invoices,
   subscriptions, costs, accounting settings, reports, export, the
   deal→quote→invoice money flow.
5. [04-projects-timesheets-calendar-reports.md](./04-projects-timesheets-calendar-reports.md) —
   projects, timesheets, calendar, dashboard, saved views.
6. [05-automation-integrations.md](./05-automation-integrations.md) —
   follow-up alerts, cron jobs, n8n webhooks, email, AI features.
7. [06-testing-and-tooling.md](./06-testing-and-tooling.md) — unit/E2E test
   inventory, coverage gaps, dev scripts.

## Cross-cutting findings worth your attention

Pulled from all seven agents' reports — things that span more than one module
or are easy to miss reading any single page in isolation:

**Security / data model**
- Role enforcement (owner/admin/member) lives almost entirely in the app layer
  (`lib/permissions.ts`), not in RLS — every business table's policy treats all
  org members the same regardless of role. RLS stops cross-org leakage; it does
  not stop a `member` from doing something only an `owner` should. → 01
- `memberships`/`organizations` have no authenticated write policy; invite
  acceptance and org/seed creation go through the service-role client by
  necessity. → 01
- No DB constraint ties invoice/quote totals to their line items — it's a
  convention, not an invariant. → 01, 03
- Supabase Auth's own password policy (min length 6) is weaker than the app's
  signup check (min length 10 + mixed case/digit) — a path that bypasses the
  app-level check would accept weak passwords. → 01
- `accounting_connections.config` is an unfinished secret-storage scaffold —
  real OAuth tokens for FlowAccount/PEAK/Xero aren't handled yet (and the sync
  itself is an intentional no-op stub, not a bug). → 01, 03

**Automation is thinner than it looks**
- Of the three "alert types" the automation module implies (follow-ups,
  overdue invoices, project deadlines), only follow-ups has real logic
  (`lib/automation/rules.ts` → `/api/cron/followups`). The other two n8n
  webhook routes are auth-and-echo stubs with no DB reads. → 05
- Nothing in the repo actually schedules any of these jobs (no `vercel.json`
  cron config, no n8n workflow file) — they exist but nothing calls them yet. → 05
- The dispatch/dedup logic that turns a due follow-up into an actual reminder
  has zero test coverage, unit or E2E — a silent failure here wouldn't be
  caught. → 05, 06

**Half-finished module connections**
- Templates (pricing catalog) has no "insert into quote" action — founders
  hand-type prices from a template into a quote. → 02
- Intake's AI-parsed action items are display-only; nothing saves them as a
  deal activity. → 02
- A won deal doesn't auto-create a project — `projects/new` just accepts a
  `?dealId=` prefill; a human still has to click through. → 04
- Portal's "mark invoice paid" is honor-system — any visitor with the token
  link can flip their own invoice to paid, no payment gateway involved. This
  looks like it's by design for a trust-based small business, not an oversight. → 02

**Money handling** — verified clean. Every `*_satang` column is `bigint`, all
conversions funnel through `lib/money.ts`, and CSV/external-API exports convert
to baht exactly once at the boundary. Two things to know, not bugs exactly:
`invoices.amount_satang` can go stale if you delete an invoice's last line item
(recompute only fires when items remain), and CSV export filters on the
*stored* `status` column while the UI badges an *effective/derived* status
(e.g. "overdue") — a filtered export can quietly exclude rows the UI shows as
overdue. → 03

**Testing** — 232 unit tests (Vitest) all pass, all green on lint/typecheck/build
(55 routes). Coverage is strong exactly where it matters most (money, dates,
permissions, invoice-status, webhook verification) and thin on IO wrappers,
which is the right tradeoff. No CI workflow exists in the repo — the four gates
pass locally but nothing enforces them on push. → 06

**One contract deviation, apparently deliberate**: `app/login/page.tsx` calls
`supabase.auth.signInWithPassword()` directly from a client component instead
of going through a server action — necessary because the browser client has to
run client-side to set the session cookie. Worth knowing explicitly since it
looks like a rule violation on first read. → 00
