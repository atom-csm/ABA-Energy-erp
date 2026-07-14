# 06 — Testing, Tooling & Dev Scripts

Scope of this page: how the codebase is tested (Vitest unit tests, Playwright
E2E smoke tests), the dev/build script surface, and the two standalone Node
scripts used for manual verification. Business-logic *behavior* (what runway,
MRR, etc. mean) is documented in the module pages linked at the bottom — this
page is about proving that behavior is actually covered by a passing gate.

**Gate status as of this writing** (all run against the working tree):
`pnpm test` → 232 tests / 26 files passed. `pnpm lint` → clean. `pnpm
typecheck` → clean. `pnpm build` → compiles, 55 routes generated. See
"Build-time checks" below for exact commands and caveats.

## Unit test inventory (Vitest)

Config: `vitest.config.ts:1` — `environment: "node"`, `include: ["lib/**/*.test.ts"]`,
`vite-tsconfig-paths` plugin so `@/lib/...` imports resolve the same as in app
code. There is **no `lib/**` test outside this glob** and no component/UI unit
tests — all 26 files below live under `lib/`.

| File | Covers |
|---|---|
| `lib/money.test.ts` | `bahtToSatang`/`satangToBaht` round-tripping, satang rounding (`bahtToSatang(0.005)===1`), `sumSatang` (no float drift), `formatTHB`/`formatTHBWhole`/`formatTHBCompact` |
| `lib/permissions.test.ts` | `can()` grants every `Capability` to `owner`, admin gets operational caps (`quote:convert`, `subscription:manage`, `team:manage`), `member` is denied every gated capability; `capabilitiesFor()` counts |
| `lib/dates.test.ts` | Asia/Bangkok (UTC+7) day roll-over in `todayISO`/`monthKey`/`currentMonthKey`; `isPastDue` and `daysUntil` on ISO date strings (incl. `null` handling) |
| `lib/documents/numbering.test.ts` | `nextDocumentNumber` — starts at 001, increments off the max existing counter (out-of-order/gapped lists), ignores wrong-prefix/wrong-year/free-form entries, per-year scoping, pads to 3 digits but grows past 999 (`999→1000`), tolerates whitespace |
| `lib/documents/printable.test.ts` | `escapeHtml`; `renderDocumentHtml` full-document render, XSS escaping of client name, discount line omitted when zero, empty-items empty-state |
| `lib/documents/report.test.ts` | `renderReportHtml` — self-contained HTML, pivot row/col labels + THB formatting, hours-by-project with billable split, HTML-escaping of org/client names, empty-state copy for no payments/no hours |
| `lib/accounting/mapping.test.ts` | `invoiceToExternalPayload` — satang→baht exact conversion, reference/customerName mapping, `"Unknown"` fallback for null/missing/empty client name, null date passthrough, status passthrough, currency hardcoded to `"THB"` |
| `lib/ai/parse.test.ts` | `parseActionItems` — dash/asterisk/bullet-char/numbered-list extraction, checkbox-marker stripping, skips blank/header lines, empty input, `"(none)"`/`"None"` placeholder suppression, keeps trailing list after a summary paragraph |
| `lib/ai/prompts.test.ts` | `projectSummaryPrompt`, `followupDraftPrompt` (tone switch friendly/formal, Thai-friendly instruction), `meetingIntakePrompt` (empty-notes fallback) — prompt-string assembly only, no LLM call |
| `lib/audit/format.test.ts` | `actorName` (email or `"System"` fallback), `actionLabel` (known actions + humanized unknown snake_case), `auditSentence` (create/update/delete/stage_changed/payment_recorded formats, generated fallback when no summary), `relativeTime` (just now/minutes/hours/days/absolute-date-after-7-days/unparseable→`""`) |
| `lib/auth/password.test.ts` | `validatePassword` policy: min length (`PASSWORD_MIN_LENGTH`), requires lower/upper/digit, multi-issue reporting, non-string defensive guard |
| `lib/automation/rules.test.ts` | `dueFollowUps` — project follow-ups due/overdue vs future/archived/null excluded; activity follow-ups due/overdue vs future/done/null excluded; **not** filtered by activity `type`; combines both entity kinds; derives a title when an activity has none; boundary (due exactly today counts) |
| `lib/billing/generate.test.ts` | `invoiceNumberFor` (`Name-YYYYMM`, zero-padded month); `buildGeneratedInvoice` (emits `sent`, `is_recurring: true`, today's issue date); `alreadyGeneratedForPeriod` (incl. accepting a `Set`); `isUniqueViolation` (Postgres `23505` check) |
| `lib/billing/recurring.test.ts` | `addInterval` (weekly/monthly/quarterly/yearly, month-end clamp Jan 31→Feb 28); `nextRunAfter` (skips multiple missed periods); `isDue` (active+auto+scheduled on/before today; excludes paused/auto_generate=false/future); `dueSubscriptions` filtering |
| `lib/calendar/month.test.ts` | `monthMatrix` always 6×7, Monday-start weeks, leading/trailing out-of-month flags, Feb leap/non-leap, December→January year rollover, strictly sequential dates; `groupByDate`; `monthLabel`; `formatMonthKey`/`parseMonthKey` round-trip + invalid-key rejection; `prevMonth`/`nextMonth` incl. year boundaries |
| `lib/email/render.test.ts` | `escapeHtml`; `renderInvoiceEmailHtml`/`renderQuoteEmailHtml` (number/amount/PDF link/due date rendering, generic greeting + due-line omission when client/date absent, XSS escaping); subject builders |
| `lib/email/send.test.ts` | `sendEmail` — no-API-key path makes **zero** network calls (`{ok:false, reason:"not_configured"}`); success path posts to `https://api.resend.com/emails` with correct auth header/body; non-ok provider response and a rejecting `fetch` both resolve to an error result, **never throw** |
| `lib/export/csv.test.ts` | `toCsv`/`BOM` — CRLF row joins, UTF-8 BOM prepended exactly once (Thai-safe), comma/quote/newline quoting (incl. doubled internal quotes), null/undefined→empty field, numbers unquoted/unformatted, **CSV-injection guard**: leading `=`, `+`, `-`, `@`, tab all get an apostrophe prefix (applied before quoting), negative numbers left alone, internal hyphen not touched |
| `lib/metrics/finance.test.ts` | `revenueForMonth`/`costsForMonth` (Bangkok-month bucketing); `mrr` (normalizes monthly/quarterly/yearly/weekly to a monthly figure, excludes non-recurring and `draft` status); `subscriptionMrr` (excludes paused/cancelled); `unpaidTotal`/`unpaidCount` (collectible statuses only); `netBurnSatang`; `runwayMonths` (null/infinite when not burning) |
| `lib/metrics/invoice-status.test.ts` | `deriveInvoiceStatus` — draft/cancelled pass through untouched, full payment→`paid`, past-due unpaid/partial→`overdue`, partial-but-not-due→`partially_paid`, zero-amount invoice not falsely marked paid on a zero payment; `outstandingSatang` never negative |
| `lib/metrics/line-items.test.ts` | `lineAmountSatang` (qty×price, fractional-quantity rounding, non-finite→0); `withLineAmount`; `subtotalSatang` (raw vs. precomputed `amount_satang`); `documentTotalSatang` (discount subtraction, floors at 0, ignores negative discount) |
| `lib/metrics/pipeline.test.ts` | `pipelineValue` (open stages only), `weightedPipelineValue` (stage-probability weighting), `archivedValue`, `pipelineByStage` (all stages incl. zero), `isOpenStage` |
| `lib/metrics/projects.test.ts` | `projectProfit` — revenue = paid+sent only (draft/cancelled excluded), cost sum, profit, margin %, zero-revenue no-divide-by-zero case |
| `lib/metrics/reports.test.ts` | `pivot` generic (sorted/de-duped row+col keys, cell sums, zero for empty intersection, row/col/grand totals, empty input); `revenueByClientMonth`; `hoursByProject` (billable split, per-project + overall totals, empty input); `minutesToHours`; `billableValueSatang`; `totalRevenueSatang` |
| `lib/metrics/timesheets.test.ts` | `totalMinutes`; `minutesToHours`; `entryValueSatang` (0 for non-billable or null rate); `billableValueSatang`; `minutesByProject`; `utilization` (billable÷total, 0 with no logged time) |
| `lib/webhooks/verify.test.ts` | `safeEqual` (constant-shape string comparison, equal/unequal/different-length); `verifyWebhookSecret` (matching/non-matching, missing/empty header, unset expected secret) |

**Notable cross-cutting patterns tested repeatedly across files:** XSS/HTML
escaping on every HTML-rendering module (`printable`, `report`, `email/render`),
CSV-injection defense (`export/csv`), and "never throw, return a result" for
I/O-adjacent code (`email/send`).

## E2E test inventory (Playwright)

Config: `playwright.config.ts:1` — `testDir: "./e2e"`, single `chromium`
project, `webServer` boots `pnpm dev` against `http://localhost:3000` (reuses
an already-running server), trace on first retry. **Assumes the local
Supabase stack is running and seeded** and `.env.local` is loaded — these are
not hermetic/mocked tests, they hit a real (local) Supabase instance and the
real demo seed data.

| Spec | User flow exercised |
|---|---|
| `e2e/smoke.spec.ts` | Baseline smoke: unauthenticated `/dashboard` redirects to `/login`; demo-account login lands on a populated `/dashboard` (asserts seeded "Cash on hand" card renders); sidebar navigation to each of Clients/Projects/Finance/Templates renders the matching page heading |
| `e2e/v2.spec.ts` | Invoices CSV export returns baht, not satang (`90000` present, `9000000` absent) — regression guard for the satang→baht bug class; projects board groups cards by pipeline stage; signup password policy disables submit for a weak password and enables it once policy is met; changing a project's stage writes a `stage_changed` row to `audit_log` (verified via a service-role Supabase client, not just the UI) and it renders on `/audit` |
| `e2e/v2-batch2.spec.ts` | Accounting sync scaffold: connect a provider on `/settings/accounting` → Disconnect control appears → open an invoice → "Sync to accounting" → polls `accounting_sync_map` for a `status=synced` row and asserts the `FLOWACCOUNT-` external id renders on the invoice page; AI graceful-degradation: the `/intake` extraction shows "not configured" copy when `ANTHROPIC_API_KEY` is unset (no crash, no silent failure) |
| `e2e/v3.spec.ts` | Sidebar exposes Quotes/Timesheets; `/quotes` list renders heading + "new quote" affordance + table-or-empty-state; `/quotes/new` form renders (client select, quote number field); `/timesheets` renders stat cards (Hours this month, Utilization) and the log-time form; `/finance/subscriptions` list + `/finance/subscriptions/new` form; a quote detail page shows line items + PDF download link (skips gracefully if the seed has no quotes) |

Several v2/v3 tests reach into Supabase directly with the **service-role key**
(`createClient(..., SUPABASE_SERVICE_ROLE_KEY)`) to set up deterministic state
(e.g. deleting `accounting_sync_map`/`accounting_connections` rows first) or to
assert on rows the UI doesn't fully expose (audit log, sync map status) —
these are integration-style smoke tests, not pure browser-only E2E.

**Gap:** no E2E coverage for the core CRM/finance *write* paths beyond stage
change and CSV export — e.g. no spec creates a client, converts a quote to an
invoice, records a payment, or logs a cost. Those flows are only exercised via
the underlying unit-tested pure functions (line-items, invoice-status,
finance) plus manual verification (`scripts/verify-seed.mjs`,
`scripts/screenshot.mjs`).

## Coverage gaps

Every file in `lib/**` that is *not* Supabase/Next.js-request-coupled has a
matching `*.test.ts` — the untested files are, without exception, thin
DB/IO/session wrappers where a unit test would just be re-mocking Supabase:

- `lib/audit.ts` (`writeAudit`) — inserts into `audit_log` via a live session client; deliberately best-effort/swallows errors. No unit test; exercised indirectly by `e2e/v2.spec.ts`'s stage-change audit assertion.
- `lib/auth.ts` (`getOrgContext`, `getUserOrgs`, `requireOrgContext`, `requireRole`, `requireCapability`) — session/cookie/membership resolution against Supabase. `requireCapability` wraps the *already-tested* `can()` from `lib/permissions.ts`, so the gating logic itself is covered — the wrapper's throw/redirect behavior is not.
- `lib/automation/dispatch.ts` (`dispatchReminders`) — upserts reminders + queues `outbound_events` against a live Supabase client with dedup-via-unique-index semantics. The *selection* logic it depends on (`dueFollowUps`) is fully unit tested in `lib/automation/rules.test.ts`; the dispatch/upsert side is not, and isn't hit by any E2E spec either — **this is the most notable gap**: the actual cron path (`/api/cron/followups`) that turns due follow-ups into reminders + events has no automated test at any level.
- `lib/accounting/provider.ts` — stub provider registry (deterministic fake IDs, no I/O). Low risk (it's intentionally a stub), but `getProvider`/`PROVIDERS` keying has no unit test; only exercised end-to-end via `e2e/v2-batch2.spec.ts`.
- `lib/ai/client.ts` — presumably wraps the Anthropic SDK call; only its output-parsing (`lib/ai/parse.ts`) and prompt-building (`lib/ai/prompts.ts`) are unit tested, which is the right split (the client itself is exercised for the "not configured" path by `e2e/v2-batch2.spec.ts` but never for a real successful call — reasonable, since that would require live API credentials in CI).
- `lib/queries/dashboard.ts` — dashboard data aggregation queries; DB-coupled, covered only indirectly by `e2e/smoke.spec.ts` asserting the dashboard renders seeded figures.
- `lib/supabase/{admin,client,middleware,server}.ts` — client factory boilerplate; appropriately untested at the unit level.
- `lib/email/index.ts`, `lib/metrics/index.ts` — barrel re-export files (a handful of lines each); nothing to unit test.
- `lib/utils.ts` (`cn`) — trivial `clsx`+`tailwind-merge` wrapper; untested, low risk.
- `lib/types/database.ts` — generated Supabase types, not logic.

**No test targets business logic without a test.** The MVP-relevant pure
functions the QA mandate calls out by name — runway, MRR, revenue, unpaid
invoices, pipeline value, project profit, invoice status, webhook validation —
are all covered (`lib/metrics/finance.test.ts`, `lib/metrics/pipeline.test.ts`,
`lib/metrics/projects.test.ts`, `lib/metrics/invoice-status.test.ts`,
`lib/webhooks/verify.test.ts`). The one process-level gap worth flagging to a
human is the untested cron dispatch path (`dispatchReminders` /
`/api/cron/followups`), since a silent failure there means follow-up reminders
and webhook events quietly stop firing with no test noticing.

## Dev script reference (`package.json:5`)

| Script | Command | What it does |
|---|---|---|
| `pnpm dev` | `next dev` | Local dev server (Turbopack), used both interactively and as Playwright's `webServer` |
| `pnpm build` | `next build` | Production build. Runs its own TypeScript check as part of the build (`Running TypeScript ...` step) and prerenders static routes (`/`, `/login`, `/signup`, `/_not-found`) — the rest of the 55 routes are server-rendered on demand (`ƒ`) |
| `pnpm start` | `next start` | Serves the production build from `pnpm build` |
| `pnpm lint` | `eslint` | Flat config (`eslint.config.mjs:1`) extending `eslint-config-next`'s `core-web-vitals` and `typescript` rule sets; ignores `.next/**`, `out/**`, `build/**`, `next-env.d.ts` |
| `pnpm typecheck` | `tsc --noEmit` | Standalone strict TypeScript check (`tsconfig.json:7` — `"strict": true`), independent of the build's own TS pass; path alias `@/*` → repo root (`tsconfig.json:22`) |
| `pnpm test` | `vitest run` | Single-run unit test suite, see inventory above |
| `pnpm test:watch` | `vitest` | Watch-mode unit tests for local TDD |
| `pnpm e2e` | `playwright test` | Runs all specs in `e2e/**`; **requires** the local Supabase stack running, seeded, and `.env.local` loaded — this is not a self-contained CI-runnable command yet (no mocked/hermetic Supabase layer, no fixture bootstrap in CI) |

Full local dev loop for a change to pure logic: edit `lib/**`, `pnpm
test:watch` for fast feedback, then before committing `pnpm lint && pnpm
typecheck && pnpm test && pnpm build` (all four ran clean against this
worktree as of this page's writing). For a change touching a route/flow, add
or update the same day's `pnpm e2e` (there is no CI wiring visible in-repo for
this — see caveat below).

## Build-time / CI checks worth knowing

- **No CI config found in the repo** (no `.github/workflows`, no other CI
  runner config visible) — `lint`/`typecheck`/`test`/`build` are scripts a
  human or agent must run locally; there is no automated gate on push/PR yet.
  Treat "the gates pass" as something to re-verify per change, not something
  enforced by the platform.
- `pnpm build` performs its own `tsc`-equivalent pass (`Running TypeScript
  ...`) in addition to `pnpm typecheck` — the two are redundant but not
  identical in config surface (Next's build-time check uses the Next TS
  plugin from `tsconfig.json:16-20`); running both is not wasted effort.
- `pnpm build` requires `.env.local` (or equivalent env) with
  `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY` etc. present —
  routes are dynamic (`ƒ`) rather than statically prerendered specifically
  because they read the authenticated org context at request time.
- `pnpm e2e` is the only check requiring live infrastructure (local Supabase +
  a running dev server + seed data) — it cannot run standalone in a clean
  checkout without that setup, unlike `test`/`lint`/`typecheck`/`build`.

## Manual verification scripts

- **`scripts/verify-seed.mjs`** — a standalone Node script (not part of any
  `package.json` script) that checks the local demo seed end-to-end: (1) the
  demo user (`demo@boombignose.org`) can sign in, (2) RLS lets that
  authenticated member read seeded `deals`/`clients`/`org_settings` (and prints
  `invoices`/`projects`/`automation_templates` counts for context), (3) an
  **anonymous** client is blocked by RLS from reading `deals` (`0` rows).
  Exits non-zero on any failed check. Run it after reseeding the local
  Supabase stack or after touching RLS policies: `set -a; source .env.local;
  set +a; node scripts/verify-seed.mjs`.
- **`scripts/screenshot.mjs`** — a standalone Playwright script (also not a
  `package.json` entry) that logs in as the demo account and captures
  full-page screenshots of `/dashboard`, `/deals`, `/finance`, `/clients`,
  `/templates` to `$SHOT_DIR` (currently hardcoded to a stale path from a
  different machine/session at `scripts/screenshot.mjs:3` — **must override
  via the `SHOT_DIR` env var before running**, e.g. `SHOT_DIR=/tmp/shots node
  scripts/screenshot.mjs`). Useful for a quick visual check of core screens
  after a UI change, independent of Playwright's own test runner.

## Claude Code meta-tooling (not app code)

The repo also carries its own Claude Code agent/skill configuration for
developing itself: `.claude/agents/*.md` (role definitions — `system-architect`,
`db-modeler`, `backend-api-builder`, `frontend-ux-builder`,
`automation-integrator`, `product-strategist`, `docs-license-reviewer`,
`security-pdpa-reviewer`, `qa-tdd-reviewer` — this page's author) and
`.claude/skills/`, `.agents/skills/` (a `grilling` skill). These are
development-process tooling, not part of the shipped application, and are
intentionally not documented further here.

## See also

- [00-architecture.md](./00-architecture.md)
- [01-data-model-and-auth.md](./01-data-model-and-auth.md)
- [02-crm-sales-quotes.md](./02-crm-sales-quotes.md)
- [03-finance-accounting.md](./03-finance-accounting.md)
- [04-projects-timesheets-calendar-reports.md](./04-projects-timesheets-calendar-reports.md)
- [05-automation-integrations.md](./05-automation-integrations.md)
