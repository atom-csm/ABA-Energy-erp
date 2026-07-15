-- Surveys are folded into the Projects page (no more standalone /surveys nav
-- item or list): every survey now belongs to a project, so make that FK
-- required instead of nullable. No real data yet, so the one demo row that
-- had lost its project link (seeded project was never (re)applied to this
-- environment) is dropped rather than migrated.
delete from public.solar_surveys where project_id is null;

alter table public.solar_surveys
  alter column project_id set not null;

-- Pricing is no longer a manually-typed `projects.budget_satang` field —
-- the project's headline price now comes from its actual `quotes` rows
-- (see lib/pipeline/quote-value.ts), so the standalone column is dropped.
alter table public.projects
  drop column budget_satang;
