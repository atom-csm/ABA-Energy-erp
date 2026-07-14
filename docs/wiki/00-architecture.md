# 00 — Core Architecture & Foundation Layer

This page covers the shared skeleton every module builds on: tech stack, folder
conventions, the app shell, the org/auth context pattern, the money convention,
shared utils, and Supabase client setup. Individual business modules (CRM,
finance, projects, etc.) are documented in the module-specific pages linked
under **See also** at the bottom.

## 1. Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | Next.js `16.2.9`, App Router | Uses the new **`proxy.ts`** middleware convention (Next 16 renamed `middleware.ts` → `proxy.ts`), see §5. |
| Language | TypeScript `^5`, `strict: true` | `tsconfig.json:7` |
| UI runtime | React `19.2.4` / React DOM `19.2.4` | |
| Styling | Tailwind CSS `^4` (`@tailwindcss/postcss`) | config lives in `app/globals.css`, no `tailwind.config.*` file (Tailwind v4 CSS-first config) |
| Component kit | shadcn/ui, style `base-nova`, **Base UI** primitives (`@base-ui/react`), not Radix | `components.json:3,13` — icon lib is `lucide-react` |
| Backend | Supabase (Postgres + Auth), accessed via `@supabase/ssr` `^0.12.0` and `@supabase/supabase-js` `^2.110.0` | |
| Forms | `react-hook-form ^7.80` + `@hookform/resolvers` + `zod ^4.4.3` | Zod v4 API: `z.email()`, `z.coerce.number()`, etc. |
| Tables | `@tanstack/react-table ^8.21` | used by module list views (not part of foundation layer) |
| Dates | `date-fns ^4.4` + `date-fns-tz ^3.2` | app operates in a single fixed timezone, see `lib/dates.ts` |
| Notifications | `sonner ^2.0.7` (`<Toaster>` mounted once in `app/layout.tsx:34-35`) | |
| AI | `@anthropic-ai/sdk ^0.109.0` | used by `lib/ai/*` (intake parsing), not foundation |
| Unit tests | Vitest `^4.1.9`, Node environment, only `lib/**/*.test.ts` | `vitest.config.ts` |
| E2E tests | Playwright `^1.61.1` | `playwright.config.ts`, boots `pnpm dev` against `localhost:3000` |
| Lint | ESLint `^9` flat config, `eslint-config-next` | `eslint.config.mjs` |

Full dependency list: `package.json`.

## 2. Folder-layout convention (the "module contract")

The authoritative source is `docs/MODULE_CONTRACT.md` — read it in full before
touching any module. Summary:

- Each module owns exactly one route-group folder under `app/(app)/<module>/`
  plus one `actions.ts` ("use server" mutations). Module-only client components
  go in a local `_components/` folder.

  ```
  app/(app)/clients/
    page.tsx          # list (server component, reads)
    new/page.tsx       # create form route
    [id]/page.tsx       # detail (server component)
    actions.ts          # "use server" mutations
    _components/
      client-form.tsx
      clients-table.tsx
  ```

- **Foundation-owned, not to be touched by module work**: `package.json`,
  `pnpm-lock.yaml`, `lib/**`, `components/ui/**`, `components/nav.ts`,
  `components/app-sidebar.tsx`, `app/layout.tsx`, `app/(app)/layout.tsx`,
  `proxy.ts` (middleware), `supabase/**`.
- Reads happen in **server components**; mutations happen in **server actions**.
  There is no client-side data-fetching layer (no SWR/React Query) — this keeps
  the data-access story to exactly one pattern.

## 3. App shell / navigation / layout structure

