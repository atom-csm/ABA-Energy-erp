import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Star } from "lucide-react"

import { createClient } from "@/lib/supabase/server"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatTHB, satangToBaht } from "@/lib/money"
import { partCategoryLabel } from "@/lib/parts/categories"

import { updatePart } from "../actions"
import { PartForm } from "../_components/part-form"
import { SupplierPriceForm } from "../_components/supplier-price-form"
import {
  DeletePartButton,
  DeleteSupplierPriceButton,
} from "../_components/delete-buttons"

export const dynamic = "force-dynamic"

export default async function PartDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()

  const [partRes, pricesRes, suppliersRes] = await Promise.all([
    supabase
      .from("parts")
      .select(
        "id, sku, name, brand_model, category, unit, phase_compat, default_selling_price_satang, remark, is_active"
      )
      .eq("id", id)
      .maybeSingle(),
    supabase
      .from("part_supplier_prices")
      .select(
        "id, supplier_id, unit_cost_ex_vat_satang, unit_cost_inc_vat_satang, is_preferred, effective_date, notes, suppliers(name)"
      )
      .eq("part_id", id)
      .order("is_preferred", { ascending: false }),
    supabase.from("suppliers").select("id, name").order("name"),
  ])

  const part = partRes.data
  if (!part) notFound()

  const prices = pricesRes.data ?? []
  const suppliers = (suppliersRes.data ?? []).map((s) => ({
    value: s.id,
    label: s.name,
  }))

  return (
    <div className="space-y-6">
      <PageHeader
        title={part.name}
        description={`${part.sku} · ${partCategoryLabel(part.category)}`}
      >
        <Button variant="ghost" render={<Link href="/parts" />}>
          <ArrowLeft />
          Back to parts
        </Button>
        <DeletePartButton id={part.id} name={part.name} />
      </PageHeader>

      <Card>
        <CardHeader>
          <CardTitle>Part details</CardTitle>
        </CardHeader>
        <CardContent>
          <PartForm
            action={updatePart.bind(null, part.id)}
            defaultValues={{
              sku: part.sku,
              name: part.name,
              brandModel: part.brand_model ?? "",
              category: part.category,
              unit: part.unit,
              phaseCompat: part.phase_compat ?? "",
              defaultSellingPriceBaht:
                part.default_selling_price_satang !== null
                  ? satangToBaht(part.default_selling_price_satang)
                  : 0,
              remark: part.remark ?? "",
              isActive: part.is_active,
            }}
            submitLabel="Save changes"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Supplier prices ({prices.length})</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {suppliers.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No suppliers yet —{" "}
              <Link href="/parts/suppliers" className="underline">
                add a supplier
              </Link>{" "}
              first, then record their price here.
            </p>
          ) : (
            <SupplierPriceForm partId={part.id} suppliers={suppliers} />
          )}

          {prices.length > 0 ? (
            <div className="rounded-xl ring-1 ring-foreground/10">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Supplier</TableHead>
                    <TableHead className="text-right">Cost ex-VAT</TableHead>
                    <TableHead className="text-right">Cost inc-VAT</TableHead>
                    <TableHead>Effective</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {prices.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">
                        {p.suppliers?.name ?? "—"}
                        {p.is_preferred ? (
                          <Badge variant="secondary" className="ml-2">
                            <Star className="size-3" /> Preferred
                          </Badge>
                        ) : null}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatTHB(p.unit_cost_ex_vat_satang)}
                      </TableCell>
                      <TableCell className="text-right">
                        {formatTHB(p.unit_cost_inc_vat_satang)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {p.effective_date}
                      </TableCell>
                      <TableCell className="text-right">
                        <DeleteSupplierPriceButton
                          id={p.id}
                          partId={part.id}
                          supplierName={p.suppliers?.name ?? "this supplier"}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              No supplier prices recorded yet. Saving a price for a supplier
              that already has one overwrites it (current pricing, not a
              history).
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
