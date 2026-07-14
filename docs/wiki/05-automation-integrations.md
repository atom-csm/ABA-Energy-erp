# 05 — Automation & Integrations

Automation surface for the Company OS: follow-up/overdue/deadline alerts, the
cron jobs that do real work, the n8n inbound webhooks (mostly placeholders in
V1), transactional email (Resend), and AI assists (Claude/Anthropic). Every
external-facing endpoint here is **session-less** — no Supabase auth cookie —
so each authenticates via a shared secret header instead.

## At a glance

| Area | Does real work in V1? | External auth |
|---|---|---|
| `lib/automation/*` (rules + dispatch) | Yes — pure logic + DB writes | n/a (library code) |
| `POST /api/cron/followups` | Yes — scans deals/activities, writes `reminders` + `outbound_events` | `X-Cron-Secret` |
| `POST /api/cron/subscriptions` | Yes — generates invoices from due subscriptions | `X-Cron-Secret` |
| `POST /api/webhooks/n8n/followup` | **No** — placeholder, auth + echo only | `X-Webhook-Secret` |
| `POST /api/webhooks/n8n/invoice-overdue` | **No** — placeholder, auth + echo only | `X-Webhook-Secret` |
| `POST /api/webhooks/n8n/project-deadline` | **No** — placeholder, auth + echo only | `X-Webhook-Secret` |
| Email (`lib/email/*`, Resend) | Yes — invoice/quote send | n/a (outbound, server-only key) |
| AI assists (`lib/ai/*`, Anthropic) | Yes — deal summary, follow-up draft, meeting intake | n/a (outbound, server-only key) |

---

## 1. Automation / alerts library (`lib/automation/`)

Purpose: turn "a deal or activity follow-up is due" into a persisted
`reminders` row plus a queued `outbound_events` row that n8n/Hermes can later
drain. This is the **only** alert type implemented as real logic today — there
is no equivalent rule module yet for invoice-overdue or project-deadline (see
§3 "Drift vs docs").

### `lib/automation/rules.ts` — pure, DB-independent rule

- `dueFollowUps(deals, activities, todayISO)` (rules.ts:63-94) is the single
  entry point. It is pure and unit-tested (`lib/automation/rules.test.ts`) so
  the cron route can stay a thin DB-fetch + dispatch wrapper.
- **Trigger condition — deals**: `stage` not in `{won, lost}` (rules.ts:37) AND
  `next_follow_up_date` is non-null and `<= todayISO` (rules.ts:40-43, 70-79).
- **Trigger condition — activities**: `done = false` AND `due_date` non-null
  and `<= todayISO` (rules.ts:81-91). Activity `type` is NOT a filter — a
  `call`, `meeting`, `note`, or `follow_up` all qualify equally (confirmed by
  rules.test.ts:51-58).
- Dates are compared as `'YYYY-MM-DD'` strings — lexical order == chronological
  order for this format (rules.ts:3-6), matching the convention in
  `lib/dates.ts` (`isPastDue`, `todayISO`).
- Activities without an explicit title get a derived label from `type`
  (`activityTitleFallback`, rules.ts:46-55), e.g. "Follow up: call".
- Output: `ReminderSpec { entity: "deal"|"activity", entityId, title, dueDate }`
  (rules.ts:29-34).

### `lib/automation/dispatch.ts` — persistence + queueing (SERVER-ONLY)

- `dispatchReminders(supabase, orgId, specs)` (dispatch.ts:27-97) does two
  writes per call:
  1. **Upsert `reminders`** with `ignoreDuplicates: true` against the unique
     index `reminders_dedup_idx (org_id, entity, entity_id, due_date)`
     (dispatch.ts:48-53; index defined in
     `supabase/migrations/20260630093000_v2.sql:59`). `.select()` after an
     `ignoreDuplicates` upsert returns **only the newly-inserted rows** — this
     is what makes a same-day re-run a no-op (dispatch.ts:1-8, 60-63).
  2. **Insert one `outbound_events` row per newly-created reminder only**
     (dispatch.ts:65-77), `event_type: "followup.due"`, `status` defaults to
     `queued`. If this insert fails, the reminders are already durably
     persisted (deduped) but the function throws so the route can report a
     partial failure rather than silently dropping the queue write
     (dispatch.ts:84-91).
- Accepts *any* Supabase client — service-role (from the cron route) or an
  RLS-scoped session client — but the caller must have already authorized the
  work and pass a trusted `orgId` (dispatch.ts:10-13). Today the only caller is
  the cron route, using the admin client.

