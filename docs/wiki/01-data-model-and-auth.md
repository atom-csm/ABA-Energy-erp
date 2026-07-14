# 01 — Data Model, Multi-Tenancy & Auth

> Ground truth for this page is the SQL in `supabase/migrations/*.sql` (8 files,
> 867 lines, applied in filename/timestamp order) plus `supabase/seed.sql`. Where
> `docs/brainstorm/database.md` (the original design brainstorm) disagrees with
> the migrations, the migrations win — drift is called out inline below.

This is a single Supabase Postgres project (`boombignose-erp`) behind one Next.js
app. It's built multi-tenant-ready (every business table carries `org_id`,
isolation enforced by Postgres RLS) but ships V1 as effectively single-org, with
a working invite flow that makes multi-org real today (a user can belong to
several orgs and switch between them).

## Table-by-table breakdown

29 tables total. FK column shows the referenced table; `⊥` marks nullable FK
(`on delete set null`), plain arrow marks `not null … on delete cascade` unless noted.

### Org / Auth (`20260630090000_init_schema.sql`, `20260630091000_rls_policies.sql`)

| Table | Purpose | Key columns | FKs |
|---|---|---|---|
| `organizations` | Tenant root | `name`, `slug unique` | — (is the tenant) |
| `profiles` | App-level user data, 1:1 with an auth user | `id` (= `auth.users.id`, **no default**), `full_name`, `avatar_url`, `locale default 'th'` | `id → auth.users.id` cascade |
| `memberships` | User↔org join table + role; **the row RLS pivots on** | `org_id`, `user_id`, `role role_enum default 'member'`, `unique(user_id, org_id)` | `org_id → organizations`, `user_id → auth.users` |

### CRM (`init_schema.sql`)

| Table | Purpose | Key columns | FKs |
|---|---|---|---|
| `clients` | Customer companies | `name`, `industry`, `source`, `notes`, `owner` | `org_id`, `owner ⊥ auth.users` |
| `contacts` | People at a client | `name`, `email`, `phone`, `role` | `org_id`, `client_id → clients` cascade |
| `deals` | Sales pipeline | `title`, `stage deal_stage`, `value_satang bigint`, `currency char(3)`, `expected_close_date`, `next_follow_up_date`, `owner` | `org_id`, `client_id → clients` cascade, `owner ⊥ auth.users` |
| `activities` | Notes/calls/follow-ups tied to a client and/or deal | `type activity_type`, `due_date`, `done`, `body`, `owner` | `org_id`, `client_id ⊥ clients`, `deal_id ⊥ deals`, `owner ⊥ auth.users` |

### Projects (`init_schema.sql`)

| Table | Purpose | Key columns | FKs |
|---|---|---|---|
| `projects` | Delivery unit, usually spawned from a won deal | `name`, `status project_status`, `deadline`, `budget_satang`, `owner` | `org_id`, `deal_id ⊥ deals`, `client_id ⊥ clients`, `owner ⊥ auth.users` |
| `project_tasks` | Task list per project | `title`, `status task_status`, `assignee`, `due_date`, `done` | `org_id`, `project_id → projects` cascade, `assignee ⊥ auth.users` |
| `milestones` | Project checklist (boolean `done`, no status enum) | `title`, `done`, `due_date` | `org_id`, `project_id → projects` cascade |

### Finance (`init_schema.sql`, `20260630092000_settings.sql`, `20260702090000_v3_sales_docs.sql`)

