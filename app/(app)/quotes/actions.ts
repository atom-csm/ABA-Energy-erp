"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"

import { createClient as createSupabaseClient } from "@/lib/supabase/server"
import { requireOrgContext, requireCapability } from "@/lib/auth"
import { bahtToSatang, formatTHBWhole } from "@/lib/money"
import {
  lineAmountSatang,
  subtotalSatang,
  documentTotalSatang,
} from "@/lib/metrics/line-items"
import { applyAdjustment } from "@/lib/quotes/pricing"
import { writeAudit } from "@/lib/audit"
import { todayISO } from "@/lib/dates"
import { nextDocumentNumber } from "@/lib/documents/numbering"

const QUOTE_STATUSES = [
  "draft",
  "sent",
  "accepted",
  "declined",
  "expired",
  "converted",
] as const

/** Empty string from an optional <input> → undefined (so zod .optional() applies). */
const optionalString = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : undefined))

/** Optional id select: "" (none) → null. */
const optionalId = z
  .string()
  .optional()
  .transform((v) => (v ? v : null))

/** Optional date (YYYY-MM-DD) from a date input: "" → null. */
const optionalDate = z
  .string()
  .optional()
  .transform((v) => (v ? v : null))

/**
 * Recompute and persist a quote's subtotal/total from its line items. The quote's
 * own discount drives the total. Runs after any item insert/delete. Returns the
 * error message on failure, or null on success.
 */
async function recomputeQuoteTotals(
  supabase: Awaited<ReturnType<typeof createSupabaseClient>>,
  orgId: string,
  quoteId: string
): Promise<string | null> {
  const { data: quote, error: quoteErr } = await supabase
    .from("quotes")
    .select("discount_satang")
    .eq("id", quoteId)
    .eq("org_id", orgId)
    .single()

  if (quoteErr || !quote) return quoteErr?.message ?? "Quote not found"

  const { data: items, error: itemsErr } = await supabase
    .from("quote_items")
    .select("amount_satang, parent_item_id")
    .eq("quote_id", quoteId)
    .eq("org_id", orgId)

  if (itemsErr) return itemsErr.message

  // Bundle children are excluded — the parent's amount is authoritative.
  const subtotal = subtotalSatang(
    (items ?? []).filter((it) => it.parent_item_id === null)
  )
  const total = documentTotalSatang(subtotal, quote.discount_satang)

  const { error: updErr } = await supabase
    .from("quotes")
    .update({ subtotal_satang: subtotal, total_satang: total })
    .eq("id", quoteId)
    .eq("org_id", orgId)

  return updErr?.message ?? null
}

// ---------------------------------------------------------------------------
// Quotes
// ---------------------------------------------------------------------------

const CreateQuote = z.object({
  client_id: z.string().min(1, "Client is required"),
  project_id: optionalId,
  number: optionalString,
  issue_date: optionalDate,
  valid_until: optionalDate,
  discountBaht: z.coerce.number().min(0, "Discount must be 0 or more").default(0),
  systemSizeKwp: z.coerce.number().min(0).optional(),
  panelModel: optionalString,
  inverterModel: optionalString,
  batteryOption: optionalString,
  warrantyYears: z.coerce.number().min(0).optional(),
  paybackYears: z.coerce.number().min(0).optional(),
  proposalAssumptions: optionalString,
  includedScope: optionalString,
  excludedScope: optionalString,
  notes: optionalString,
})