### `app/(app)/automation/page.tsx` — read-only dashboard

- Server component, `dynamic = "force-dynamic"` (page.tsx:28).
- Two panels, both org-scoped via `requireOrgContext()` (page.tsx:64-66):
  - **Pending reminders**: `reminders` where `status = 'pending'`, ordered by
    `due_date` ascending (page.tsx:70-75); a client-side `isPastDue` check
    renders an "Overdue" vs "Due today" badge (page.tsx:121, 142-157).
  - **Outbound events**: latest 25 `outbound_events` rows, most recent first
    (page.tsx:76-82, `EVENT_LIMIT = 25` at page.tsx:30), with a status badge
    for `queued`/`delivered`/`failed` (page.tsx:41-62).
- There is **no** UI here to configure automation rules (schedule, channel,
  thresholds) — the page is purely a viewer of what the cron scan already
  produced. The empty state explicitly tells the user to
  `POST /api/cron/followups` to populate it (page.tsx:99).
- Nothing on this page reads or writes `outbound_events.status` — no
  in-app "mark delivered" action exists; only an external consumer (n8n) is
  expected to flip that column (per `docs/N8N_INTEGRATION.md`).

---

## 2. Cron jobs (`app/api/cron/`)

Both cron routes are **real workers**, not placeholders, and share one auth
pattern: header `X-Cron-Secret` checked against `process.env.CRON_SECRET` via
`verifyWebhookSecret` (see §4). `/api/cron` is listed in `PUBLIC_PREFIXES` in
`lib/supabase/middleware.ts:7` so the route is reachable with no Supabase
session cookie — auth is the header, not middleware. Both export `GET` as an
alias of `POST` so a scheduler's health-check ping can also trigger a scan
(followups/route.ts:121-123, subscriptions/route.ts:192-194).

There is **no `vercel.json` cron config in the repo** — nothing currently
invokes these endpoints on a schedule inside this codebase. Wiring the actual
timer (n8n Schedule node, or Vercel Cron config) is left to deployment/ops.

### `POST /api/cron/followups` (`app/api/cron/followups/route.ts`)

- **Auth**: header `X-Cron-Secret` vs `CRON_SECRET` (route.ts:105-108).
- **Runtime**: Node (service-role client needs `@supabase/supabase-js`,
  route.ts:19).
- **Query behind the alert** (route.ts:35-49):
  - `deals`: `next_follow_up_date is not null AND next_follow_up_date <= today
    AND stage not in (won,lost)`.
  - `activities`: `done = false AND due_date is not null AND due_date <=
    today`, with `body` aliased to `title` in the select (route.ts:45,
    `title:body`).
  - These are the SQL-level candidate filters; `dueFollowUps` re-checks them
    in-process so the rule stays the single source of truth (route.ts:32-34).
- **Grouping**: results are grouped by `org_id` into per-org batches
  (route.ts:56-82) — single-org MVP today, but this keeps the multi-org
  boundary correct (route.ts:54-55).
- **Dispatch**: for each org with due specs, calls `dispatchReminders`
  (route.ts:88-98) — see §1.
- **Response**: `200 { ok: true, orgsScanned, remindersUpserted,
  eventsQueued }`; `401 { error: "unauthorized" }` on bad/missing secret;
  `500 { error: "<message>" }` on scan failure (route.ts:104-117).
- **Idempotency**: re-running the same day produces
  `remindersUpserted: 0, eventsQueued: 0` (enforced by the dedup upsert in
  `dispatchReminders`, not by this route).

### `POST /api/cron/subscriptions` (`app/api/cron/subscriptions/route.ts`)

- **Auth**: same `X-Cron-Secret` / `CRON_SECRET` pattern (route.ts:177-180),
  same secret variable as the followups scan.
- **Purpose**: generate invoices from due recurring subscriptions — not a
  reminder/alert per se, but the other cron-driven automation in the system,
  documented here because it shares the auth model and scheduling story.
- **Trigger condition** (route.ts:52-59, `lib/billing/recurring.ts:66-72`
  `isDue`): subscription `status = 'active' AND auto_generate = true AND
  next_run_date <= today`.
