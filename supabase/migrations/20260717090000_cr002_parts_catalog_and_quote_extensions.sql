-- CR-002: Parts pricing catalog + quotation-from-parts (ST-1)
-- New: suppliers, parts, part_supplier_prices. Extends quote_items (catalog
-- refs, cost snapshot, % price adjustment, bundle parent/child, unit) and
-- quotes (payment split, templates, VAT mode, terms). Conventions match the
-- rest of the schema: money is bigint satang, org_id on every table, RLS
-- enabled + forced with org-scoped policies via private.is_org_member(org_id),
-- and an updated_at trigger per table.

-- ── Enums ───────────────────────────────────────────────────────────────────
-- Categories mirror the BOQ's lettered sections A–G.
create type part_category as enum (
  'pv_modules_inverter',   -- A
  'mounting_structure',    -- B
  'dc_side',               -- C
  'ac_side',               -- D
  'earthing_grounding',    -- E
  'conduit_bos_misc',      -- F
  'labor_services',        -- G
  'other'
);

create type quote_vat_mode as enum ('none', 'add_7');

-- ── Suppliers ───────────────────────────────────────────────────────────────
create table suppliers (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references organizations(id) on delete cascade,
  name         text not null,
  contact_name text,
  phone        text,
  email        text,
  notes        text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, name)
);

-- ── Parts catalog ───────────────────────────────────────────────────────────
-- One row per part (SKU). Selling price is a manually-set suggestion that
-- prefills new quote lines; costs live per-supplier in part_supplier_prices.
create table parts (
  id                           uuid primary key default gen_random_uuid(),
  org_id                       uuid not null references organizations(id) on delete cascade,
  sku                          text not null,
  name                         text not null,
  brand_model                  text,
  category                     part_category not null default 'other',
  unit                         text not null,          -- pc / set / m / pair / lot
  phase_compat                 text,                   -- 'both' | '1_phase' | '3_phase'
  default_selling_price_satang bigint,                 -- ex-VAT
  remark                       text,
  is_active                    boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, sku)
);

-- ── Supplier prices ─────────────────────────────────────────────────────────
-- One row per (part, supplier). Both VAT variants are stored as entered —
-- suppliers quote either way and round differently than a clean ×1.07.
-- Updating a price overwrites it; this is current pricing, not a history log.
create table part_supplier_prices (
  id                       uuid primary key default gen_random_uuid(),
  org_id                   uuid not null references organizations(id) on delete cascade,
  part_id                  uuid not null references parts(id) on delete cascade,
  supplier_id              uuid not null references suppliers(id) on delete cascade,
  unit_cost_ex_vat_satang  bigint not null,
  unit_cost_inc_vat_satang bigint not null,
  is_preferred             boolean not null default false,
  effective_date           date not null default current_date,
  notes                    text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, part_id, supplier_id)
);

-- ── quote_items extensions ──────────────────────────────────────────────────
-- part refs + unit_cost_satang are snapshots taken when the line is added, so
-- issued quotes never shift when catalog/supplier prices change later.
-- base_unit_price_satang + adjustment_pct drive the %-adjusted selling price
-- (computed in lib/quotes/pricing.ts; manual price entry clears the pct).
-- parent_item_id groups component lines under a priced bundle parent (one
-- level deep, enforced in the app); children are excluded from quote totals.
alter table quote_items
  add column part_id                uuid references parts(id) on delete set null,
  add column part_supplier_price_id uuid references part_supplier_prices(id) on delete set null,
  add column unit_cost_satang       bigint,
  add column base_unit_price_satang bigint,
  add column adjustment_pct         numeric(6,2),
  add column parent_item_id         uuid references quote_items(id) on delete cascade,
  add column unit                   text;

-- ── quotes extensions ───────────────────────────────────────────────────────
-- deposit_pct: two-installment payment split (deposit / on completion).
-- is_template: a template is just a flagged quote with no client, reusing the
-- duplicate machinery; hidden from the normal list.
alter table quotes
  add column deposit_pct numeric(5,2) not null default 50,
  add column is_template boolean not null default false,
  add column vat_mode    quote_vat_mode not null default 'add_7',
  add column terms       text;

alter table quotes alter column client_id drop not null;
alter table quotes add constraint quotes_client_required_unless_template
  check (is_template or client_id is not null);

-- ── updated_at triggers ─────────────────────────────────────────────────────
create trigger set_updated_at before update on suppliers            for each row execute function public.set_updated_at();
create trigger set_updated_at before update on parts                for each row execute function public.set_updated_at();
create trigger set_updated_at before update on part_supplier_prices for each row execute function public.set_updated_at();

-- ── Indexes ─────────────────────────────────────────────────────────────────
create index on suppliers            (org_id);
create index on parts                (org_id);
create index on parts                (org_id, category);
create index on part_supplier_prices (org_id);
create index on part_supplier_prices (part_id);
create index on part_supplier_prices (supplier_id);
create index on quote_items          (part_id);
create index on quote_items          (parent_item_id);
create index on quotes               (org_id, is_template);

-- ── RLS: enable + force on every new table ──────────────────────────────────
alter table suppliers            enable row level security;
alter table suppliers            force  row level security;
alter table parts                enable row level security;
alter table parts                force  row level security;
alter table part_supplier_prices enable row level security;
alter table part_supplier_prices force  row level security;

-- ── Org-scoped CRUD policies (everyone in the org sees cost/margin equally) ─
create policy suppliers_rw on suppliers
  for all to authenticated
  using (private.is_org_member(org_id)) with check (private.is_org_member(org_id));

create policy parts_rw on parts
  for all to authenticated
  using (private.is_org_member(org_id)) with check (private.is_org_member(org_id));

create policy part_supplier_prices_rw on part_supplier_prices
  for all to authenticated
  using (private.is_org_member(org_id)) with check (private.is_org_member(org_id));
