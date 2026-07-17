# Change: Parts Pricing Catalog + Quotation-from-Parts (CR-002)

Status: **IMPLEMENTED — all 8 subtasks shipped to `dev` on 2026-07-17**
(ST-1 `9aef247`, ST-3 `627d2eb`, ST-2 `64f71ca`, ST-8 `487d305`, ST-4
`232c61b`, ST-5 `3c550d9`, ST-6 `7e36cf3`, ST-7 `6ae2473`). Based on the
reference BOQ (`6-7-69_BOQ_5kW_OnGrid_Solar_บ้านยาภานุช+optimizer.xlsx`) and
the real sent quotation TSD11026164. One implementation deviation: the DOCX
export is generated programmatically with the `docx` library instead of
porting the legacy docxtpl binary template — same fields and layout, no
binary-template placeholder surgery. Company header/signer details for
documents live as a constant in `lib/documents/thai-quote.ts`
(`COMPANY_PROFILE`) pending an org-branding settings screen.

## Why

Every quotation you build re-types the same ~30 line items (PV modules,
inverter, mounting kit, DC/AC cable, earthing, conduit, labor) with the same
brand/spec/unit, because the parts list barely changes between jobs — only
quantities and which mounting kit applies. Today's `quotes` module
(`app/(app)/quotes/`) only supports freeform line items: description, qty,
unit price, all typed by hand every time (`quote-item-form.tsx`). There's no
concept of a part, a SKU, or a supplier anywhere in the schema.

You asked for two things:
1. A **parts pricing catalog** — one row per part (SKU), each part carrying
   **multiple prices, one per supplier**, stored both **ex-VAT** and
   **inc-VAT (7%)**.
2. A **quotation module** where your engineers **pick parts + quantities**
   from that catalog instead of retyping them, and can **duplicate an
   existing quotation** as a starting point for a new one.

## What the reference BOQ tells us about the data shape

The spreadsheet is one flat table with these columns, grouped into lettered
sections (A. Main equipment, B. Mounting structure, C. DC side, D. AC side,
E. Earthing/Grounding, F. Conduit/BOS/Misc, G. Labor & Services):

| Column | Example | Maps to |
|---|---|---|
| Description | "PV Module (N-type, Tier-1)" | `parts.name` |
| Brand / Model / Spec | "Longi Hi-MO X10 (650W)" | `parts.brand_model` |
| Phase | Both / 1-Ph / 3-Ph | `parts.phase_compat` |
| Unit | pc, set, m, pair, lot | `parts.unit` |
| Unit Cost (THB) | 3,486 | a supplier's price on `part_supplier_prices` |
| Unit Price (THB) | 4,000 | `parts.default_selling_price_satang` (suggested; editable per quote line) |
| GP % | 12.9% | computed live, not stored |
| Remark | "8 × 650W = 5.2 kWp DC" | `parts.remark` |
| Section letter (A–G) | "C. DC SIDE" | `parts.category` |

The sheet doesn't currently track *which supplier* each cost came from or a
VAT split — that's the actual gap this catalog closes.

## Proposed schema

Two new tables plus one extension to the existing `quote_items` table. Same
conventions as the rest of the schema: `org_id` on every table, RLS
enabled+forced via `private.is_org_member(org_id)`, money as integer satang,
`updated_at` trigger.