export async function createQuote(
  input: z.input<typeof CreateQuote>
): Promise<{ error?: string }> {
  const ctx = await requireOrgContext()
  const parsed = CreateQuote.safeParse(input)
  if (!parsed.success) return { error: "Invalid input" }
  const d = parsed.data

  const supabase = await createSupabaseClient()

  // Auto-generate the quote number when none was provided. Scans the org's
  // existing numbers for the current year and continues the running counter.
  // Manual numbers are used verbatim; a rare unique(org_id, number) collision
  // surfaces as the DB error below, exactly as before.
  let number = d.number
  if (!number) {
    const year = Number(todayISO().slice(0, 4))
    const { data: existing } = await supabase
      .from("quotes")
      .select("number")
      .eq("org_id", ctx.orgId)
    number = nextDocumentNumber(
      "QUO",
      (existing ?? []).map((r) => r.number),
      year
    )
  }

  const { data, error } = await supabase
    .from("quotes")
    .insert({
      org_id: ctx.orgId,
      client_id: d.client_id,
      project_id: d.project_id,
      number,
      status: "draft",
      issue_date: d.issue_date ?? undefined,
      valid_until: d.valid_until,
      discount_satang: bahtToSatang(d.discountBaht),
      subtotal_satang: 0,
      total_satang: 0,
      system_size_kwp: d.systemSizeKwp ?? null,
      panel_model: d.panelModel,
      inverter_model: d.inverterModel,
      battery_option: d.batteryOption,
      warranty_years: d.warrantyYears ?? null,
      payback_years: d.paybackYears ?? null,
      proposal_assumptions: d.proposalAssumptions,
      included_scope: d.includedScope,
      excluded_scope: d.excludedScope,
      notes: d.notes,
    })
    .select("id")
    .single()

  if (error) return { error: error.message }

  await writeAudit(ctx, {
    entity: "quote",
    entityId: data.id,
    action: "created",
    summary: `Created quote ${number}`,
  })

  revalidatePath("/quotes")
  redirect(`/quotes/${data.id}`)
}

const UpdateQuote = z.object({
  id: z.string().min(1),
  client_id: z.string().min(1, "Client is required"),
  project_id: optionalId,
  // The shared form marks number optional (create auto-numbers). On edit the
  // field is prefilled, so a blank number simply leaves the stored one untouched.
  number: optionalString,
  issue_date: optionalDate,
  valid_until: optionalDate,
  discountBaht: z.coerce.number().min(0, "Discount must be 0 or more"),
  systemSizeKwp: z.coerce.number().min(0).optional(),
  panelModel: optionalString,
  inverterModel: optionalString,
  batteryOption: optionalString,
  warrantyYears: z.coerce.number().min(0).optional(),
  paybackYears: z.coerce.number().min(0).optional(),
  proposalAssumptions: optionalString,
  includedScope: optionalString,
  excludedScope: optionalString,
  notes: optionalString,
})

export async function updateQuote(
  input: z.input<typeof UpdateQuote>
): Promise<{ error?: string }> {
  const ctx = await requireOrgContext()
  const parsed = UpdateQuote.safeParse(input)
  if (!parsed.success) return { error: "Invalid input" }
  const d = parsed.data

  const supabase = await createSupabaseClient()
  const { error } = await supabase
    .from("quotes")
    .update({
      client_id: d.client_id,
      project_id: d.project_id,
      ...(d.number ? { number: d.number } : {}),
      issue_date: d.issue_date ?? undefined,
      valid_until: d.valid_until,
      discount_satang: bahtToSatang(d.discountBaht),
      system_size_kwp: d.systemSizeKwp ?? null,
      panel_model: d.panelModel,
      inverter_model: d.inverterModel,
      battery_option: d.batteryOption,
      warranty_years: d.warrantyYears ?? null,
      payback_years: d.paybackYears ?? null,
      proposal_assumptions: d.proposalAssumptions,
      included_scope: d.includedScope,
      excluded_scope: d.excludedScope,
      notes: d.notes,
    })
    .eq("id", d.id)
    .eq("org_id", ctx.orgId)

  if (error) return { error: error.message }

  // Discount feeds the total, so recompute after a header edit.
  const recomputeErr = await recomputeQuoteTotals(supabase, ctx.orgId, d.id)
  if (recomputeErr) return { error: recomputeErr }

  revalidatePath("/quotes")
  revalidatePath(`/quotes/${d.id}`)
  return {}
}

const DeleteQuote = z.object({ id: z.string().min(1) })

