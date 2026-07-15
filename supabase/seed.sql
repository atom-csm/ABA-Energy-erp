-- ════════════════════════════════════════════════════════════════════════════
-- ABA Energy OS — demo seed (FAKE data only).
--
-- Runs via the service role / superuser (bypasses RLS). Idempotent.
-- Demo logins (LOCAL ONLY):  password for all = AbaDemo123!
--   demo@aba-energy.local   (owner)
--   sales@aba-energy.local  (member / sales)
--   ops@aba-energy.local    (member / ops)
--
-- All names, emails (@aba-energy.local / example.com), and phone numbers are
-- fictional. No real personal data.
-- ════════════════════════════════════════════════════════════════════════════

-- Evaluate current_date / now() in the app's timezone so the seed's "today" and
-- "this month" line up with the dashboard (which reckons in Asia/Bangkok).
set time zone 'Asia/Bangkok';

-- ── Auth users (email + password, pre-confirmed) ────────────────────────────
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change
) values
  ('00000000-0000-0000-0000-000000000000','b0000000-0000-0000-0000-000000000001','authenticated','authenticated','demo@aba-energy.local',  crypt('AbaDemo123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}','{"full_name":"ABA Owner (Demo)"}',  now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000','b0000000-0000-0000-0000-000000000002','authenticated','authenticated','sales@aba-energy.local', crypt('AbaDemo123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}','{"full_name":"Sales Rep (Demo)"}',  now(), now(), '', '', '', ''),
  ('00000000-0000-0000-0000-000000000000','b0000000-0000-0000-0000-000000000003','authenticated','authenticated','ops@aba-energy.local',   crypt('AbaDemo123!', gen_salt('bf')), now(), '{"provider":"email","providers":["email"]}','{"full_name":"Ops Lead (Demo)"}',   now(), now(), '', '', '', '')
on conflict (id) do nothing;

insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at) values
  (gen_random_uuid(), 'b0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001','{"sub":"b0000000-0000-0000-0000-000000000001","email":"demo@aba-energy.local","email_verified":true}',     'email', now(), now(), now()),
  (gen_random_uuid(), 'b0000000-0000-0000-0000-000000000002','b0000000-0000-0000-0000-000000000002','{"sub":"b0000000-0000-0000-0000-000000000002","email":"sales@aba-energy.local","email_verified":true}','email', now(), now(), now()),
  (gen_random_uuid(), 'b0000000-0000-0000-0000-000000000003','b0000000-0000-0000-0000-000000000003','{"sub":"b0000000-0000-0000-0000-000000000003","email":"ops@aba-energy.local","email_verified":true}',   'email', now(), now(), now())
on conflict (provider_id, provider) do nothing;

-- Profiles (belt-and-braces; the on_auth_user_created trigger also creates these)
insert into public.profiles (id, full_name, locale) values
  ('b0000000-0000-0000-0000-000000000001','ABA Owner (Demo)','th'),
  ('b0000000-0000-0000-0000-000000000002','Sales Rep (Demo)','th'),
  ('b0000000-0000-0000-0000-000000000003','Ops Lead (Demo)','th')
on conflict (id) do update set full_name = excluded.full_name;

-- ── Organization + settings + memberships ───────────────────────────────────
insert into organizations (id, name, slug) values
  ('a0000000-0000-0000-0000-000000000001','ABA Energy','aba-energy')
on conflict (id) do nothing;

insert into org_settings (org_id, cash_balance_satang, monthly_burn_satang) values
  ('a0000000-0000-0000-0000-000000000001', 85000000, null)  -- ฿850,000 cash on hand
on conflict (org_id) do nothing;

insert into memberships (org_id, user_id, role) values
  ('a0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000001','owner'),
  ('a0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000002','member'),
  ('a0000000-0000-0000-0000-000000000001','b0000000-0000-0000-0000-000000000003','member')
on conflict (user_id, org_id) do nothing;

