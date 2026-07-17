import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Download, ListPlus } from "lucide-react"

import { createClient } from "@/lib/supabase/server"
import { requireOrgContext } from "@/lib/auth"
import { formatTHB, satangToBaht } from "@/lib/money"
import { gpPercent } from "@/lib/quotes/margin"

import { PageHeader } from "@/components/page-header"
import { EmptyState } from "@/components/empty-state"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table"

import { updateQuote } from "../actions"
import {
  QuoteForm,
  type QuoteFormValues,
  type QuoteFormSubmitValues,
} from "../_components/quote-form"
import { QuoteItemForm } from "../_components/quote-item-form"
import {
  AddPartItemForm,
  type PickerPart,
} from "../_components/add-part-item-form"
import { AddBundleForm } from "../_components/add-bundle-form"
import { BundlePriceButton } from "../_components/bundle-price-button"
import { DeleteQuoteItemButton } from "../_components/delete-quote-item-button"
import { QuoteStatusControls } from "../_components/quote-status-controls"
import { QuoteStatusBadge } from "../_components/quote-status-badge"
import { EmailQuoteButton } from "../_components/email-quote-button"
import {
  DuplicateQuoteButton,
  SaveAsTemplateButton,
} from "../_components/duplicate-buttons"
import type { Option } from "../_components/form-fields"

export const dynamic = "force-dynamic"

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <dt className="text-muted-foreground text-xs font-medium">{label}</dt>
      <dd className="text-sm">{value}</dd>
    </div>
  )
}

