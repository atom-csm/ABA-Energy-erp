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

-- ── CRM: deals (mix of stages) ──────────────────────────────────────────────
insert into deals (id, org_id, client_id, title, stage, value_satang, expected_close_date, next_follow_up_date, source, notes, owner) values
  ('d0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001','Solar Rooftop 20.8 kWp — Kranuan',          'won',        18000000, current_date - 20, null,               'Referral','Deposit received. Moving to installation planning.','b0000000-0000-0000-0000-000000000001'),
  ('d0000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000002','Solar Rooftop 41.6 kWp — Khon Kaen',    'won',        25000000, current_date - 10, null,               'LINE OA','Approved. Site survey and installation schedule next week.','b0000000-0000-0000-0000-000000000001'),
  ('d0000000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000003','Factory Solar Survey + Proposal',      'won',        15000000, current_date - 35, null,               'Webinar','Survey completed. Preparing revised proposal.','b0000000-0000-0000-0000-000000000002'),
  ('d0000000-0000-0000-0000-000000000004','a0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000004','Home Solar Lease-to-Own Proposal', 'proposal',   22000000, current_date + 14, current_date,       'Cold outreach','Proposal sent. Follow up on roof layout and payment terms today.','b0000000-0000-0000-0000-000000000001'),
  ('d0000000-0000-0000-0000-000000000005','a0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000005','Clean Energy Dashboard Pilot',       'negotiation',32000000, current_date + 7,  current_date - 2,   'Referral','Negotiating monitoring scope and pilot terms. Follow-up overdue!','b0000000-0000-0000-0000-000000000003'),
  ('d0000000-0000-0000-0000-000000000006','a0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000003','Battery / EV Charger Add-on',                 'discovery',  12000000, current_date + 30, current_date + 3,   'Webinar','Exploring battery and EV charger add-on sizing.','b0000000-0000-0000-0000-000000000002'),
  ('d0000000-0000-0000-0000-000000000007','a0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000002','After-sale Monitoring Package',     'lead',        8000000, current_date + 45, current_date + 5,   'LINE OA','New after-sale monitoring upsell from existing client.','b0000000-0000-0000-0000-000000000001'),
  ('d0000000-0000-0000-0000-000000000008','a0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000004','Solar Quote (lost)',          'lost',        9000000, current_date - 5,  null,               'Cold outreach','Lost to lower-price installer.','b0000000-0000-0000-0000-000000000001')
on conflict (id) do nothing;

-- ── CRM: activities / follow-ups ────────────────────────────────────────────
insert into activities (org_id, client_id, deal_id, type, due_date, done, body, owner) values
  ('a0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000004','d0000000-0000-0000-0000-000000000004','follow_up', current_date,     false,'Call Khun Wachira re: proposal feedback.','b0000000-0000-0000-0000-000000000001'),
  ('a0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000005','d0000000-0000-0000-0000-000000000005','call',      current_date - 2, false,'Overdue: confirm scope + budget with GreenLeaf.','b0000000-0000-0000-0000-000000000003'),
  ('a0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000003','d0000000-0000-0000-0000-000000000006','meeting',   current_date + 3, false,'Discovery call for AI tutor add-on.','b0000000-0000-0000-0000-000000000002'),
  ('a0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001',null,                                   'note',      null,             true, 'Sent thank-you note after kickoff.','b0000000-0000-0000-0000-000000000001'),
  ('a0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000002','d0000000-0000-0000-0000-000000000007','follow_up', current_date + 5, false,'Send loyalty campaign one-pager.','b0000000-0000-0000-0000-000000000001')
on conflict do nothing;

