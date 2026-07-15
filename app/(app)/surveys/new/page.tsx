import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft } from "lucide-react"

import { createClient } from "@/lib/supabase/server"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { createSurvey } from "../actions"
import { SurveyForm, type SurveyFormValues } from "../_components/survey-form"

export const dynamic = "force-dynamic"

export default async function NewSurveyPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string }>
}) {
  const { projectId } = await searchParams
  if (!projectId) notFound()

  const supabase = await createClient()
  const { data: project } = await supabase
    .from("projects")
    .select("id, name")
    .eq("id", projectId)
    .maybeSingle()

  if (!project) notFound()

  async function action(values: SurveyFormValues) {
    "use server"
    return createSurvey(projectId as string, values)
  }

  return (
    <div className="space-y-6">
      <PageHeader title="New survey" description={`Site-survey checklist for ${project.name}`}>
        <Button variant="outline" render={<Link href={`/projects/${projectId}`} />}>
          <ArrowLeft /> Back
        </Button>
      </PageHeader>
      <Card className="max-w-3xl">
        <CardContent>
          <SurveyForm action={action} submitLabel="Create survey" />
        </CardContent>
      </Card>
    </div>
  )
}