```sql
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

create table suppliers (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references organizations(id) on delete cascade,
  name          text not null,
  contact_name  text,
  phone         text,
  email         text,
  notes         text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, name)
);

create table parts (
  id                            uuid primary key default gen_random_uuid(),
  org_id                        uuid not null references organizations(id) on delete cascade,
  sku                           text not null,
  name                          text not null,          -- "PV Module (N-type, Tier-1)"
  brand_model                   text,                    -- "Longi Hi-MO X10 (650W)"
  category                      part_category not null default 'other',
  unit                          text not null,           -- pc / set / m / pair / lot (free text)
  phase_compat                  text,                    -- 'both' | '1_phase' | '3_phase'
  default_selling_price_satang  bigint,                  -- ex-VAT; prefills new quote lines, still editable
  remark                        text,
  is_active                     boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, sku)
);

-- One row per (part, supplier): "SKU -> multiple prices, one per supplier."
-- Re-quoting a price is an UPDATE, not a new row — this table is current
-- pricing, not a price-history log (see the adopted defaults below).
create table part_supplier_prices (
  id                          uuid primary key default gen_random_uuid(),
  org_id                      uuid not null references organizations(id) on delete cascade,
  part_id                     uuid not null references parts(id) on delete cascade,
  supplier_id                 uuid not null references suppliers(id) on delete cascade,
  unit_cost_ex_vat_satang     bigint not null,
  unit_cost_inc_vat_satang    bigint not null,   -- stored as entered, not derived — see the adopted defaults below
  is_preferred                boolean not null default false,  -- headline supplier shown by default when adding to a quote
  effective_date              date not null default current_date,
  notes                       text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, part_id, supplier_id)
);

-- Extends the EXISTING quote_items table (no new table for line items —
-- freeform lines like custom labor or one-off discounts still work exactly
-- as they do today, part_id is just optional).
alter table quote_items
  add column part_id                 uuid references parts(id) on delete set null,
  add column part_supplier_price_id  uuid references part_supplier_prices(id) on delete set null,
  add column unit_cost_satang        bigint;  -- snapshot of the chosen supplier's ex-VAT cost at add-time, for GP%
```

Snapshotting `unit_cost_satang` (and effectively the whole line) onto
`quote_items` at the moment a part is added means a quote stays accurate
even if you later renegotiate a supplier's price — exactly like
`selectHeadlineQuote()` already treats issued quotes as frozen snapshots,
not live-recalculated views.

## UI/UX

**New nav item**: `Parts` — placed right after `Quotes` in `components/nav.ts`
(it's a catalog that exists to feed Quotes, not a peer-weight destination
like Projects/Clients). No separate top-level `Suppliers` menu — supplier
management is a simple tab/sub-page under Parts (`/parts/suppliers`), same
"don't add a menu for every table" restraint used elsewhere in this app.

**`/parts`** — list grouped by category (the BOQ's A–G sections), searchable
by SKU/name/brand. Each row shows name, unit, category, and its preferred
supplier's price. "+ New part" opens a form (name, SKU, brand/model,
category, unit, phase, remark, default selling price).

**`/parts/[id]`** — part detail: the fields above, plus a **Supplier
prices** table (supplier, cost ex-VAT, cost inc-VAT, preferred toggle,
effective date) with inline add/edit — this is where "SKU → multiple
supplier prices" actually lives.

**`/parts/suppliers`** — plain CRUD list (name, contact, phone, email),
mirroring the existing `Clients` list pattern.

**Quote editor (`quotes/[id]`)** — the current freeform "add item" form
(`quote-item-form.tsx`) gets a sibling: an **"Add from parts"** combobox
(search by SKU/name) alongside the existing manual-entry form, not replacing
it — freeform lines stay for one-off items (custom labor, discounts, notes)
that will never be in the catalog. Picking a part:
- lets the engineer choose which supplier's price to use (defaults to
  `is_preferred`),
- prefills description from `parts.name` + `brand_model`,
- prefills the selling price from `parts.default_selling_price_satang`
  (editable — real quotes negotiate),
- snapshots `unit_cost_satang` for a live GP% shown next to the line, same
  idea as the BOQ's GP% column, computed by a new pure, unit-tested
  `lib/quotes/margin.ts` (not stored) — following this repo's TDD convention
  ([[feedback_tdd_workflow]]) and the "extract pure `lib/` logic, leave
  components thin" pattern from CR-001.

**Duplicate quote** — a "Duplicate" button on `quotes/[id]` creates a new
`draft` quote (new auto-numbered `number`, today's `issue_date`, same
client/project/notes) and copies every `quote_items` row 1:1 (including
`part_id`/`part_supplier_price_id`/`unit_cost_satang`), then redirects to
the new quote for editing. This is the "quicker edit" workflow — start from
the closest past job, adjust quantities/client, done.

## Decisions (resolved with Max, 2026-07-17)

1. **Cost/margin visibility: everyone equal.** All org members (owner,
   admin, member) can see supplier costs, `unit_cost_satang`, and GP% — no
   role-gated RLS on the new tables. Same single org-membership policy
   pattern as every other table. Revisit only if a restricted role is ever
   added.