-- ── Projects (from won deals) ───────────────────────────────────────────────
insert into projects (id, org_id, deal_id, client_id, name, status, deadline, budget_satang, owner) values
  ('e0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001','Solar Install — Kranuan Showroom','in_progress', current_date + 12, 12000000,'b0000000-0000-0000-0000-000000000002'),
  ('e0000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000002','c0000000-0000-0000-0000-000000000002','Solar Install — Khon Kaen Site','not_started', current_date + 30, 16000000,'b0000000-0000-0000-0000-000000000003'),
  ('e0000000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000003','c0000000-0000-0000-0000-000000000003','Survey + Proposal — Food Processing','support', current_date - 10, 10000000,'b0000000-0000-0000-0000-000000000002'),
  ('e0000000-0000-0000-0000-000000000004','a0000000-0000-0000-0000-000000000001',null,'c0000000-0000-0000-0000-000000000005','Internal: Solar Mining Pilot','review', current_date + 5, 5000000,'b0000000-0000-0000-0000-000000000001')
on conflict (id) do nothing;

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
  ('f0000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000001','INV-2026-001','paid',          current_date - 25, current_date - 10,  9000000, false, null,     'Deposit 50% — LINE bot project'),
  ('f0000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000002','e0000000-0000-0000-0000-000000000002','INV-2026-002','sent',          current_date - 8,  current_date + 7,  12500000, false, null,     'Deposit — CRM automation'),
  ('f0000000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000004',null,                                   'INV-2026-003','overdue',       current_date - 30, current_date - 8,   5500000, false, null,     'Discovery workshop — Siam Property'),
  ('f0000000-0000-0000-0000-000000000004','a0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000003','e0000000-0000-0000-0000-000000000003','INV-2026-004','partially_paid',current_date - 15, current_date + 5,   8000000, false, null,     'Course onboarding — milestone 2'),
  ('f0000000-0000-0000-0000-000000000005','a0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000003',null,                                   'INV-2026-005','sent',          current_date - 3,  current_date + 27,  3500000, true,  'monthly','Lanna EdTech — monthly support retainer'),
  ('f0000000-0000-0000-0000-000000000006','a0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000002',null,                                   'INV-2026-006','draft',         current_date,      current_date + 30,  4000000, true,  'monthly','Krua Thai — monthly automation retainer (draft)')
on conflict (id) do nothing;

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
  ('a0000000-0000-0000-0000-000000000001','11110000-0000-0000-0000-000000000001','Solar Rooftop 20.8 kWp — Kranuan','LINE OA bot that answers FAQs, captures leads, and routes to a human.', 18000000, 25000000, 'Reusable n8n + LINE Messaging API flow. Swap the FAQ knowledge base per client.', '["Connect LINE OA channel","Import n8n flow","Load FAQ knowledge base","Set human-handoff keyword","Test on staging"]'::jsonb, array['line','bot','sales','n8n']),
  ('a0000000-0000-0000-0000-000000000001','11110000-0000-0000-0000-000000000002','n8n CRM Follow-up','Auto-creates follow-up tasks and reminders when a deal stage changes.', 12000000, 18000000, 'Webhook from CRM -> n8n -> LINE/email reminder. Map stages to cadences.', '["Expose deal webhook","Build n8n schedule","Configure reminder channel","Map stage -> cadence"]'::jsonb, array['crm','n8n','follow-up']),
  ('a0000000-0000-0000-0000-000000000001','11110000-0000-0000-0000-000000000002','Invoice Overdue Reminder','Watches invoice due dates and nudges clients before/after due.', 9000000, 15000000, 'Cron + invoices table -> templated reminders at -3/0/+3/+7 days.', '["Connect invoice source","Set reminder schedule","Write message templates","Add escalation to owner"]'::jsonb, array['finance','invoice','reminder']),
  ('a0000000-0000-0000-0000-000000000001','11110000-0000-0000-0000-000000000001','Meeting Summary Workflow','Transcribes a call and posts an AI summary + action items to LINE.', 8000000, 12000000, 'Whisper -> LLM summary -> LINE/Notion. Great upsell after a bot project.', '["Capture recording","Transcribe","Summarize + extract actions","Post to channel"]'::jsonb, array['ai','meeting','summary']),
  ('a0000000-0000-0000-0000-000000000001','11110000-0000-0000-0000-000000000003','Course & Community Onboarding','Onboards new students: welcome, drip content, and community invite.', 15000000, 20000000, 'Payment webhook -> enrol -> drip sequence -> community auto-invite.', '["Hook payment provider","Build welcome sequence","Schedule drip content","Auto-invite to community"]'::jsonb, array['education','onboarding','community'])