-- ── CRM: clients ────────────────────────────────────────────────────────────
insert into clients (id, org_id, name, industry, source, notes, owner) values
  ('c0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','Chaiyasawat Motorbike - Kranuan','Motorcycle Dealership','Referral','SME showroom in Khon Kaen evaluating rooftop solar to reduce electricity costs and track clean-energy impact.','b0000000-0000-0000-0000-000000000001'),
  ('c0000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','Khon Kaen Cold Storage','Cold Storage / SME','LINE OA','High-electricity SME site interested in solar survey, proposal, and energy-yield dashboard.','b0000000-0000-0000-0000-000000000001'),
  ('c0000000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000001','Isan Food Processing','Food Processing','Expo Lead','Factory lead requesting rooftop survey and savings estimate.','b0000000-0000-0000-0000-000000000002'),
  ('c0000000-0000-0000-0000-000000000004','a0000000-0000-0000-0000-000000000001','Home Solar Pilot - Khon Kaen','Residential','Website','Homeowner lead interested in lease-to-own solar package.','b0000000-0000-0000-0000-000000000001'),
  ('c0000000-0000-0000-0000-000000000005','a0000000-0000-0000-0000-000000000001','Municipal Learning Center','Public / Education','Partner','Potential public-sector pilot for clean-energy dashboard and MRV-readiness reporting.','b0000000-0000-0000-0000-000000000003')
on conflict (id) do nothing;

-- ── CRM: contacts ───────────────────────────────────────────────────────────
insert into contacts (org_id, client_id, name, email, phone, role) values
  ('a0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001','Khun Anan','anan@example.com','02-555-0101','Owner'),
  ('a0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001','Khun Mali','mali@example.com','02-555-0102','Marketing Lead'),
  ('a0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000002','Khun Somchai','somchai@example.com','02-555-0201','Operations Manager'),
  ('a0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000003','Dr. Pichai','pichai@example.com','02-555-0301','Founder'),
  ('a0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000004','Khun Wachira','wachira@example.com','02-555-0401','Sales Director'),
  ('a0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000005','Khun Ploy','ploy@example.com','02-555-0501','Co-founder')
on conflict do nothing;

