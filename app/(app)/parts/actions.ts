"use server"

import { revalidatePath } from "next/cache"
import { redirect } from "next/navigation"
import { z } from "zod"

import { createClient as createSupabaseClient } from "@/lib/supabase/server"
import { requireOrgContext, requireCapability } from "@/lib/auth"
import { bahtToSatang } from "@/lib/money"
import { Constants } from "@/lib/types/database"

const PartInput = z.object({
  sku: z.string().min(1, "SKU is required"),
  name: z.string().min(1, "Name is required"),
  brandModel: z.string().optional(),
  category: z.enum(Constants.public.Enums.part_category),
  unit: z.string().min(1, "Unit is required"),
  phaseCompat: z.string().optional(),
  defaultSellingPriceBaht: z.coerce.number().min(0).optional(),
  remark: z.string().optional(),
  isActive: z.boolean().optional(),
})

export type PartInputValues = z.infer<typeof PartInput>

const SupplierInput = z.object({
  name: z.string().min(1, "Name is required"),
  contactName: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().optional(),
  notes: z.string().optional(),
})

export type SupplierInputValues = z.infer<typeof SupplierInput>

const SupplierPriceInput = z.object({
  partId: z.string().uuid(),
  supplierId: z.string().uuid(),
  unitCostExVatBaht: z.coerce.number().min(0),
  unitCostIncVatBaht: z.coerce.number().min(0),
  isPreferred: z.boolean().optional(),
  effectiveDate: z.string().optional(),
  notes: z.string().optional(),
})

export type SupplierPriceInputValues = z.infer<typeof SupplierPriceInput>