```
app/layout.tsx            (root)  — fonts, <TooltipProvider>, <Toaster>, no auth
app/page.tsx                       — "/" always redirects to /dashboard
app/(app)/layout.tsx        (shell) — requireOrgContext() + getUserOrgs(), renders
                                      <AppSidebar> + <SidebarInset> header + children
app/(app)/<module>/...             — one folder per module (see §2)

app/login/page.tsx                  — public, client-side Supabase auth
app/signup/page.tsx + actions.ts    — public signup (server action + Zod)
app/auth/confirm/route.ts           — email-confirmation / OTP / PKCE callback
app/auth/signout/route.ts           — POST → supabase.auth.signOut() → /login
app/invite/[token]/page.tsx         — accept-org-invitation flow (service-role lookup)
app/portal/[token]/page.tsx         — tokenized read-only client portal (no auth)
```

Key points:

- `app/layout.tsx:24-39` is intentionally thin: fonts, `TooltipProvider`, global
  `Toaster`. No auth logic lives here — that's the whole point of splitting out
  the `(app)` route group.
- `app/(app)/layout.tsx:10-36` is the actual app shell. It calls
  `requireOrgContext()` (redirects to `/login` if not signed in / no org
  membership) and `getUserOrgs()` (for the org switcher), then renders
  `<AppSidebar>` inside `<SidebarProvider>`/`<SidebarInset>`. The header bar
  shows `ctx.orgName` and a `<SidebarTrigger>`.
- `components/nav.ts:31-46` — `NAV_ITEMS` is the **single source of truth** for
  sidebar links; every module registers itself here. Items can be flagged
  `ownerAdminOnly` (currently only "Activity" i.e. the audit log,
  `components/nav.ts:44`) — the sidebar filters these client-side
  (`components/app-sidebar.tsx:47-50`) but the underlying page must still gate
  server-side (nav hiding is UX only, not enforcement).
- `components/app-sidebar.tsx` renders `<OrgSwitcher>`, the nav list, and a
  footer with avatar/email/role + a sign-out `<form action="/auth/signout"
  method="post">` (plain HTML form POST, no JS needed to sign out).
- `components/org-switcher.tsx` — dropdown to switch active org; collapses to a
  plain label when the user belongs to only one org (`orgs.length <= 1`, line
  55). Calls the `setActiveOrg` server action in
  `app/(app)/settings/org-actions.ts`, which validates membership before
  writing the `active_org` cookie.
- Auth routes that use the **browser** Supabase client directly (not a server
  action): `app/login/page.tsx:32-33` calls
  `supabase.auth.signInWithPassword()` client-side. This is the one deliberate
  exception to "mutations go through server actions" — Supabase's client SDK
  needs to run in the browser to set the session cookie via `@supabase/ssr`'s
  browser client. Signup, by contrast, is a real server action
  (`app/signup/actions.ts`) since it only need to call `auth.signUp()`, whose
  cookie-setting is handled by the server client there.

## 4. Org + auth context pattern

Central module: `lib/auth.ts`. Every server component/action that touches org
data starts with:

```ts
import { requireOrgContext } from "@/lib/auth"
const ctx = await requireOrgContext()   // { userId, email, orgId, orgName, role }
```

- `getOrgContext()` (`lib/auth.ts:29-64`) — wrapped in React's `cache()` so it's
  deduped per request. Resolves the user's **active org**: reads the
  `active_org` cookie (`ACTIVE_ORG_COOKIE`, line 12), falls back to the user's
  first membership (`memberships` ordered by `created_at`) for a stable
  single-org default. Returns `null` if not signed in or not a member of any org.
- `requireOrgContext()` (line 104-108) — same, but `redirect("/login")` if null.
  This is what pages/actions call; it never returns a nullable context.
- `getUserOrgs()` (line 72-101) — all orgs the user belongs to, for the org
  switcher.
- `Role = Enums<"role_enum">` → `"owner" | "admin" | "member"`.
- Two enforcement helpers, both **defense-in-depth on top of RLS** (RLS is the
  real enforcement boundary; documented in `01-data-model-and-auth.md`):
  - `requireRole(ctx, allowed: Role[])` (line 111-115) — throws if role not in list.
  - `requireCapability(ctx, capability)` (line 122-126) — preferred over
    `requireRole`; delegates to `lib/permissions.ts`.

