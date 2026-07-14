# CRM & Sales: Clients, Deals, Quotes, Templates, Portal, Intake

This page covers the sales-facing modules: everything from "who is this
client" through "send them a quote" to "let them self-serve on a portal
link." All six modules follow the shared `MODULE_CONTRACT.md` — org-scoped
reads via `requireOrgContext()`, mutations in `"use server"` action files,
money as integer satang via `lib/money.ts`, Zod-validated forms with
`react-hook-form`. Deviations from the contract are called out explicitly
per module.

## Module map

| Module | Route group | Purpose |
|---|---|---|
| Clients | `app/(app)/clients/` | Client + contact directory, portal enablement |
| Deals | `app/(app)/deals/` | Sales pipeline (kanban board), activities, AI assist |
| Quotes | `app/(app)/quotes/` | Draft proposals → send → accept → convert to invoice |
| Templates | `app/(app)/templates/` | Reusable automation "playbook" library with pricing |
| Portal | `app/portal/[token]/` | Public, tokenized read-mostly client view (outside the auth group) |
| Intake | `app/(app)/intake/` | Ad-hoc AI meeting-notes → summary + action items |

---

## 1. Clients (`app/(app)/clients/`)

**Purpose**: the directory of who ABA Energy works with — company record,
contacts at that company, and (for owners/admins) a shareable client-portal
link.

**Key files**
- List: `app/(app)/clients/page.tsx` — server component, `ilike` name search via `?q=`, empty states for "no clients" vs "no matches."
- Detail: `app/(app)/clients/[id]/page.tsx` — overview card, portal-share card (gated), contacts list, **read-only** deals list, **read-only** recent activity (last 8).
- Edit: `app/(app)/clients/[id]/edit/page.tsx`; New: `app/(app)/clients/new/page.tsx`.
- Mutations: `app/(app)/clients/actions.ts` — `createClient`, `updateClient`, `deleteClient`, `addContact`, `deleteContact`.
- Portal management (authenticated side): `app/(app)/clients/portal-actions.ts` — `enableClientPortal`, `disableClientPortal`, `regeneratePortalToken`.
- Components: `_components/client-form.tsx`, `_components/add-contact-dialog.tsx`, `_components/clients-toolbar.tsx` (URL-driven search), `_components/delete-client-button.tsx`, `_components/delete-contact-button.tsx`, `_components/portal-share-card.tsx`.
- `_lib/format.ts` — local `formatDate()` (Thailand-timezone date formatting via `date-fns-tz` + `lib/dates.ts#APP_TZ`); scoped to this module rather than shared.

**Data flow**
- Reads/writes `clients` (`clients/page.tsx:30`, `actions.ts:39`) and `contacts` (`actions.ts:114`).
- Client detail also reads `deals` (`[id]/page.tsx:60`) and `activities` (`:66`) filtered by `client_id`, but only to *display* — no mutation path from this module.
- `clients.portal_enabled` / `clients.portal_token` are the columns the public portal checks (see §5). Token is a 64-hex-char opaque secret: two `crypto.randomUUID()`s concatenated with hyphens stripped (`portal-actions.ts:19-23`). Re-enabling reuses the existing token so previously shared links keep working (`portal-actions.ts:41-52`); regenerating mints a fresh one, effectively revoking the old link.
- Portal actions are gated to `settings:manage` capability (owner/admin) via `requireCapability` (`portal-actions.ts:32`), and every mutation writes an audit row (`lib/audit.ts` → `writeAudit`), e.g. `"portal_enabled"`, `"portal_token_regenerated"`.
- `deleteClient` requires `client:delete` capability; deleting a client removes its contacts but explicitly leaves deals/activities intact (comment in the confirm dialog, `_components/delete-client-button.tsx:40-41`) — no FK cascade concern since neither table hard-links back in a way that blocks deletion in this codebase's schema.