export async function deleteQuote(
  input: z.input<typeof DeleteQuote>
): Promise<{ error?: string }> {
  const ctx = await requireOrgContext()
  try {
    requireCapability(ctx, "quote:delete")
  } catch {
    return { error: "Only owners and admins can delete quotes." }
  }
  const parsed = DeleteQuote.safeParse(input)
  if (!parsed.success) return { error: "Invalid input" }

  const supabase = await createSupabaseClient()
  const { error } = await supabase
    .from("quotes")
    .delete()
    .eq("id", parsed.data.id)
    .eq("org_id", ctx.orgId)

  if (error) return { error: error.message }

  await writeAudit(ctx, {
    entity: "quote",
    entityId: parsed.data.id,
    action: "deleted",
    summary: "Deleted a quote",
  })

  revalidatePath("/quotes")
  redirect("/quotes")
}

// ---------------------------------------------------------------------------
// Quote items (with totals recompute)
// ---------------------------------------------------------------------------

const AddQuoteItem = z.object({
  quote_id: z.string().min(1),
  description: z.string().trim().min(1, "Description is required"),
  quantity: z.coerce.number().positive("Quantity must be greater than 0"),
  unitPriceBaht: z.coerce.number().min(0, "Unit price must be 0 or more"),
})

export async function addQuoteItem(
  input: z.input<typeof AddQuoteItem>
): Promise<{ error?: string }> {
  const ctx = await requireOrgContext()
  const parsed = AddQuoteItem.safeParse(input)
  if (!parsed.success) return { error: "Invalid input" }
  const d = parsed.data

  const supabase = await createSupabaseClient()

  // A converted quote is locked: its items are frozen (they've become an invoice).
  const { data: parent, error: parentErr } = await supabase
    .from("quotes")
    .select("status")
    .eq("id", d.quote_id)
    .eq("org_id", ctx.orgId)
    .maybeSingle()

  if (parentErr) return { error: parentErr.message }
  if (!parent) return { error: "Quote not found" }
  if (parent.status === "converted") {
    return { error: "This quote is converted and locked" }
  }

  // Next position = current item count (stable append order).
  const { count } = await supabase
    .from("quote_items")
    .select("id", { count: "exact", head: true })
    .eq("quote_id", d.quote_id)
    .eq("org_id", ctx.orgId)

  const unitPriceSatang = bahtToSatang(d.unitPriceBaht)
  const { error } = await supabase.from("quote_items").insert({
    org_id: ctx.orgId,
    quote_id: d.quote_id,
    description: d.description,
    quantity: d.quantity,
    unit_price_satang: unitPriceSatang,
    amount_satang: lineAmountSatang(d.quantity, unitPriceSatang),
    position: count ?? 0,
  })

  if (error) return { error: error.message }

  const recomputeErr = await recomputeQuoteTotals(supabase, ctx.orgId, d.quote_id)
  if (recomputeErr) return { error: recomputeErr }

  revalidatePath(`/quotes/${d.quote_id}`)
  return {}
}

const DeleteQuoteItem = z.object({ id: z.string().min(1) })

export async function deleteQuoteItem(
  input: z.input<typeof DeleteQuoteItem>
): Promise<{ error?: string }> {
  const ctx = await requireOrgContext()
  const parsed = DeleteQuoteItem.safeParse(input)
  if (!parsed.success) return { error: "Invalid input" }

  const supabase = await createSupabaseClient()

  // Resolve the parent quote first so a converted (locked) quote can't be edited.
  const { data: item, error: findErr } = await supabase
    .from("quote_items")
    .select("id, quote_id")
    .eq("id", parsed.data.id)
    .eq("org_id", ctx.orgId)
    .maybeSingle()

  if (findErr) return { error: findErr.message }
  if (!item) return { error: "Line item not found" }

  const { data: parent, error: parentErr } = await supabase
    .from("quotes")
    .select("status")
    .eq("id", item.quote_id)
    .eq("org_id", ctx.orgId)
    .maybeSingle()

  if (parentErr) return { error: parentErr.message }
  if (parent?.status === "converted") {
    return { error: "This quote is converted and locked" }
  }

  const { error } = await supabase
    .from("quote_items")
    .delete()
    .eq("id", item.id)
    .eq("org_id", ctx.orgId)

  if (error) return { error: error.message }

  const recomputeErr = await recomputeQuoteTotals(
    supabase,
    ctx.orgId,
    item.quote_id
  )
  if (recomputeErr) return { error: recomputeErr }

  revalidatePath(`/quotes/${item.quote_id}`)
  return {}
}