-- ── Projects (one row per customer journey — merges the old deals+projects) ─
-- Stages: electric_bill_collection, site_survey, quotation_and_proposal,
-- negotiation_and_followup, installation, payment, after_sales, archive.
insert into projects (
  id, org_id, client_id, name, stage, value_satang, currency,
  expected_close_date, next_follow_up_date, source, notes, owner,
  deadline,
  installation_start_date, installation_end_date, installation_crew,
  deposit_received, handover_completed, warranty_registered, installation_checklist
) values
  (
    'e0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001','Solar Rooftop 20.8 kWp — Kranuan Showroom','installation',18000000,'THB',
    current_date - 20, null, 'Referral','Deposit received. Installing per schedule; emphasize self-consumption and after-sale monitoring.','b0000000-0000-0000-0000-000000000001',
    current_date + 12,
    current_date + 3, current_date + 6, 'Team A / Khon Kaen electrician partner',
    true, false, false,
    '{"survey_confirmed":true,"equipment_ready":true,"safety_briefed":false,"installed":false,"tested":false,"handover_signed":false}'::jsonb
  ),
  (
    'e0000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000002','Solar Rooftop 41.6 kWp — Khon Kaen Cold Storage','payment',25000000,'THB',
    current_date - 10, null, 'LINE OA','Approved. Awaiting deposit before installation scheduling.','b0000000-0000-0000-0000-000000000001',
    current_date + 30,
    current_date + 14, current_date + 18, 'Team B / Cold storage safety crew',
    false, false, false,
    '{"survey_confirmed":true,"equipment_ready":false,"safety_briefed":false,"installed":false,"tested":false,"handover_signed":false}'::jsonb
  ),
  (
    'e0000000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000003','Factory Solar — Food Processing','after_sales',15000000,'THB',
    current_date - 35, null, 'Webinar','Installed, handed over, and under warranty/monitoring support.','b0000000-0000-0000-0000-000000000002',
    current_date - 10,
    current_date - 20, current_date - 18, 'Service / monitoring team',
    true, true, true,
    '{"survey_confirmed":true,"equipment_ready":true,"safety_briefed":true,"installed":true,"tested":true,"handover_signed":true}'::jsonb
  ),
  (
    'e0000000-0000-0000-0000-000000000004','a0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000005','Internal: Solar Mining Pilot','site_survey',0,'THB',
    null, null, 'Internal','Internal engineering pilot; scoping site requirements before any customer commitment.','b0000000-0000-0000-0000-000000000001',
    current_date + 5,
    null, null, 'Ava + ABA engineering review',
    false, false, false,
    '{"survey_confirmed":false,"equipment_ready":false,"safety_briefed":false,"installed":false,"tested":false,"handover_signed":false}'::jsonb
  ),
  (
    'e0000000-0000-0000-0000-000000000005','a0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000004','Home Solar Lease-to-Own Proposal','quotation_and_proposal',22000000,'THB',
    current_date + 14, current_date, 'Cold outreach','Proposal sent. Follow up on roof layout and payment terms today.','b0000000-0000-0000-0000-000000000001',
    null,
    null, null, null,
    false, false, false,
    '{"survey_confirmed":false,"equipment_ready":false,"safety_briefed":false,"installed":false,"tested":false,"handover_signed":false}'::jsonb
  ),
  (
    'e0000000-0000-0000-0000-000000000006','a0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000005','Clean Energy Dashboard Pilot','negotiation_and_followup',32000000,'THB',
    current_date + 7, current_date - 2, 'Referral','Negotiating monitoring scope and pilot terms. Follow-up overdue!','b0000000-0000-0000-0000-000000000003',
    null,
    null, null, null,
    false, false, false,
    '{"survey_confirmed":false,"equipment_ready":false,"safety_briefed":false,"installed":false,"tested":false,"handover_signed":false}'::jsonb
  ),
  (
    'e0000000-0000-0000-0000-000000000007','a0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000003','Battery / EV Charger Add-on','site_survey',12000000,'THB',
    current_date + 30, current_date + 3, 'Webinar','Exploring battery and EV charger add-on sizing; needs load profile review.','b0000000-0000-0000-0000-000000000002',
    null,
    null, null, null,
    false, false, false,
    '{"survey_confirmed":false,"equipment_ready":false,"safety_briefed":false,"installed":false,"tested":false,"handover_signed":false}'::jsonb
  ),
  (
    'e0000000-0000-0000-0000-000000000008','a0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000002','After-sale Monitoring Package','electric_bill_collection',8000000,'THB',
    current_date + 45, current_date + 5, 'LINE OA','New after-sale monitoring upsell from existing client; qualifying scope.','b0000000-0000-0000-0000-000000000001',
    null,
    null, null, null,
    false, false, false,
    '{"survey_confirmed":false,"equipment_ready":false,"safety_briefed":false,"installed":false,"tested":false,"handover_signed":false}'::jsonb
  ),
  (
    'e0000000-0000-0000-0000-000000000009','a0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000004','Solar Quote (lost)','archive',9000000,'THB',
    current_date - 5, null, 'Cold outreach','Lost to lower-price installer. Kept for competitor intel and future follow-up.','b0000000-0000-0000-0000-000000000001',
    null,
    null, null, null,
    false, false, false,
    '{"survey_confirmed":false,"equipment_ready":false,"safety_briefed":false,"installed":false,"tested":false,"handover_signed":false}'::jsonb
  )
on conflict (id) do update set
  name = excluded.name,
  stage = excluded.stage,
  value_satang = excluded.value_satang,
  currency = excluded.currency,
  expected_close_date = excluded.expected_close_date,
  next_follow_up_date = excluded.next_follow_up_date,
  source = excluded.source,
  notes = excluded.notes,
  owner = excluded.owner,
  deadline = excluded.deadline,
  installation_start_date = excluded.installation_start_date,
  installation_end_date = excluded.installation_end_date,
  installation_crew = excluded.installation_crew,
  deposit_received = excluded.deposit_received,
  handover_completed = excluded.handover_completed,
  warranty_registered = excluded.warranty_registered,
  installation_checklist = excluded.installation_checklist;

