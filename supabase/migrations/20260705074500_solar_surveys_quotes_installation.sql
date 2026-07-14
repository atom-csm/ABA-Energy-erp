-- ABA Energy OS — Phase 1.2-1.4 solar survey, quote spec, and installation tracker.

-- ── Phase 1.2: survey module ───────────────────────────────────────────────
create table if not exists solar_surveys (
  id                 uuid primary key default gen_random_uuid(),
  org_id             uuid not null references organizations(id) on delete cascade,
  deal_id            uuid references deals(id) on delete set null,
  project_id         uuid references projects(id) on delete set null,
  title              text not null,
  status             text not null default 'scheduled' check (status in ('scheduled','completed','needs_engineer','blocked','cancelled')),
  scheduled_date     date,
  completed_date     date,
  roof_type          text,
  roof_area_sqm      numeric(10,2) check (roof_area_sqm is null or roof_area_sqm >= 0),
  meter_phase        text,
  main_breaker_amp   numeric(10,2) check (main_breaker_amp is null or main_breaker_amp >= 0),
  shading_notes      text,
  structural_notes   text,
  photo_folder_url   text,
  result_summary     text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create trigger set_updated_at before update on solar_surveys for each row execute function public.set_updated_at();

create index if not exists solar_surveys_org_idx on solar_surveys (org_id);
create index if not exists solar_surveys_deal_idx on solar_surveys (deal_id);
create index if not exists solar_surveys_project_idx on solar_surveys (project_id);
create index if not exists solar_surveys_org_status_idx on solar_surveys (org_id, status);
create index if not exists solar_surveys_org_scheduled_idx on solar_surveys (org_id, scheduled_date) where scheduled_date is not null;

alter table solar_surveys enable row level security;
alter table solar_surveys force row level security;

drop policy if exists solar_surveys_rw on solar_surveys;
create policy solar_surveys_rw on solar_surveys
  for all to authenticated
  using (private.is_org_member(org_id)) with check (private.is_org_member(org_id));

-- ── Phase 1.3: solar quote/proposal metadata ───────────────────────────────
alter table quotes
  add column if not exists system_size_kwp numeric(8,2) check (system_size_kwp is null or system_size_kwp >= 0),
  add column if not exists panel_model text,
  add column if not exists inverter_model text,
  add column if not exists battery_option text,
  add column if not exists warranty_years numeric(5,2) check (warranty_years is null or warranty_years >= 0),
  add column if not exists payback_years numeric(5,2) check (payback_years is null or payback_years >= 0),
  add column if not exists proposal_assumptions text,
  add column if not exists included_scope text,
  add column if not exists excluded_scope text;

create index if not exists quotes_org_system_size_idx on quotes (org_id, system_size_kwp) where system_size_kwp is not null;

-- ── Phase 1.4: installation tracker on projects ────────────────────────────
alter table projects
  add column if not exists installation_start_date date,
  add column if not exists installation_end_date date,
  add column if not exists installation_crew text,
  add column if not exists deposit_received boolean not null default false,
  add column if not exists handover_completed boolean not null default false,
  add column if not exists warranty_registered boolean not null default false,
  add column if not exists installation_checklist jsonb not null default '{"survey_confirmed":false,"equipment_ready":false,"safety_briefed":false,"installed":false,"tested":false,"handover_signed":false}'::jsonb;

create index if not exists projects_org_install_start_idx on projects (org_id, installation_start_date) where installation_start_date is not null;
create index if not exists projects_org_handover_idx on projects (org_id, handover_completed);