**Notable UX**
- `ClientsToolbar` mirrors the `?q=` URL-param search pattern used across the app (`view-config.ts`'s `configToHref`), making search state shareable/bookmarkable.
- The client detail page nudges users toward `/deals/{id}` and treats deals/activities as read-only surfaces owned by the Deals module — a clean example of one module linking into another without duplicating its mutation logic.
- Contract deviation: none notable — this module hews closely to the contract (own `_lib/format.ts` helper is a reasonable, scoped addition).

---

## 2. Deals (`app/(app)/deals/`)

**Purpose**: the sales pipeline — a Trello-style kanban board by stage, deal
detail with activity log, and an AI assist panel for summarizing a deal or
drafting a follow-up.

**Key files**
- Board: `app/(app)/deals/page.tsx` — server component; renders one column per `deal_stage` enum value (`lead, contacted, discovery, proposal, negotiation, won, lost`, `page.tsx:29-37`), each a `DealCard` linking to detail. Two headline `StatCard`s: **Open pipeline** and **Weighted pipeline** (`lib/metrics/pipeline.ts`).
- Detail: `app/(app)/deals/[id]/page.tsx` — deal fields, `ChangeStageSelect`, `ActivitiesSection`, `AiPanel`. Shows a **"Create project"** CTA when `stage === "won"` linking to `/projects/new?dealId=…&clientId=…` (`[id]/page.tsx:65-76`) — this is the deal→project handoff into the Projects module.
- New/Edit: `new/page.tsx`, `[id]/edit/page.tsx`.
- Mutations: `actions.ts` — `createDeal`, `updateDeal`, `updateDealStage`, `deleteDeal`, `addActivity`, `toggleActivityDone`.
- AI: `ai-actions.ts` — `summarizeDeal`, `draftFollowup` (both call `lib/ai/client.ts#generateText` with prompts from `lib/ai/prompts.ts`, gracefully no-op when `ANTHROPIC_API_KEY` unset via `isAIConfigured()`/`AINotConfiguredError`). Results are cached to the shared `ai_outputs` table best-effort (`ai-actions.ts:70-95`).
- Export: `export/route.ts` — `GET /deals/export[?stage=&q=]`, streams a CSV mirroring the board's active filters (values converted `satang → baht` for the export, never the reverse).
- Components: `_components/deal-form.tsx`, `_components/change-stage-select.tsx`, `_components/activities-section.tsx`, `_components/ai-panel.tsx`, `_components/deals-toolbar.tsx`, `_components/delete-deal-button.tsx`.

**Data flow**
- Core table: `deals` (`value_satang`, `stage` enum, `next_follow_up_date`, `expected_close_date`, `source`, `notes`). Reads join in `clients` (id→name map, `page.tsx:72,83`) and `activities` (`deal_id` FK).
- `activities` rows created via the deal detail's inline form also carry the deal's `client_id` (`actions.ts:209-223`), so the same activity later surfaces on the client detail page's read-only feed (§1) — this is the cross-module link between Deals and Clients.
- Stage changes (`updateDealStage`) and creates/deletes write an `audit` row (`lib/audit.ts`) recording the from→to transition (`actions.ts:138-146`).
- `deleteDeal` first detaches activities (`deal_id → null`, `actions.ts:171-175`) rather than cascading a delete, so activity history for the client survives even if the deal record is removed.
- Pipeline math is centralized in `lib/metrics/pipeline.ts`: `pipelineValue()` sums only "open" stages (`lead…negotiation`, excludes `won`/`lost`), `weightedPipelineValue()` applies a fixed `STAGE_PROBABILITY` map (10%→70%) per stage — worth knowing since it's a hardcoded heuristic, not configurable per-org.

**Notable UX / patterns**
- The board is a server component with in-memory filtering (`page.tsx:92-97`) rather than a client-side kanban library — simpler, no drag-and-drop; stage change happens via the `ChangeStageSelect` dropdown on the detail page only, not by dragging cards on the board.
- `DealsToolbar` bundles filter (`stage`, `q`), **saved views** (`app/(app)/views/saved-views-menu.tsx`, `save-view-button.tsx` — a small shared feature letting a user persist a `(stage, q)` filter combo per module in a `saved_views` table), and **CSV export** with matching filters — a nice "what you see is what you export" guarantee.
- `AiPanel` is a good template for optional-AI features elsewhere: discriminated-union result type (`{notConfigured}` / `{content}` / `{error}`), friendly inline notice instead of a broken button when no API key is configured.
- Overdue/due-today follow-ups get inline red/amber styling both on the board card and the detail page (`cn(...)` conditionals) — a lightweight substitute for a dedicated "follow-ups" view.

---

## 3. Quotes (`app/(app)/quotes/`)

**Purpose**: draft a proposal for a client, add priced line items, send it,
track acceptance, and convert an accepted quote into an invoice (handoff
into Finance).

**Key files**
- List: `app/(app)/quotes/page.tsx` — table of all quotes with `QuoteStatusBadge`.
- Detail: `app/(app)/quotes/[id]/page.tsx` — overview (subtotal/discount/total, dates, client/project), line items table, inline `QuoteItemForm`, `QuoteStatusControls`, and (while `draft`/`sent`) an editable `QuoteForm`. Locked (read-only items) once `status === "converted"`.
- New: `new/page.tsx`.
- PDF: `[id]/pdf/route.ts` — `GET /quotes/{id}/pdf`, org-scoped, builds a `PrintableDocument` and renders it via the shared `lib/documents/printable.ts#renderDocumentHtml` (see §7).
- Mutations: `actions.ts` — `createQuote`, `updateQuote`, `deleteQuote`, `addQuoteItem`, `deleteQuoteItem`, `setQuoteStatus`, **`convertQuoteToInvoice`**.
- Email: `email-actions.ts` — `sendQuoteEmail` (via `lib/email.ts`, degrades gracefully if `RESEND_API_KEY` unset).
- Components: `_components/quote-form.tsx`, `_components/quote-item-form.tsx`, `_components/quote-status-badge.tsx`, `_components/quote-status-controls.tsx`, `_components/email-quote-button.tsx`, `_components/delete-quote-item-button.tsx`, `_components/form-fields.tsx` (a shared `SelectField` wrapper for RHF + Base UI `Select`, explicitly documented as mirroring the finance module's own copy rather than a shared import, `form-fields.tsx:24-30`).

**Data flow**
- Tables: `quotes` (`number`, `status` enum `draft|sent|accepted|declined|expired|converted`, `subtotal_satang`, `discount_satang`, `total_satang`, `client_id`, `project_id`, `converted_invoice_id`) and `quote_items` (`description`, `quantity`, `unit_price_satang`, `amount_satang`, `position`).
- **Numbering**: on create, if no `number` supplied, `nextDocumentNumber("QUO", existingNumbers, year)` from `lib/documents/numbering.ts` scans the org's existing quote numbers for the current year and continues the counter (`actions.ts:114-126`) — see §7.
- **Totals recompute**: every item insert/delete calls `recomputeQuoteTotals()` (`actions.ts:52-84`), which re-sums `quote_items.amount_satang` via `lib/metrics/line-items.ts#subtotalSatang` and applies the quote's `discount_satang` via `documentTotalSatang()` (subtotal − discount, floored at 0). Editing the quote header (discount) also triggers a recompute (`actions.ts:198`).
- **Lock semantics**: a `status === "converted"` quote rejects `addQuoteItem`/`deleteQuoteItem` (`actions.ts:271-273`, `:332-333`) — the UI mirrors this with `locked` in `[id]/page.tsx:79`.
- **Convert to invoice** (`convertQuoteToInvoice`, `actions.ts:402-496`, gated to `quote:convert` capability i.e. owner/admin): creates a new `invoices` row (`number = "INV-" + quote.number`, `status: "draft"`, `amount_satang = quote.total_satang`), **copies** every `quote_items` row into `invoice_items` (line items are duplicated, not shared/referenced), stamps `quotes.converted_invoice_id`, writes an audit entry, and redirects to `/finance/invoices/{id}` — this is the Quotes→Finance handoff. A quote can only be converted once (`converted_invoice_id` guard, `actions.ts:426-428`).
- **Email**: `sendQuoteEmail` looks up the client's first contact with a non-null email (`email-actions.ts:39-47`), sends via `lib/email.ts`, then both writes an audit row and inserts an `activities` row of type `"email"` on the client (`email-actions.ts:85-91`) — so a sent quote also shows up in the client's activity feed (§1) and would be visible if a deal→activity link existed, though this insert does not set `deal_id`.
- **PDF route** re-derives everything from the DB (not from cached HTML) and is org-scoped with `.eq("org_id", ctx.orgId)` on both queries (`pdf/route.ts:27,33`) — defense in depth beyond RLS.

**Notable UX**
- `QuoteStatusControls` renders different action buttons purely from current `status` (draft→"Mark sent", sent→"Accept"/"Decline", accepted+canConvert→"Convert to invoice") — a simple state-machine-as-UI pattern reused conceptually in the Portal (§5) for the client-facing Accept button.
- The quote-detail page's `Download PDF` button opens `/quotes/{id}/pdf` in a new tab; there is no binary PDF generation — the browser's own print-to-PDF is the intended flow (see §7).
- Contract deviation: `quote-status-badge.tsx` explicitly does **not** use the shared `components/status-badge.tsx` because that file (owned by the coordinator/foundation lane) has no `quote_status` variant yet, so this module hand-rolls its own tone system locally (`quote-status-badge.tsx:5-6`) — worth flagging as a spot where the shared badge component could be extended later to remove duplication (the Portal page reuses *this* local badge via a cross-module import, `app/portal/[token]/page.tsx:11`, which is itself a minor lane-boundary bend since Portal is technically outside `app/(app)/quotes/`).

---

## 4. Templates (`app/(app)/templates/`)

**Purpose**: a library of reusable "automation playbooks" — what ABA Energy
can sell (e.g. an automation you'd quote a client for), each with internal
cost vs. client price, a step-by-step implementation checklist, and tags.

**Key files**
- List: `app/(app)/templates/page.tsx` — fetches `template_categories` and `automation_templates`, renders via `_components/templates-library.tsx`.
- Detail: `[id]/page.tsx` — overview, tags, implementation checklist (rendered as a checked list), pricing card (client price vs. internal value).
- New/Edit: `new/page.tsx`, `[id]/edit/page.tsx`.
- Mutations: `actions.ts` — `createTemplate`, `updateTemplate`, `deleteTemplate` (gated to `template:manage`), `createCategory`.
- Components: `_components/template-form.tsx` (uses `useFieldArray` for a dynamic checklist-steps list), `_components/templates-library.tsx` (category tabs + card grid), `_components/new-category-dialog.tsx`, `_components/delete-template-button.tsx`.

**Data flow**
- Tables: `automation_templates` (`name`, `description`, `internal_value_satang`, `price_satang`, `reusable_notes`, `implementation_checklist` jsonb array of strings, `tags` text[], `category_id`) and `template_categories` (`name`, `slug`).
- Category creation slugifies the name client-adjacent (preview in the dialog, `new-category-dialog.tsx:23-29`) and again server-side in `actions.ts:12-18` (the two must stay in sync manually — same slugify logic duplicated, not imported from one place).
- **No inbound reference from Quotes/Deals** in this codebase yet — templates are a standalone catalog. There's no "add this template as a quote line item" wiring; a founder would eyeball the template's price and hand-type a `QuoteItemForm` row. This is a plausible half-finished/aspirational integration point worth flagging.

**Notable UX**
- `TemplatesLibrary` groups templates by category as expandable sections under an "All" tab, plus a per-category tab and an "Uncategorized" tab if any templates lack a category (`templates-library.tsx:88-148`) — a clean way to browse a growing catalog without pagination.
- Pricing card explicitly separates "client price" (what you charge) from "internal value" (what it's worth/saves internally) — a founder-useful margin-visibility pattern not seen elsewhere in the app.

---

## 5. Client Portal (`app/portal/[token]/`)

**Purpose**: a public, unauthenticated, read-mostly view a client can be
sent so they can see their own quotes/invoices/projects and take two
specific actions (accept a quote, mark an invoice paid) without a login.

**This module deliberately breaks several contract rules, on purpose:**
- Lives at `app/portal/[token]/`, **outside** the `app/(app)/` auth route group — there is no session, so `requireOrgContext()` cannot run here.
- Uses `createAdminClient()` from `lib/supabase/admin.ts` (service-role, **RLS bypassed**) instead of the session-scoped `createClient()`. Every query manually re-applies `.eq("org_id", …)`/`.eq("client_id", …)` scoping by hand since RLS isn't doing it — see the trust-boundary comment at `portal-actions.ts:9-17`.
- The **only** thing trusted from the caller is the opaque `token` (and a row id to act on); token→client resolution happens server-side (`resolveClient()`, `portal-actions.ts:27-40`) and any client/org id the caller might supply is never used directly.
- A missing or disabled token renders the exact same generic `Unavailable` page as a nonexistent one (`page.tsx:61-69`) — no existence-leak side channel.

**Key files**
- `page.tsx` — resolves `token → clients` row (`portal_token` + `portal_enabled = true`), then loads `organizations.name`, `quotes`, `invoices` (+ `payments` summed per invoice + `invoice_items` for an inline breakdown), and `projects`, all scoped to that one `client_id`/`org_id`.
- `portal-actions.ts` — `portalAcceptQuote` (flips a `sent` quote to `accepted`, but only if it belongs to the resolved client — `.eq("client_id", client.id).eq("status", "sent")` makes the update a no-op otherwise, `portal-actions.ts:60-66`) and `portalMarkInvoicePaid` (sums existing `payments`, inserts one more `payments` row for the outstanding balance with `method: "transfer"` and a note `"Marked paid via client portal"`, then flips `invoices.status` to `"paid"`, `portal-actions.ts:108-138`).
- `_components/accept-quote-button.tsx`, `_components/mark-invoice-paid-button.tsx` — thin client components calling the above actions and `router.refresh()`.

**Data flow / connections**
- Reuses **shared** badge components (`InvoiceStatusBadge`, `ProjectStatusBadge` from `components/status-badge.tsx`) and invoice math (`deriveInvoiceStatus`, `outstandingSatang` from `lib/metrics/invoice-status.ts`) — the same effective-status logic the Finance module presumably uses internally, so the portal's status always matches what staff see.
- Imports `QuoteStatusBadge` from the Quotes module directly (`app/(app)/quotes/_components/quote-status-badge.tsx`) rather than a shared component — see the Templates/Quotes note above about that badge not living in `components/status-badge.tsx` yet.
- Note in the code: "the PDF routes require a session, so they are intentionally not linked here" (`page.tsx:104-105`) — the portal shows an inline item breakdown instead of linking to `/quotes/{id}/pdf`, since that route requires an authenticated org session and would 404/redirect for a public visitor.
- The enable/disable/regenerate control surface for this module lives in the **Clients** module (`clients/portal-actions.ts`, §1) — Portal itself has no settings UI, only the public-facing read/act surface.

**Notable UX / security note worth flagging**
- `portalMarkInvoicePaid` lets a client self-report their invoice as paid with **no verification** (no payment gateway, no proof-of-payment upload) — it's an honor-system "mark paid" button that directly writes a `payments` row and flips invoice status. Fine for a trust-based small-business workflow, but worth flagging explicitly to the user as a business-process gap if payments ever need reconciliation against actual bank transfers.

---

## 6. Intake (`app/(app)/intake/`)

**Purpose**: a single-page AI utility — paste raw meeting notes, get back a
clean summary plus parsed action items. Not persisted to any CRM entity by
default (no deal/client picker), so it's closer to a scratch tool than a
system-of-record feature.

**Key files**
- `page.tsx` — client component (`"use client"` at top level, unusual for this codebase's page-level convention where most `page.tsx` are server components) with local `notes` textarea state and a `State` union (`idle | notConfigured | done`).
- `actions.ts` — `intakeMeeting(notes)`: guards on `isAIConfigured()`, validates non-empty notes via Zod, calls `lib/ai/client.ts#generateText` with `lib/ai/prompts.ts#meetingIntakePrompt`, parses action items via `lib/ai/parse.ts#parseActionItems`, and best-effort caches the raw content to `ai_outputs` (`entity: "meeting"`, `entity_id: null` — not linked to any specific record).

**Data flow**
- Writes only to the shared `ai_outputs` table (best-effort, swallowed on failure so a cache-write error never loses the generated content the user is looking at, `actions.ts:44-59`).
- **No write path back into Deals/Clients** — action items are displayed as a plain list (`item.title`, `page.tsx:149-153`) with no "convert to activity" or "create follow-up" button. This is the clearest half-finished/aspirational integration in the CRM lane: the natural next step (turn a parsed action item into a deal `activity` or a project `task`) doesn't exist yet.

**Notable UX**
- Mirrors the `AiPanel` pattern from Deals (§2) almost exactly — same `notConfigured` friendly-notice treatment, same copy-to-clipboard button — good consistency between the two AI-assist surfaces even though they're unrelated modules.

---

## 7. Shared document infrastructure: numbering + printable rendering

Both Quotes (this page) and Invoices (Finance, see `03-finance-accounting.md`)
depend on two small shared libs. They're infrastructure, not owned by any
one module, but central to the quote user journey:

### `lib/documents/numbering.ts`
- Pure function `nextDocumentNumber(prefix, existingNumbers, year)` → `"{PREFIX}-{YEAR}-{NNN}"`, e.g. `QUO-2026-001`, `INV-2026-007`.
- Scans a string array for `^{prefix}-{year}-(\d+)$`, takes the max matched counter, adds one, zero-pads to ≥3 digits (`padCounter`, `numbering.ts:11-13`). Non-matching numbers (different prefix/year, hand-typed free text) are silently ignored rather than erroring — so a manually-entered non-standard number never breaks the counter for subsequent auto-numbered quotes.
- Callers (`quotes/actions.ts:114-126`) load *all* existing numbers for the org first, filter by year client-side inside the function itself (regex includes the year) — no dedicated `year` column filter at the DB level, just a full-number scan. Fine at small scale; would want an index/narrower query if quote volume grows large.
- A manually supplied number is used verbatim (no auto-number path); a duplicate collides with the DB's `unique(org_id, number)` constraint and surfaces as a plain Postgres error string, not a friendly validation message (`actions.ts:113`, comment acknowledges this explicitly).

### `lib/documents/printable.ts`
- `renderDocumentHtml(doc: PrintableDocument)` — a **pure function** returning a self-contained HTML string (inline `<style>`, no external assets/fonts) for a quote or invoice. No PDF-binary dependency (no Puppeteer/pdfkit) — the browser's native print-to-PDF is the delivery mechanism; the route just serves HTML with `Content-Type: text/html`.
- `PrintableDocument` type is deliberately generic over both document kinds: `kind: "Invoice" | "Quotation"`, optional `dueDate` (invoices) vs. optional `validUntil` (quotes) — the Quotes PDF route sets `dueDate: undefined` and populates `validUntil` (`quotes/[id]/pdf/route.ts:47-48`); Finance's invoice PDF route presumably does the inverse.
- All interpolated text is escaped via a local `escapeHtml()` (`printable.ts:37-44`) — every dynamic string (client name, notes, line-item descriptions) goes through it before landing in the HTML string, since this is unsanitized string concatenation rather than a templating engine with auto-escaping.
- Footer includes an explicit disclaimer: *"Operational document, not a legal tax invoice."* (`printable.ts:160`) — a deliberate scope boundary: this system does not attempt to produce a Thai Revenue Department-compliant tax invoice/receipt, only an internal proposal/billing document.
- Both quote and invoice PDF routes independently query with `.eq("org_id", ctx.orgId)` even though RLS should already scope the row — same defense-in-depth pattern seen elsewhere in this codebase.

---

## Cross-module journey summary

```
Client (clients/)
  └─ Deal (deals/) ── activities logged, AI summary/follow-up
        └─ stage → "won" ──▶ "Create project" CTA → Projects module
  └─ Quote (quotes/) ── line items, auto-numbered (QUO-YYYY-NNN)
        ├─ PDF via lib/documents/printable.ts (browser print-to-PDF)
        ├─ Email via lib/email.ts → also logs a client `activities` row
        ├─ status: draft → sent → accepted/declined/expired
        └─ accepted → convertQuoteToInvoice() → Invoice (Finance module)
  └─ Portal link (portal-actions.ts, enable/regenerate)
        └─ app/portal/[token]/ (public) shows THIS client's quotes/
           invoices/projects; client can Accept a sent quote or
           Mark an invoice paid (honor-system, no payment gateway)
Templates (templates/) — standalone catalog, not yet wired into
  Quote line-item creation (no "insert from template" action)
Intake (intake/) — standalone AI scratch tool, not yet wired into
  Deals/Clients (no "save as activity" action on parsed items)
```

## See also

- `00-architecture.md` — overall app shell, route groups, layout conventions.
- `01-data-model-and-auth.md` — full schema, RLS policies, `requireOrgContext`/`requireCapability`, org/role model.
- `03-finance-accounting.md` — invoices, payments, the other end of `convertQuoteToInvoice()`.
- `04-projects-timesheets-calendar-reports.md` — where a won deal's "Create project" CTA lands.
- `05-automation-integrations.md` — `lib/ai/*`, `lib/email.ts`, n8n/webhook integration used by the AI panels and quote emailing here.
- `06-testing-and-tooling.md` — test coverage for `lib/documents/numbering.ts`, `lib/metrics/*`, and this area generally.