-- ── CRM: activities / follow-ups ────────────────────────────────────────────
insert into activities (org_id, client_id, project_id, type, due_date, done, body, owner) values
  ('a0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000004','e0000000-0000-0000-0000-000000000005','follow_up', current_date,     false,'Call Khun Wachira re: proposal feedback.','b0000000-0000-0000-0000-000000000001'),
  ('a0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000005','e0000000-0000-0000-0000-000000000006','call',      current_date - 2, false,'Overdue: confirm scope + budget with GreenLeaf.','b0000000-0000-0000-0000-000000000003'),
  ('a0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000003','e0000000-0000-0000-0000-000000000007','meeting',   current_date + 3, false,'Discovery call for AI tutor add-on.','b0000000-0000-0000-0000-000000000002'),
  ('a0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001',null,                                   'note',      null,             true, 'Sent thank-you note after kickoff.','b0000000-0000-0000-0000-000000000001'),
  ('a0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000002','e0000000-0000-0000-0000-000000000008','follow_up', current_date + 5, false,'Send loyalty campaign one-pager.','b0000000-0000-0000-0000-000000000001')
on conflict do nothing;

-- ── Solar surveys (demo: site data feeding quote/project decisions) ─────────
insert into solar_surveys (
  id, org_id, project_id, title, status, scheduled_date, completed_date,
  roof_type, roof_area_sqm, meter_phase, main_breaker_amp,
  shading_notes, structural_notes, photo_folder_url, result_summary
) values
  (
    '70000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000001','Kranuan showroom roof survey','completed', current_date - 28, current_date - 28,
    'metal sheet', 168.00, '3-phase', 100,
    'Minor morning shade from signage; layout keeps inverter string away from shaded edge.',
    'Roof frame visually acceptable; final structure sign-off required before installation.',
    'https://drive.google.com/drive/folders/demo-kranuan-survey',
    'Fit for ~20.8 kWp rooftop package. Proposal should emphasize self-consumption and after-sale monitoring.'
  ),
  (
    '70000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000002','Khon Kaen cold storage survey','needs_engineer', current_date - 18, current_date - 17,
    'metal sheet', 320.00, '3-phase', 250,
    'Open roof area with limited shade; verify cable routing around cold-room compressor area.',
    'Engineer to confirm roof loading and maintenance walkway before final BOQ.',
    'https://drive.google.com/drive/folders/demo-cold-storage-survey',
    'Potential ~41.6 kWp system. Add monitoring dashboard as optional package after engineering sign-off.'
  ),
  (
    '70000000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000005','Home solar lease-to-own pre-survey','scheduled', current_date + 2, null,
    'tile roof', null, '1-phase', 50,
    'Need drone/photo check for afternoon shade from neighboring building.',
    'Pending attic/roof access approval from homeowner.',
    null,
    'Confirm roof structure, usable area, and finance assumptions before final lease-to-own proposal.'
  )
on conflict (id) do update set
  project_id = excluded.project_id,
  title = excluded.title,
  status = excluded.status,
  scheduled_date = excluded.scheduled_date,
  completed_date = excluded.completed_date,
  roof_type = excluded.roof_type,
  roof_area_sqm = excluded.roof_area_sqm,
  meter_phase = excluded.meter_phase,
  main_breaker_amp = excluded.main_breaker_amp,
  shading_notes = excluded.shading_notes,
  structural_notes = excluded.structural_notes,
  photo_folder_url = excluded.photo_folder_url,
  result_summary = excluded.result_summary;

-- ── Project tasks ───────────────────────────────────────────────────────────
insert into project_tasks (org_id, project_id, title, status, assignee, due_date, done) values
  ('a0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000001','Confirm panel layout and equipment list','done','b0000000-0000-0000-0000-000000000002', current_date - 5, true),
  ('a0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000001','Prepare installation checklist and work order','in_progress','b0000000-0000-0000-0000-000000000002', current_date + 3, false),
  ('a0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000001','Customer handover and monitoring walkthrough','todo','b0000000-0000-0000-0000-000000000003', current_date + 9, false),
  ('a0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000002','Site survey + requirements','todo','b0000000-0000-0000-0000-000000000003', current_date + 7, false),
  ('a0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000003','Monthly solar performance check-in','todo','b0000000-0000-0000-0000-000000000002', current_date + 2, false)
on conflict do nothing;

-- ── Milestones / checklist ──────────────────────────────────────────────────
insert into milestones (org_id, project_id, title, done, due_date) values
  ('a0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000001','Phase 1: Flow approved', true,  current_date - 6),
  ('a0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000001','Phase 2: Bot live in staging', false, current_date + 4),
  ('a0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000001','Phase 3: Production handover', false, current_date + 12),
  ('a0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000002','Signed SOW', false, current_date + 6)