// ---------------------------------------------------------------------------
// Catalog lines & bundles (CR-002 ST-4)
// ---------------------------------------------------------------------------

/** Shared "quote exists and isn't converted" guard for item mutations. */
async function requireEditableQuote(
  supabase: Awaited<ReturnType<typeof createSupabaseClient>>,
  orgId: string,
  quoteId: string
): Promise<string | null> {
  const { data: quote, error } = await supabase
    .from("quotes")
    .select("status")
    .eq("id", quoteId)
    .eq("org_id", orgId)
    .maybeSingle()

  if (error) return error.message
  if (!quote) return "Quote not found"
  if (quote.status === "converted") return "This quote is converted and locked"
  return null
}

const AddPartQuoteItem = z.object({
  quote_id: z.string().uuid(),
  part_id: z.string().uuid(),
  supplier_price_id: optionalId,
  parent_item_id: optionalId,
  quantity: z.coerce.number().positive("Quantity must be greater than 0"),
  adjustmentPct: z.coerce.number().min(-100).max(1000).optional(),
})

/**
 * Add a line from the parts catalog. The part's default selling price is
 * snapshotted as the base, the optional % adjustment computes the actual
 * unit price, and the chosen supplier's ex-VAT cost is snapshotted for GP%.
 * Everything is resolved server-side so the client can't fabricate a cost.
 */
export async function addPartQuoteItem(
  input: z.input<typeof AddPartQuoteItem>
): Promise<{ error?: string }> {
  const ctx = await requireOrgContext()
  const parsed = AddPartQuoteItem.safeParse(input)
  if (!parsed.success) return { error: "Invalid input" }
  const d = parsed.data

  const supabase = await createSupabaseClient()

  const lockErr = await requireEditableQuote(supabase, ctx.orgId, d.quote_id)
  if (lockErr) return { error: lockErr }

  const { data: part, error: partErr } = await supabase
    .from("parts")
    .select(
      "id, name, brand_model, unit, default_selling_price_satang, part_supplier_prices(id, unit_cost_ex_vat_satang, is_preferred)"
    )
    .eq("id", d.part_id)
    .eq("org_id", ctx.orgId)
    .maybeSingle()

  if (partErr) return { error: partErr.message }
  if (!part) return { error: "Part not found" }

  // Supplier cost snapshot: the requested price row, else the preferred one,
  // else the only/first one, else no cost (GP% just won't show).
  const prices = part.part_supplier_prices
  const chosen = d.supplier_price_id
    ? prices.find((p) => p.id === d.supplier_price_id)
    : (prices.find((p) => p.is_preferred) ?? prices[0])
  if (d.supplier_price_id && !chosen) {
    return { error: "Supplier price not found for this part" }
  }

  // One level deep: a child's parent must be a top-level line on this quote.
  if (d.parent_item_id) {
    const { data: parentItem, error: parentItemErr } = await supabase
      .from("quote_items")
      .select("id, quote_id, parent_item_id")
      .eq("id", d.parent_item_id)
      .eq("org_id", ctx.orgId)
      .maybeSingle()
    if (parentItemErr) return { error: parentItemErr.message }
    if (!parentItem || parentItem.quote_id !== d.quote_id) {
      return { error: "Bundle not found on this quote" }
    }
    if (parentItem.parent_item_id !== null) {
      return { error: "Bundles can only be one level deep" }
    }
  }

  const base = part.default_selling_price_satang ?? 0
  const adjustmentPct = d.adjustmentPct ?? null
  const unitPriceSatang = applyAdjustment(base, adjustmentPct)

  const { count } = await supabase
    .from("quote_items")
    .select("id", { count: "exact", head: true })
    .eq("quote_id", d.quote_id)
    .eq("org_id", ctx.orgId)

  const { error } = await supabase.from("quote_items").insert({
    org_id: ctx.orgId,
    quote_id: d.quote_id,
    description: part.brand_model ? `${part.name} — ${part.brand_model}` : part.name,
    quantity: d.quantity,
    unit: part.unit,
    unit_price_satang: unitPriceSatang,
    amount_satang: lineAmountSatang(d.quantity, unitPriceSatang),
    position: count ?? 0,
    part_id: part.id,
    part_supplier_price_id: chosen?.id ?? null,
    unit_cost_satang: chosen?.unit_cost_ex_vat_satang ?? null,
    base_unit_price_satang: base,
    adjustment_pct: adjustmentPct,
    parent_item_id: d.parent_item_id,
  })

  if (error) return { error: error.message }

  const recomputeErr = await recomputeQuoteTotals(supabase, ctx.orgId, d.quote_id)
  if (recomputeErr) return { error: recomputeErr }

  revalidatePath(`/quotes/${d.quote_id}`)
  return {}
}

