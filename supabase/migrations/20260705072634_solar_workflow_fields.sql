-- ABA Energy OS — Phase 1.1 solar workflow fields for deals.
-- Adds rooftop-solar qualification/survey/proposal metadata without changing
-- existing CRM stage enums or RLS behavior.

alter table deals
  add column if not exists monthly_bill_satang bigint check (monthly_bill_satang is null or monthly_bill_satang >= 0),
  add column if not exists estimated_system_size_kwp numeric(8,2) check (estimated_system_size_kwp is null or estimated_system_size_kwp >= 0),
  add column if not exists roof_type text,
  add column if not exists province text,
  add column if not exists survey_date date,
  add column if not exists installation_target_date date,
  add column if not exists payback_years numeric(5,2) check (payback_years is null or payback_years >= 0),
  add column if not exists solar_notes text;

create index if not exists deals_org_province_idx on deals (org_id, province);
create index if not exists deals_org_survey_date_idx on deals (org_id, survey_date) where survey_date is not null;
create index if not exists deals_org_installation_target_idx on deals (org_id, installation_target_date) where installation_target_date is not null;
