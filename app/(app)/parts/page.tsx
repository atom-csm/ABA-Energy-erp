import Link from "next/link"
import { Package, Plus, Truck } from "lucide-react"

import { createClient } from "@/lib/supabase/server"
import { PageHeader } from "@/components/page-header"
import { EmptyState } from "@/components/empty-state"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { formatTHB } from "@/lib/money"
import {
  PART_CATEGORIES,
  partCategoryLabel,
  phaseLabel,
  type PartCategory,
} from "@/lib/parts/categories"

export const dynamic = "force-dynamic"

type PartRow = {
  id: string
  sku: string
  name: string
  brand_model: string | null
  category: PartCategory
  unit: string
  phase_compat: string | null
  default_selling_price_satang: number | null
  is_active: boolean
  part_supplier_prices: {
    unit_cost_ex_vat_satang: number
    is_preferred: boolean
    suppliers: { name: string } | null
  }[]
}

export default async function PartsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>
}) {
  const supabase = await createClient()
  const { q: qParam } = await searchParams
  const q = (qParam ?? "").trim()

  let query = supabase
    .from("parts")
    .select(
      "id, sku, name, brand_model, category, unit, phase_compat, default_selling_price_satang, is_active, part_supplier_prices(unit_cost_ex_vat_satang, is_preferred, suppliers(name))"
    )
    .order("name", { ascending: true })
  if (q) query = query.or(`name.ilike.%${q}%,sku.ilike.%${q}%,brand_model.ilike.%${q}%`)

  const { data } = await query
  const parts = (data ?? []) as PartRow[]

  const byCategory = PART_CATEGORIES.map((cat) => ({
    ...cat,
    parts: parts.filter((p) => p.category === cat.value),
  })).filter((g) => g.parts.length > 0)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Parts"
        description="The parts catalog behind every quotation — one part, many supplier prices."
      >
        <Button variant="outline" render={<Link href="/parts/suppliers" />}>
          <Truck />
          Suppliers
        </Button>
        <Button render={<Link href="/parts/new" />}>
          <Plus />
          New part
        </Button>
      </PageHeader>

      <form action="/parts" className="max-w-sm">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search by name, SKU, or brand…"
          className="border-input bg-background w-full rounded-md border px-3 py-2 text-sm"
        />
      </form>

      {parts.length === 0 ? (
        q ? (
          <EmptyState
            icon={Package}
            title="No matching parts"
            description="No parts match your search."
          />
        ) : (
          <EmptyState
            icon={Package}
            title="No parts yet"
            description="Add your first part to start building quotations from the catalog."
            action={
              <Button render={<Link href="/parts/new" />}>
                <Plus />
                New part
              </Button>
            }
          />
        )
      ) : (
        <div className="space-y-6">
          {byCategory.map((group) => (
            <div key={group.value} className="space-y-2">
              <h2 className="text-sm font-semibold">
                {partCategoryLabel(group.value)}
              </h2>
              <div className="rounded-xl ring-1 ring-foreground/10">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Part</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>Unit</TableHead>
                      <TableHead>Phase</TableHead>
                      <TableHead className="text-right">
                        Preferred cost (ex-VAT)
                      </TableHead>
                      <TableHead className="text-right">Selling price</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {group.parts.map((p) => {
                      const preferred =
                        p.part_supplier_prices.find((sp) => sp.is_preferred) ??
                        p.part_supplier_prices[0]
                      return (
                        <TableRow key={p.id}>
                          <TableCell className="font-medium">
                            <Link
                              href={`/parts/${p.id}`}
                              className="hover:underline"
                            >
                              {p.name}
                            </Link>
                            {p.brand_model ? (
                              <div className="text-muted-foreground text-xs">
                                {p.brand_model}
                              </div>
                            ) : null}
                            {!p.is_active ? (
                              <Badge variant="outline" className="ml-2">
                                Inactive
                              </Badge>
                            ) : null}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {p.sku}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {p.unit}
                          </TableCell>
                          <TableCell className="text-muted-foreground">
                            {phaseLabel(p.phase_compat)}
                          </TableCell>
                          <TableCell className="text-muted-foreground text-right">
                            {preferred
                              ? `${formatTHB(preferred.unit_cost_ex_vat_satang)}${preferred.suppliers ? ` · ${preferred.suppliers.name}` : ""}`
                              : "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            {p.default_selling_price_satang !== null
                              ? formatTHB(p.default_selling_price_satang)
                              : "—"}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