const AddBundleItem = z.object({
  quote_id: z.string().uuid(),
  description: z.string().trim().min(1, "Description is required"),
  unitPriceBaht: z.coerce.number().min(0),
})

/**
 * Add a bundle parent line — the one priced row the customer sees (e.g.
 * "Solar Rooftop System — Huawei 5.2 kW 1-phase"), with catalog parts added
 * under it as unpriced component lines.
 */
export async function addBundleItem(
  input: z.input<typeof AddBundleItem>
): Promise<{ error?: string }> {
  const ctx = await requireOrgContext()
  const parsed = AddBundleItem.safeParse(input)
  if (!parsed.success) return { error: "Invalid input" }
  const d = parsed.data

  const supabase = await createSupabaseClient()

  const lockErr = await requireEditableQuote(supabase, ctx.orgId, d.quote_id)
  if (lockErr) return { error: lockErr }

  const { count } = await supabase
    .from("quote_items")
    .select("id", { count: "exact", head: true })
    .eq("quote_id", d.quote_id)
    .eq("org_id", ctx.orgId)

  const unitPriceSatang = bahtToSatang(d.unitPriceBaht)
  const { error } = await supabase.from("quote_items").insert({
    org_id: ctx.orgId,
    quote_id: d.quote_id,
    description: d.description,
    quantity: 1,
    unit: "ชุด",
    unit_price_satang: unitPriceSatang,
    amount_satang: unitPriceSatang,
    position: count ?? 0,
  })

  if (error) return { error: error.message }

  const recomputeErr = await recomputeQuoteTotals(supabase, ctx.orgId, d.quote_id)
  if (recomputeErr) return { error: recomputeErr }

  revalidatePath(`/quotes/${d.quote_id}`)
  return {}
}

/**
 * Set a bundle parent's price to the sum of its children's amounts (each
 * child's qty × its catalog-derived unit price) — the "sum children, then
 * adjust by hand if needed" helper.
 */
export async function setBundlePriceFromChildren(
  itemId: string
): Promise<{ error?: string }> {
  const ctx = await requireOrgContext()

  const supabase = await createSupabaseClient()

  const { data: parent, error: findErr } = await supabase
    .from("quote_items")
    .select("id, quote_id, parent_item_id")
    .eq("id", itemId)
    .eq("org_id", ctx.orgId)
    .maybeSingle()

  if (findErr) return { error: findErr.message }
  if (!parent) return { error: "Line item not found" }
  if (parent.parent_item_id !== null) return { error: "Not a bundle line" }

  const lockErr = await requireEditableQuote(supabase, ctx.orgId, parent.quote_id)
  if (lockErr) return { error: lockErr }

  const { data: children, error: childErr } = await supabase
    .from("quote_items")
    .select("amount_satang")
    .eq("parent_item_id", parent.id)
    .eq("org_id", ctx.orgId)

  if (childErr) return { error: childErr.message }
  if (!children || children.length === 0) {
    return { error: "This bundle has no component lines yet" }
  }

  const total = children.reduce((acc, c) => acc + c.amount_satang, 0)
  const { error } = await supabase
    .from("quote_items")
    .update({ unit_price_satang: total, amount_satang: total })
    .eq("id", parent.id)
    .eq("org_id", ctx.orgId)

  if (error) return { error: error.message }

  const recomputeErr = await recomputeQuoteTotals(
    supabase,
    ctx.orgId,
    parent.quote_id
  )
  if (recomputeErr) return { error: recomputeErr }

  revalidatePath(`/quotes/${parent.quote_id}`)
  return {}
}