- **Idempotency / no double-billing** (route.ts:83-165):
  1. Deterministic invoice number per period: `invoiceNumberFor(name, today)`
     → `"Name-YYYYMM"` (`lib/billing/generate.ts`); a pre-insert existence
     check skips if that number already exists for the org
     (route.ts:88-101, 103-120).
  2. Belt-and-suspenders: a `23505` unique-violation on insert
     (`unique(org_id, number)`) is treated as a benign skip, not a failure
     (route.ts:135-150, `isUniqueViolation`).
  3. Either way, the subscription's `next_run_date`/`last_generated_on` is
     advanced (`advanceSchedule`, route.ts:33-48) via
     `nextRunAfter(next_run_date, interval, today)` — bounded loop over
     missed periods (`lib/billing/recurring.ts:52-63`).
  - A single failing subscription is caught, logged, and skipped — it does not
    abort the rest of the scan (route.ts:82, 168-170).
- **Response**: `200 { ok: true, generated, skipped }`; same 401/500 shapes as
  the followups scan (route.ts:182-189).

---

## 3. n8n inbound webhooks (`app/api/webhooks/n8n/`)

Three endpoints, one per alert type named in this agent's brief. **All three
are placeholders in V1**: they authenticate the caller, `safeParse` the body
against a permissive `z.object({}).passthrough()` schema, and echo it back —
they do **not** read org data or trigger any side effect
(followup/route.ts:12-16, invoice-overdue/route.ts:13-16,
project-deadline/route.ts:12-15). The comments in each file explain why: a
webhook call has no Supabase session, so RLS would block every query; real
data access is meant to happen inside n8n (via its own Supabase node) or in a
**future** service-role-backed route.

Common shape for all three (e.g. `followup/route.ts:20-47`):

| | |
|---|---|
| **Method** | `POST` (does the auth+echo work); `GET` (health check, no auth: returns `{ status: "ok", endpoint: "<name>" }`) |
| **Auth header** | `X-Webhook-Secret` vs `process.env.N8N_WEBHOOK_SECRET` |
| **Payload schema** | `z.object({}).passthrough()` — accepts any JSON object, rejects non-object bodies |
| **Success (200)** | `{ ok: true, event: "<followup\|invoice-overdue\|project-deadline>", received: <parsed payload> }` |
| **Bad/missing secret (401)** | `{ error: "unauthorized" }` |
| **Invalid payload (400)** | `{ error: "invalid payload" }` |

Files:
- `app/api/webhooks/n8n/followup/route.ts` — deals/activities due today
  (comment at lines 6-10 describes intended fan-out: n8n reads
  `next_follow_up_date` / `due_date` and pushes reminders via Slack/email/LINE).
- `app/api/webhooks/n8n/invoice-overdue/route.ts` — invoices past `due_date`
  still `sent`/`partially_paid`; intended to nudge clients and flip status to
  `overdue` (comment at lines 6-11).
- `app/api/webhooks/n8n/project-deadline/route.ts` — projects/milestones whose
  deadline is approaching or has slipped (comment at lines 6-11).

**Note on what actually drives real reminders today**: only the deals/activity
follow-up path has a working producer — the `/api/cron/followups` scan (§2).
There is **no** cron/query equivalent yet for "invoices past due" or "projects
near deadline" — those two webhook endpoints are pure stubs with no backing
rule module (`lib/automation/rules.ts` only exports `dueFollowUps`). The
underlying data almost certainly exists already (invoices have a `due_date`
and status enum used elsewhere in Finance; projects likely carry a deadline
field per the Projects module), but no automation code in this repo currently
queries them.

`/api/webhooks/**` is a `PUBLIC_PREFIXES` entry in `lib/supabase/middleware.ts:7`,
same mechanism as `/api/cron`.

---

## 4. Secret verification (`lib/webhooks/verify.ts`)

Shared by both the cron routes (`X-Cron-Secret`) and the n8n webhooks
(`X-Webhook-Secret`) — two different env vars, one comparison function.

- `safeEqual(a, b)` (verify.ts:6-13): length check first (this leaks length,
  called out as acceptable for a shared secret in the doc comment), then XORs
  every char code without early-exiting on the first mismatch — a "constant-
  time-ish" comparison. No Node `crypto` dependency, so it works on the Edge
  runtime too.
- `verifyWebhookSecret(provided, expected)` (verify.ts:19-25): returns `false`
  if either side is missing/empty, otherwise delegates to `safeEqual`. Empty
  string secrets can never match (guards against an unset env var silently
  becoming `""` and matching an empty header).
- Fully unit-tested in `lib/webhooks/verify.test.ts` (equal/unequal/length
  mismatch/missing-either-side cases).

