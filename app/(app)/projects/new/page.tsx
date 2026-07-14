import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { createClient } from "@/lib/supabase/server"
import { requireOrgContext } from "@/lib/auth"
import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { createProject } from "../actions"
import {
  ProjectForm,
  type ProjectFormValues,
  type ClientOption,
} from "../_components/project-form"

export const dynamic = "force-dynamic"

export default async function NewProjectPage({
  searchParams,
}: {
  searchParams: Promise<{ clientId?: string }>
}) {
  await requireOrgContext()
  const { clientId } = await searchParams
  const supabase = await createClient()

  const { data: clientsData } = await supabase
    .from("clients")
    .select("id, name")
    .order("name", { ascending: true })
  const clients = (clientsData ?? []) as ClientOption[]

  const prefill: Partial<ProjectFormValues> = clientId ? { clientId } : {}

  async function action(values: ProjectFormValues) {
    "use server"
    return createProject(values)
  }

  return (
    <div className="space-y-6">
      <PageHeader title="New project" description="Set up a new customer journey.">
        <Button variant="outline" render={<Link href="/projects" />}>
          <ArrowLeft data-icon="inline-start" /> Back
        </Button>
      </PageHeader>

      <Card>
        <CardContent className="pt-6">
          <ProjectForm
            action={action}
            clients={clients}
            defaultValues={prefill}
          />
        </CardContent>
      </Card>
    </div>
  )
}