on conflict do nothing;

-- ── Finance: invoices (varied statuses) ─────────────────────────────────────
insert into invoices (id, org_id, client_id, project_id, number, status, issue_date, due_date, amount_satang, is_recurring, recurring_interval, notes) values
  ('f0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000001','INV-2026-001','paid',          current_date - 25, current_date - 10,  9000000, false, null,     'Deposit 50% — Kranuan showroom solar installation'),
  ('f0000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000002','e0000000-0000-0000-0000-000000000002','INV-2026-002','sent',          current_date - 8,  current_date + 7,  12500000, false, null,     'Deposit — Khon Kaen cold-storage solar project'),
  ('f0000000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000004',null,                                   'INV-2026-003','overdue',       current_date - 30, current_date - 8,   5500000, false, null,     'Solar pre-survey and feasibility workshop — Siam Property'),
  ('f0000000-0000-0000-0000-000000000004','a0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000003','e0000000-0000-0000-0000-000000000003','INV-2026-004','partially_paid',current_date - 15, current_date + 5,   8000000, false, null,     'Factory solar proposal revision — milestone 2'),
  ('f0000000-0000-0000-0000-000000000005','a0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000003',null,                                   'INV-2026-005','sent',          current_date - 3,  current_date + 27,  3500000, true,  'monthly','Lanna EdTech — solar monitoring monthly support'),
  ('f0000000-0000-0000-0000-000000000006','a0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000002',null,                                   'INV-2026-006','draft',         current_date,      current_date + 30,  4000000, true,  'monthly','Krua Thai — after-sale monitoring retainer (draft)')
on conflict (id) do update set
  status = excluded.status,
  issue_date = excluded.issue_date,
  due_date = excluded.due_date,
  amount_satang = excluded.amount_satang,
  notes = excluded.notes;

-- ── Finance: payments ───────────────────────────────────────────────────────
insert into payments (org_id, invoice_id, amount_satang, paid_at, method, notes) values
  ('a0000000-0000-0000-0000-000000000001','f0000000-0000-0000-0000-000000000001', 9000000, date_trunc('month', now()) + interval '9 hours',  'transfer','Paid in full'),
  ('a0000000-0000-0000-0000-000000000001','f0000000-0000-0000-0000-000000000004', 4000000, now(),  'promptpay','Partial — 50%')
on conflict do nothing;

-- ── Finance: costs (this month + history) ───────────────────────────────────
insert into costs (org_id, project_id, category, amount_satang, incurred_on, vendor, notes) values
  ('a0000000-0000-0000-0000-000000000001',null,                                   'salary',     12000000, date_trunc('month', current_date)::date,        'Payroll','Junior dev salaries (2)'),
  ('a0000000-0000-0000-0000-000000000001',null,                                   'software',    1500000, current_date,                                   'OpenAI / Anthropic','LLM API usage'),
  ('a0000000-0000-0000-0000-000000000001',null,                                   'infra',        800000, current_date,                                   'Supabase / Vercel','Hosting'),
  ('a0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000001','contractor',  2500000, date_trunc('month', current_date)::date,        'Freelance designer','Bot UI/UX'),
  ('a0000000-0000-0000-0000-000000000001',null,                                   'marketing',   2000000, current_date,                                   'Meta Ads','Lead-gen campaign'),
  ('a0000000-0000-0000-0000-000000000001',null,                                   'salary',     12000000, (date_trunc('month', current_date) - interval '10 days')::date, 'Payroll','Junior dev salaries (last month)')
on conflict do nothing;

-- ── Templates: categories + automation templates ───────────────────────────
insert into template_categories (id, org_id, name, slug) values
  ('11110000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','Sales & Support','sales-support'),
  ('11110000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','CRM & Follow-up','crm-followup'),
  ('11110000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000001','Education & Community','education')
on conflict (id) do nothing;

