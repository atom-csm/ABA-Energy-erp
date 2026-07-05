-- Handover Evidence flow: track handover + warranty sign-off with notes + URLs.
-- Lets the team record what was handed over, who signed, warranty certificate URL,
-- and the photo/folder evidence link so the audit trail is real (not just booleans).

create table if not exists project_handover_evidence (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  project_id uuid not null references projects(id) on delete cascade,
  -- Which milestone this evidence supports. Future-proof: lets us tag
  -- 'handover_signed' vs 'warranty_registered' etc.
  kind text not null check (kind in ('handover','warranty','commissioning','after_sale')),
  -- Free-text note: what happened, who was present, conditions accepted.
  note text,
  -- Optional URL: Drive folder, photo album, warranty cert PDF, customer e-sign doc.
  evidence_url text,
  -- Optional sign-off metadata. Recorded as plain text for now (we don't
  -- bind to profiles here; RLS keeps it scoped by org_id).
  signed_by text,
  signed_at timestamptz,
  created_by text,
  created_at timestamptz not null default now()
);

create index if not exists project_handover_evidence_project_idx
  on project_handover_evidence (project_id, created_at desc);

create index if not exists project_handover_evidence_org_idx
  on project_handover_evidence (org_id);

-- Enable RLS + org-scoped full CRUD (mirrors projects/project_tasks pattern).
alter table project_handover_evidence enable row level security;

create policy project_handover_evidence_rw on project_handover_evidence
  for all to authenticated
  using (private.is_org_member(org_id)) with check (private.is_org_member(org_id));
