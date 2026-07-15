import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, ExternalLink } from "lucide-react"

import { createClient } from "@/lib/supabase/server"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { updateSurvey } from "../actions"
import { SurveyForm, type SurveyFormValues } from "../_components/survey-form"

export const dynamic = "force-dynamic"

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1"><div className="text-muted-foreground text-xs font-medium uppercase tracking-wide">{label}</div><div className="text-sm">{children}</div></div>
}

export default async function SurveyDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: survey } = await supabase
    .from("solar_surveys")
    .select("*, project:projects(name)")
    .eq("id", id)
    .maybeSingle()

  if (!survey) notFound()
  const projectId = survey.project_id

  const defaultValues: Partial<SurveyFormValues> = {
    title: survey.title,
    status: survey.status as SurveyFormValues["status"],
    scheduledDate: survey.scheduled_date ?? "",
    completedDate: survey.completed_date ?? "",
    roofType: survey.roof_type ?? "",
    roofAreaSqm: survey.roof_area_sqm ?? 0,
    meterPhase: survey.meter_phase ?? "",
    mainBreakerAmp: survey.main_breaker_amp ?? 0,
    shadingNotes: survey.shading_notes ?? "",
    structuralNotes: survey.structural_notes ?? "",
    photoFolderUrl: survey.photo_folder_url ?? "",
    resultSummary: survey.result_summary ?? "",
  }

  async function action(values: SurveyFormValues) {
    "use server"
    return updateSurvey(id, projectId, values)
  }

  return (
    <div className="space-y-6">
      <PageHeader title={survey.title} description={survey.project?.name ?? "Solar survey"}>
        <Button variant="outline" render={<Link href={`/projects/${survey.project_id}`} />}><ArrowLeft /> Back to project</Button>
      </PageHeader>
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-1">
          <CardHeader><CardTitle className="text-base">Survey summary</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <Field label="Status">{survey.status.replaceAll("_", " ")}</Field>
            <Field label="Schedule">{survey.scheduled_date ?? "—"}{survey.completed_date ? ` → ${survey.completed_date}` : ""}</Field>
            <Field label="Roof">{[survey.roof_type, survey.roof_area_sqm ? `${survey.roof_area_sqm} sqm` : null].filter(Boolean).join(" · ") || "—"}</Field>
            <Field label="Meter / breaker">{[survey.meter_phase, survey.main_breaker_amp ? `${survey.main_breaker_amp}A` : null].filter(Boolean).join(" · ") || "—"}</Field>
            {survey.photo_folder_url ? <Field label="Photos"><a className="inline-flex items-center gap-1 hover:underline" href={survey.photo_folder_url} target="_blank" rel="noreferrer">Open folder <ExternalLink className="size-3" /></a></Field> : null}
            {survey.result_summary ? <Field label="Result"><p className="whitespace-pre-wrap">{survey.result_summary}</p></Field> : null}
          </CardContent>
        </Card>
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle className="text-base">Edit survey</CardTitle></CardHeader>
          <CardContent><SurveyForm defaultValues={defaultValues} action={action} submitLabel="Save survey" /></CardContent>
        </Card>
      </div>
    </div>
  )
}
