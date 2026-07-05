import Link from "next/link"
import { Plus, ClipboardCheck } from "lucide-react"

import { createClient } from "@/lib/supabase/server"
import { PageHeader } from "@/components/page-header"
import { EmptyState } from "@/components/empty-state"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"

export const dynamic = "force-dynamic"

export default async function SurveysPage() {
  const supabase = await createClient()
  const { data: surveys } = await supabase
    .from("solar_surveys")
    .select("id,title,status,scheduled_date,completed_date,roof_type,roof_area_sqm,meter_phase,deal:deals(title),project:projects(name)")
    .order("scheduled_date", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })

  return (
    <div className="space-y-6">
      <PageHeader title="Surveys" description="Solar site-survey checklist, roof data, and handoff notes.">
        <Button render={<Link href="/surveys/new" />}><Plus className="size-4" /> New survey</Button>
      </PageHeader>

      {!surveys || surveys.length === 0 ? (
        <EmptyState icon={ClipboardCheck} title="No surveys yet" description="Create a survey when a lead is ready for site inspection." action={<Button render={<Link href="/surveys/new" />}><Plus className="size-4" /> New survey</Button>} />
      ) : (
        <Card>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Survey</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Schedule</TableHead>
                  <TableHead>Roof</TableHead>
                  <TableHead>Linked work</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {surveys.map((s) => (
                  <TableRow key={s.id}>
                    <TableCell className="font-medium"><Link href={`/surveys/${s.id}`} className="hover:underline">{s.title}</Link></TableCell>
                    <TableCell>{s.status.replaceAll("_", " ")}</TableCell>
                    <TableCell>{s.scheduled_date ?? "—"}{s.completed_date ? ` → ${s.completed_date}` : ""}</TableCell>
                    <TableCell>{[s.roof_type, s.roof_area_sqm ? `${s.roof_area_sqm} sqm` : null, s.meter_phase].filter(Boolean).join(" · ") || "—"}</TableCell>
                    <TableCell>{s.deal?.title ?? s.project?.name ?? "—"}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
