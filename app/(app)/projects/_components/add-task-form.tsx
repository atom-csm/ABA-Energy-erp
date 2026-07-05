"use client"

import { useMemo, useState, useTransition } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import {
  AlertCircle,
  ArrowRight,
  CalendarClock,
  Check,
  CheckCheck,
  ChevronDown,
  ChevronUp,
  CircleDashed,
  KeyRound,
  Layers3,
  ListChecks,
  Plus,
  Sparkles,
  TimerReset,
  Wand2,
} from "lucide-react"

import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Checkbox } from "@/components/ui/checkbox"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import {
  addTask,
  createAiWorkBreakdownTasks,
  generateAiWorkBreakdown,
  type AiWorkBreakdownPhase,
  type AiWorkBreakdownTask,
  type AiWorkBreakdownTeamMember,
} from "../actions"

const Schema = z.object({
  title: z.string().min(1, "Task title is required"),
  status: z.enum(["todo", "in_progress", "done"]),
  dueDate: z.string(),
})
type Values = z.infer<typeof Schema>

const STATUS_OPTIONS = [
  { value: "todo", label: "To do" },
  { value: "in_progress", label: "In progress" },
  { value: "done", label: "Done" },
] as const

const STATUS_LABEL: Record<Values["status"], string> = {
  todo: "To do",
  in_progress: "In progress",
  done: "Done",
}

function flatten(phases: AiWorkBreakdownPhase[]): AiWorkBreakdownTask[] {
  return phases.flatMap((phase) => phase.tasks)
}

function taskLabelById(phases: AiWorkBreakdownPhase[]): Map<string, string> {
  return new Map(flatten(phases).map((task) => [task.clientId, task.title]))
}

function humanHours(hours: number): string {
  if (hours <= 0) return "0h"
  if (Number.isInteger(hours)) return `${hours}h`
  return `${hours.toFixed(2).replace(/\.?0+$/, "")}h`
}

export function AddTaskForm({ projectId }: { projectId: string }) {
  const form = useForm<Values>({
    resolver: zodResolver(Schema),
    defaultValues: { title: "", status: "todo", dueDate: "" },
  })

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(async (v) => {
          const res = await addTask({ projectId, ...v })
          if (res?.error) return toast.error(res.error)
          toast.success("Task added")
          form.reset({ title: "", status: "todo", dueDate: "" })
        })}
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
      >
        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem className="flex-1">
              <FormLabel className="sr-only">Task title</FormLabel>
              <FormControl>
                <Input placeholder="Add a task…" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="status"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="sr-only">Status</FormLabel>
              <Select value={field.value} onValueChange={field.onChange}>
                <FormControl>
                  <SelectTrigger className="w-full sm:w-36">
                    <SelectValue>
                      {(v: Values["status"]) => STATUS_LABEL[v]}
                    </SelectValue>
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="dueDate"
          render={({ field }) => (
            <FormItem>
              <FormLabel className="sr-only">Due date</FormLabel>
              <FormControl>
                <Input type="date" className="w-full sm:w-40" {...field} />
              </FormControl>
            </FormItem>
          )}
        />
        <Button type="submit" disabled={form.formState.isSubmitting}>
          <Plus data-icon="inline-start" /> Add task
        </Button>
      </form>
    </Form>
  )
}

type AiPanelState = "idle" | "loading" | "ready" | "needs_key" | "error"