export default async function QuoteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const ctx = await requireOrgContext()
  const supabase = await createClient()

  const [quoteRes, itemsRes, clientsRes, projectsRes, partsRes] =
    await Promise.all([
      supabase
        .from("quotes")
        .select(
          "id, number, status, issue_date, valid_until, subtotal_satang, discount_satang, total_satang, system_size_kwp, panel_model, inverter_model, battery_option, warranty_years, payback_years, proposal_assumptions, included_scope, excluded_scope, notes, client_id, project_id, converted_invoice_id, is_template, clients(name), projects(name)"
        )
        .eq("id", id)
        .maybeSingle(),
      supabase
        .from("quote_items")
        .select(
          "id, description, quantity, unit, unit_price_satang, amount_satang, position, parent_item_id, unit_cost_satang, adjustment_pct"
        )
        .eq("quote_id", id)
        .order("position", { ascending: true }),
      supabase.from("clients").select("id, name").order("name"),
      supabase.from("projects").select("id, name").order("name"),
      supabase
        .from("parts")
        .select(
          "id, sku, name, brand_model, unit, default_selling_price_satang, part_supplier_prices(id, unit_cost_ex_vat_satang, is_preferred, suppliers(name))"
        )
        .eq("is_active", true)
        .order("name"),
    ])

  const quote = quoteRes.data
  if (!quote) notFound()

  const items = itemsRes.data ?? []
  // Render top-level lines in position order, each followed by its children.
  const topLevel = items.filter((it) => it.parent_item_id === null)
  const childrenOf = (parentId: string) =>
    items.filter((it) => it.parent_item_id === parentId)

  const pickerParts: PickerPart[] = (partsRes.data ?? []).map((p) => ({
    id: p.id,
    sku: p.sku,
    name: p.name,
    brandModel: p.brand_model,
    unit: p.unit,
    defaultSellingPriceSatang: p.default_selling_price_satang,
    prices: p.part_supplier_prices.map((sp) => ({
      id: sp.id,
      supplierName: sp.suppliers?.name ?? "Unknown supplier",
      unitCostExVatSatang: sp.unit_cost_ex_vat_satang,
      isPreferred: sp.is_preferred,
    })),
  }))
  const bundleOptions = topLevel.map((it) => ({
    value: it.id,
    label: it.description,
  }))
  const canConvert = ctx.role === "owner" || ctx.role === "admin"
  const editable = quote.status === "draft" || quote.status === "sent"
  const locked = quote.status === "converted"

  const clients: Option[] = (clientsRes.data ?? []).map((c) => ({
    value: c.id,
    label: c.name,
  }))
  const projects: Option[] = (projectsRes.data ?? []).map((p) => ({
    value: p.id,
    label: p.name,
  }))

  const defaultValues: QuoteFormValues = {
    client_id: quote.client_id ?? "",
    project_id: quote.project_id ?? "",
    number: quote.number,
    issue_date: quote.issue_date ?? "",
    valid_until: quote.valid_until ?? "",
    discountBaht: satangToBaht(quote.discount_satang),
    systemSizeKwp: quote.system_size_kwp ?? 0,
    panelModel: quote.panel_model ?? "",
    inverterModel: quote.inverter_model ?? "",
    batteryOption: quote.battery_option ?? "",
    warrantyYears: quote.warranty_years ?? 0,
    paybackYears: quote.payback_years ?? 0,
    proposalAssumptions: quote.proposal_assumptions ?? "",
    includedScope: quote.included_scope ?? "",
    excludedScope: quote.excluded_scope ?? "",
    notes: quote.notes ?? "",
  }

  // Bind the quote id into a real server action (see invoices/[id] for why a
  // plain closure can't cross the RSC boundary to a "use client" form).
  const quoteId = quote.id
  async function saveQuote(values: QuoteFormSubmitValues) {
    "use server"
    return updateQuote({ id: quoteId, ...values })
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={quote.number}
        description={
          quote.is_template ? "Quote template" : (quote.clients?.name ?? "Quote")
        }
      >
        {quote.is_template ? null : (
          <>
            <Button
              variant="outline"
              render={<a href={`/quotes/${quote.id}/pdf`} target="_blank" rel="noreferrer" />}
            >
              <Download /> Download PDF
            </Button>
            <EmailQuoteButton quoteId={quote.id} />
            <SaveAsTemplateButton quoteId={quote.id} />
          </>
        )}
        <DuplicateQuoteButton quoteId={quote.id} />
        <Button
          variant="outline"
          render={<Link href={quote.is_template ? "/quotes/templates" : "/quotes"} />}
        >
          <ArrowLeft /> Back
        </Button>
      </PageHeader>

      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle className="text-base">Overview</CardTitle>
          <QuoteStatusBadge status={quote.status} />
        </CardHeader>
        <CardContent className="space-y-4">
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Field label="Subtotal" value={formatTHB(quote.subtotal_satang)} />
            <Field label="Discount" value={formatTHB(quote.discount_satang)} />
            <Field
              label="Total"
              value={
                <span className="font-medium">{formatTHB(quote.total_satang)}</span>
              }
            />
            <Field label="Issue date" value={quote.issue_date ?? "—"} />
            <Field label="Valid until" value={quote.valid_until ?? "—"} />
            <Field label="Client" value={quote.clients?.name ?? "—"} />
            <Field label="Project" value={quote.projects?.name ?? "—"} />
            <Field label="System size" value={quote.system_size_kwp ? `${quote.system_size_kwp} kWp` : "—"} />
            <Field label="Panel" value={quote.panel_model ?? "—"} />
            <Field label="Inverter" value={quote.inverter_model ?? "—"} />
            <Field label="Battery / EV" value={quote.battery_option ?? "—"} />
            <Field label="Warranty" value={quote.warranty_years ? `${quote.warranty_years} years` : "—"} />
            <Field label="Payback" value={quote.payback_years ? `${quote.payback_years} years` : "—"} />
            {quote.converted_invoice_id ? (
              <Field
                label="Converted invoice"
                value={
                  <Link
                    href={`/finance/invoices/${quote.converted_invoice_id}`}
                    className="hover:underline"
                  >
                    View invoice
                  </Link>
                }
              />
            ) : null}
          </dl>

          {quote.notes ? (
            <>
              <Separator />
              <Field label="Notes" value={quote.notes} />
            </>
          ) : null}

          {quote.is_template ? null : (
            <>
              <Separator />
              <QuoteStatusControls
                quoteId={quote.id}
                status={quote.status}
                canConvert={canConvert}
              />
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Line items</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {items.length === 0 ? (
            <EmptyState
              icon={ListPlus}
              title="No line items yet"
              description="Add items below to build up this quote's total."
              className="border-0"
            />
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Description</TableHead>
                  <TableHead className="text-right">Qty</TableHead>
                  <TableHead className="text-right">Unit price</TableHead>
                  <TableHead className="text-right">GP%</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  {locked ? null : (
                    <TableHead className="w-20" aria-label="Actions" />
                  )}
                </TableRow>
              </TableHeader>
              <TableBody>
                {topLevel.flatMap((it) => {
                  const children = childrenOf(it.id)
                  const gp = gpPercent(it.unit_price_satang, it.unit_cost_satang)
                  return [
                    <TableRow key={it.id}>
                      <TableCell className="font-medium">
                        {it.description}
                        {it.adjustment_pct ? (
                          <span className="text-muted-foreground ml-1 text-xs">
                            ({Number(it.adjustment_pct) > 0 ? "+" : ""}
                            {Number(it.adjustment_pct)}%)
                          </span>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {Number(it.quantity)}
                        {it.unit ? ` ${it.unit}` : ""}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatTHB(it.unit_price_satang)}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-right tabular-nums">
                        {gp !== null ? `${gp.toFixed(1)}%` : "—"}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatTHB(it.amount_satang)}
                      </TableCell>
                      {locked ? null : (
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-0.5">
                            {children.length > 0 ? (
                              <BundlePriceButton itemId={it.id} />
                            ) : null}
                            <DeleteQuoteItemButton
                              id={it.id}
                              label={it.description}
                            />
                          </div>
                        </TableCell>
                      )}
                    </TableRow>,
                    ...children.map((child) => {
                      const childGp = gpPercent(
                        child.unit_price_satang,
                        child.unit_cost_satang
                      )
                      return (
                        <TableRow key={child.id} className="bg-muted/40">
                          <TableCell className="text-muted-foreground pl-8 text-sm">
                            {child.description}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-right text-sm tabular-nums">
                            {Number(child.quantity)}
                            {child.unit ? ` ${child.unit}` : ""}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-right text-xs tabular-nums">
                            ({formatTHB(child.unit_price_satang)})
                          </TableCell>
                          <TableCell className="text-muted-foreground text-right text-xs tabular-nums">
                            {childGp !== null ? `${childGp.toFixed(1)}%` : "—"}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-right text-xs">
                            in bundle
                          </TableCell>
                          {locked ? null : (
                            <TableCell className="text-right">
                              <DeleteQuoteItemButton
                                id={child.id}
                                label={child.description}
                              />
                            </TableCell>
                          )}
                        </TableRow>
                      )
                    }),
                  ]
                })}
              </TableBody>
            </Table>
          )}

          <Separator />
          {locked ? (
            <p className="text-muted-foreground text-sm">Converted (locked)</p>
          ) : (
            <div className="space-y-6">
              <AddPartItemForm
                quoteId={quote.id}
                parts={pickerParts}
                bundleOptions={bundleOptions}
              />
              <AddBundleForm quoteId={quote.id} />
              <details>
                <summary className="text-muted-foreground cursor-pointer text-sm">
                  Add a freeform line (not from the catalog)
                </summary>
                <div className="pt-3">
                  <QuoteItemForm quoteId={quote.id} />
                </div>
              </details>
            </div>
          )}
        </CardContent>
      </Card>

      {editable ? (
        <Card className="max-w-3xl">
          <CardHeader>
            <CardTitle className="text-base">Edit quote</CardTitle>
          </CardHeader>
          <CardContent>
            <QuoteForm
              clients={clients}
              projects={projects}
              defaultValues={defaultValues}
              submitLabel="Save changes"
              action={saveQuote}
            />
          </CardContent>
        </Card>
      ) : null}
    </div>
  )
}
