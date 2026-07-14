# 04 — Projects, Timesheets, Calendar & Dashboard

This page covers **post-sale delivery and scheduling**: turning a won deal into
tracked installation work, logging billable time against it, seeing everything
date-driven on one calendar, and rolling it all up on the dashboard. It also
covers the small cross-module "saved views" feature that lives in its own
route-group folder.

Scope: `app/(app)/projects/**`, `app/(app)/timesheets/**`, `app/(app)/calendar/**`,
`app/(app)/dashboard/**`, `app/(app)/views/**`, `lib/calendar/**`, `lib/metrics/**`.

For shared conventions (org scoping, money-as-satang, Base UI forms), see
`docs/MODULE_CONTRACT.md` — this page only calls out where each module follows
or deviates from it.

---

## 1. Projects

**Purpose**: post-sale delivery tracking for solar installation jobs — status
board, tasks, milestones, budget vs. profit, and time logged, per client.

**Files**:
- `app/(app)/projects/page.tsx` — list, grouped into cards by `project_status`
  (`in_progress`, `review`, `not_started`, `support`, `paused`, `delivered`,
  `cancelled`, in that display order — `STATUS_ORDER` at line 29). Each row
  shows client, deadline (with relative overdue/warning styling), owner.
- `app/(app)/projects/[id]/page.tsx` — detail page: overview fields (client,
  deadline, budget, owner), inline status changer, profit panel, tasks list,
  milestones list, and a time-logged panel with an embedded `LogTimeForm`
  (imported cross-module from `app/(app)/timesheets/_components/log-time-form.tsx`,
  line 39 — the one place a module reaches into another module's `_components`).
- `app/(app)/projects/[id]/edit/page.tsx` — edit form, reuses `ProjectForm`.
- `app/(app)/projects/new/page.tsx` — create form. Accepts `?dealId=` or
  `?clientId=` query params.
- `app/(app)/projects/actions.ts` — all mutations: `createProject`,
  `updateProject`, `updateProjectStatus`, `addTask`, `toggleTask`,
  `addMilestone`, `toggleMilestone`.
- `app/(app)/projects/_components/project-form.tsx` — shared create/edit form.
- `app/(app)/projects/_components/add-task-form.tsx`,
  `add-milestone-form.tsx`, `status-select.tsx`, `toggle-check.tsx`
  (`TaskToggle` / `MilestoneToggle` checkboxes, optimistic via `useTransition`).
- `app/(app)/projects/_lib/dates.ts` — `deadlineMeta()` (overdue/due-today/due-soon
  tone + label) and `formatDate()`, local to this module (parallels but does not
  reuse `lib/dates.ts`'s `isPastDue`/`daysUntil` — a small duplication).

**Data flow** (tables read/written):
- `projects` (`id, name, status, deadline, budget_satang, owner, client_id, deal_id, org_id`)
  — read on list/detail/edit, inserted in `createProject` (`actions.ts:56-70`),
  updated in `updateProject` and `updateProjectStatus`.
- `project_tasks` (`id, title, status, assignee, due_date, done, project_id, org_id`)
  — read in detail page (`[id]/page.tsx:96-102`), inserted/updated via
  `addTask`/`toggleTask`. `toggleTask` keeps `done` and `status` in sync
  (`done ? "done" : "todo"`, `actions.ts:194`).
- `milestones` (`id, title, due_date, done, project_id, org_id`) — same pattern
  via `addMilestone`/`toggleMilestone`.
- `invoices` and `costs` (both filtered `.eq("project_id", id)`) — read-only on
  the detail page to compute profit; **not owned by this module** (see
  `03-finance-accounting.md`).
- `time_entries` (`project_id, minutes, billable, rate_satang`) — read-only on
  the detail page for the "Time logged" panel; writes happen through the
  Timesheets module's `logTime` action (see below).

**CRM connection**: `projects/new/page.tsx` (lines 38–54) accepts `?dealId=`,
loads the `deals` row (`title`, `client_id`, `value_satang`), and prefills the
project name/client/budget from it — **but does not automatically create a
project when a deal is marked won**; a human must click through from the CRM
side to `/projects/new?dealId=...`. The resolved `dealId` is bound
server-side inside the page's own `action()` closure (`new/page.tsx:57-63`) so
the client can never spoof `deal_id`, and `createProject` stores it on
`projects.deal_id` (`actions.ts:67`). See `02-crm-sales-quotes.md` for the deal
lifecycle itself.

**Contract conformance**: follows the file-layout, org-scoping
(`requireOrgContext` + `.eq("org_id", ctx.orgId)` on every mutation), money
(`bahtToSatang`/`formatTHBWhole`/`satangToBaht`), and Base UI `render` prop
conventions closely. One gap: unlike Timesheets, **none of the project
actions call `writeAudit`** (`lib/audit.ts`) — create/update/status-change/task/
milestone mutations leave no audit trail, whereas `logTime`/`deleteTimeEntry`
do (see below). Worth flagging as an inconsistency if audit coverage matters
for this module.

---

## 2. Timesheets

**Purpose**: log billable/non-billable hours against a project, see
utilization and billable value for the current month.

**Files**:
- `app/(app)/timesheets/page.tsx` — month stat cards (hours, billable value,
  utilization), the log-time form, and a table of the last 100 entries
  (`.limit(100)`, `page.tsx:69`).
- `app/(app)/timesheets/actions.ts` — `logTime`, `deleteTimeEntry`.
- `app/(app)/timesheets/_components/log-time-form.tsx` — `LogTimeForm`,
  reused directly by the Projects detail page (see above) via `lockProject`
  prop that hides the project picker and pins `project_id`.
- `app/(app)/timesheets/_components/form-fields.tsx` — generic
  `SelectField` (react-hook-form-bound Select with a "None" sentinel).
- `app/(app)/timesheets/_components/delete-time-entry-button.tsx` — confirm-dialog delete.

**Data flow**:
- `time_entries` (`id, project_id, task_id, user_id, work_date, minutes,
  billable, rate_satang, notes, org_id`) — inserted in `logTime`
  (`actions.ts:63-77`; hours are converted to integer minutes at
  `Math.round(d.hours * 60)`, `actions.ts:59`); deleted in `deleteTimeEntry`.
- `projects` — read-only, to populate the project picker.
- `profiles` (`id, full_name`) — read-only, to resolve `user_id` → display
  name for the "Who" column (`page.tsx:91-98`); the comment at `page.tsx:84-87`
  notes there's no PostgREST FK from `time_entries.user_id` to `profiles`
  (it references `auth.users`), so the join is done manually.

Both `logTime` and `deleteTimeEntry` call `writeAudit()` (`actions.ts:81-87`,
`112-117`) — this module has audit coverage that Projects lacks.

**Aggregation logic** lives in `lib/metrics/timesheets.ts` (not `.tsx`,
pure functions, unit-tested via `lib/metrics/timesheets.test.ts`):
`totalMinutes`, `minutesToHours`, `entryValueSatang` (billable hours × rate,
rounded once), `billableValueSatang`, `minutesByProject`, `utilization`
(billable ÷ total minutes). Consumed by the Timesheets page, the Projects
detail page, and `lib/queries/dashboard.ts`.

**Note**: `lib/metrics/index.ts` re-exports `invoice-status`, `finance`,
`pipeline`, and `projects` — but **not** `timesheets`, `line-items`, or
`reports`. Every caller of timesheet metrics imports
`@/lib/metrics/timesheets` directly rather than through the barrel; harmless
but an inconsistent use of the barrel file.

**CRM/Projects connection**: every time entry requires a `project_id`
(`LogTime` schema, `actions.ts:38`), so time tracking is strictly
project-scoped — there's no way to log time against a client or deal
directly, only through a project.

---

## 3. Calendar

**Purpose**: a single month-grid view of everything dated — CRM follow-ups,
invoice due dates, and project deadlines — so delivery and finance dates are
visible alongside sales activity.

**Files**:
- `app/(app)/calendar/page.tsx` — server component. Resolves the month from
  `?month=YYYY-MM` (defaults to current month), builds the 6×7 grid via
  `monthMatrix`, fetches everything due in the visible range (including
  spill-over days from adjacent months, `page.tsx:54-57`), and buckets by
  date with `groupByDate`.
- `app/(app)/calendar/types.ts` — `CalendarItem` (`id, date, label, tone, href?`)
  and `CalendarTone` shared between the page and its components.
- `app/(app)/calendar/_components/day-cell.tsx` — one grid cell; shows up to
  3 item chips + "+N more"; each chip links to its source record via `href`.
- `app/(app)/calendar/_components/calendar-legend.tsx` — static color-key legend.
- `lib/calendar/month.ts` — pure, timezone-safe date-grid helpers, entirely
  `Date.UTC`-based (no host-timezone surprises): `monthMatrix`, `groupByDate`,
  `monthLabel`, `formatMonthKey`, `parseMonthKey`, `prevMonth`, `nextMonth`.
  Unit-tested in `lib/calendar/month.test.ts`.

**Data flow** (all three queries `.eq("org_id", ctx.orgId)` and range-filtered
to `[rangeStart, rangeEnd]`, `page.tsx:60-82`):
- `activities` (`id, type, due_date, client_id, clients(name)`) → amber
  (follow_up), violet (meeting), blue (call), neutral (email/note) chips
  linking to `/clients/{client_id}`.
- `invoices` (`id, number, due_date`) → red chips, "Invoice {number} due",
  linking to `/finance/invoices/{id}`.
- `projects` (`id, name, deadline`) → emerald chips, "{name} deadline",
  linking to `/projects/{id}`.

This is the clearest cross-module integration point in the whole delivery
slice: one read-only page pulls from CRM (`activities`), Finance
(`invoices`), and Projects (`projects`) and renders them as a unified
schedule. It writes nothing — purely a read/aggregate view.

---

## 4. Dashboard

**Purpose**: single home page with cash/pipeline/delivery KPIs and two
"what needs attention" panels (follow-ups due today, needs-attention list).

**Files**:
- `app/(app)/dashboard/page.tsx` — thin server component; all data comes from
  one call to `getDashboardData()`.
- `lib/queries/dashboard.ts` — `getDashboardData()`: fires 10 parallel
  Supabase queries (`deals`, `invoices`, `payments`, `costs`, `projects`,
  `activities`, `org_settings`, `subscriptions`, `quotes`, `time_entries`
  scoped to the current month) and composes the results entirely through
  `lib/metrics/*` pure functions — no ad hoc math in the page or the query file.

**Data flow / composition** (`lib/queries/dashboard.ts:71-193`):
- `deals` → `pipelineValue`, `weightedPipelineValue` (`lib/metrics/pipeline.ts`).
- `invoices` + `payments` → `deriveInvoiceStatus`, `unpaidTotal`, `unpaidCount`
  (`lib/metrics/invoice-status.ts`, `lib/metrics/finance.ts`).
- `costs` + `payments` + `org_settings` → `revenueForMonth`, `costsForMonth`,
  `netBurnSatang`, `runwayMonths` (`lib/metrics/finance.ts`); cash/burn fall
  back to `org_settings.cash_balance_satang` / `monthly_burn_satang` when set,
  else computed burn.
- `subscriptions` → `subscriptionMrr` is the **source of truth for MRR**
  shown on the dashboard; `mrr(invoices)` (recurring-invoice based) is still
  computed and returned as `invoiceMrrSatang` "for reference/back-compat"
  (`dashboard.ts:41-42, 175-178`) but not displayed.
- `quotes` (open: draft/sent/accepted) → open quote count + value.
- `time_entries` (this month only) → `totalMinutes`, `billableValueSatang`,
  `utilization` (`lib/metrics/timesheets.ts`) for the "Billable hours" stat card.
- `projects` → active count (`not_started`, `in_progress`, `review`, `support`).
- `activities` → `followUpsDueToday` / `overdueFollowUps` (uses
  `lib/dates.ts`'s `isPastDue`, app-timezone `Asia/Bangkok`).

The Dashboard is the one place that touches essentially every module's tables
in a single request — it's the natural integration point to check when
adding a new KPI. It reads only; no mutations.

**`lib/metrics/` full inventory** (for reference, since several files here
belong conceptually to Finance/Reports, not Projects, but live in this shared
lib):
- `finance.ts`, `invoice-status.ts`, `pipeline.ts` — Finance/CRM math, see
  `03-finance-accounting.md` / `02-crm-sales-quotes.md`.
- `projects.ts` — `projectProfit()` (revenue from non-draft/non-cancelled
  invoices minus costs, used by the Projects detail page).
- `timesheets.ts` — described above.
- `line-items.ts` — quote/invoice line-item math (`lineAmountSatang`,
  `subtotalSatang`, `documentTotalSatang`), consumed by
  `app/(app)/quotes/actions.ts` and `app/(app)/finance/invoice-items-actions.ts`.
- `reports.ts` — generic `pivot()` builder plus `hoursByProject`,
  `revenueByClientMonth`, consumed by `app/(app)/reports/_data.ts` and
  `lib/documents/report.ts` (the Reports module is out of this page's scope —
  see `03-finance-accounting.md` / `05-automation-integrations.md`).

---

## 5. Views (saved filters)

**Purpose**: not a page of its own — a small shared feature that lets a user
save the current filter state of a list page (Deals, Finance, Clients) under
a name and jump back to it. Despite living at `app/(app)/views/`, **there is
no `/views` route** (no `page.tsx`); the folder is a shared library exposed
through the route-group convention so other modules can import from it.

**Files**:
- `app/(app)/views/actions.ts` — `createSavedView`, `deleteSavedView`.
  `MODULES = ["deals", "finance", "clients"]` is the closed set of modules
  allowed to have saved views; `MODULE_PATH` maps each to the path
  `revalidatePath`d after a change.
- `app/(app)/views/view-config.ts` — pure helpers with no framework
  dependency: `VIEW_FILTER_KEYS = ["stage", "status", "q"]`,
  `configToQueryString`, `configToHref`, `isEmptyConfig`. Deliberately only
  ever emits known keys, so a saved view can't inject arbitrary query params.
- `app/(app)/views/save-view-button.tsx` — `SaveViewButton`, a dialog that
  captures the caller's current `ViewConfig` and names it; disabled when no
  filter is active.
- `app/(app)/views/saved-views-menu.tsx` — `SavedViewsMenu`, dropdown of the
  user's saved views for a module; each entry links to `configToHref(basePath,
  view.config)`; ticks the currently-active view; per-item delete.

**Data flow**: `saved_views` table (`org_id, user_id, module, name, config`
— `config` is `jsonb` validated against the strict `ViewConfig` Zod schema
before insert, `actions.ts:23-29`). RLS is org-wide, but `deleteSavedView`
additionally scopes by `.eq("user_id", ctx.userId)` so one member can't
delete another member's saved view (comment at `actions.ts:75-76`) — a
role/ownership check enforced in application code, not just RLS.

**Consumers**: actually wired into
`app/(app)/deals/_components/deals-toolbar.tsx`,
`app/(app)/finance/_components/finance-toolbar.tsx`, and
`app/(app)/clients/_components/clients-toolbar.tsx` (confirmed via grep) —
not a half-built feature, but it is the one spot in the codebase where the
module contract's "own your lane" rule is deliberately broken: Deals,
Finance, and Clients (three separate module lanes) all reach into
`app/(app)/views/` for shared UI and actions.

---

## Notable cross-cutting observations

- **Audit coverage is inconsistent**: Timesheets calls `writeAudit()` on log/
  delete; Projects' create/update/status/task/milestone actions do not call
  it at all. If audit-log completeness matters, Projects is the gap.
- **Deal → Project handoff is manual, not automatic**: winning a deal does
  not create a project; a person must navigate to `/projects/new?dealId=...`
  (there's no server-side trigger or webhook that does this — check
  `05-automation-integrations.md` for whether n8n/webhooks pick up the slack).
- **Calendar is the cleanest example of a read-only cross-module aggregation**
  view in the codebase — worth using as a reference pattern if another
  "unified view" page is ever built.
- **`lib/metrics/index.ts` barrel is incomplete** (`timesheets`, `line-items`,
  `reports` are not re-exported), though every current call site imports the
  specific submodule directly, so this has no functional effect today.
- **`app/(app)/views/` has no route** — it's a shared-lib-shaped exception to
  the "each module owns one route-group folder" rule in `MODULE_CONTRACT.md`,
  by design (three modules need identical saved-view behavior).

## See also

- `00-architecture.md`
- `01-data-model-and-auth.md`
- `02-crm-sales-quotes.md`
- `03-finance-accounting.md`
- `05-automation-integrations.md`
- `06-testing-and-tooling.md`