| Table | Purpose | Key columns | FKs |
|---|---|---|---|
| `invoices` | Bills to clients | `number`, `status invoice_status`, `issue_date`, `due_date`, `amount_satang`, `is_recurring`, `recurring_interval`, `unique(org_id, number)` | `org_id`, `client_id → clients` cascade, `project_id ⊥ projects` |
| `invoice_items` | Invoice line items (V3) | `description`, `quantity numeric(12,3)`, `unit_price_satang`, `amount_satang`, `position` | `org_id`, `invoice_id → invoices` cascade |
| `payments` | Payments recorded against an invoice | `amount_satang`, `paid_at`, `method payment_method`, `notes` | `org_id`, `invoice_id → invoices` cascade |
| `costs` | Operating costs (optionally project-attributed) | `category cost_category`, `amount_satang`, `incurred_on`, `vendor` | `org_id`, `project_id ⊥ projects` |
| `org_settings` | Per-org manual cash balance + optional burn override, feeds runway metric | `cash_balance_satang`, `monthly_burn_satang` (nullable = compute from `costs`), `unique(org_id)` | `org_id → organizations` cascade |
| `quotes` | Priced proposal; converts to an invoice on acceptance | `number`, `status quote_status`, `subtotal_satang`, `discount_satang`, `total_satang`, `converted_invoice_id`, `owner`, `unique(org_id, number)` | `org_id`, `client_id → clients` cascade, `project_id ⊥ projects`, `converted_invoice_id ⊥ invoices` |
| `quote_items` | Quote line items | `description`, `quantity`, `unit_price_satang`, `amount_satang`, `position` | `org_id`, `quote_id → quotes` cascade |
| `subscriptions` | Recurring billing engine — cron scans `next_run_date`, generates invoices, feeds MRR | `amount_satang`, `interval recurring_interval`, `status subscription_status`, `next_run_date`, `last_generated_on`, `unique(org_id, name)` | `org_id`, `client_id → clients` cascade, `project_id ⊥ projects` |
| `accounting_connections` | One external book-of-record link per org (FlowAccount/PEAK/Xero scaffold) | `provider`, `status accounting_conn_status`, `config jsonb` (non-secret only — no tokens stored), `unique(org_id)` | `org_id → organizations` cascade |
| `accounting_sync_map` | Our record ↔ external id mapping | `provider`, `local_entity`, `local_id`, `external_id`, `status accounting_sync_status`, `last_error`, `unique(org_id, provider, local_entity, local_id)` | `org_id → organizations` cascade |

### Templates (`init_schema.sql`)

| Table | Purpose | Key columns | FKs |
|---|---|---|---|
| `template_categories` | Grouping for automation templates | `name`, `slug`, `unique(org_id, slug)` | `org_id → organizations` cascade |
| `automation_templates` | Reusable automation playbook (internal cost vs. client price) | `internal_value_satang`, `price_satang`, `reusable_notes`, `implementation_checklist jsonb`, `tags text[]` | `org_id`, `category_id ⊥ template_categories` |

### Timesheets (`20260702090000_v3_sales_docs.sql`)

| Table | Purpose | Key columns | FKs |
|---|---|---|---|
| `time_entries` | Hours logged against a project/task | `work_date`, `minutes int check (minutes >= 0)`, `billable`, `rate_satang` (null = non-billable) | `org_id`, `project_id → projects` cascade, `task_id ⊥ project_tasks`, `user_id ⊥ auth.users` |

### Operational / platform tables (`20260630093000_v2.sql`, `20260701090000_v2_ai_accounting.sql`)

| Table | Purpose | Key columns | FKs |
|---|---|---|---|
| `audit_log` | **Append-only** activity history (see Audit section below) | `actor_id`, `actor_email`, `entity`, `entity_id`, `action`, `summary`, `meta jsonb` | `org_id`, `actor_id ⊥ auth.users` |
| `saved_views` | Per-user saved filters per module | `module`, `name`, `config jsonb` | `org_id`, `user_id → auth.users` cascade |
| `reminders` | Follow-up reminders; cron scan upserts idempotently | `entity`, `entity_id`, `due_date`, `channel reminder_channel`, `status reminder_status`, `unique(org_id, entity, entity_id, due_date)` | `org_id → organizations` cascade |
| `outbound_events` | Queue consumed by n8n / future Hermes integration | `event_type`, `payload jsonb`, `status outbound_status`, `attempts` | `org_id → organizations` cascade |
| `ai_outputs` | Cache of generated AI summaries/drafts/intake | `entity`, `entity_id`, `kind ai_output_kind`, `model`, `content`, `created_by` | `org_id`, `created_by ⊥ auth.users` |