insert into automation_templates (org_id, category_id, name, description, internal_value_satang, price_satang, reusable_notes, implementation_checklist, tags) values
  ('a0000000-0000-0000-0000-000000000001','11110000-0000-0000-0000-000000000001','Solar Rooftop 20.8 kWp — Kranuan','Standard rooftop-solar package with survey, proposal, installation handoff, and monitoring-ready documentation.', 18000000, 25000000, 'Reusable survey → quote → project checklist. Swap panel/inverter models and assumptions per site.', '["Confirm survey result","Prepare BOQ and proposal assumptions","Schedule installation crew","Collect deposit","Register warranty and handover pack"]'::jsonb, array['solar','survey','proposal','installation']),
  ('a0000000-0000-0000-0000-000000000001','11110000-0000-0000-0000-000000000002','Solar Lead Follow-up Cadence','Auto-creates follow-up tasks and reminders when a solar lead stage changes.', 12000000, 18000000, 'Webhook from CRM -> reminders. Map Lead→Survey→Proposal→Deposit cadences.', '["Expose project webhook","Build follow-up schedule","Configure reminder channel","Map stage -> cadence"]'::jsonb, array['solar','crm','follow-up']),
  ('a0000000-0000-0000-0000-000000000001','11110000-0000-0000-0000-000000000002','Deposit / Final Payment Reminder','Watches solar invoice due dates and nudges clients before/after due.', 9000000, 15000000, 'Cron + invoices table -> templated reminders at -3/0/+3/+7 days.', '["Connect invoice source","Set reminder schedule","Write message templates","Add escalation to owner"]'::jsonb, array['finance','deposit','invoice','reminder']),
  ('a0000000-0000-0000-0000-000000000001','11110000-0000-0000-0000-000000000001','Site Survey Summary Workflow','Turns survey photos/notes into a structured engineering summary and customer-ready follow-up.', 8000000, 12000000, 'Survey notes -> AI summary -> Drive/Lark task. Great for reducing survey-to-proposal delay.', '["Collect survey notes","Summarize constraints","Extract engineering actions","Post to project"]'::jsonb, array['ai','survey','summary']),
  ('a0000000-0000-0000-0000-000000000001','11110000-0000-0000-0000-000000000003','After-sale Monitoring Onboarding','Onboards customers after handover: warranty registration, monitoring access, and referral ask.', 15000000, 20000000, 'Handover checklist -> warranty record -> monitoring invite -> referral follow-up.', '["Register warranty","Create monitoring access","Send handover guide","Schedule after-sale check-in"]'::jsonb, array['after-sale','handover','monitoring'])
on conflict do nothing;

-- ── V3: Quotations + line items ─────────────────────────────────────────────
insert into quotes (
  id, org_id, client_id, project_id, number, status, issue_date, valid_until,
  subtotal_satang, discount_satang, total_satang,
  system_size_kwp, panel_model, inverter_model, battery_option, warranty_years, payback_years,
  proposal_assumptions, included_scope, excluded_scope, notes, owner
) values
  (
    '90000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000002','e0000000-0000-0000-0000-000000000002','QUO-2026-001','sent', current_date - 4, current_date + 26,
    17000000, 1000000, 16000000,
    41.60, 'Tier-1 mono PERC 550W class', 'Huawei / Sungrow 3-phase inverter', 'No battery in base offer', 10, 3.90,
    'Demo assumptions only: daytime load profile and yield/payback must be validated against real bill + site survey before customer use.',
    'Panels, inverter, mounting, standard DC/AC protection, installation, commissioning, handover checklist, monitoring setup.',
    'PEA application fees, structural reinforcement, non-standard cable routing, battery/EV charger add-ons unless quoted separately.',
    'Solar rooftop proposal for cold-storage SME with monitoring dashboard option.',
    'b0000000-0000-0000-0000-000000000001'
  ),
  (
    '90000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000001','QUO-2026-002','accepted', current_date - 9, current_date + 14,
    8000000, 0, 8000000,
    20.80, 'Tier-1 mono PERC 550W class', 'Huawei / Sungrow 3-phase inverter', 'No battery in base offer', 10, 4.70,
    'Demo assumptions only: showroom daytime consumption and roof area are illustrative for UAT.',
    'Survey, BOQ, equipment supply, rooftop installation, testing, warranty registration, and customer handover pack.',
    'Grid upgrade, roof repair, monitoring subscription beyond included setup, and optional insurance.',
    'Accepted solar rooftop scope for Kranuan showroom installation planning.',
    'b0000000-0000-0000-0000-000000000002'
  )
