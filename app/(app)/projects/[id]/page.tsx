import Link from "next/link"
import { notFound } from "next/navigation"
import {
  ArrowLeft,
  Pencil,
  ListChecks,
  Flag,
  Wallet,
  CalendarClock,
  User,
  Building2,
  Clock,
  FileSignature,
  History,
  Camera,
  FileText,
  ClipboardCheck,
} from "lucide-react"

import { createClient } from "@/lib/supabase/server"
import { requireOrgContext } from "@/lib/auth"
import { formatTHB } from "@/lib/money"
import { projectProfit } from "@/lib/metrics/projects"
import {
  totalMinutes,
  minutesToHours,
  billableValueSatang,
} from "@/lib/metrics/timesheets"
import { todayISO } from "@/lib/dates"
import { PageHeader } from "@/components/page-header"
import { StatCard } from "@/components/stat-card"
import { EmptyState } from "@/components/empty-state"
import { ProjectStageBadge, TaskStatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"
import type { Enums } from "@/lib/types/database"
import { getStageRequirements } from "@/lib/pipeline/stages"
import { selectHeadlineQuote } from "@/lib/pipeline/quote-value"
import { deadlineMeta, formatDate } from "../_lib/dates"
import { StageSelect } from "../_components/stage-select"
import { StageProgressHeader } from "../_components/stage-progress-header"
import { StageChecklist } from "../_components/stage-checklist"
import { StageTimeline } from "../_components/stage-timeline"
import { StageMediaSection } from "../_components/stage-media-section"
import { QuotesSection, type ProjectQuote } from "../_components/quotes-section"
import { SurveysSection, type ProjectSurvey } from "../_components/surveys-section"
import { TaskToggle, MilestoneToggle } from "../_components/toggle-check"
import { AddTaskForm, AiWorkBreakdownPanel } from "../_components/add-task-form"
import { AddMilestoneForm } from "../_components/add-milestone-form"
import { LogTimeForm } from "@/app/(app)/timesheets/_components/log-time-form"
import { HandoverEvidenceSection } from "../_components/handover-evidence-section"
import { loadProjectPipelineState } from "../actions"
import { listDocuments } from "../documents-actions"

export const dynamic = "force-dynamic"

function Field({
  icon: Icon,
  label,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="bg-muted text-muted-foreground mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-md">
        <Icon className="size-4" />
      </div>
      <div className="min-w-0">
        <div className="text-muted-foreground text-xs font-medium">{label}</div>
        <div className="text-sm font-medium">{children}</div>
      </div>
    </div>
  )
}

export default async function ProjectDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const ctx = await requireOrgContext()
  const { id } = await params
  const supabase = await createClient()

  const { data: project } = await supabase
    .from("projects")
    .select(
      "id, name, stage, deadline, owner, client_id, monthly_bill_satang, installation_start_date, installation_end_date, installation_crew, deposit_received, handover_completed, warranty_registered, installation_checklist, client:clients(name)"
    )
    .eq("id", id)
    .maybeSingle()

  if (!project) notFound()

  const p = project as typeof project & {
    stage: Enums<"project_stage">
    client: { name: string } | null
  }

  const [
    { data: tasksData },
    { data: milestonesData },
    { data: invoicesData },
    { data: costsData },
    { data: timeData },
    { data: handoverData },
    { data: quotesData },
    { data: surveysData },
    { documents: allDocuments },
  ] = await Promise.all([
    supabase
      .from("project_tasks")
      .select("id, title, status, assignee, due_date, done")
      .eq("project_id", id)
      .order("done", { ascending: true })
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true }),
    supabase
      .from("milestones")
      .select("id, title, due_date, done")
      .eq("project_id", id)
      .order("done", { ascending: true })
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true }),
    supabase
      .from("invoices")
      .select("status, amount_satang")
      .eq("project_id", id)
      .in("status", ["sent", "partially_paid", "paid", "overdue"]),
    supabase.from("costs").select("amount_satang").eq("project_id", id),
    supabase
      .from("time_entries")
      .select("project_id, minutes, billable, rate_satang")
      .eq("project_id", id),
    supabase
      .from("project_handover_evidence")
      .select("id, kind, note, evidence_url, signed_by, signed_at, created_by, created_at")
      .eq("project_id", id)
      .order("created_at", { ascending: false }),
    supabase
      .from("quotes")
      .select("id, number, status, total_satang, issue_date")
      .eq("project_id", id)
      .order("issue_date", { ascending: false }),
    supabase
      .from("solar_surveys")
      .select("id, title, status, scheduled_date, completed_date, roof_type, roof_area_sqm, meter_phase")
      .eq("project_id", id)
      .order("scheduled_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false }),
    // No stage filter — the stage timeline (below) groups every stage's
    // documents itself; the current-stage media section filters this same
    // set down to `p.stage` rather than issuing a second query.
    listDocuments(id),
  ])

  const quotes = (quotesData ?? []) as ProjectQuote[]
  const surveys = (surveysData ?? []) as ProjectSurvey[]
  const documents = allDocuments ?? []
  const currentStageDocuments = documents.filter((d) => d.stage === p.stage)

  // The project's headline price is derived from its quotes (see
  // lib/pipeline/quote-value.ts), not a manually-typed budget field.
  const headlineQuote = selectHeadlineQuote(
    quotes.map((q) => ({
      id: q.id,
      status: q.status,
      totalSatang: q.total_satang,
      issueDate: q.issue_date,
    }))
  )

  // Same assembly `updateProjectStage` uses to gate a stage change (ST-4),
  // reused here to *display* the live "what's needed to move forward"
  // checklist for the project's current stage.
  const pipelineState = await loadProjectPipelineState(
    supabase,
    ctx.orgId,
    id,
    p.stage,
    p.monthly_bill_satang,
    p.installation_start_date
  )
  const stageRequirements = getStageRequirements(pipelineState)

  const tasks = (tasksData ?? []) as Array<{
    id: string
    title: string
    status: Enums<"task_status">
    assignee: string | null
    due_date: string | null
    done: boolean
  }>
  const milestones = (milestonesData ?? []) as Array<{
    id: string
    title: string
    due_date: string | null
    done: boolean
  }>
  const invoices = (invoicesData ?? []) as Array<{
    status: Enums<"invoice_status">
    amount_satang: number
  }>
  const costs = (costsData ?? []) as Array<{ amount_satang: number }>
  const timeEntries = (timeData ?? []) as Array<{
    project_id: string
    minutes: number
    billable: boolean
    rate_satang: number | null
  }>
  const handover = (handoverData ?? []) as Array<{
    id: string
    kind: "handover" | "warranty" | "commissioning" | "after_sale"
    note: string | null
    evidence_url: string | null
    signed_by: string | null
    signed_at: string | null
    created_by: string | null
    created_at: string
  }>

  const loggedMinutes = totalMinutes(timeEntries)
  const loggedBillable = billableValueSatang(timeEntries)

  const dl = deadlineMeta(p.deadline)
  const doneTasks = tasks.filter((t) => t.done).length
  const doneMilestones = milestones.filter((m) => m.done).length

  const hasFinancials = invoices.length > 0 || costs.length > 0
  const profit = hasFinancials ? projectProfit(invoices, costs) : null

  return (
    <div className="space-y-6">
      <PageHeader title={p.name} description={p.client?.name ?? "No client"}>
        <Button variant="outline" render={<Link href="/projects" />}>
          <ArrowLeft data-icon="inline-start" /> Back
        </Button>
        <Button variant="outline" render={<Link href={`/projects/${id}/edit`} />}>
          <Pencil data-icon="inline-start" /> Edit
        </Button>
      </PageHeader>

      {/* Pipeline status: stage, progress, and what's needed to move forward */}
      <Card>
        <CardContent className="space-y-5 pt-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <ProjectStageBadge stage={p.stage} />
              <StageProgressHeader stage={p.stage} />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground text-sm">Change stage</span>
              <StageSelect projectId={p.id} stage={p.stage} />
            </div>
          </div>
          <div className="rounded-md border bg-muted/30 p-3">
            <p className="text-muted-foreground mb-2 text-xs font-medium">
              To move forward
            </p>
            <StageChecklist requirements={stageRequirements.requirements} />
          </div>
        </CardContent>
      </Card>

      {/* Left: basic project info (1) — right: everything else (2) */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Project info</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <Field icon={Building2} label="Client">
                {p.client?.name ?? "—"}
              </Field>
              <Field icon={CalendarClock} label="Deadline">
                {dl ? (
                  <span
                    className={cn(
                      dl.tone === "danger" && "text-red-600 dark:text-red-400",
                      dl.tone === "warning" && "text-amber-600 dark:text-amber-400"
                    )}
                  >
                    {dl.label}
                    {dl.note ? (
                      <span className="block text-xs font-normal">{dl.note}</span>
                    ) : null}
                  </span>
                ) : (
                  "—"
                )}
              </Field>
              <Field icon={User} label="Owner">
                {p.owner ?? "—"}
              </Field>
              <Separator />
              <Field icon={CalendarClock} label="Install window">
                {[p.installation_start_date, p.installation_end_date].filter(Boolean).join(" → ") || "—"}
              </Field>
              <Field icon={User} label="Crew">
                {p.installation_crew ?? "—"}
              </Field>
              <Field icon={Wallet} label="Deposit">
                {p.deposit_received ? "Received" : "Pending"}
              </Field>
              <Field icon={Flag} label="Handover / warranty">
                {[p.handover_completed ? "Handover done" : "Handover pending", p.warranty_registered ? "Warranty registered" : "Warranty pending"].join(" · ")}
              </Field>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6 lg:col-span-2">
          {/* Profit (only when there are invoices or costs) */}
          {profit ? (
            <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              <StatCard label="Revenue" value={formatTHB(profit.revenueSatang)} tone="positive" />
              <StatCard label="Cost" value={formatTHB(profit.costSatang)} tone="negative" />
              <StatCard
                label="Profit"
                value={formatTHB(profit.profitSatang)}
                tone={profit.profitSatang >= 0 ? "positive" : "negative"}
              />
              <StatCard
                label="Margin"
                value={`${profit.marginPct.toFixed(0)}%`}
                tone={profit.marginPct >= 0 ? "default" : "negative"}
                hint="Billed revenue vs. recorded cost"
              />
            </div>
          ) : null}

          {/* Surveys tied to this project */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ClipboardCheck className="size-4" /> Surveys
                <span className="text-muted-foreground text-sm font-normal">
                  {surveys.length}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <SurveysSection projectId={p.id} surveys={surveys} />
            </CardContent>
          </Card>

          {/* Quotes tied to this project */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileText className="size-4" /> Quotes
                <span className="text-muted-foreground text-sm font-normal">
                  {quotes.length}
                  {headlineQuote
                    ? ` · ${formatTHB(headlineQuote.totalSatang)} (${headlineQuote.status})`
                    : ""}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <QuotesSection projectId={p.id} quotes={quotes} />
            </CardContent>
          </Card>

          {/* Media for the current stage */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Camera className="size-4" /> Photos & files — current stage
                <span className="text-muted-foreground text-sm font-normal">
                  <ProjectStageBadge stage={p.stage} />
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <StageMediaSection
                projectId={p.id}
                stage={p.stage}
                initialDocuments={currentStageDocuments}
              />
            </CardContent>
          </Card>

          {/* Tasks */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <ListChecks className="size-4" /> Tasks
                <span className="text-muted-foreground text-sm font-normal">
                  {doneTasks}/{tasks.length} done
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <AddTaskForm projectId={p.id} />
              <AiWorkBreakdownPanel
                projectId={p.id}
                projectDeadline={p.deadline}
                team={[]}
              />
              {tasks.length === 0 ? (
                <EmptyState
                  icon={ListChecks}
                  title="No tasks yet"
                  description="Break the project into tasks to track progress."
                  className="border-0 p-6"
                />
              ) : (
                <ul className="divide-y rounded-md border">
                  {tasks.map((t) => (
                    <li key={t.id} className="flex items-center gap-3 px-3 py-2.5">
                      <TaskToggle
                        id={t.id}
                        projectId={p.id}
                        done={t.done}
                        label={`Mark "${t.title}" done`}
                      />
                      <span
                        className={cn(
                          "min-w-0 flex-1 truncate text-sm",
                          t.done && "text-muted-foreground line-through"
                        )}
                      >
                        {t.title}
                      </span>
                      {t.assignee ? (
                        <span className="text-muted-foreground hidden shrink-0 text-xs sm:inline">
                          {t.assignee}
                        </span>
                      ) : null}
                      {t.due_date ? (
                        <span className="text-muted-foreground hidden shrink-0 text-xs sm:inline">
                          {formatDate(t.due_date)}
                        </span>
                      ) : null}
                      <TaskStatusBadge status={t.status} />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Milestones */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Flag className="size-4" /> Milestones
                <span className="text-muted-foreground text-sm font-normal">
                  {doneMilestones}/{milestones.length} done
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <AddMilestoneForm projectId={p.id} />
              {milestones.length === 0 ? (
                <EmptyState
                  icon={Flag}
                  title="No milestones yet"
                  description="Add checkpoints to mark key deliverables."
                  className="border-0 p-6"
                />
              ) : (
                <ul className="divide-y rounded-md border">
                  {milestones.map((m) => (
                    <li key={m.id} className="flex items-center gap-3 px-3 py-2.5">
                      <MilestoneToggle
                        id={m.id}
                        projectId={p.id}
                        done={m.done}
                        label={`Mark "${m.title}" done`}
                      />
                      <span
                        className={cn(
                          "min-w-0 flex-1 truncate text-sm",
                          m.done && "text-muted-foreground line-through"
                        )}
                      >
                        {m.title}
                      </span>
                      {m.due_date ? (
                        <span className="text-muted-foreground shrink-0 text-xs">
                          {formatDate(m.due_date)}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          {/* Time logged */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Clock className="size-4" /> Time logged
                <span className="text-muted-foreground text-sm font-normal">
                  {minutesToHours(loggedMinutes).toFixed(1)}h
                  {loggedBillable > 0
                    ? ` · ${formatTHB(loggedBillable)} billable`
                    : ""}
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <StatCard
                  label="Hours logged"
                  value={`${minutesToHours(loggedMinutes).toFixed(1)}h`}
                />
                <StatCard
                  label="Billable value"
                  value={formatTHB(loggedBillable)}
                  tone="positive"
                />
              </div>
              <LogTimeForm
                projects={[{ value: p.id, label: p.name }]}
                defaultProjectId={p.id}
                defaultWorkDate={todayISO()}
                lockProject
              />
            </CardContent>
          </Card>

          {/* Handover / warranty evidence */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <FileSignature className="size-4" /> Handover & warranty evidence
              </CardTitle>
            </CardHeader>
            <CardContent>
              <HandoverEvidenceSection projectId={p.id} items={handover} />
            </CardContent>
          </Card>

          {/* Stage timeline — browse what was uploaded at every stage */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <History className="size-4" /> Stage timeline
              </CardTitle>
            </CardHeader>
            <CardContent>
              <StageTimeline documents={documents} currentStage={p.stage} />
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