// ---------------------------------------------------------------------------
// Duplicate & templates (CR-002 ST-5)
// ---------------------------------------------------------------------------

/**
 * Copy a quote (or template) into a new draft: fresh auto number, today's
 * issue date, items copied 1:1 including part refs, cost snapshots, %
 * adjustments, and bundle structure (parents first, then children remapped).
 * Templates are numbered TPL-… so they don't consume real QUO numbers.
 */
async function copyQuote(
  supabase: Awaited<ReturnType<typeof createSupabaseClient>>,
  ctx: { orgId: string; userId: string },
  sourceId: string,
  opts: {
    isTemplate: boolean
    clientId: string | null
    projectId: string | null
  }
): Promise<{ error?: string; id?: string }> {
  const { data: source, error: srcErr } = await supabase
    .from("quotes")
    .select(
      "discount_satang, subtotal_satang, total_satang, notes, terms, vat_mode, deposit_pct, system_size_kwp, panel_model, inverter_model, battery_option, warranty_years, payback_years, proposal_assumptions, included_scope, excluded_scope"
    )
    .eq("id", sourceId)
    .eq("org_id", ctx.orgId)
    .maybeSingle()

  if (srcErr) return { error: srcErr.message }
  if (!source) return { error: "Quote not found" }

  const { data: items, error: itemsErr } = await supabase
    .from("quote_items")
    .select(
      "id, description, quantity, unit, unit_price_satang, amount_satang, position, parent_item_id, part_id, part_supplier_price_id, unit_cost_satang, base_unit_price_satang, adjustment_pct"
    )
    .eq("quote_id", sourceId)
    .eq("org_id", ctx.orgId)
    .order("position", { ascending: true })

  if (itemsErr) return { error: itemsErr.message }

  const year = Number(todayISO().slice(0, 4))
  const prefix = opts.isTemplate ? "TPL" : "QUO"
  const { data: existing } = await supabase
    .from("quotes")
    .select("number")
    .eq("org_id", ctx.orgId)
  const number = nextDocumentNumber(
    prefix,
    (existing ?? []).map((r) => r.number),
    year
  )

  const { data: created, error: insErr } = await supabase
    .from("quotes")
    .insert({
      org_id: ctx.orgId,
      client_id: opts.clientId,
      project_id: opts.projectId,
      number,
      status: "draft",
      issue_date: todayISO(),
      valid_until: null,
      is_template: opts.isTemplate,
      owner: ctx.userId,
      discount_satang: source.discount_satang,
      subtotal_satang: source.subtotal_satang,
      total_satang: source.total_satang,
      notes: source.notes,
      terms: source.terms,
      vat_mode: source.vat_mode,
      deposit_pct: source.deposit_pct,
      system_size_kwp: source.system_size_kwp,
      panel_model: source.panel_model,
      inverter_model: source.inverter_model,
      battery_option: source.battery_option,
      warranty_years: source.warranty_years,
      payback_years: source.payback_years,
      proposal_assumptions: source.proposal_assumptions,
      included_scope: source.included_scope,
      excluded_scope: source.excluded_scope,
    })
    .select("id")
    .single()

  if (insErr) return { error: insErr.message }

  const allItems = items ?? []
  const parents = allItems.filter((it) => it.parent_item_id === null)
  const children = allItems.filter((it) => it.parent_item_id !== null)

  const itemPayload = (it: (typeof allItems)[number]) => ({
    org_id: ctx.orgId,
    quote_id: created.id,
    description: it.description,
    quantity: it.quantity,
    unit: it.unit,
    unit_price_satang: it.unit_price_satang,
    amount_satang: it.amount_satang,
    position: it.position,
    part_id: it.part_id,
    part_supplier_price_id: it.part_supplier_price_id,
    unit_cost_satang: it.unit_cost_satang,
    base_unit_price_satang: it.base_unit_price_satang,
    adjustment_pct: it.adjustment_pct,
  })

  // Insert parents one-by-one: positions can collide after deletes, so the
  // old→new id mapping has to come from each insert directly.
  const idMap = new Map<string, string>()
  for (const parent of parents) {
    const { data: inserted, error: parErr } = await supabase
      .from("quote_items")
      .insert(itemPayload(parent))
      .select("id")
      .single()

    if (parErr) return { error: parErr.message }
    idMap.set(parent.id, inserted.id)
  }

  if (children.length > 0) {
    const { error: childErr } = await supabase.from("quote_items").insert(
      children.map((it) => ({
        ...itemPayload(it),
        parent_item_id: idMap.get(it.parent_item_id as string) ?? null,
      }))
    )
    if (childErr) return { error: childErr.message }
  }

  return { id: created.id }
}

