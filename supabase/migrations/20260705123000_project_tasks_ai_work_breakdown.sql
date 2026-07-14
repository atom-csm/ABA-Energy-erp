-- AI Work Breakdown support on the existing tasks table.
-- No new table: confirmed AI tasks are stored as normal project_tasks rows.
-- We keep only the user-confirmed task fields, never the raw model JSON.

alter table project_tasks
  add column if not exists estimate_hours numeric(8,2),
  add column if not exists phase_name text,
  add column if not exists depends_on uuid[] not null default '{}';

comment on column project_tasks.estimate_hours is
  'Estimated effort in hours for planning and AI work breakdown scheduling.';
comment on column project_tasks.phase_name is
  'Optional phase/group label from AI work breakdown or manual planning.';
comment on column project_tasks.depends_on is
  'Task dependency IDs stored on the existing project_tasks row; avoids a separate dependency table.';

create index if not exists project_tasks_depends_on_gin_idx
  on project_tasks using gin (depends_on);

create index if not exists project_tasks_phase_idx
  on project_tasks (org_id, project_id, phase_name);