export function AiWorkBreakdownPanel({
  projectId,
  projectDeadline,
  team,
}: {
  projectId: string
  projectDeadline: string | null
  team: AiWorkBreakdownTeamMember[]
}) {
  const [open, setOpen] = useState(false)
  const [goal, setGoal] = useState("")
  const [deadline, setDeadline] = useState(projectDeadline ?? "")
  const [phases, setPhases] = useState<AiWorkBreakdownPhase[]>([])
  const [teamState, setTeamState] = useState<AiWorkBreakdownTeamMember[]>(team)
  const [panelState, setPanelState] = useState<AiPanelState>("idle")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [creating, startCreating] = useTransition()
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({})

  const teamById = useMemo(
    () => new Map(teamState.map((member) => [member.id, member])),
    [teamState]
  )
  const dependencyLabels = useMemo(() => taskLabelById(phases), [phases])

  const selectedTasks = useMemo(
    () => flatten(phases).filter((task) => task.selected),
    [phases]
  )
  const selectedCount = selectedTasks.length
  const totalSelectedHours = useMemo(
    () => selectedTasks.reduce((sum, task) => sum + (task.estimateHours || 0), 0),
    [selectedTasks]
  )
  const allTasks = useMemo(() => flatten(phases), [phases])

  function updateTask(
    clientId: string,
    patch: Partial<
      Pick<
        AiWorkBreakdownTask,
        "selected" | "title" | "estimateHours" | "suggestedAssignee"
      >
    >
  ) {
    setPhases((current) =>
      current.map((phase) => ({
        ...phase,
        tasks: phase.tasks.map((task) =>
          task.clientId === clientId ? { ...task, ...patch } : task
        ),
      }))
    )
  }

  function setPhaseSelection(phaseName: string, selected: boolean) {
    setPhases((current) =>
      current.map((phase) =>
        phaseName === "*" || phase.name === phaseName
          ? {
              ...phase,
              tasks: phase.tasks.map((task) => ({ ...task, selected })),
            }
          : phase
      )
    )
  }

  function generate() {
    if (!goal.trim()) return toast.error("Please enter a goal first.")
    if (!deadline) return toast.error("Please choose the overall deadline.")
    setErrorMessage(null)
    setPanelState("loading")
    setPhases([])
    startTransition(async () => {
      const res = await generateAiWorkBreakdown({ projectId, goal, deadline })
      if ("error" in res) {
        setPanelState("error")
        setErrorMessage(res.error)
        return
      }
      if ("notConfigured" in res) {
        setPanelState("needs_key")
        return
      }
      setTeamState(res.team)
      setPhases(res.phases)
      setCollapsed({})
      setPanelState("ready")
      toast.success("AI breakdown ready for review")
    })
  }

  function createTasks() {
    if (selectedTasks.length === 0) {
      return toast.error("Select at least one task to create.")
    }
    startCreating(async () => {
      const res = await createAiWorkBreakdownTasks({
        projectId,
        deadline,
        tasks: selectedTasks,
      })
      if (res.error) {
        setErrorMessage(res.error)
        setPanelState("error")
        return
      }
      toast.success(`${res.created ?? 0} tasks created on board`)
      setPhases([])
      setGoal("")
      setPanelState("idle")
      setOpen(false)
    })
  }

  function resetPanel() {
    setPhases([])
    setErrorMessage(null)
    setPanelState("idle")
  }

  const isBusy = pending || creating

  return (
    <div
      className={cn(
        "rounded-xl border bg-white p-4 shadow-xs transition-colors dark:bg-card",
        open ? "border-border" : "border-border/80"
      )}
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-lg">
            <Sparkles className="size-4" />
          </div>
          <div className="space-y-0.5">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">AI work breakdown</span>
              <StatusBadge state={panelState} />
            </div>
            <p className="text-muted-foreground text-xs">
              ใส่เป้าหมาย + เดดไลน์ → OpenRouter/Claude แตกเป็น phase/tasks → ติ๊กเลือกเฉพาะที่อยากได้
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant={open ? "secondary" : "outline"}
          size="sm"
          onClick={() => setOpen((v) => !v)}
        >
          <Wand2 className="size-3.5" />
          {open ? "ซ่อนแชต" : "แตกงานด้วย AI"}
        </Button>
      </div>

      {open ? (
        <div className="mt-3 space-y-4">
          <div className="rounded-xl border bg-white p-3 shadow-xs dark:bg-card">
            <div className="grid gap-3 lg:grid-cols-[1fr_220px_auto] lg:items-end">
              <div className="space-y-1.5">
                <label className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
                  <ListChecks className="size-3.5" /> เป้าหมาย
                </label>
                <Textarea
                  value={goal}
                  onChange={(e) => setGoal(e.target.value)}
                  placeholder="เช่น เปิดเว็บร้านใหม่ใน 6 สัปดาห์"
                  className="min-h-20"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-muted-foreground flex items-center gap-1.5 text-xs font-medium">
                  <CalendarClock className="size-3.5" /> เดดไลน์รวม
                </label>
                <Input
                  type="date"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                />
              </div>
              <Button
                type="button"
                disabled={isBusy}
                onClick={generate}
                className="self-stretch lg:self-auto"
              >
                {pending ? (
                  <>
                    <CircleDashed className="size-3.5 animate-spin" />
                    Breaking down…
                  </>
                ) : (
                  <>
                    <Sparkles className="size-3.5" />
                    Generate preview
                  </>
                )}
              </Button>
            </div>
          </div>

          {panelState === "loading" ? <PreviewSkeleton /> : null}
          {panelState === "needs_key" ? <NeedsKeyCallout /> : null}
          {panelState === "error" ? (
            <div className="border-destructive/30 bg-destructive/5 text-destructive flex items-start gap-2 rounded-lg border p-3 text-sm">
              <AlertCircle className="mt-0.5 size-4" />
              <div className="space-y-0.5">
                <div className="font-medium">AI breakdown ล้มเหลว</div>
                <div className="text-destructive/80 text-xs">
                  {errorMessage ?? "โปรดลองอีกครั้ง"}
                </div>
                <Button
                  type="button"
                  size="xs"
                  variant="outline"
                  className="mt-1"
                  onClick={resetPanel}
                >
                  <TimerReset className="size-3" /> ลองใหม่
                </Button>
              </div>
            </div>
          ) : null}

          {panelState === "ready" && phases.length > 0 ? (
            <PreviewBody
              phases={phases}
              teamById={teamById}
              team={teamState}
              dependencyLabels={dependencyLabels}
              collapsed={collapsed}
              setCollapsed={setCollapsed}
              onUpdateTask={updateTask}
              onPhaseSelection={setPhaseSelection}
            />
          ) : null}
        </div>
      ) : null}

      {open && panelState === "ready" ? (
        <div className="bg-background/80 sticky bottom-0 -mx-3 mt-4 rounded-b-xl border-t px-3 py-2 backdrop-blur">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              <span className="text-foreground text-sm font-medium">
                {selectedCount}/{allTasks.length} งาน
              </span>
              <span>·</span>
              <span>{humanHours(totalSelectedHours)} รวม</span>
              <span>·</span>
              <span>เดดไลน์ {deadline || "—"}</span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                size="sm"
                variant="ghost"
                onClick={resetPanel}
                disabled={creating}
              >
                <TimerReset className="size-3.5" /> รีเซ็ต
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={creating || selectedCount === 0}
                onClick={createTasks}
              >
                {creating ? (
                  <>
                    <CircleDashed className="size-3.5 animate-spin" />
                    Creating…
                  </>
                ) : (
                  <>
                    <CheckCheck className="size-3.5" />
                    สร้างลงบอร์ด ({selectedCount})
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function StatusBadge({ state }: { state: AiPanelState }) {
  if (state === "idle") {
    return (
      <Badge variant="outline" className="text-muted-foreground font-normal">
        idle
      </Badge>
    )
  }
  if (state === "loading") {
    return (
      <Badge variant="secondary" className="font-normal">
        <CircleDashed className="size-3 animate-spin" /> thinking
      </Badge>
    )
  }
  if (state === "ready") {
    return (
      <Badge variant="default" className="font-normal">
        <Check className="size-3" /> ready
      </Badge>
    )
  }
  if (state === "needs_key") {
    return (
      <Badge variant="outline" className="border-slate-300 bg-white text-slate-700 font-normal dark:bg-card">
        <KeyRound className="size-3" /> needs OpenRouter key
      </Badge>
    )
  }
  return (
    <Badge variant="destructive" className="font-normal">
      <AlertCircle className="size-3" /> error
    </Badge>
  )
}

function NeedsKeyCallout() {
  return (
    <div className="rounded-xl border bg-white p-3 text-sm shadow-xs dark:bg-card">
      <div className="flex items-start gap-3">
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border bg-slate-50 text-slate-700 dark:bg-muted/40">
          <KeyRound className="size-4" />
        </div>
        <div className="space-y-1.5">
          <div className="font-medium text-foreground">
            ยังไม่ได้เปิด OpenRouter สำหรับ AI
          </div>
          <p className="text-muted-foreground text-xs">
            เพิ่ม <code className="rounded border bg-slate-50 px-1 py-0.5 text-[11px] dark:bg-muted">OPENROUTER_API_KEY</code>{" "}
            เป็น Vercel Preview env แล้ว redeploy หนึ่งรอบ — ระบบจะเรียก Claude ผ่าน OpenRouter เพื่อแตกงานให้ทีมทันที
          </p>
          <ol className="text-muted-foreground list-decimal space-y-0.5 pl-4 text-xs">
            <li>Vercel → Project <code>aba-energy-os</code> → Settings → Environment Variables</li>
            <li>Add <code>OPENROUTER_API_KEY</code> · scope: <strong>Preview</strong></li>
            <li>Optional: set <code>OPENROUTER_MODEL</code> เช่น <code>anthropic/claude-sonnet-4.5</code></li>
            <li>แจ้งเอวาให้ redeploy preview แล้วทดสอบ real flow</li>
          </ol>
        </div>
      </div>
    </div>
  )
}

function PreviewSkeleton() {
  return (
    <div className="space-y-3">
      {[0, 1].map((i) => (
        <div key={i} className="rounded-lg border p-3">
          <div className="flex items-center justify-between">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-16" />
          </div>
          <div className="mt-3 space-y-2">
            {[0, 1, 2].map((j) => (
              <div key={j} className="flex items-center gap-3">
                <Skeleton className="size-4" />
                <Skeleton className="h-4 flex-1" />
                <Skeleton className="h-4 w-12" />
                <Skeleton className="h-4 w-24" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

function PreviewBody({
  phases,
  teamById,
  team,
  dependencyLabels,
  collapsed,
  setCollapsed,
  onUpdateTask,
  onPhaseSelection,
}: {
  phases: AiWorkBreakdownPhase[]
  teamById: Map<string, AiWorkBreakdownTeamMember>
  team: AiWorkBreakdownTeamMember[]
  dependencyLabels: Map<string, string>
  collapsed: Record<string, boolean>
  setCollapsed: React.Dispatch<React.SetStateAction<Record<string, boolean>>>
  onUpdateTask: (
    clientId: string,
    patch: Partial<
      Pick<
        AiWorkBreakdownTask,
        "selected" | "title" | "estimateHours" | "suggestedAssignee"
      >
    >
  ) => void
  onPhaseSelection: (phaseName: string, selected: boolean) => void
}) {
  const total = flatten(phases).length
  const selected = flatten(phases).filter((task) => task.selected).length
  return (
    <div className="space-y-3">
      <div className="text-muted-foreground flex items-center justify-between text-xs">
        <div className="flex items-center gap-2">
          <Layers3 className="size-3.5" />
          <span>
            Preview · {selected}/{total} selected
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <Button
            type="button"
            size="xs"
            variant="ghost"
            onClick={() => onPhaseSelection("*", true)}
          >
            <CheckCheck className="size-3" /> Select all
          </Button>
          <Button
            type="button"
            size="xs"
            variant="ghost"
            onClick={() => onPhaseSelection("*", false)}
          >
            <TimerReset className="size-3" /> Deselect all
          </Button>
        </div>
      </div>
      {phases.map((phase) => {
        const isCollapsed = collapsed[phase.name] ?? false
        const phaseSelected = phase.tasks.filter((t) => t.selected).length
        const phaseAll = phase.tasks.every((t) => t.selected)
        const phaseNone = phase.tasks.every((t) => !t.selected)
        const phaseHours = phase.tasks.reduce(
          (sum, t) => sum + (t.estimateHours || 0),
          0
        )
        return (
          <Card key={phase.name} className="overflow-hidden">
            <button
              type="button"
              onClick={() =>
                setCollapsed((c) => ({ ...c, [phase.name]: !isCollapsed }))
              }
              className="hover:bg-muted/40 flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition-colors"
            >
              <div className="flex items-center gap-2">
                {isCollapsed ? (
                  <ChevronDown className="size-4" />
                ) : (
                  <ChevronUp className="size-4" />
                )}
                <span className="text-sm font-semibold">{phase.name}</span>
                <Badge variant="secondary" className="font-normal">
                  {phaseSelected}/{phase.tasks.length}
                </Badge>
              </div>
              <div className="text-muted-foreground flex items-center gap-3 text-xs">
                <span>{humanHours(phaseHours)}</span>
                <ProgressBar
                  value={phaseSelected}
                  total={phase.tasks.length}
                />
              </div>
            </button>
            {!isCollapsed ? (
              <CardContent className="space-y-2 p-3 pt-0">
                <div className="flex items-center justify-between">
                  <Separator />
                  <div className="text-muted-foreground flex shrink-0 items-center gap-1 pl-2 text-[11px]">
                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      disabled={phaseAll}
                      onClick={(e) => {
                        e.stopPropagation()
                        onPhaseSelection(phase.name, true)
                      }}
                    >
                      Select phase
                    </Button>
                    <span>·</span>
                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      disabled={phaseNone}
                      onClick={(e) => {
                        e.stopPropagation()
                        onPhaseSelection(phase.name, false)
                      }}
                    >
                      Clear phase
                    </Button>
                  </div>
                </div>
                {phase.tasks.map((task) => {
                  const assignee = task.suggestedAssignee
                    ? teamById.get(task.suggestedAssignee)
                    : null
                  return (
                    <div
                      key={task.clientId}
                      className={cn(
                        "rounded-md border p-3 transition-colors",
                        !task.selected && "bg-muted/30 opacity-70"
                      )}
                    >
                      <div className="flex items-start gap-3">
                        <Checkbox
                          checked={task.selected}
                          onCheckedChange={(value) =>
                            onUpdateTask(task.clientId, {
                              selected: value === true,
                            })
                          }
                          aria-label={`Select ${task.title}`}
                          className="mt-0.5"
                        />
                        <div className="flex-1 space-y-1.5">
                          <Input
                            value={task.title}
                            onChange={(e) =>
                              onUpdateTask(task.clientId, {
                                title: e.target.value,
                              })
                            }
                            aria-label="Task title"
                            className="h-8"
                          />
                          <div className="text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
                            {task.dependsOn.length > 0 ? (
                              <span className="flex items-center gap-1">
                                <ArrowRight className="size-3" />
                                depends on:{" "}
                                {task.dependsOn
                                  .map(
                                    (id) => dependencyLabels.get(id) ?? id
                                  )
                                  .join(", ")}
                              </span>
                            ) : (
                              <span>no deps</span>
                            )}
                            <span>·</span>
                            <span>due {task.dueDate}</span>
                          </div>
                        </div>
                        <div className="flex w-full flex-col gap-2 sm:w-56">
                          <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-0.5">
                              <label className="text-muted-foreground text-[10px] uppercase tracking-wide">
                                hours
                              </label>
                              <Input
                                type="number"
                                min="0.25"
                                step="0.25"
                                value={task.estimateHours}
                                onChange={(e) =>
                                  onUpdateTask(task.clientId, {
                                    estimateHours: Number(
                                      e.target.value || 0
                                    ),
                                  })
                                }
                                aria-label="Estimate hours"
                                className="h-8"
                              />
                            </div>
                            <div className="space-y-0.5">
                              <label className="text-muted-foreground text-[10px] uppercase tracking-wide">
                                assignee
                              </label>
                              <Select
                                value={task.suggestedAssignee ?? "none"}
                                onValueChange={(value) =>
                                  onUpdateTask(task.clientId, {
                                    suggestedAssignee:
                                      value === "none" ? null : value,
                                  })
                                }
                              >
                                <SelectTrigger
                                  className="h-8 w-full"
                                  aria-label="Suggested assignee"
                                >
                                  <SelectValue>
                                    {(value: string) => {
                                      if (value === "none")
                                        return "Unassigned"
                                      const member = teamById.get(value)
                                      if (!member) return "Unknown"
                                      return `${member.name} · ${member.openEstimateHours}h`
                                    }}
                                  </SelectValue>
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">
                                    Unassigned
                                  </SelectItem>
                                  {team.map((member) => (
                                    <SelectItem
                                      key={member.id}
                                      value={member.id}
                                    >
                                      {member.name} ·{" "}
                                      {member.skills.join("/")} ·{" "}
                                      {member.openEstimateHours}h open
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>
                          <div className="text-muted-foreground flex items-center justify-between text-[11px]">
                            <span>{assignee ? assignee.name : "Unassigned"}</span>
                            <span className="font-medium text-foreground">
                              {task.dueDate}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </CardContent>
            ) : null}
          </Card>
        )
      })}
    </div>
  )
}

function ProgressBar({ value, total }: { value: number; total: number }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0
  return (
    <div className="bg-muted relative h-1.5 w-24 overflow-hidden rounded-full">
      <div
        className="bg-primary h-full transition-all"
        style={{ width: `${pct}%` }}
      />
    </div>
  )
}