export async function duplicateQuote(id: string): Promise<{ error?: string }> {
  const ctx = await requireOrgContext()
  const supabase = await createSupabaseClient()

  const { data: source } = await supabase
    .from("quotes")
    .select("client_id, project_id, is_template")
    .eq("id", id)
    .eq("org_id", ctx.orgId)
    .maybeSingle()
  if (!source) return { error: "Quote not found" }

  const res = await copyQuote(supabase, ctx, id, {
    isTemplate: false,
    clientId: source.client_id,
    projectId: source.project_id,
  })
  if (res.error || !res.id) return { error: res.error ?? "Copy failed" }

  revalidatePath("/quotes")
  redirect(`/quotes/${res.id}`)
}

export async function saveQuoteAsTemplate(
  id: string
): Promise<{ error?: string }> {
  const ctx = await requireOrgContext()
  const supabase = await createSupabaseClient()

  const res = await copyQuote(supabase, ctx, id, {
    isTemplate: true,
    clientId: null,
    projectId: null,
  })
  if (res.error || !res.id) return { error: res.error ?? "Copy failed" }

  revalidatePath("/quotes")
  revalidatePath("/quotes/templates")
  redirect(`/quotes/${res.id}`)
}

const CreateFromTemplate = z.object({
  template_id: z.string().uuid(),
  client_id: z.string().min(1, "Client is required"),
  project_id: optionalId,
})

