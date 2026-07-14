# Change: Unified Project Pipeline (Deal + Project + Survey merge)

Status: **decided — implementation starting**. Production/UAT currently have
no real data, so a hard, no-compatibility-shim merge is fully in scope: we are
not preserving `deals` as a separate table or keeping a migration path for
old rows. Every module should feel like it revolves around **one thing: the
Project** — Deals and Surveys as separate top-level concepts go away
entirely, not just in the UI but in the schema.

Decisions locked in from the "Decisions needed" section below:
1. **Hard merge** — `deals` is absorbed into `projects`, then dropped.
2. **Soft gate** — advancing a stage without the listed evidence warns but
   allows an override with a reason, unchanged from the recommendation.
3. **Stage list** — proceeding with the 8 stages below as-is.

This project follows **TDD**: every subtask below is implemented test-first
(failing test → implementation → green), not tests-added-after. See the
Notion change request for the subtask breakdown and acceptance criteria this
design turns into.

## Why

Today the sales-to-delivery journey for one solar installation is split
across four separate menus that only loosely reference each other:

- **Deals** (`deals`, stage: `lead → contacted → discovery → proposal →
  negotiation → won/lost`) — a generic CRM pipeline, not ABA's actual process.
- **Surveys** (`solar_surveys`) — its own table/menu, linked to a deal and/or
  project by nullable FK.
- **Quotes** (`quotes`) — its own menu, linked to a project by nullable FK.
  Already supports **multiple quotes per project** today (`quotes.project_id`
  is just a normal FK — nothing stops several quote rows pointing at one
  project), this just isn't surfaced anywhere as "here are all the quotes for
  this project."
- **Projects** (`projects`, status: `not_started/in_progress/review/
  delivered/support/paused/cancelled`) — created manually; a won deal does
  *not* auto-create a project, a human has to click through
  (`projects/new?dealId=`).

Problems this causes, in order of how much they hurt day-to-day use:

1. **"Lead" tells you nothing about what to do next.** The stage names
   describe a generic sales funnel, not "the next physical thing our team
   needs to go do" (collect a bill, do a survey, install). You asked for
   exactly this fix.
2. **No real file upload anywhere in the app.** Every "evidence" field today
   (`project_handover_evidence.evidence_url`, `solar_surveys.photo_folder_url`)
   is a **pasted external URL** — usually a Google Drive link someone made by
   hand. There is no Supabase Storage bucket configured at all
   (`supabase/config.toml` has storage enabled but zero buckets defined) and
   no upload UI, camera capture, or gallery/lightbox anywhere in the repo.
   Since most real usage is a field tech on a phone taking photos of a roof,
   meter, or finished install, this is the single biggest usability gap —
   bigger than the stage-naming issue.
3. **Four menus for one journey.** A user has to jump between Deals, Surveys,
   Quotes, and Projects to see the full story of one customer's install, and
   nothing forces the handoff between them.

## Goal

One record — call it a **Project** — that flows through the stages that
match how ABA actually works, with document/photo upload built into every
stage, and a detail page that always answers "what stage are we at, and what
do we still need to move forward."

## Proposed stages

Replaces `deal_stage` and `project_status` with a single pipeline:

| # | Stage | What it means | Typical required evidence |
|---|-------|----------------|---------------------------|
| 1 | Electric bill collection | Waiting on the customer's electric bill so we can size the system | Photo/scan of electric bill |
| 2 | Site survey | Site visit scheduled/done — roof, meter, breaker, shading | Site photos, `solar_surveys` fields (roof type, roof area, breaker amp, shading notes) |
| 3 | Quotation and Proposal | Sizing + pricing sent to customer | ≥1 `quotes` row in `sent` status |
| 4 | Negotiation and Follow-up | Back-and-forth on price/scope | Activity log entries (already exists via `activities`) |
| 5 | Installation | Crew on site installing | Installation start/end dates (already on `projects`), progress photos |
| 6 | Payment | Invoicing / collecting payment | ≥1 `invoices` row, deposit/final payment recorded |
| 7 | After-sales | Warranty, commissioning, support | `project_handover_evidence` (already exists: handover/warranty/commissioning/after_sale kinds) |
| 8 | Archive | Done, won, or lost/dead — kept for records | — |

This list is a first draft to react to, not final — happy to rename/reorder
based on how your team actually talks about it.

## What changes under the hood (conceptual — no code yet)

- **One pipeline stage column.** Add a `project_stage` enum + column,
  replacing the split between `deal_stage` and `project_status`. The existing
  `deals` rows and `projects` rows get merged into one record per
  customer-journey (see "Decisions needed" — this is the biggest fork).
- **Real file storage.** Add a Supabase Storage bucket (e.g.
  `project-media`), with storage RLS policies scoped by org, path convention
  `org_id/project_id/stage/filename`. This is genuinely new infrastructure —
  nothing in the repo does this today.