**Security note**: `CRON_SECRET` and `N8N_WEBHOOK_SECRET` are two independent
secrets by design (different surface, different caller), but both are single
static shared secrets with no rotation mechanism, no per-org scoping, and no
rate limiting on the auth check itself — a brute-force attempt against a short
or default secret is only slowed by string length comparison cost, not
throttled. `docs/N8N_INTEGRATION.md:66-68` explicitly recommends per-org
secrets "if you expose org-specific data" — not yet needed since the webhooks
are still no-op placeholders, but will matter the moment they start reading
real data.

---

## 5. Email (`lib/email/`) — Resend, HTTP-only, no SDK

Purpose: send invoice/quote emails to clients with a link to the PDF.

- **`lib/email/send.ts`**: `sendEmail({ to, subject, html }, deps?)`
  (send.ts:48-117) posts directly to `https://api.resend.com/emails` via the
  global `fetch` — no `resend` npm package (send.ts:1-14). Deliberately has
  **no `server-only` import** so its config/degrade branch stays unit-testable
  with no key and no network (send.ts:9-11); the real callers (server actions)
  still only run server-side.
  - `isEmailConfigured()` (send.ts:39-41): `true` iff `RESEND_API_KEY` is set.
  - **Graceful degradation**: if `RESEND_API_KEY` is unset, `sendEmail` returns
    `{ ok: false, reason: "not_configured" }` **before constructing any
    request** — no network call is attempted (send.ts:52-56).
  - All transport/HTTP errors are caught and normalized to
    `{ ok: false, reason: "error", error: <message> }`; the API key is never
    included in any returned error string (send.ts:76-116).
  - From-address: `EMAIL_FROM` env override, else `DEFAULT_EMAIL_FROM =
    "BoomBigNose <onboarding@resend.dev>"` (send.ts:16-17, 58).
- **`lib/email/render.ts`**: pure HTML builders, no I/O
  (render.ts:1-5) — `renderInvoiceEmailHtml`, `renderQuoteEmailHtml`, plus
  `escapeHtml` (render.ts:9-16) used everywhere a client-supplied string (name,
  number) is interpolated into the HTML, preventing markup injection. Money is
  formatted via `lib/money`'s `formatTHB` at the display edge only
  (render.ts:6, 71, 89) — the module itself only ever handles satang integers
  until rendering.
- **`lib/email/index.ts`**: re-exports the public surface — `sendEmail`,
  `isEmailConfigured`, `DEFAULT_EMAIL_FROM`, the two render functions, subject
  builders, `escapeHtml`.

### Call sites (both server actions, both org-scoped)

- `app/(app)/finance/email-actions.ts` → `sendInvoiceEmail(invoiceId)`
  (email-actions.ts:24-94): loads the invoice + its client's first contact
  with an email on file, builds the PDF link as
  `${NEXT_PUBLIC_APP_URL}/finance/invoices/{id}/pdf` (email-actions.ts:57),
  sends, then on success writes an audit-log entry (`writeAudit`,
  email-actions.ts:77-83) and logs an `email`-type activity
  (email-actions.ts:85-91). On `reason: "not_configured"` it returns that
  discriminant so the UI can show a subtle notice rather than an error
  (email-actions.ts:72-75).
- `app/(app)/quotes/email-actions.ts` → `sendQuoteEmail(quoteId)` — identical
  shape, PDF link at `/quotes/{id}/pdf`.
- Neither action sends if there is no contact email on file — both return a
  user-facing error asking to add a contact first (email-actions.ts:50-55).

---

## 6. AI assists (`lib/ai/`) — Anthropic/Claude, server-only

Purpose: deal summaries, follow-up drafts, and meeting-notes intake for a
Thai SME founder. Three-layer split mirrors the email module: pure prompt
builders, pure output parsing, and a thin server-only SDK client.

- **`lib/ai/client.ts`** (has `import "server-only"` at line 5 — importing it
  from a Client Component or a vitest node test throws, keeping the SDK/API
  key out of the browser bundle and off the pure-unit-test path):
  - `DEFAULT_MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-4-8"`
    (client.ts:9).
  - `isAIConfigured()` (client.ts:24-26): `true` iff `ANTHROPIC_API_KEY` is set.
  - `generateText({ system, prompt, maxTokens })` (client.ts:33-62): throws
    `AINotConfiguredError` **before constructing the `Anthropic` client** when
    the key is missing (client.ts:42-45) — same "guard first, no network"
    pattern as email. Otherwise calls `client.messages.create(...)` and joins
    all `text`-type content blocks (client.ts:57-61).