export async function createQuoteFromTemplate(
  input: z.input<typeof CreateFromTemplate>
): Promise<{ error?: string }> {
  const ctx = await requireOrgContext()
  const parsed = CreateFromTemplate.safeParse(input)
  if (!parsed.success) return { error: "Invalid input" }
  const d = parsed.data

  const supabase = await createSupabaseClient()

  const { data: template } = await supabase
    .from("quotes")
    .select("id, is_template")
    .eq("id", d.template_id)
    .eq("org_id", ctx.orgId)
    .maybeSingle()
  if (!template || !template.is_template) {
    return { error: "Template not found" }
  }

  const res = await copyQuote(supabase, ctx, d.template_id, {
    isTemplate: false,
    clientId: d.client_id,
    projectId: d.project_id,
  })
  if (res.error || !res.id) return { error: res.error ?? "Copy failed" }

  revalidatePath("/quotes")
  redirect(`/quotes/${res.id}`)
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

const SetQuoteStatus = z.object({
  id: z.string().min(1),
  status: z.enum(QUOTE_STATUSES),
})

export async function setQuoteStatus(
  input: z.input<typeof SetQuoteStatus>
): Promise<{ error?: string }> {
  const ctx = await requireOrgContext()
  const parsed = SetQuoteStatus.safeParse(input)
  if (!parsed.success) return { error: "Invalid input" }
  const d = parsed.data

  const supabase = await createSupabaseClient()
  const { data: quote, error } = await supabase
    .from("quotes")
    .update({ status: d.status })
    .eq("id", d.id)
    .eq("org_id", ctx.orgId)
    .select("number")
    .single()

  if (error) return { error: error.message }

  await writeAudit(ctx, {
    entity: "quote",
    entityId: d.id,
    action: "status_changed",
    summary: `Set quote ${quote.number} to ${d.status}`,
    meta: { status: d.status },
  })

  revalidatePath("/quotes")
  revalidatePath(`/quotes/${d.id}`)
  return {}
}

// ---------------------------------------------------------------------------
// Convert to invoice (owner/admin only)
// ---------------------------------------------------------------------------

const ConvertQuote = z.object({ id: z.string().min(1) })

export async function convertQuoteToInvoice(
  input: z.input<typeof ConvertQuote>
): Promise<{ error?: string }> {
  const ctx = await requireOrgContext()
  try {
    requireCapability(ctx, "quote:convert")
  } catch {
    return { error: "Only owners and admins can convert quotes." }
  }
  const parsed = ConvertQuote.safeParse(input)
  if (!parsed.success) return { error: "Invalid input" }

  const supabase = await createSupabaseClient()

  const { data: quote, error: quoteErr } = await supabase
    .from("quotes")
    .select(
      "id, number, status, client_id, project_id, total_satang, converted_invoice_id"
    )
    .eq("id", parsed.data.id)
    .eq("org_id", ctx.orgId)
    .single()

  if (quoteErr || !quote) return { error: "Quote not found" }
  if (quote.converted_invoice_id) {
    return { error: "This quote has already been converted." }
  }
  if (!quote.client_id) {
    return { error: "This quote has no client, so it can't be converted." }
  }

  const today = todayISO()
  const invoiceNumber = `INV-${quote.number}`

  const { data: invoice, error: invErr } = await supabase
    .from("invoices")
    .insert({
      org_id: ctx.orgId,
      client_id: quote.client_id,
      project_id: quote.project_id,
      number: invoiceNumber,
      status: "draft",
      amount_satang: quote.total_satang,
      issue_date: today,
    })
    .select("id")
    .single()

  if (invErr) return { error: invErr.message }

  // Copy line items across to the new invoice.
  const { data: items, error: itemsErr } = await supabase
    .from("quote_items")
    .select("description, quantity, unit_price_satang, amount_satang, position")
    .eq("quote_id", quote.id)
    .eq("org_id", ctx.orgId)
    .order("position", { ascending: true })

  if (itemsErr) return { error: itemsErr.message }

  if (items && items.length > 0) {
    const { error: copyErr } = await supabase.from("invoice_items").insert(
      items.map((it) => ({
        org_id: ctx.orgId,
        invoice_id: invoice.id,
        description: it.description,
        quantity: it.quantity,
        unit_price_satang: it.unit_price_satang,
        amount_satang: it.amount_satang,
        position: it.position,
      }))
    )
    if (copyErr) return { error: copyErr.message }
  }

  const { error: markErr } = await supabase
    .from("quotes")
    .update({ status: "converted", converted_invoice_id: invoice.id })
    .eq("id", quote.id)
    .eq("org_id", ctx.orgId)

  if (markErr) return { error: markErr.message }

  await writeAudit(ctx, {
    entity: "quote",
    entityId: quote.id,
    action: "converted",
    summary: `Converted quote ${quote.number} to invoice ${invoiceNumber} for ${formatTHBWhole(
      quote.total_satang
    )}`,
    meta: { invoiceId: invoice.id },
  })

  revalidatePath("/quotes")
  revalidatePath(`/quotes/${quote.id}`)
  revalidatePath("/finance")
  redirect(`/finance/invoices/${invoice.id}`)
}