- **A `project_documents` table**: `project_id`, `stage`, `kind`
  (photo/video/document), `storage_path`, `caption`, `uploaded_by`,
  `created_at`. This becomes the one place all stage evidence lives, instead
  of ad-hoc URL text fields.
- **Per-stage requirements as app config, not a DB table.** What's "required"
  to advance (e.g. "Site survey needs ≥1 photo") is a business rule, not a
  per-org setting yet — a small `lib/pipeline/stages.ts` config keeps this
  simple and avoids ERP-style over-configurability the roadmap explicitly
  wants to avoid.
- **Quotes, invoices, surveys, handover evidence keep their existing tables**
  — they already hang off the right entity (`project_id`). This redesign is
  about giving them one shared home page and a stage they belong to, not
  rebuilding them.

## UI/UX design

**Navigation**: collapse `Deals` and `Surveys` out of the sidebar; `Projects`
becomes the single pipeline. `Quotes` and `Finance` can stay as their own
menus for org-wide search/reporting, but the project detail page becomes the
primary place to create/view them.

**List page (`/projects`)**
- Desktop: kanban board, one column per stage (like today's Deals board, just
  with the new 8 stages and Projects' existing cards).
- Mobile: horizontal swipeable stage tabs + a vertical card list per stage —
  a real kanban with drag-and-drop is painful with a thumb, so mobile gets a
  simpler filtered list instead of a board.

**Project detail page**
- Header: name, client, current stage badge, "stage 3 of 8" progress bar.
- **"To move forward" checklist** — pulled from the stage config, shows
  what's missing (e.g. "☐ Upload a site survey photo", "☑ Quote sent"),
  computed live from `project_documents`/`quotes`/`invoices` rather than
  hand-maintained.
- **Stage timeline** — tap any past stage to see what was uploaded/logged
  during it.
- **Media section for the current stage** — big camera/upload button first
  (mobile: `<input type="file" capture="environment">` for direct camera
  access), thumbnail grid below, tap-to-open full-screen swipeable
  photo/video viewer.
- **Quotes section** — every quote tied to this project, with a "+ New
  quote" button (this is where "multiple quotes per project" becomes visible
  — the data already supports it, it just needs a home).
- **Advance-stage button** — recommend a soft gate: warns if required
  evidence is missing but allows override with a reason (matches the
  existing honor-system pattern already used for the client portal's "mark
  invoice paid" — this app trusts its users rather than hard-blocking them).

**Mobile specifics** (since you said most usage will be on mobile):
- Bottom tab bar within a project: Overview / Documents / Quotes / Activity.
- Large tap targets, sticky upload button.
- Upload queue with progress + retry — site wifi/cellular is unreliable, so
  a photo that fails to upload shouldn't just vanish.
- Video gets a thumbnail + tap-to-play, not autoplay (data usage).

## Decisions (locked in — no real data to migrate, so we go all-in)

1. **Hard merge, no back-compat.** `deals` disappears as a table. Its useful
   columns (`title`, `value_satang`, `currency`, `expected_close_date`,
   `next_follow_up_date`, `source`, `notes`, `owner`) move onto `projects`.
   Every FK that pointed at `deals` (`activities.deal_id`, `solar_surveys
   .deal_id`, `projects.deal_id` itself) gets repointed at `projects` directly
   or dropped. No compatibility view, no deprecated-but-kept columns — since
   there is no real data yet, there is nothing to preserve.
2. **Soft gate** on advancing stages — warn if required evidence is missing,
   allow override with a reason. Matches the portal's existing honor-system
   pattern.
3. **Stage list stands as proposed** (Electric bill collection → Site survey
   → Quotation and Proposal → Negotiation and Follow-up → Installation →
   Payment → After-sales → Archive).

## "Everything revolves around Project" — what that means concretely

- Nav: remove `Deals` entirely from `components/nav.ts`. **Revised during
  implementation**: `Surveys` stays as its own nav item/module, not folded
  away. `solar_surveys` holds structured site-survey data (roof type/area,
  meter phase, breaker amp, shading/structural notes) that isn't evidence
  photos — ST-3/ST-7's stage timeline covers the "photos from the survey"
  need, but doesn't replace the structured-data form. Quotes also stays
  separate for the same reason (it's a real module with its own line items
  and PDF generation, not just project evidence), though ST-7 does surface
  a project's quotes directly on its detail page.
- Dashboard's pipeline metric (`lib/metrics/pipeline.ts`, currently reads
  `deals`) is rebuilt to read `projects.stage` instead.
- `clients/[id]/page.tsx`'s deal list becomes a project list.
- `components/status-badge.tsx`'s deal-stage badge is replaced by a single
  project-stage badge used everywhere (list, kanban, detail header, client
  page).
- Old `/deals/*` routes are deleted outright (not redirected) — same reason
  as above, nothing depends on them existing.

See the Notion change request (linked from project memory) for the ordered
subtask breakdown, acceptance criteria per subtask, and TDD expectations —
that's the actual execution plan; this document stays the design record.
