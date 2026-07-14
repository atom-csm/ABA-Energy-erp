import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { createClient } from "@/lib/supabase/server"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { createSurvey } from "../actions"
import { SurveyForm, type Option } from "../_components/survey-form"

export const dynamic = "force-dynamic"

export default async function NewSurveyPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string }>
}) {
  const { projectId } = await searchParams
  const supabase = await createClient()
  const { data: projectsData } = await supabase
    .from("projects")
    .select("id,name")
    .order("created_at", { ascending: false })

  const projects: Option[] = (projectsData ?? []).map((p) => ({ id: p.id, label: p.name }))
  const defaultValues = {
    projectId: projectId ?? "none",
  }

  return (
    <div className="space-y-6">
      <PageHeader title="New survey" description="Create a site-survey checklist for a solar opportunity.">
        <Button variant="outline" render={<Link href="/surveys" />}><ArrowLeft /> Back</Button>
      </PageHeader>
      <Card className="max-w-3xl"><CardContent><SurveyForm projects={projects} defaultValues={defaultValues} action={createSurvey} submitLabel="Create survey" /></CardContent></Card>
    </div>
  )
}