2. **Seed the BOQ as the starting catalog — parts only, no prices.** All
   ~31 BOQ rows are seeded into `parts` with their identity fields (name,
   brand/model, category A–G, unit, phase, remark) but **no pricing at
   all**: `default_selling_price_satang` stays null and zero
   `part_supplier_prices` rows are created. Max will enter real supplier
   prices through the UI once it exists — which conveniently means no
   placeholder supplier is needed and the "which supplier does the BOQ cost
   belong to" question disappears.

## Defaults adopted for the remaining open points (say so if any is wrong)

- **Selling price default is manually set per part** (like the BOQ's "Unit
  Price" column), not auto-computed from cost + markup %. Simpler to build;
  a markup rule can be layered on later without schema change.
- **Both ex-VAT and inc-VAT costs are persisted as entered** (not one
  derived from the other via ×1.07), since suppliers quote either way and
  round differently than a clean 7% calc.
- **No price history in v1** — one current price per (part, supplier);
  updating a cost overwrites it. A history table is an easy follow-up if
  cost-trend reporting is ever wanted.
- **No special modeling for mutually-exclusive alternates** (the BOQ's
  "select ONE mounting kit per roof type"): the engineer leaves the
  non-applicable kits' quantities at 0 on the quote, same manual judgment
  call as today's spreadsheet. A conscious scope cut, not an oversight.

## Quotation module — expanded scope (added 2026-07-17)

After reviewing a real sent quotation (TSD11026164, Panuch — the PDF and
the existing `quotation_template.docx` + `render_quotation.py` docxtpl
pipeline in the ABA Quotation folder), Max confirmed five additions on top
of the catalog picker + duplicate-quote base:

### 1. Per-line % price adjustment (Max's explicit ask)

When a line comes from the catalog, the engineer can adjust its price by a
percentage instead of retyping a number:

```sql
alter table quote_items
  add column base_unit_price_satang bigint,        -- snapshot of the part's catalog selling price at add-time
  add column adjustment_pct         numeric(6,2);  -- e.g. -5.00 or 12.50; null = no adjustment
```

`unit_price_satang = round(base_unit_price_satang × (1 + adjustment_pct/100))`
— computed in a pure, TDD'd `lib/quotes/pricing.ts`. Typing a manual price
directly clears `adjustment_pct` (manual wins). Freeform lines (no
`part_id`) have no base price and no % field.

### 2. Bundle / system lines (matches the real quotation's structure)

The customer-facing quote shows **one priced parent line** ("Solar Rooftop
System — Huawei 5.2 kW 1-phase · ฿156,135") with its component parts listed
below as qty/unit-only sub-lines (1.1–1.11), prices hidden. Internally each
component still references its catalog part so costs/GP% roll up.

```sql
alter table quote_items
  add column parent_item_id uuid references quote_items(id) on delete cascade,
  add column unit           text;   -- ชุด / แผง / เครื่อง / งาน — copied from parts.unit, editable
```

Rules: child lines are excluded from quote totals (the parent's amount is
authoritative); one level deep only (a child can't have children); the
parent's price is either typed directly or "sum children's catalog prices,
then adjust" via a helper button. Roll-up math lives in the same pure
`lib/quotes/pricing.ts`.

### 3. Payment schedule

```sql
alter table quotes add column deposit_pct numeric(5,2) not null default 50;
```

v1 keeps the real-world shape: two installments — deposit (`deposit_pct`%
to confirm the order) and balance on completion — with baht amounts
computed from the total and printed in the T&C block, exactly like งวดที่ 1/2
on TSD11026164. More than two installments is a later follow-up if ever
needed.

### 4. Quote templates / packages

A template is just a quote flagged `is_template` — "Save as template" and
"New from template" both reuse the duplicate-quote machinery (ST-5), so
this costs one column, not a new table:

```sql
alter table quotes
  add column is_template boolean not null default false,
  alter column client_id drop not null,
  add constraint quotes_client_required_unless_template
    check (is_template or client_id is not null);
```

Templates (e.g. "5 kW 1-phase Huawei package") are hidden from the normal
quotes list, live under a "Templates" tab on `/quotes`, and carry no
client. "New from template" copies items 1:1 and asks for the client/
project.

### 5. Thai-format output: printable + editable Word file

Two outputs from the same data, replacing the current generic English
printable for quotes:

- **Thai HTML printable** (`/quotes/[id]/pdf`, existing route rebuilt):
  layout matching TSD11026164 — Thai labels, Buddhist-calendar dates,
  bundle rows with unpriced sub-lines, discount row, VAT row, grand total
  in Thai words (ตัวอักษร), payment schedule, warranty/T&C block,
  signature/stamp area.
- **DOCX export** (`/quotes/[id]/docx`, new route): generates an editable
  Word file via `docxtemplater` from a template adapted from the existing
  `quotation_template.docx` (its docxtpl context — items/sub_items,
  subtotal/vat/grand_total/grand_total_text, warranty years — is already
  the exact data contract; we port the placeholders to docxtemplater
  syntax and keep the layout). This is the "fix small details right away"
  escape hatch: download, tweak in Word, send.

Supporting pure libs, both TDD'd: `lib/thai/baht-text.ts` (satang → Thai
words) and `lib/thai/buddhist-date.ts` (ISO date → "07 ก.ค. 2569").

VAT on the quote gets an explicit mode instead of today's implicit
nothing:

```sql
create type quote_vat_mode as enum ('none', 'add_7');
alter table quotes add column vat_mode quote_vat_mode not null default 'add_7';
```

Warranty/terms text: `quotes.terms text` — prefilled from the duplicated
quote/template (which is how terms realistically get reused), freely
editable per quote. No org-level settings screen in v1.

## Non-goals for v1

- Invoices are untouched — quote totals gain a VAT row and bundle-aware
  math (children excluded), but `invoice_items` and invoice PDFs keep
  working exactly as today. Converting an accepted quote to an invoice
  copies lines as it does now (bundle parents become plain lines).
- No purchase-order / inventory / stock-level tracking — this is a price
  list for quoting, not procurement.
- No automatic re-pricing of already-issued quotes when a supplier price
  changes (snapshotting is intentional, see above).

## Suggested subtask breakdown (mirrors CR-001's ST-1..ST-8 pattern, which worked well)

- **ST-1**: Schema — `suppliers`, `parts`, `part_supplier_prices`,
  `part_category` enum; `quote_items` extension (part refs + cost snapshot
  + `base_unit_price_satang`/`adjustment_pct` + `parent_item_id`/`unit`);
  `quotes` extension (`deposit_pct`, `is_template` + nullable client,
  `vat_mode`, `terms`); RLS policies.
- **ST-2**: Parts & Suppliers CRUD UI (`/parts`, `/parts/[id]`,
  `/parts/suppliers`).
- **ST-3**: Pure quote math libs, all TDD — `lib/quotes/margin.ts` (GP%),
  `lib/quotes/pricing.ts` (% adjustment, bundle roll-up, bundle-aware
  totals + VAT + payment split), `lib/thai/baht-text.ts`,
  `lib/thai/buddhist-date.ts`.
- **ST-4**: Quote editor — "Add from parts" picker with supplier-price
  choice, per-line % adjustment, live GP%, bundle create/group UI,
  snapshot logic in `addQuoteItem`.
- **ST-5**: Duplicate quote + templates ("Save as template" / "New from
  template" / Templates tab) + e2e tests.
- **ST-6**: Thai printable rebuild (`/quotes/[id]/pdf`) — bundles, VAT,
  discount, Thai-words total, payment schedule, T&C, signature block.
- **ST-7**: DOCX export route (`/quotes/[id]/docx`) via `docxtemplater`,
  template ported from `quotation_template.docx`.
- **ST-8**: seed `parts` from the reference BOQ — all ~31 rows, identity
  fields only, no prices (per Decision 2).

This is logged as **CR-002** in Notion under the "Project Management" hub
(same place as CR-001), with this subtask breakdown and acceptance criteria:
https://app.notion.com/p/3a014e5e6a0a81269cb8f17cc0fb439c

Implementation starts on Max's go-ahead — same TDD-first, gates-verified
process as CR-001.
