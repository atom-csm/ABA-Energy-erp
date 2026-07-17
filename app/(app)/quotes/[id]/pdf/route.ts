import { notFound } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { requireOrgContext } from "@/lib/auth"
import {
  renderThaiQuoteHtml,
  type ThaiQuoteDoc,
  type ThaiQuoteItem,
} from "@/lib/documents/thai-quote"

/**
 * GET /quotes/{id}/pdf
 * Org-scoped printable Thai quotation (CR-002 ST-6) — layout matches the
 * company's real sent quotations: bundle parents priced, component sub-rows
 * unpriced, VAT per the quote's vat_mode, Thai-words grand total, payment
 * schedule, terms, signature blocks. Self-contained HTML the browser prints
 * to PDF.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const ctx = await requireOrgContext()
  const supabase = await createClient()

  const [quoteRes, itemsRes] = await Promise.all([
    supabase
      .from("quotes")
      .select(
        "number, issue_date, valid_until, discount_satang, vat_mode, deposit_pct, terms, notes, is_template, clients(name), projects(name)"
      )
      .eq("id", id)
      .eq("org_id", ctx.orgId)
      .maybeSingle(),
    supabase
      .from("quote_items")
      .select(
        "id, description, quantity, unit, unit_price_satang, amount_satang, position, parent_item_id"
      )
      .eq("quote_id", id)
      .eq("org_id", ctx.orgId)
      .order("position", { ascending: true }),
  ])

  const quote = quoteRes.data
  if (!quote || quote.is_template) notFound()

  const all = itemsRes.data ?? []
  const items: ThaiQuoteItem[] = all
    .filter((it) => it.parent_item_id === null)
    .map((parent) => ({
      description: parent.description,
      quantity: Number(parent.quantity),
      unit: parent.unit,
      unitPriceSatang: parent.unit_price_satang,
      amountSatang: parent.amount_satang,
      children: all
        .filter((c) => c.parent_item_id === parent.id)
        .map((c) => ({
          description: c.description,
          quantity: Number(c.quantity),
          unit: c.unit,
        })),
    }))

  const doc: ThaiQuoteDoc = {
    number: quote.number,
    issueDate: quote.issue_date,
    validUntil: quote.valid_until,
    clientName: quote.clients?.name ?? "—",
    projectTitle: quote.projects?.name ?? null,
    items,
    discountSatang: quote.discount_satang,
    vatMode: quote.vat_mode,
    depositPct: Number(quote.deposit_pct),
    terms: quote.terms,
    notes: quote.notes,
  }

  return new Response(renderThaiQuoteHtml(doc), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
    },
  })
}
