import { notFound } from "next/navigation"

import { createClient } from "@/lib/supabase/server"
import { requireOrgContext } from "@/lib/auth"
import { buildThaiQuoteDocx } from "@/lib/documents/thai-quote-docx"
import type { ThaiQuoteDoc, ThaiQuoteItem } from "@/lib/documents/thai-quote"

/**
 * GET /quotes/{id}/docx
 * Editable Word export of the Thai quotation (CR-002 ST-7) — same content
 * as the printable, for the "download, fix a small detail in Word, send"
 * workflow.
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

  const buffer = await buildThaiQuoteDocx(doc)

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(quote.number)}.docx"`,
    },
  })
}
