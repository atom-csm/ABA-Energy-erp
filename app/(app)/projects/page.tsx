import Link from "next/link"
import { Briefcase, Plus } from "lucide-react"

import { createClient } from "@/lib/supabase/server"
import { requireOrgContext } from "@/lib/auth"
import { PageHeader } from "@/components/page-header"
import { EmptyState } from "@/components/empty-state"
import { ProjectStatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { Enums } from "@/lib/types/database"
import { deadlineMeta } from "./_lib/dates"

export const dynamic = "force-dynamic"

type ProjectStatus = Enums<"project_status">

// Order used to group the board; mirrors the lifecycle.
const STATUS_ORDER: { value: ProjectStatus; label: string }[] = [
  { value: "in_progress", label: "In progress" },
  { value: "review", label: "Review" },
  { value: "not_started", label: "Not started" },
  { value: "support", label: "Support" },
  { value: "paused", label: "Paused" },
  { value: "delivered", label: "Delivered" },
  { value: "cancelled", label: "Cancelled" },
]

export default async function ProjectsPage() {
  await requireOrgContext()
  const supabase = await createClient()

  const { data: projects } = await supabase
    .from("projects")
    .select("id, name, status, deadline, owner, installation_start_date, installation_end_date, deposit_received, handover_completed, warranty_registered, client:clients(name)")
    .order("deadline", { ascending: true, nullsFirst: false })
    .order("created_at", { ascending: false })

  const rows = (projects ?? []) as Array<{
    id: string
    name: string
    status: ProjectStatus
    deadline: string | null
    owner: string | null
    installation_start_date: string | null
    installation_end_date: string | null
    deposit_received: boolean
    handover_completed: boolean
    warranty_registered: boolean
    client: { name: string } | null
  }>

  const newButton = (
    <Button render={<Link href="/projects/new" />}>
      <Plus data-icon="inline-start" /> New project
    </Button>
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Projects"
        description="Delivery work across every client, grouped by status."
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
        <div className="space-y-5">
          {STATUS_ORDER.map((group) => {
            const groupRows = rows.filter((p) => p.status === group.value)
            if (groupRows.length === 0) return null
            return (
              <Card key={group.value}>
                <CardHeader className="flex-row items-center justify-between gap-2">
                  <CardTitle className="flex items-center gap-2 text-base">
                    <ProjectStatusBadge status={group.value} />
                    <span className="text-muted-foreground text-sm font-normal">
                      {groupRows.length}
                    </span>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Project</TableHead>
                        <TableHead>Client</TableHead>
                        <TableHead>Deadline</TableHead>
                        <TableHead>Install</TableHead>
                        <TableHead>Owner</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {groupRows.map((p) => {
                        const dl = deadlineMeta(p.deadline)
                        return (
                          <TableRow key={p.id} className="cursor-pointer">
                            <TableCell className="font-medium">
                              <Link
                                href={`/projects/${p.id}`}
                                className="hover:underline"
                              >
                                {p.name}
                              </Link>
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {p.client?.name ?? "—"}
                            </TableCell>
                            <TableCell>
                              {dl ? (
                                <span
                                  className={cn(
                                    "inline-flex items-center gap-1.5",
                                    dl.tone === "danger" &&
                                      "text-red-600 dark:text-red-400",
                                    dl.tone === "warning" &&
                                      "text-amber-600 dark:text-amber-400"
                                  )}
                                >
                                  {dl.label}
                                  {dl.note ? (
                                    <Badge
                                      variant="outline"
                                      className={cn(
                                        "text-xs",
                                        dl.tone === "danger" &&
                                          "border-transparent bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300",
                                        dl.tone === "warning" &&
                                          "border-transparent bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300"
                                      )}
                                    >
                                      {dl.note}
                                    </Badge>
                                  ) : null}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="space-y-1">
                                <div className="text-sm">
                                  {[p.installation_start_date, p.installation_end_date]
                                    .filter(Boolean)
                                    .join(" → ") || "—"}
                                </div>
                                <div className="flex flex-wrap gap-1">
                                  <Badge
                                    variant="outline"
                                    className={cn(
                                      p.deposit_received &&
                                        "border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300"
                                    )}
                                  >
                                    {p.deposit_received ? "Deposit" : "No deposit"}
                                  </Badge>
                                  <Badge
                                    variant="outline"
                                    className={cn(
                                      p.handover_completed &&
                                        "border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300"
                                    )}
                                  >
                                    {p.handover_completed ? "Handover" : "Handover pending"}
                                  </Badge>
                                  {p.warranty_registered ? (
                                    <Badge
                                      variant="outline"
                                      className="border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900 dark:bg-violet-950 dark:text-violet-300"
                                    >
                                      Warranty
                                    </Badge>
                                  ) : null}
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {p.owner ?? "—"}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
