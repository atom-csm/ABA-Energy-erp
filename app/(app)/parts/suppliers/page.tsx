import Link from "next/link"
import { ArrowLeft, Truck } from "lucide-react"

import { createClient } from "@/lib/supabase/server"
import { PageHeader } from "@/components/page-header"
import { EmptyState } from "@/components/empty-state"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

import { SupplierDialog } from "../_components/supplier-dialog"
import { DeleteSupplierButton } from "../_components/delete-buttons"

export const dynamic = "force-dynamic"

export default async function SuppliersPage() {
  const supabase = await createClient()
  const { data: suppliers } = await supabase
    .from("suppliers")
    .select("id, name, contact_name, phone, email, part_supplier_prices(id)")
    .order("name")

  const rows = suppliers ?? []

  return (
    <div className="space-y-6">
      <PageHeader
        title="Suppliers"
        description="Who you buy parts from. Each supplier can carry a price per part."
      >
        <Button variant="ghost" render={<Link href="/parts" />}>
          <ArrowLeft />
          Back to parts
        </Button>
        <SupplierDialog />
      </PageHeader>

      {rows.length === 0 ? (
        <EmptyState
          icon={Truck}
          title="No suppliers yet"
          description="Add your first supplier, then record their prices on each part's page."
          action={<SupplierDialog />}
        />
      ) : (
        <div className="rounded-xl ring-1 ring-foreground/10">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Email</TableHead>
                <TableHead className="text-right">Priced parts</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((s) => (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {s.contact_name ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {s.phone ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {s.email ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-right">
                    {s.part_supplier_prices?.length ?? 0}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex items-center justify-end gap-1">
                      <SupplierDialog
                        supplier={{
                          id: s.id,
                          name: s.name,
                          contactName: s.contact_name ?? "",
                          phone: s.phone ?? "",
                          email: s.email ?? "",
                        }}
                      />
                      <DeleteSupplierButton id={s.id} name={s.name} />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