### Team & client-portal (`20260702100000_v3_invitations.sql`, `20260702110000_v3_client_portal.sql`)

| Table | Purpose | Key columns | FKs |
|---|---|---|---|
| `invitations` | Email invite → membership on accept | `email`, `role role_enum`, `token unique`, `status invitation_status`, `invited_by`, `accepted_by`, `expires_at`, `unique(org_id, email)` | `org_id`, `invited_by ⊥ auth.users`, `accepted_by ⊥ auth.users` |
| `clients.portal_enabled` / `clients.portal_token` | Adds an opt-in, per-client, unguessable read-only portal token directly onto `clients` (no new table) | `portal_enabled boolean default false`, `portal_token text unique`, indexed | — |

## Enums

```
role_enum              owner | admin | member
deal_stage             lead | contacted | discovery | proposal | negotiation | won | lost
project_status         not_started | in_progress | review | delivered | support | paused | cancelled
invoice_status         draft | sent | partially_paid | paid | overdue | cancelled
task_status             todo | in_progress | done
activity_type           note | call | email | meeting | follow_up
payment_method          transfer | cash | card | promptpay | cheque | other
recurring_interval      weekly | monthly | quarterly | yearly
cost_category           software | contractor | infra | marketing | salary | other
reminder_status         pending | sent | cancelled
reminder_channel        line | email | inapp
outbound_status         queued | delivered | failed
ai_output_kind          deal_summary | followup_draft | meeting_intake
accounting_provider     flowaccount | peak | xero
accounting_conn_status  disconnected | connected | error
accounting_sync_status  pending | synced | error
quote_status            draft | sent | accepted | declined | expired | converted
subscription_status     active | paused | cancelled
invitation_status       pending | accepted | revoked | expired
```
(`supabase/migrations/20260630090000_init_schema.sql:19-27`, `20260630093000_v2.sql:8-10`, `20260701090000_v2_ai_accounting.sql:8-11`, `20260702090000_v3_sales_docs.sql:9-10`, `20260702100000_v3_invitations.sql:10`)

## Entity-relationship summary

```
auth.users ──1:1── profiles
auth.users ──< memberships >── organizations        (M:N, role per pair)

organizations ─┬< clients ─┬< contacts
               │           ├< deals ─< activities
               │           ├< quotes ─< quote_items
               │           ├< invoices ─┬< invoice_items
               │           │            └< payments
               │           └< subscriptions
               ├< projects ─┬< project_tasks
               │            ├< milestones
               │            ├< time_entries
               │            └< costs (project_id optional)
               ├< template_categories ─< automation_templates
               ├< invitations
               ├< audit_log / saved_views / reminders / outbound_events / ai_outputs
               ├< accounting_connections ─< accounting_sync_map
               └< org_settings (1:1)

deal ──0..1──> project        (won deal may spawn a project)
quote ──0..1──> invoice       (accepted quote converts via converted_invoice_id)
project ──0..1──> invoice/quote/cost/time_entries   (optional project link)
client.portal_token ──> scoped read-only access to that client's quotes/invoices/projects
```

Every table except `organizations` and `profiles` carries `org_id` pointing back
to the owning org — a flat, redundant tenant key that keeps every RLS check a
single indexed predicate rather than a multi-join.

## Multi-tenancy: how `org_id` scoping works end to end

**Database layer (source of truth).** Every business table has RLS both
`enable`d and `force`d (`force` matters — it applies RLS even to the table
owner, which is who Postgres runs migrations/some queries as). The pattern,
repeated per table, is:

```sql
create policy <table>_rw on <table>
  for all to authenticated
  using (private.is_org_member(org_id)) with check (private.is_org_member(org_id));
```

`private.is_org_member(target_org)` (`supabase/migrations/20260630091000_rls_policies.sql:9-21`)
is a `SECURITY DEFINER`, `search_path = ''` SQL function that checks
`memberships` for `(org_id = target_org, user_id = auth.uid())`. Because it's
`SECURITY DEFINER` it bypasses RLS on `memberships` itself when it runs, which
is precisely what avoids infinite recursion (a normal RLS predicate on
`memberships` calling back into a policy on `memberships` would deadlock the
planner). `execute` on it is revoked from `public`/`anon` and granted only to
`authenticated`.

