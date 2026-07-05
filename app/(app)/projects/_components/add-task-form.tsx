"use client"

import { useMemo, useState, useTransition } from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { AlertCircle, Plus, Sparkles, Wand2 } from "lucide-react"

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
  const [notConfigured, setNotConfigured] = useState(false)
  const [pending, startTransition] = useTransition()
  const [creating, startCreating] = useTransition()

  const teamById = useMemo(
    () => new Map(teamState.map((member) => [member.id, member])),
    [teamState]
  )
  const dependencyLabels = useMemo(() => taskLabelById(phases), [phases])
  const selectedCount = useMemo(
    () => flatten(phases).filter((task) => task.selected).length,
    [phases]
  )

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

  function generate() {
    if (!goal.trim()) return toast.error("Please enter a goal first.")
    if (!deadline) return toast.error("Please choose the overall deadline.")
    setNotConfigured(false)
    startTransition(async () => {
      const res = await generateAiWorkBreakdown({ projectId, goal, deadline })
      if ("error" in res) {
        toast.error(res.error)
        return
      }
      if ("notConfigured" in res) {
        setNotConfigured(true)
        return
      }
      setTeamState(res.team)
      setPhases(res.phases)
      toast.success("AI breakdown ready for review")
    })
  }

  function createTasks() {
    const tasks = flatten(phases)
    if (tasks.filter((task) => task.selected).length === 0) {
      return toast.error("Select at least one task to create.")
    }
    startCreating(async () => {
      const res = await createAiWorkBreakdownTasks({ projectId, deadline, tasks })
      if (res.error) {
        toast.error(res.error)
        return
      }
      toast.success(`${res.created ?? 0} tasks created on board`)
      setPhases([])
      setGoal("")
      setOpen(false)
    })
  }

  return (
    <div className="space-y-3 rounded-lg border border-dashed p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-medium">
            <Sparkles className="text-primary size-4" /> AI work breakdown
          </div>
          <p className="text-muted-foreground text-xs">
            Chat goal + deadline → preview phases/tasks → create only confirmed tasks.
          </p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => setOpen((v) => !v)}>
          <Wand2 className="size-3.5" /> แตกงานด้วย AI
        </Button>
      </div>

      {open ? (
        <div className="space-y-4">
          <div className="grid gap-3 lg:grid-cols-[1fr_180px_auto] lg:items-end">
            <div className="space-y-1.5">
              <label className="text-muted-foreground text-xs font-medium">Goal</label>
              <Textarea
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                placeholder="เช่น เปิดเว็บร้านใหม่ใน 6 สัปดาห์"
                className="min-h-24"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-muted-foreground text-xs font-medium">Overall deadline</label>
              <Input type="date" value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            </div>
            <Button type="button" disabled={pending || creating} onClick={generate}>
              <Sparkles className="size-3.5" />
              {pending ? "Breaking down…" : "Generate preview"}
            </Button>
          </div>

          {notConfigured ? (
            <div className="text-muted-foreground flex items-start gap-2 rounded-lg border border-dashed p-3 text-sm">
              <AlertCircle className="mt-0.5 size-4" />
              <span>AI is not configured — add ANTHROPIC_API_KEY to enable.</span>
            </div>
          ) : null}

          {phases.length > 0 ? (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="text-sm font-medium">Preview ({selectedCount} selected)</div>
                <Button type="button" disabled={creating || pending} onClick={createTasks}>
                  <Plus className="size-3.5" />
                  {creating ? "Creating…" : "สร้างลงบอร์ด"}
                </Button>
              </div>

              {phases.map((phase) => (
                <Card key={phase.name} className="overflow-hidden">
                  <CardContent className="space-y-3 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-medium">{phase.name}</div>
                      <Badge variant="secondary" className="font-normal">
                        {phase.tasks.filter((task) => task.selected).length}/{phase.tasks.length} tasks
                      </Badge>
                    </div>
                    <div className="space-y-2">
                      {phase.tasks.map((task) => {
                        const assignee = task.suggestedAssignee
                          ? teamById.get(task.suggestedAssignee)
                          : null
                        return (
                          <div
                            key={task.clientId}
                            className={cn(
                              "grid gap-2 rounded-md border p-3 lg:grid-cols-[auto_1fr_96px_180px_120px] lg:items-start",
                              !task.selected && "bg-muted/40 opacity-70"
                            )}
                          >
                            <Checkbox
                              checked={task.selected}
                              onCheckedChange={(value) =>
                                updateTask(task.clientId, { selected: value === true })
                              }
                              aria-label={`Select ${task.title}`}
                              className="mt-2"
                            />
                            <div className="space-y-1.5">
                              <Input
                                value={task.title}
                                onChange={(e) => updateTask(task.clientId, { title: e.target.value })}
                                aria-label="Task title"
                              />
                              {task.dependsOn.length > 0 ? (
                                <p className="text-muted-foreground text-xs">
                                  Depends on:{" "}
                                  {task.dependsOn
                                    .map((id) => dependencyLabels.get(id) ?? id)
                                    .join(", ")}
                                </p>
                              ) : (
                                <p className="text-muted-foreground text-xs">No dependencies</p>
                              )}
                            </div>
                            <Input
                              type="number"
                              min="1"
                              step="0.25"
                              value={task.estimateHours}
                              onChange={(e) =>
                                updateTask(task.clientId, {
                                  estimateHours: Number(e.target.value || 1),
                                })
                              }
                              aria-label="Estimate hours"
                            />
                            <Select
                              value={task.suggestedAssignee ?? "none"}
                              onValueChange={(value) =>
                                updateTask(task.clientId, {
                                  suggestedAssignee: value === "none" ? null : value,
                                })
                              }
                            >
                              <SelectTrigger className="w-full" aria-label="Suggested assignee">
                                <SelectValue>
                                  {(value: string) => {
                                    if (value === "none") return "Unassigned"
                                    const member = teamById.get(value)
                                    if (!member) return "Unknown teammate"
                                    return `${member.name} · ${member.openEstimateHours}h open`
                                  }}
                                </SelectValue>
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">Unassigned</SelectItem>
                                {teamState.map((member) => (
                                  <SelectItem key={member.id} value={member.id}>
                                    {member.name} · {member.skills.join("/")} · {member.openEstimateHours}h open
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <div className="text-muted-foreground text-xs lg:text-right">
                              <div className="font-medium text-foreground">{task.dueDate}</div>
                              <div>{assignee ? assignee.name : "Unassigned"}</div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}
