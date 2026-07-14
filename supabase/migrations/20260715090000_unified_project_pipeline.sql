-- ABA Energy OS — CR-001 ST-1: Unified Project Pipeline.
-- Merges `deals` into `projects` behind one `project_stage` enum, per
-- docs/PROJECT_PIPELINE_REDESIGN.md. Hard merge, no back-compat: production
-- and UAT have zero real users/orgs/rows as of this migration, so there is no
-- legacy data to preserve. `deal_stage` and `project_status` are both fully
-- superseded by `project_stage` and dropped.
--
-- Every FK that pointed at `deals` (`activities.deal_id`, `solar_surveys
-- .deal_id`, `projects.deal_id`) is repointed at `projects` directly or
-- dropped as redundant (`projects.deal_id`, since the project the deal
-- described now *is* the project row).

-- ── New pipeline enum ────────────────────────────────────────────────────────
create type project_stage as enum (
  'electric_bill_collection',
  'site_survey',
  'quotation_and_proposal',
  'negotiation_and_followup',
  'installation',
  'payment',
  'after_sales',
  'archive'
);

-- ── projects: absorb deals' useful columns + the new stage ─────────────────
alter table projects
  add column stage               project_stage not null default 'electric_bill_collection',
  add column value_satang        bigint not null default 0,
  add column currency            char(3) not null default 'THB',
  add column expected_close_date date,
  add column next_follow_up_date date,
  add column source               text,
  add column notes                 text,
  add column monthly_bill_satang        bigint check (monthly_bill_satang is null or monthly_bill_satang >= 0),
  add column province                   text,
  add column installation_target_date   date,
  add column solar_notes                text;

-- `title` (deals) and `name` (projects) represented the same "what is this
-- called" concept — `name` is the single field going forward, so `title`
-- is not carried over as a separate column.
--
-- `estimated_system_size_kwp`, `roof_type`, `survey_date`, `payback_years`
-- from the old `deals` (added in 20260705072634_solar_workflow_fields.sql)
-- are NOT carried over — they're already duplicated by
-- `solar_surveys.roof_type`/`scheduled_date` and
-- `quotes.system_size_kwp`/`payback_years`. `monthly_bill_satang`,
-- `province`, `installation_target_date`, and `solar_notes` have no
-- replacement anywhere else and ARE carried over — `monthly_bill_satang` in
-- particular is what stage 1 ("Electric bill collection") exists to capture.

-- Drop the now-redundant self-reference (a project no longer needs to point
-- at the deal it came from — it IS the deal, merged).
alter table projects drop constraint if exists projects_deal_id_fkey;
alter table projects drop column if exists deal_id;

-- Drop the old status column + its index; `stage` fully supersedes it.
drop index if exists projects_org_id_status_idx;
alter table projects drop column if exists status;

create index on projects (org_id, stage);
create index on projects (org_id, next_follow_up_date) where next_follow_up_date is not null;

-- ── activities: deal_id -> project_id ────────────────────────────────────────
alter table activities add column project_id uuid references projects(id) on delete cascade;
drop index if exists activities_deal_id_idx;
alter table activities drop constraint if exists activities_deal_id_fkey;
alter table activities drop column if exists deal_id;
create index on activities (project_id);

-- ── solar_surveys: drop deal_id (project_id already exists and is the one
--    remaining link back to the pipeline) ───────────────────────────────────
drop index if exists solar_surveys_deal_idx;
alter table solar_surveys drop constraint if exists solar_surveys_deal_id_fkey;
alter table solar_surveys drop column if exists deal_id;

-- ── Drop `deals` entirely, then the enum it alone depended on ───────────────
drop table if exists deals;
drop type if exists deal_stage;
drop type if exists project_status;

-- ai_outputs.kind still has a 'deal_summary' value from the old deal-AI
-- actions; rename it to match the merged model (no rows exist to migrate).
alter type ai_output_kind rename value 'deal_summary' to 'project_summary';

-- Note: RLS on `projects`, `activities`, and `solar_surveys` already enables +
-- forces row level security with an org-scoped `for all` policy driven by
-- private.is_org_member(org_id) (see 20260630091000_rls_policies.sql and
-- 20260705074500_solar_surveys_quotes_installation.sql). Adding/dropping
-- columns on an already-RLS-protected table needs no new policy — the
-- existing policies apply to the whole row, so every new column here is
-- already isolated by org.