### Capability matrix (`lib/permissions.ts`)

Instead of scattering `["owner","admin"]` checks across every action, sensitive
operations map to a named `Capability` string (e.g. `"quote:convert"`,
`"invoice:delete"`, `"team:manage"`), and a single matrix
(`CAPABILITY_ROLES: Record<Capability, Role[]>`, `lib/permissions.ts:33-46`)
says which roles hold it. Today every capability maps to `ALL_STAFF = ["owner",
"admin"]` — plain members hold none of them (tune by editing this file, not
call sites). Helpers: `can(role, capability)` and `capabilitiesFor(role)`.
Tested in `lib/permissions.test.ts`.

### Call-site pattern (server action)

```ts
"use server"
const ctx = await requireOrgContext()
requireCapability(ctx, "quote:convert")   // throws if not allowed
const supabase = await createClient()
await supabase.from("...").insert({ ...data, org_id: ctx.orgId })  // always set org_id explicitly
```

`org_id: ctx.orgId` must be set on every insert even though RLS also scopes
reads/writes — never trust a client-supplied org id (`docs/MODULE_CONTRACT.md:38-41`).

## 5. Supabase client setup — which client where

Four distinct client constructors, each for a specific execution context. Never
mix them up.

| File | Function | Use in | Auth | Notes |
|---|---|---|---|---|
| `lib/supabase/server.ts` | `createClient()` (async) | Server Components, Server Actions, Route Handlers | User session via cookies | Subject to RLS. **Create a new one per request** (`lib/supabase/server.ts:9`) — never share across requests. Swallows cookie-set errors from Server Components (line 27-30, comment explains why: middleware refreshes the session instead). |
| `lib/supabase/client.ts` | `createClient()` | Client Components (`"use client"`) | Anon key, browser session | Subject to RLS. Used e.g. by `app/login/page.tsx` for `signInWithPassword`. |
| `lib/supabase/middleware.ts` | `updateSession(request)` | `proxy.ts` only | Refreshes the session cookie on every request | **Do not run any logic between `createServerClient` and `auth.getUser()`** (explicit comment, line 17-19) — this is a documented Supabase footgun. Also does the auth-gate redirect (see below). |
| `lib/supabase/admin.ts` | `createAdminClient()` | Trusted server-only contexts with no user session (seeding, cron, invite-lookup) | **Service role — bypasses RLS** | Guarded by `import "server-only"` (line 3) so it throws at build time if ever imported into client code. Every query through this client must manually scope `org_id` — RLS does not do it. Used in `app/invite/[token]/page.tsx:37` to read an invitation row the invitee (not yet a member) couldn't see under RLS. |

### Middleware / `proxy.ts`

Next.js 16 renamed the `middleware.ts` file convention to `proxy.ts` (exported
function must be named `proxy`) — `proxy.ts:1-11` has a comment explaining
this so it isn't mistaken for a mistake. It delegates entirely to
`lib/supabase/middleware.ts:updateSession`, which:

- Refreshes the Supabase auth cookie on every matched request (matcher
  excludes `_next/static`, `_next/image`, and static image extensions —
  `proxy.ts:14-21`).
- Treats `/login`, `/signup`, `/auth`, `/api/webhooks`, `/api/cron`, `/portal`,
  and `/` as public (`lib/supabase/middleware.ts:7-14`) — session cookie still
  refreshes on these, but no redirect is forced.
- Redirects unauthenticated users hitting a non-public path to
  `/login?redirect=<original path>` (line 52-57).
- Redirects already-authenticated users away from `/login` to `/dashboard`
  (line 60-65).

## 6. Money convention — integer satang, never floats

`lib/money.ts` is the single source of truth; every module imports it rather
than hand-rolling `× 100`.

- Storage: `bigint` satang columns everywhere (`*_satang`). 100 satang = ฿1.
- `bahtToSatang(baht)` / `satangToBaht(satang)` — conversion happens **only at
  the edges** (form input, display).
