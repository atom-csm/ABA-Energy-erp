-- ABA Energy OS — CR-001 ST-3: real project document/photo/video uploads.
-- Replaces every pasted-URL "evidence" field (project_handover_evidence
-- .evidence_url, solar_surveys.photo_folder_url) with real Supabase Storage
-- + a project_documents table. See docs/PROJECT_PIPELINE_REDESIGN.md.
--
-- Bucket is provisioned here via a direct insert into storage.buckets (a
-- normal Postgres table under Supabase Storage), NOT via
-- supabase/config.toml's [storage.buckets.*] section — that section only
-- applies to `supabase start` (local emulator) and has no effect on a
-- pushed/hosted project. A SQL migration is the one mechanism that
-- provisions the bucket identically on local dev (via `supabase db reset`/
-- `migration up`) and on the remote/hosted project (via `supabase db push`).

-- ── Storage bucket ───────────────────────────────────────────────────────────
-- Private (not public): all access goes through RLS-checked signed URLs
-- (see storage.objects policies below), never a public bucket URL.
-- file_size_limit is bytes: 25 MiB comfortably fits a phone photo or a short
-- video clip. allowed_mime_types covers the field-tech use case (site/roof/
-- meter photos, install videos) plus scanned bills/documents (PDF).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'project-media',
  'project-media',
  false,
  26214400, -- 25 MiB
  array[
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif',
    'video/mp4',
    'video/quicktime',
    'application/pdf'
  ]
)
on conflict (id) do update set
  public             = excluded.public,
  file_size_limit    = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- ── Storage RLS on storage.objects, scoped to this bucket ───────────────────
-- storage.objects already has RLS enabled by Supabase Storage itself (not a
-- table this migration owns/creates, so we don't ALTER TABLE ... ENABLE/FORCE
-- ROW LEVEL SECURITY on it here — that's Supabase-managed infrastructure).
-- Path convention: {org_id}/{project_id}/{stage}/{filename}
-- (storage.foldername(name))[1] pulls the org_id segment out of the full
-- object key so we can reuse the same private.is_org_member(org_id) helper
-- every other table's RLS policy uses. The uuid-shape regex guard avoids a
-- hard Postgres cast error (`invalid input syntax for type uuid`) if a
-- malformed path is ever attempted — it just becomes a clean access denial
-- instead of a 500.
drop policy if exists project_media_objects_rw on storage.objects;
create policy project_media_objects_rw on storage.objects
  for all to authenticated
  using (
    bucket_id = 'project-media'
    and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and private.is_org_member(((storage.foldername(name))[1])::uuid)
  )
  with check (
    bucket_id = 'project-media'
    and (storage.foldername(name))[1] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    and private.is_org_member(((storage.foldername(name))[1])::uuid)
  );

-- ── project_documents table ──────────────────────────────────────────────────
-- The one place all stage evidence lives, instead of ad-hoc URL text fields.
-- `org_id` is carried directly (not just derived via project_id) to match
-- every other project-linked table's convention (see solar_surveys,
-- project_handover_evidence, project_tasks) so the standard
-- private.is_org_member(org_id) RLS policy pattern applies uniformly.
create table if not exists project_documents (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  project_id    uuid not null references projects(id) on delete cascade,
  -- The stage this evidence was captured during — may differ from the
  -- project's *current* stage, since the stage timeline lets you look back
  -- at what was uploaded during a past stage.
  stage         project_stage not null,
  kind          text not null check (kind in ('photo', 'video', 'document')),
  storage_path  text not null,
  caption       text,
  -- Matches the acting-user convention used elsewhere (e.g. `owner` on
  -- deals/projects/milestones, `created_by` on ai_outputs) — nullable uuid FK
  -- to auth.users, set null rather than cascading delete so evidence outlives
  -- the uploader's account.
  uploaded_by   uuid references auth.users(id) on delete set null,
  created_at    timestamptz not null default now()
);

create index if not exists project_documents_org_idx
  on project_documents (org_id);
create index if not exists project_documents_project_idx
  on project_documents (project_id);
create index if not exists project_documents_project_stage_idx
  on project_documents (project_id, stage);

alter table project_documents enable row level security;
alter table project_documents force row level security;

drop policy if exists project_documents_rw on project_documents;
create policy project_documents_rw on project_documents
  for all to authenticated
  using (private.is_org_member(org_id)) with check (private.is_org_member(org_id));
