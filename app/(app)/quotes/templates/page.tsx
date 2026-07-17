import Link from "next/link"
import { ArrowLeft, BookMarked } from "lucide-react"

import { createClient } from "@/lib/supabase/server"
import { requireOrgContext } from "@/lib/auth"
import { formatTHB } from "@/lib/money"

import { PageHeader } from "@/components/page-header"
import { EmptyState } from "@/components/empty-state"
import { Button } from "@/components/ui/button"
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table"

import { UseTemplateDialog } from "../_components/duplicate-buttons"

export const dynamic = "force-dynamic"

export default async function QuoteTemplatesPage() {
  await requireOrgContext()
  const supabase = await createClient()

  const [templatesRes, clientsRes] = await Promise.all([
    supabase
      .from("quotes")
      .select("id, number, notes, total_satang, system_size_kwp, created_at")
      .eq("is_template", true)
      .order("created_at", { ascending: false }),
    supabase.from("clients").select("id, name").order("name"),
  ])

  const templates = templatesRes.data ?? []
  const clients = (clientsRes.data ?? []).map((c) => ({
    value: c.id,
    label: c.name,
  }))

  return (
    <div className="space-y-6">
      <PageHeader
        title="Quote templates"
        description="Standard packages — start a new quote from one instead of a blank page."
      >
        <Button variant="ghost" render={<Link href="/quotes" />}>
          <ArrowLeft /> Back to quotes
        </Button>
      </PageHeader>

      {templates.length === 0 ? (
        <EmptyState
          icon={BookMarked}
          title="No templates yet"
          description='Open any quote and press "Save as template" to turn it into a reusable package.'
        />
      ) : (
        <div className="rounded-xl ring-1 ring-foreground/10">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Template</TableHead>
                <TableHead>System</TableHead>
                <TableHead className="text-right">Value</TableHead>
                <TableHead className="text-right" aria-label="Actions" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {templates.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">
                    <Link href={`/quotes/${t.id}`} className="hover:underline">
                      {t.number}
                    </Link>
                    {t.notes ? (
                      <div className="text-muted-foreground max-w-md truncate text-xs">
                        {t.notes}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {t.system_size_kwp ? `${t.system_size_kwp} kWp` : "—"}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatTHB(t.total_satang)}
                  </TableCell>
                  <TableCell className="text-right">
                    <UseTemplateDialog
                      templateId={t.id}
                      templateLabel={t.number}
                      clients={clients}
                    />
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