- `sumSatang(amounts: Satang[])` — safe integer summation (avoids the classic
  `0.1 + 0.2` float-drift problem entirely by never entering float space for
  money math).
- Display formatters (Thai locale, `Intl.NumberFormat("th-TH", {currency:
  "THB"})`): `formatTHB` (2 decimals), `formatTHBWhole` (0 decimals),
  `formatTHBCompact` (e.g. "฿12.3M", for dashboard cards).
- Form convention: forms collect **baht** from the user (`z.coerce.number()`
  on the baht field), convert to satang inside the server action right before
  insert (`docs/MODULE_CONTRACT.md:58-60`).
- Tested in `lib/money.test.ts` (rounding behavior, exact integer sums).

## 7. Shared utils reference

| File | Purpose |
|---|---|
| `lib/utils.ts` | `cn(...)` — `clsx` + `tailwind-merge`. The only export; used everywhere for conditional className composition. |
| `lib/money.ts` | Satang ⇄ baht conversion + THB formatting. See §6. |
| `lib/dates.ts` | App-timezone (`Asia/Bangkok`, `APP_TZ`) date helpers: `todayISO`, `monthKey`, `currentMonthKey`, `isPastDue`, `daysUntil`. All "today"/"this month" business logic must go through these rather than raw `Date` math, since the studio operates in a single fixed timezone and naive UTC comparisons would roll over at the wrong hour. |
| `lib/permissions.ts` | Capability-based RBAC matrix. See §4. |
| `lib/auth.ts` | Org context resolution (`getOrgContext`, `requireOrgContext`, `getUserOrgs`) + role/capability gates. See §4. |
| `lib/auth/password.ts` | `validatePassword()` — shared password policy (≥10 chars, upper/lower/number), used by both the signup form (live validation) and `signup/actions.ts` (server-side re-check). |
| `lib/audit.ts` | `writeAudit(ctx, entry)` — best-effort, non-throwing append to the org's `audit_log`. Call **after** a mutation succeeds and, in actions that redirect, **before** `redirect()` (it doesn't redirect itself, so no `NEXT_REDIRECT` swallowing risk). Failures are logged, never propagated — auditing must never break the real mutation. |
| `lib/types/database.ts` | Generated Supabase types (1784 lines). Exports `Database`, `Json`, and the generic helpers `Tables<"table">`, `TablesInsert<"table">`, `TablesUpdate<"table">`, `Enums<"enum">` (lines 1609-1704ish). Regenerated from the DB schema — treat as generated code, don't hand-edit. |
| `lib/supabase/{server,client,middleware,admin}.ts` | Supabase client constructors. See §5. |
| `hooks/use-mobile.ts` | `useIsMobile()` — SSR-safe mobile breakpoint (768px) via `useSyncExternalStore`, no `setState`-in-effect. |

### Shared UI building blocks (`components/*.tsx`, not `components/ui/*`)

| Component | Purpose |
|---|---|
| `components/page-header.tsx` | `<PageHeader title description>` — every module page starts with one; `children` render as right-aligned actions. |
| `components/stat-card.tsx` | `<StatCard label value hint icon tone>` — dashboard/report metric tiles; `tone` drives color (`default/positive/negative/warning`). |
| `components/status-badge.tsx` | `DealStageBadge`, `ProjectStatusBadge`, `InvoiceStatusBadge`, `TaskStatusBadge` — colored pills keyed off DB enums (`Enums<"deal_stage">` etc.), tone-mapped in fixed lookup tables. Add a new enum value here whenever the DB enum changes, or the badge throws on an unmapped key. |
| `components/empty-state.tsx` | `<EmptyState icon title description action>` — standard "no rows yet" placeholder for list views. |
| `components/app-sidebar.tsx`, `components/nav.ts`, `components/org-switcher.tsx` | App shell, see §3. |

### `components/ui/*` — shadcn/ui primitives