- **`lib/ai/prompts.ts`**: pure prompt builders, no I/O/SDK, unit-testable
  with no key/network (prompts.ts:1-5):
  - `dealSummaryPrompt(...)` (prompts.ts:44-73) — summarize deal state,
    momentum, risk, next step, capped at ~120 words.
  - `followupDraftPrompt(...)` (prompts.ts:85-112) — draft a ready-to-send
    follow-up message; `Tone = "friendly" | "formal" | "brief"`
    (prompts.ts:16, 79-83), defaults to `"friendly"`.
  - `meetingIntakePrompt(rawNotes)` (prompts.ts:118-137) — turns raw meeting
    notes into a short summary + `Action items:` bullet list.
  - All three append a shared `THAI_OUTPUT` instruction (prompts.ts:36-38):
    reply in the same language as the input context, and in polite/formal Thai
    when the context is Thai.
- **`lib/ai/parse.ts`**: pure text parsing, no I/O (parse.ts:1-4):
  - `parseActionItems(modelText)` (parse.ts:46-68) extracts bulleted/numbered
    lines into `ActionItem[]`, skipping markdown headers/label lines
    (`isHeaderLine`, parse.ts:10-15) and a `(none)` placeholder
    (parse.ts:63). Prose with no list markers yields `[]` (parse.ts:44-45)
    so the caller falls back to showing just the summary.

### Call sites (server actions, all org-scoped via `requireOrgContext()`)

- `app/(app)/deals/ai-actions.ts`:
  - `summarizeDeal(dealId)` (ai-actions.ts:99-132) and
    `draftFollowup(dealId, tone?)` (ai-actions.ts:134-171). Both: guard
    `isAIConfigured()` up front and return `{ notConfigured: true }`
    (ai-actions.ts:102, 139) *in addition to* catching
    `AINotConfiguredError` from `generateText` (ai-actions.ts:128-130,
    167-169) — belt-and-suspenders against dev module-boundary `instanceof`
    gaps per the comment at ai-actions.ts:101.
  - Context fed to the model: deal title/stage/value (satang→baht at the
    boundary, ai-actions.ts:113), client name, and up to the last **12**
    activities (`ACTIVITY_LIMIT`, ai-actions.ts:30), all loaded org-scoped
    (`loadDealContext`, ai-actions.ts:33-68).
  - Every generated result is best-effort cached to `ai_outputs`
    (`cacheOutput`, ai-actions.ts:72-95; table defined in
    `supabase/migrations/20260701090000_v2_ai_accounting.sql:14-25`,
    `kind` enum `deal_summary|followup_draft|meeting_intake`) — a cache-write
    failure is swallowed so it never loses content already generated for the
    user (ai-actions.ts:92-94).
  - Return type `AIResult = { notConfigured: true } | { content } | { error }`
    (ai-actions.ts:22-25) — a 3-way discriminated union the UI branches on.
- `app/(app)/intake/actions.ts` → `intakeMeeting(notes)`
  (actions.ts:29-66): validates non-empty notes with Zod
  (`NotesInput`, actions.ts:27), same `notConfigured` guard
  (actions.ts:31), runs `meetingIntakePrompt` + `parseActionItems`, caches to
  `ai_outputs` with `entity: "meeting", entity_id: null` (actions.ts:47-56),
  and returns `{ content, items }` on success.
- `app/(app)/intake/page.tsx` renders the intake form/UI around
  `intakeMeeting`.

---

## Env vars and graceful degradation (`.env.example`)

| Var | Used by | If unset |
|---|---|---|
| `N8N_WEBHOOK_SECRET` | `app/api/webhooks/n8n/*` (`X-Webhook-Secret`) | `verifyWebhookSecret` always returns `false` (expected side is empty) → every call gets `401` |
| `CRON_SECRET` | `app/api/cron/followups`, `app/api/cron/subscriptions` (`X-Cron-Secret`) | Same — always `401` |
| `ANTHROPIC_API_KEY` | `lib/ai/client.ts` | `isAIConfigured()` false; every AI action returns `{ notConfigured: true }` **before** any SDK construction or network call — UI shows a "configure ANTHROPIC_API_KEY" notice (`.env.example:31-34`) |
| `ANTHROPIC_MODEL` | `lib/ai/client.ts:9` | Falls back to hardcoded `"claude-opus-4-8"` |
| `RESEND_API_KEY` | `lib/email/send.ts` | `isEmailConfigured()` false; `sendEmail` returns `{ ok: false, reason: "not_configured" }` before any network call — UI shows "Email not configured" (`.env.example:38-40`) |
| `EMAIL_FROM` | `lib/email/send.ts:58` | Falls back to `DEFAULT_EMAIL_FROM` |
| `NEXT_PUBLIC_APP_URL` | PDF links in invoice/quote emails (`email-actions.ts:57`, quotes equivalent) | Link renders with `undefined` prefix if unset — no explicit guard in these two call sites |
| `SUPABASE_SERVICE_ROLE_KEY` | `lib/supabase/admin.ts` `createAdminClient()`, used by both cron routes | Cron routes would fail to construct an admin client (not degrade — this one is load-bearing for the cron scans, not an optional integration) |