on conflict (id) do update set
  project_id = excluded.project_id,
  status = excluded.status,
  issue_date = excluded.issue_date,
  valid_until = excluded.valid_until,
  subtotal_satang = excluded.subtotal_satang,
  discount_satang = excluded.discount_satang,
  total_satang = excluded.total_satang,
  system_size_kwp = excluded.system_size_kwp,
  panel_model = excluded.panel_model,
  inverter_model = excluded.inverter_model,
  battery_option = excluded.battery_option,
  warranty_years = excluded.warranty_years,
  payback_years = excluded.payback_years,
  proposal_assumptions = excluded.proposal_assumptions,
  included_scope = excluded.included_scope,
  excluded_scope = excluded.excluded_scope,
  notes = excluded.notes,
  owner = excluded.owner;

delete from quote_items where quote_id in (
  '90000000-0000-0000-0000-000000000001',
  '90000000-0000-0000-0000-000000000002'
);

insert into quote_items (id, org_id, quote_id, description, quantity, unit_price_satang, amount_satang, position) values
  ('91000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000001','Solar PV system 41.60 kWp — panels, inverter, protection, mounting', 1, 15000000, 15000000, 0),
  ('91000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000001','Monitoring dashboard setup + handover training',                 1,  2000000,  2000000, 1),
  ('91000000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000002','Solar PV system 20.80 kWp — equipment supply and installation',  1,  8000000,  8000000, 0)
on conflict (id) do update set
  description = excluded.description,
  quantity = excluded.quantity,
  unit_price_satang = excluded.unit_price_satang,
  amount_satang = excluded.amount_satang,
  position = excluded.position;

-- ── V3: Invoice line items (sum to the invoice amount) ──────────────────────
insert into invoice_items (org_id, invoice_id, description, quantity, unit_price_satang, amount_satang, position) values
  ('a0000000-0000-0000-0000-000000000001','f0000000-0000-0000-0000-000000000001','Survey, BOQ, and installation planning deposit', 1, 4000000, 4000000, 0),
  ('a0000000-0000-0000-0000-000000000001','f0000000-0000-0000-0000-000000000001','Solar rooftop installation 20.8 kWp — 50% deposit', 1, 5000000, 5000000, 1),
  ('a0000000-0000-0000-0000-000000000001','f0000000-0000-0000-0000-000000000002','Solar rooftop installation 41.6 kWp — deposit', 1, 12500000, 12500000, 0)
on conflict do nothing;

-- ── V3: Timesheets ──────────────────────────────────────────────────────────
insert into time_entries (org_id, project_id, task_id, user_id, work_date, minutes, billable, rate_satang, notes) values
  ('a0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000001',null,'b0000000-0000-0000-0000-000000000002', current_date - 5, 240, true, 100000, 'Survey review and BOQ preparation'),
  ('a0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000001',null,'b0000000-0000-0000-0000-000000000002', current_date - 3, 180, true, 100000, 'Installation checklist and crew coordination'),
  ('a0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000001',null,'b0000000-0000-0000-0000-000000000003', current_date - 1, 300, true,  80000, 'Monitoring setup and handover testing'),
  ('a0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000003',null,'b0000000-0000-0000-0000-000000000002', current_date - 2, 120, false,   null, 'Monthly solar performance check-in (non-billable)')
on conflict do nothing;

-- ── V3: Subscriptions (recurring billing → feeds MRR) ───────────────────────
insert into subscriptions (id, org_id, client_id, project_id, name, amount_satang, interval, status, start_date, next_run_date, last_generated_on, auto_generate, notes) values
  ('80000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000003','e0000000-0000-0000-0000-000000000003','Lanna EdTech — monthly support', 3500000, 'monthly','active', date_trunc('month', current_date)::date, current_date + 27, date_trunc('month', current_date)::date, true, 'Monthly support retainer'),
  ('80000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000002',null,                                   'Krua Thai — automation retainer', 4000000, 'monthly','active', current_date, current_date + 30, null, true, 'Monthly automation retainer')
on conflict (id) do nothing;