Standard shadcn generated components (button, card, input, label, textarea,
select, checkbox, switch, radio-group, badge, table, tabs, dialog,
alert-dialog, sheet, dropdown-menu, form, sonner, separator, avatar, skeleton,
popover, calendar, command, alert, tooltip, scroll-area, breadcrumb, progress,
sidebar, input-group). Nothing here is business logic — skim only if you need
to check a primitive's prop surface. One customization worth knowing:
**this is a Base UI build (`style: "base-nova"` in `components.json`), not
Radix** — polymorphic rendering uses the `render` prop, not `asChild` (see §8
gotchas).

## 8. Gotchas / conventions not to violate

1. **`render` prop, not `asChild`.** This shadcn install is Base UI, not
   Radix. `<Button render={<Link href="..." />}>` is correct;
   `<Button asChild><Link .../></Button>` does not work here
   (`docs/MODULE_CONTRACT.md:62-74`).
2. **Never hand-roll money math.** Always go through `lib/money.ts`. A stray
   `* 100` or a float column is exactly the bug class this convention exists
   to prevent.
3. **Always set `org_id` explicitly on inserts**, even though RLS scopes the
   query — defense in depth, and never take an org id from client input.
4. **`requireOrgContext()` before any org data access** in a server
   component/action. It's cheap to call repeatedly — `getOrgContext` is
   `cache()`-wrapped per request.
5. **Prefer `requireCapability` over `requireRole`** for new sensitive
   actions — one matrix in `lib/permissions.ts` beats role-list checks
   scattered across call sites.
6. **Don't touch the "Foundation-owned" files** listed in §2 from within a
   module's lane (this is a parallel-build convention from
   `docs/MODULE_CONTRACT.md`, not just a suggestion) — `lib/**`,
   `components/ui/**`, `components/nav.ts`, `components/app-sidebar.tsx`,
   `app/layout.tsx`, `app/(app)/layout.tsx`, `proxy.ts`, `supabase/**`,
   `package.json`, `pnpm-lock.yaml`.
7. **No logic between `createServerClient` and `auth.getUser()`** in
   `lib/supabase/middleware.ts` — this is a hard Supabase SSR requirement, not
   a style preference; breaking it can silently break session refresh.
8. **`createAdminClient()` (service role) is for seeding and unauthenticated
   token-lookups only** (invite page, cron routes with a shared-secret
   header). It bypasses RLS entirely; importing it into any client-reachable
   code path is a security bug, not just a style issue — it's marked
   `"server-only"` so misuse fails at build time, but don't route around that
   by re-exporting it.
9. **`ownerAdminOnly` on a `NAV_ITEMS` entry is UI-only.** Hiding a link from
   the sidebar (`components/nav.ts:44`) does not gate the page — the page
   itself must still call `requireRole`/`requireCapability`.
10. **`writeAudit` never throws and never redirects** — call it after the
    real mutation succeeds, and before any `redirect()` in the same action.
11. **Zod v4 API**, not v3 — `z.email()` not `z.string().email()`,
    `z.coerce.number()` for baht fields, per `docs/MODULE_CONTRACT.md:93-94`.
12. **Vitest only runs `lib/**/*.test.ts`** (`vitest.config.ts:8`) — the
    project's unit-test convention is to keep pure business logic
    (money/dates/permissions/metrics/etc.) in `lib/` specifically so it's
    unit-testable without a database; UI and route code is covered by
    Playwright E2E instead, not Vitest.

## See also

- `01-data-model-and-auth.md` — schema, RLS policies, memberships/org tables, invitations.
- `02-crm-sales-quotes.md` — clients, deals, quotes.
- `03-finance-accounting.md` — invoices, payments, costs, accounting integration.
- `04-projects-timesheets-calendar-reports.md` — projects, tasks, timesheets, calendar, reports.
- `05-automation-integrations.md` — n8n webhooks, automation rules, email.
- `06-testing-and-tooling.md` — Vitest/Playwright conventions, CI.