/** Empty/whitespace-only optional string → null (don't store ""). */
function nullify(value: string | undefined): string | null {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function partPayload(d: PartInputValues) {
  return {
    sku: d.sku.trim(),
    name: d.name.trim(),
    brand_model: nullify(d.brandModel),
    category: d.category,
    unit: d.unit.trim(),
    phase_compat: nullify(d.phaseCompat),
    default_selling_price_satang:
      d.defaultSellingPriceBaht !== undefined && d.defaultSellingPriceBaht > 0
        ? bahtToSatang(d.defaultSellingPriceBaht)
        : null,
    remark: nullify(d.remark),
    is_active: d.isActive ?? true,
  }
}

export async function createPart(
  input: PartInputValues
): Promise<{ error?: string }> {
  const ctx = await requireOrgContext()
  const parsed = PartInput.safeParse(input)
  if (!parsed.success) return { error: "Invalid input" }

  const supabase = await createSupabaseClient()
  const { data, error } = await supabase
    .from("parts")
    .insert({ org_id: ctx.orgId, ...partPayload(parsed.data) })
    .select("id")
    .single()

  if (error) return { error: error.message }

  revalidatePath("/parts")
  redirect(`/parts/${data.id}`)
}

export async function updatePart(
  id: string,
  input: PartInputValues
): Promise<{ error?: string }> {
  const ctx = await requireOrgContext()
  const parsed = PartInput.safeParse(input)
  if (!parsed.success) return { error: "Invalid input" }

  const supabase = await createSupabaseClient()
  const { error } = await supabase
    .from("parts")
    .update(partPayload(parsed.data))
    .eq("id", id)
    .eq("org_id", ctx.orgId)

  if (error) return { error: error.message }

  revalidatePath("/parts")
  revalidatePath(`/parts/${id}`)
  return {}
}

export async function deletePart(id: string): Promise<{ error?: string }> {
  const ctx = await requireOrgContext()
  try {
    requireCapability(ctx, "part:delete")
  } catch {
    return { error: "Only owners and admins can delete parts." }
  }

  const supabase = await createSupabaseClient()
  const { error } = await supabase
    .from("parts")
    .delete()
    .eq("id", id)
    .eq("org_id", ctx.orgId)

  if (error) return { error: error.message }

  revalidatePath("/parts")
  redirect("/parts")
}

export async function createSupplier(
  input: SupplierInputValues
): Promise<{ error?: string }> {
  const ctx = await requireOrgContext()
  const parsed = SupplierInput.safeParse(input)
  if (!parsed.success) return { error: "Invalid input" }

  const supabase = await createSupabaseClient()
  const { error } = await supabase.from("suppliers").insert({
    org_id: ctx.orgId,
    name: parsed.data.name.trim(),
    contact_name: nullify(parsed.data.contactName),
    phone: nullify(parsed.data.phone),
    email: nullify(parsed.data.email),
    notes: nullify(parsed.data.notes),
  })

  if (error) return { error: error.message }

  revalidatePath("/parts/suppliers")
  return {}
}

export async function updateSupplier(
  id: string,
  input: SupplierInputValues
): Promise<{ error?: string }> {
  const ctx = await requireOrgContext()
  const parsed = SupplierInput.safeParse(input)
  if (!parsed.success) return { error: "Invalid input" }

  const supabase = await createSupabaseClient()
  const { error } = await supabase
    .from("suppliers")
    .update({
      name: parsed.data.name.trim(),
      contact_name: nullify(parsed.data.contactName),
      phone: nullify(parsed.data.phone),
      email: nullify(parsed.data.email),
      notes: nullify(parsed.data.notes),
    })
    .eq("id", id)
    .eq("org_id", ctx.orgId)

  if (error) return { error: error.message }

  revalidatePath("/parts/suppliers")
  return {}
}

export async function deleteSupplier(id: string): Promise<{ error?: string }> {
  const ctx = await requireOrgContext()
  try {
    requireCapability(ctx, "part:delete")
  } catch {
    return { error: "Only owners and admins can delete suppliers." }
  }

  const supabase = await createSupabaseClient()
  const { error } = await supabase
    .from("suppliers")
    .delete()
    .eq("id", id)
    .eq("org_id", ctx.orgId)

  if (error) return { error: error.message }

  revalidatePath("/parts/suppliers")
  return {}
}

/**
 * Insert-or-update the price row for (part, supplier) — the table holds one
 * current price per pair, so re-quoting a supplier is an update, not a new
 * row. Marking a price preferred unmarks the part's other prices first.
 */
export async function upsertSupplierPrice(
  input: SupplierPriceInputValues
): Promise<{ error?: string }> {
  const ctx = await requireOrgContext()
  const parsed = SupplierPriceInput.safeParse(input)
  if (!parsed.success) return { error: "Invalid input" }
  const d = parsed.data

  const supabase = await createSupabaseClient()

  if (d.isPreferred) {
    const { error: clearErr } = await supabase
      .from("part_supplier_prices")
      .update({ is_preferred: false })
      .eq("part_id", d.partId)
      .eq("org_id", ctx.orgId)
    if (clearErr) return { error: clearErr.message }
  }

  const { error } = await supabase.from("part_supplier_prices").upsert(
    {
      org_id: ctx.orgId,
      part_id: d.partId,
      supplier_id: d.supplierId,
      unit_cost_ex_vat_satang: bahtToSatang(d.unitCostExVatBaht),
      unit_cost_inc_vat_satang: bahtToSatang(d.unitCostIncVatBaht),
      is_preferred: d.isPreferred ?? false,
      effective_date: d.effectiveDate || undefined,
      notes: nullify(d.notes),
    },
    { onConflict: "org_id,part_id,supplier_id" }
  )

  if (error) return { error: error.message }

  revalidatePath(`/parts/${d.partId}`)
  return {}
}

export async function deleteSupplierPrice(
  id: string,
  partId: string
): Promise<{ error?: string }> {
  const ctx = await requireOrgContext()
  try {
    requireCapability(ctx, "part:delete")
  } catch {
    return { error: "Only owners and admins can delete supplier prices." }
  }

  const supabase = await createSupabaseClient()
  const { error } = await supabase
    .from("part_supplier_prices")
    .delete()
    .eq("id", id)
    .eq("org_id", ctx.orgId)

  if (error) return { error: error.message }

  revalidatePath(`/parts/${partId}`)
  return {}
}