on conflict do nothing;

-- ── V3: Quotations + line items ─────────────────────────────────────────────
insert into quotes (id, org_id, client_id, project_id, number, status, issue_date, valid_until, subtotal_satang, discount_satang, total_satang, notes, owner) values
  ('90000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000002','e0000000-0000-0000-0000-000000000002','QUO-2026-001','sent',    current_date - 4, current_date + 26, 17000000, 1000000, 16000000, 'CRM automation proposal — build + training', 'b0000000-0000-0000-0000-000000000001'),
  ('90000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000001','QUO-2026-002','accepted',current_date - 9, current_date + 14,  8000000,       0,  8000000, 'LINE bot — phase 2 scope', 'b0000000-0000-0000-0000-000000000002')
on conflict (id) do nothing;

insert into quote_items (org_id, quote_id, description, quantity, unit_price_satang, amount_satang, position) values
  ('a0000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000001','CRM automation build (n8n + CRM)', 1, 15000000, 15000000, 0),
  ('a0000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000001','Team training session',            2,  1000000,  2000000, 1),
  ('a0000000-0000-0000-0000-000000000001','90000000-0000-0000-0000-000000000002','LINE bot — phase 2 build',         1,  8000000,  8000000, 0)
on conflict do nothing;

-- ── V3: Invoice line items (sum to the invoice amount) ──────────────────────
insert into invoice_items (org_id, invoice_id, description, quantity, unit_price_satang, amount_satang, position) values
  ('a0000000-0000-0000-0000-000000000001','f0000000-0000-0000-0000-000000000001','Discovery & conversation-flow design', 1, 4000000, 4000000, 0),
  ('a0000000-0000-0000-0000-000000000001','f0000000-0000-0000-0000-000000000001','LINE bot build (50% deposit)',         1, 5000000, 5000000, 1),
  ('a0000000-0000-0000-0000-000000000001','f0000000-0000-0000-0000-000000000002','CRM automation — deposit',             1, 12500000, 12500000, 0)
on conflict do nothing;

-- ── V3: Timesheets ──────────────────────────────────────────────────────────
insert into time_entries (org_id, project_id, task_id, user_id, work_date, minutes, billable, rate_satang, notes) values
  ('a0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000001',null,'b0000000-0000-0000-0000-000000000002', current_date - 5, 240, true, 100000, 'Conversation flow design'),
  ('a0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000001',null,'b0000000-0000-0000-0000-000000000002', current_date - 3, 180, true, 100000, 'n8n webhook wiring'),
  ('a0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000001',null,'b0000000-0000-0000-0000-000000000003', current_date - 1, 300, true,  80000, 'LINE integration + tests'),
  ('a0000000-0000-0000-0000-000000000001','e0000000-0000-0000-0000-000000000003',null,'b0000000-0000-0000-0000-000000000002', current_date - 2, 120, false,   null, 'Monthly solar performance check-in (non-billable)')
on conflict do nothing;

-- ── V3: Subscriptions (recurring billing → feeds MRR) ───────────────────────
insert into subscriptions (id, org_id, client_id, project_id, name, amount_satang, interval, status, start_date, next_run_date, last_generated_on, auto_generate, notes) values
  ('80000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000003','e0000000-0000-0000-0000-000000000003','Lanna EdTech — monthly support', 3500000, 'monthly','active', date_trunc('month', current_date)::date, current_date + 27, date_trunc('month', current_date)::date, true, 'Monthly support retainer'),
  ('80000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000001','c0000000-0000-0000-0000-000000000002',null,                                   'Krua Thai — automation retainer', 4000000, 'monthly','active', current_date, current_date + 30, null, true, 'Monthly automation retainer')
on conflict (id) do nothing;