`memberships` and `organizations` get narrower, hand-written policies instead of
the generic helper-based one:
- `memberships_select_own`: `using (user_id = auth.uid())` — no helper call, so
  no recursion risk; a user only ever sees their own membership rows.
- `organizations_select`: `using (private.is_org_member(id))` — read-only; **there
  is no authenticated insert/update/delete policy on `organizations` or
  `memberships`** (see Gotchas — org creation and invite-acceptance therefore
  require the service-role client).
- `profiles_select`: `using (id = auth.uid() or private.shares_org(id))` (a
  second `SECURITY DEFINER` helper, `private.shares_org`, lets co-members see
  each other's name/avatar for attribution in UI like the audit feed).
- `profiles_update_own`: a user may only update their own profile row.

**App layer (defense-in-depth, not the source of truth).**
`lib/auth.ts:29-64` (`getOrgContext`) resolves, per request, which org is
"active" for the signed-in user: it reads all of the user's `memberships` rows,
picks the one matching the `active_org` cookie if the user is actually a member
of it, else falls back to the first (oldest) membership. `requireOrgContext()`
(`lib/auth.ts:104-108`) wraps this and redirects to `/login` if there's no
session or no membership at all.

Server actions never trust a client-supplied `org_id`; every mutation derives
`org_id` from `ctx.orgId` returned by `requireOrgContext()`, then the query
still runs through the session-scoped Supabase client so RLS re-validates
membership independently. This is belt-and-braces: even if a bug caused an
action to use the wrong `org_id`, RLS's `with check (private.is_org_member(org_id))`
would still reject a write into an org the caller isn't a member of.

**Seed strategy.** `supabase/seed.sql` runs via the service role (bypasses RLS
entirely) and uses deterministic literal UUIDs (`a000...0001` for the org,
`b000...0001..3` for the three demo users) so the whole file is safe to re-run
(`on conflict … do nothing`/`do update`). It creates: 3 `auth.users` +
matching `auth.identities` rows (pre-confirmed, password `BoomDemo123!` for
all), 3 `profiles`, 1 `organizations` row, 1 `org_settings` row, 3
`memberships` rows (owner/member/member — **this membership linkage is what
maps a demo login to visible data**; without it RLS returns zero rows even
though the data exists), then CRM/projects/finance/templates/quotes/timesheets/
subscriptions data all stamped with the same `org_id`. `scripts/verify-seed.mjs`
end-to-end-checks this: logs in as the demo owner over the anon client, asserts
`deals`/`clients`/`org_settings` are visible (RLS lets a real member read), and
separately asserts an anonymous (no-session) client sees **zero** rows on
`deals` — i.e. it's a live regression test that RLS is doing its job, not just
that the tables exist.

## Role model — owner / admin / member

Roles live in `memberships.role` (`role_enum`), one per `(user, org)` pair —
the same person can hold different roles in different orgs.

RLS policies themselves are **not** role-differentiated for most tables — any
member of the org gets full CRUD (`for all … using (private.is_org_member(org_id))`)
at the database level, regardless of role. Role-based restriction is a pure
**application-layer** concern, implemented as a capability matrix:

`lib/permissions.ts` defines a `Capability` union (`settings:manage`,
`team:manage`, `accounting:manage`, `client:delete`, `deal:delete`,
`template:manage`, `quote:convert`, `quote:delete`, `invoice:delete`,
`cost:delete`, `subscription:manage`, `audit:view`) and a single map,
`CAPABILITY_ROLES`, from capability → allowed roles. Today every capability
maps to `ALL_STAFF = ["owner", "admin"]` — i.e. `member` holds **none** of the
gated capabilities, and owner/admin are currently equivalent in practice.
`can(role, capability)` and `capabilitiesFor(role)` (used to shape UI
affordances) are the two entry points.

`lib/auth.ts:110-126` exposes two enforcement helpers used from server actions
and pages:
- `requireRole(ctx, allowed: Role[])` — throws `"Forbidden"` if
  `ctx.role` isn't in the list (legacy/simple call sites).
- `requireCapability(ctx, capability)` — preferred: throws unless
  `can(ctx.role, capability)`.

12 files under `app/` call one of these (`requireCapability`/`requireRole`),
gating things like: connecting/disconnecting accounting
(`accounting:manage`), deleting a client/deal/quote/invoice/cost, managing
templates and subscriptions, inviting/revoking teammates (`team:manage`,
used in `app/(app)/settings/org-actions.ts:73-74,121-122`), editing org
settings, and viewing the audit log (`audit:view`, `app/(app)/audit/page.tsx:21`).
The comment in `lib/permissions.ts:9-11` is explicit about the split: "RLS
still enforces org isolation at the database; capabilities are the
defense-in-depth layer for *which member* may perform an action" — i.e. RLS
answers "which org," capabilities answer "which role within the org."

Two flows deliberately run outside both the ordinary session RLS path and the
capability check, using the service-role admin client instead, because the
caller has no membership yet or no session at all:
- **Invitation acceptance** (`app/(app)/settings/org-actions.ts:151-221`,
  `acceptInvitation`): the invitee isn't a member of the target org, so RLS
  would hide the `invitations` row and block the `memberships` insert (recall
  `memberships` has no authenticated insert policy at all). The action
  validates the token, status, expiry, and email match server-side, then uses
  `createAdminClient()` to read the invite and idempotently insert the
  membership — the acting user id still comes only from the verified session
  (`supabase.auth.getUser()`), never from client input.
- **Client portal** (`app/portal/[token]/portal-actions.ts`): fully anonymous,
  no user session at all. Every action resolves the opaque `portal_token` to
  exactly one `(client_id, org_id)` via the admin client
  (`resolveClient`, lines 27-40) and every subsequent read/write is filtered by
  that resolved `client_id`/`org_id` — the caller-supplied `quoteId`/`invoiceId`
  is only ever used as a `WHERE` filter alongside the resolved ids, never
  trusted alone. Explicit status guards (only a `sent` quote can be accepted;
  a `paid`/`cancelled` invoice can't be re-marked) prevent replay/misuse.
  Portal is off by default (`portal_enabled default false`) and must be
  explicitly enabled with a minted token per client.

## Audit logging

`audit_log` (`supabase/migrations/20260630093000_v2.sql:13-26`) is intentionally
**append-only**: its RLS policies only cover `select` and `insert`
(`audit_log_select`, `audit_log_insert`, both `private.is_org_member(org_id)`);
there is no `update`/`delete` policy for `authenticated`, so no ordinary session
can alter or erase a row once written (only `service_role`, which bypasses RLS,
theoretically could — nothing in the app currently does).

Columns: `org_id`, `actor_id` (nullable FK to `auth.users`, `set null` on user
deletion so history survives account removal), `actor_email` (denormalized so
the feed can render a name even after the user is gone), `entity` (free-text,
e.g. `'deal'`, `'invoice'`, `'invitation'`), `entity_id`, `action` (free-text,
e.g. `'created'`, `'stage_changed'`, `'invited'`), `summary` (a human sentence
authored at write time — the row is pre-rendered, not reconstructed from
`meta`), and `meta jsonb` for structured extras.

**Write path** — `lib/audit.ts:29-50`, `writeAudit(ctx, entry)`:
- Runs on the normal session-scoped client (not admin), so the insert is itself
  subject to `audit_log_insert`'s RLS check — the row can only ever be written
  as the acting user, into their own active org.
- Deliberately **best-effort**: wrapped in try/catch, errors are only
  `console.error`'d, never thrown. The docstring is explicit that this must
  never break the mutation it accompanies, and that call sites should call it
  *after* the mutation succeeds and, for actions that `redirect()`, *before*
  the redirect (since it doesn't throw, there's no `NEXT_REDIRECT` to leak).
  Net effect: **audit logging is not guaranteed** — a transient RLS/auth/network
  blip silently drops the entry with only a server log, no visible error, no
  retry queue.

**Read path / UI** — `app/(app)/audit/page.tsx`: gated by
`requireCapability(ctx, "audit:view")` (owner/admin only), queries the last 100
rows for the active org ordered newest-first. Presentation logic lives in
`lib/audit/format.ts` (pure, DB-independent, unit-tested via
`lib/audit/format.test.ts`): `auditSentence` prefers the authored `summary`,
falling back to a synthesized `"{actor} {action} {entity}"` sentence for
legacy/partial rows so nothing renders blank; `actorName` falls back to
`"System"` when there's no actor email; `relativeTime` renders "just now" /
"N minutes/hours/days ago" up to a week, then an absolute Asia/Bangkok date.

Indexes: `(org_id, created_at desc)` for the feed query, `(org_id, entity,
entity_id)` for per-record history lookups (not yet surfaced in UI as of this
read, but the index anticipates it).

## Indexes (non-exhaustive highlights)

Every tenant table has a plain `(org_id)` index (RLS's hottest predicate) plus
FK indexes. Composite/partial indexes worth knowing about:
`deals(org_id, stage)`, `deals(org_id, next_follow_up_date)`,
`activities(org_id, due_date) where done = false`,
`project_tasks(org_id, status) where done = false`,
`projects(org_id, status)`, `invoices(org_id, status)`,
`invoices(org_id, due_date)`, `automation_templates using gin(tags)`,
`audit_log(org_id, created_at desc)`, `reminders(org_id, status) where status = 'pending'`,
a **dedup unique index** `reminders(org_id, entity, entity_id, due_date)` that
lets the reminder cron `upsert` idempotently, `time_entries(org_id, user_id, work_date)`,
`subscriptions(org_id, status, next_run_date)` (the cron's scan predicate), and
`clients(portal_token)`.

## Types

`lib/types/database.ts` (1784 lines) is the Supabase-generated `Database` type:
one entry per table under `Tables`, `TablesInsert`, `TablesUpdate`, plus
`Enums<>` and a `Json` type. App code narrows against this everywhere (e.g.
`Role = Enums<"role_enum">` in `lib/auth.ts:9`) rather than hand-rolling
duplicate types, so a schema change (new column, new enum value) surfaces as a
type error at the nearest call site once regenerated.

## Security gotchas / drift / tech debt

- **`memberships` and `organizations` have no authenticated write policy at
  all** — only `select`. This is correct-by-design (membership grants must not
  be self-service; org creation isn't a self-serve flow in V1) but it means
  **both invitation acceptance and org creation are hard-wired to require the
  service-role client**. Any future "create your own org" self-signup flow will
  need either a new carefully-scoped policy or another service-role code path —
  worth flagging before that feature is built.
- **RLS is uniform-by-role.** Every business table's policy is
  `private.is_org_member(org_id)` regardless of `role` — a `member` has the
  same raw database CRUD access as `owner`/`admin` on clients, deals, invoices,
  payments, etc. All role restriction (delete capabilities, settings, team
  management, audit view) is enforced only in the Next.js server actions via
  `requireCapability`. This matches `docs/brainstorm/database.md:184`'s note
  that per-verb/per-role splits should be added "only where owner/admin should
  differ" — but as implemented, **none** of the business tables actually have
  that split at the DB layer; a bug or a direct DB client (e.g. Studio, a
  future public API, a compromised anon key used creatively) that skips the
  app layer would let a `member` delete or edit anything a session's RLS
  allows. This is the single biggest "RLS relies on the app" gap in the schema.
- **Audit logging can silently fail.** By design (`lib/audit.ts:22-24`,
  "BEST-EFFORT BY DESIGN... must NEVER throw"), a dropped audit write leaves no
  visible trace beyond a server console log — there's no retry, dead-letter
  queue, or reconciliation. For a system whose main audit-worthy events are
  money movement (payments, invoice status) and access changes (invitations),
  this is a real (if deliberately accepted) gap versus a compliance-grade audit
  trail.
- **`accounting_connections.config` is jsonb documented as "non-secret only"**
  (`20260701090000_v2_ai_accounting.sql:34-35`) with a comment that real OAuth
  tokens will be "handled server-side later, never stored here in plaintext" —
  this is a scaffold, not a finished secret-storage design; whoever wires up
  real FlowAccount/PEAK/Xero OAuth needs to pick an actual secret-storage
  mechanism (Vault, encrypted column, external secret manager) before this
  table holds real credentials.
- **Client portal trust boundary is narrow but manually re-derived per query**
  (`app/portal/[token]/portal-actions.ts`) rather than enforced by an RLS
  policy — every new portal action has to remember to re-filter by the
  resolved `client_id`/`org_id` itself; RLS gives no safety net here since the
  admin client bypasses it entirely. This is flagged in the migration's own
  comment (`20260702110000_v3_client_portal.sql:6-7`: "no new RLS policy is
  required") — correct today, but it's a pattern that must be followed
  correctly by hand for every future portal action, with no DB-level backstop.
- **`docs/brainstorm/database.md` is stale relative to the migrations.** It
  documents only the 13 tables from `init_schema.sql` + `org_settings`; it
  predates (and doesn't mention) `audit_log`, `saved_views`, `reminders`,
  `outbound_events`, `ai_outputs`, `accounting_connections`,
  `accounting_sync_map`, `quotes`/`quote_items`, `invoice_items`,
  `time_entries`, `subscriptions`, `invitations`, or the client-portal columns
  — i.e. roughly half the current schema. It also shows a hypothetical
  per-verb `invoices_select`/`invoices_delete` role split
  (lines 198-211) that was **never actually implemented** — the real
  migration uses one uniform `invoices_rw` policy. Treat that file as historical
  design intent, not current schema documentation.
- **Money invariant is enforced by convention, not a DB constraint.** Nothing
  in the schema (e.g. a `check` constraint or trigger) prevents a float/decimal
  column from creeping in, or an `amount_satang` insert that doesn't match its
  line items' sum; the reconciliation (`invoices.amount_satang` = Σ
  `invoice_items.amount_satang`, `quotes.total_satang` = subtotal − discount)
  is a comment-documented app responsibility
  (`20260702090000_v3_sales_docs.sql:50-51`), recomputed in the relevant server
  action, not guaranteed by Postgres.
- **`time_entries.minutes`** has a real DB-level guard (`check (minutes >= 0)`)
  — one of the only numeric `check` constraints in the schema; worth noting as
  the exception rather than the rule for data-integrity constraints here.
- **Password policy lives only in app code**, not Supabase Auth config:
  `lib/auth/password.ts` enforces length ≥ 10 + upper/lower/digit for
  non-demo signups, while `supabase/config.toml:125-128` still has
  `minimum_password_length = 6` and an empty `password_requirements`. If a
  signup path ever bypasses the app's `validatePassword()` call (e.g. a direct
  Auth API call, password reset flow), Supabase Auth itself would accept a much
  weaker password. `docs/PDPA_SECURITY_NOTES.md:38-39` already flags turning on
  email confirmation + a real Auth password policy as a pre-real-data TODO —
  still open as of this read.
- **Seed data is provably fake and cross-checked**: `@boombignose.org` /
  `example.com` emails, fictional Thai company names, placeholder phone
  numbers, no tax IDs — matches the claim in `docs/PDPA_SECURITY_NOTES.md:32-33`.
  No drift found here.
- **Service-role usage is narrowly and consistently scoped**: only in
  `supabase/seed.sql`, `lib/supabase/admin.ts` (guarded by `import "server-only"`
  so it throws if pulled into a Client Component bundle), invitation acceptance,
  and the client-portal actions. No other call site in the areas read uses it.

## See also

- `00-architecture.md`
- `02-crm-sales-quotes.md`
- `03-finance-accounting.md`
- `04-projects-timesheets-calendar-reports.md`
- `05-automation-integrations.md`
- `06-testing-and-tooling.md`
