import Link from "next/link"
import { Briefcase, Plus } from "lucide-react"

import { createClient } from "@/lib/supabase/server"
import { requireOrgContext } from "@/lib/auth"
import { PageHeader } from "@/components/page-header"
import { EmptyState } from "@/components/empty-state"
import { Button } from "@/components/ui/button"
import type { Enums } from "@/lib/types/database"
import { ProjectsPipeline, type PipelineProject } from "./_components/projects-pipeline"

export const dynamic = "force-dynamic"

type ProjectStage = Enums<"project_stage">

export default async function ProjectsPage() {
  await requireOrgContext()
  const supabase = await createClient()

  const { data: projects } = await supabase
    .from("projects")
    .select("id, name, stage, deadline, owner, installation_start_date, installation_end_date, deposit_received, handover_completed, warranty_registered, client:clients(name)")
    .order("deadline", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })

  const rows = (projects ?? []) as Array<{
    id: string
    name: string
    stage: ProjectStage
    deadline: string | null
    owner: string | null
    installation_start_date: string | null
    installation_end_date: string | null
    deposit_received: boolean
    handover_completed: boolean
    warranty_registered: boolean
    client: { name: string } | null
  }> as PipelineProject[]

  const newButton = (
    <Button render={<Link href="/projects/new" />}>
      <Plus data-icon="inline-start" /> New project
    </Button>
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Projects"
        description="Every customer journey, grouped by pipeline stage."
      >
        {newButton}
      </PageHeader>

      {rows.length === 0 ? (
        <EmptyState
          icon={Briefcase}
          title="No projects yet"
          description="Create your first project to start tracking delivery, tasks, and milestones."
          action={newButton}
        />
      ) : (
        <ProjectsPipeline projects={rows} />
      )}
    </div>
  )
}