Every optional integration here (`N8N_WEBHOOK_SECRET`/`CRON_SECRET` excepted,
since those *should* fail closed) follows the same "guard before I/O, never
throw, return a typed not-configured/error result" convention, applied
consistently across email and AI.

---

## n8n wiring guide (short version — full detail in `docs/N8N_INTEGRATION.md`)

1. **Inbound (n8n → OS), real work today**: Schedule node (e.g. daily 09:00
   Asia/Bangkok) → HTTP Request node → `POST /api/cron/followups` with header
   `X-Cron-Secret: $CRON_SECRET`. Safe to call repeatedly; idempotent. Same
   pattern for `POST /api/cron/subscriptions` (billing).
2. **Inbound (n8n → OS), placeholders today**: Schedule → HTTP Request →
   `POST /api/webhooks/n8n/{followup,invoice-overdue,project-deadline}` with
   header `X-Webhook-Secret: $N8N_WEBHOOK_SECRET`. Currently only
   authenticate+echo; to make these do real work, add a service-role query
   **inside the route handler** scoped by `org_id`, per the guidance in
   `docs/N8N_INTEGRATION.md:60-68`.
3. **Outbound consumption (OS → n8n/Hermes)**: n8n polls (e.g. every 5 min)
   `outbound_events` where `status = 'queued'` (Supabase node or service-role
   HTTP call), sends the message (LINE via future Hermes, or email) using the
   `payload` (`followup.due` shape documented in
   `docs/N8N_INTEGRATION.md:211-222`), then marks the row `delivered`/`failed`
   with `attempts` incremented on failure. No code in this repo currently
   performs that poll+mark step — it is entirely n8n/Hermes-side.
4. **Future: Hermes (LINE)**. Planned as the consumer in step 3 — resolves a
   deal/activity owner's LINE binding and pushes a card for `followup.due`
   (and later `invoice.overdue`) events. No contract change needed on the OS
   side; the queue is the integration seam. Flagged as a Pro-tier automation
   pack in the docs.

---

## Drift vs `docs/N8N_INTEGRATION.md`

The doc is largely accurate and current, with these gaps worth flagging:

- The doc's endpoint table (`docs/N8N_INTEGRATION.md:12-16`) correctly labels
  all three `/api/webhooks/n8n/*` routes as placeholders and the two
  `/api/cron/*` routes as doing real work — this matches the code exactly.
- The doc does not mention that **no rule/query module exists yet** for
  invoice-overdue or project-deadline detection — only follow-ups have a
  working `lib/automation/rules.ts` equivalent. A reader could reasonably
  assume from the doc's cron section that all three alert types are driven by
  scans; only one is.
- The doc does not mention that **no scheduler is actually configured** in
  this repo (no `vercel.json` cron block, no n8n workflow file checked in) —
  the "Schedule node" instructions are aspirational/manual setup, not
  something that runs today without external configuration.
- The doc's outbound-queue section is accurate to `dispatch.ts` and the
  `outbound_events` schema, including the reserved-but-unused `event_type`
  values `deal.stalled` and `invoice.overdue` (schema comment,
  `20260630093000_v2.sql:64`) — those are documented as future, matching that
  no code emits them yet.

---

## See also

- [00-architecture.md](./00-architecture.md)
- [01-data-model-and-auth.md](./01-data-model-and-auth.md)
- [02-crm-sales-quotes.md](./02-crm-sales-quotes.md)
- [03-finance-accounting.md](./03-finance-accounting.md)
- [04-projects-timesheets-calendar-reports.md](./04-projects-timesheets-calendar-reports.md)
- [06-testing-and-tooling.md](./06-testing-and-tooling.md)
