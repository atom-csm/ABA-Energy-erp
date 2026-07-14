"use client"

/**
 * CR-001 ST-6 — the `/projects` list page's pipeline board. See
 * docs/PROJECT_PIPELINE_REDESIGN.md's "List page (`/projects`)" section.
 *
 * Desktop and mobile are two different layouts, not one flexbox that
 * reflows: a kanban board (columns side by side) does not make sense on a
 * phone, and a single-stage vertical list with tabs does not make sense on a
 * wide screen. This component renders both trees and lets Tailwind's `md:`
 * breakpoint decide which one is in the DOM's visible flow
 * (`hidden md:block` / `md:hidden`), which keeps each layout's markup simple
 * (no shared grid that has to serve both shapes) at the cost of rendering
 * both once. Both share the same `ProjectCard` for a single "what does a
 * project look like" definition.
 *
 * Moving a project between stages happens via `StageSelect` (ST-4's
 * soft-gate/override control), not drag-and-drop — this repo has no D&D
 * library and the (now-deleted) Deals board didn't use one either.
 */

import { useRef, useState } from "react"
import Link from "next/link"
import { CalendarClock, User } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { cn } from "@/lib/utils"
import type { Enums } from "@/lib/types/database"
import { STAGES } from "@/lib/pipeline/stages"
import { swipeToAdjacentStageIndex } from "@/lib/pipeline/stage-tabs"
import { deadlineMeta } from "../_lib/dates"
import { StageSelect } from "./stage-select"

type ProjectStage = Enums<"project_stage">

export type PipelineProject = {
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
}

function groupByStage(
  projects: PipelineProject[]
): Map<ProjectStage, PipelineProject[]> {
  const byStage = new Map<ProjectStage, PipelineProject[]>()
  for (const s of STAGES) byStage.set(s.value, [])
  for (const p of projects) byStage.get(p.stage)?.push(p)
  return byStage
}

export function ProjectsPipeline({ projects }: { projects: PipelineProject[] }) {
  const byStage = groupByStage(projects)

  return (
    <>
      {/* Desktop: kanban board, one column per stage, always shown (even
          empty) so a stage like "Site survey" is visible as a destination
          even when nothing is in it yet. */}
      <div className="hidden md:block">
        <DesktopBoard byStage={byStage} />
      </div>

      {/* Mobile: horizontal swipeable stage tabs + a vertical card list for
          whichever stage tab is active — a full 8-column kanban board is
          painful to use with a thumb. */}
      <div className="md:hidden">
        <MobileStageTabs byStage={byStage} />
      </div>
    </>
  )
}

function DesktopBoard({
  byStage,
}: {
  byStage: Map<ProjectStage, PipelineProject[]>
}) {
  return (
    <div className="-mx-4 overflow-x-auto px-4 pb-2 md:-mx-6 md:px-6">
      <div className="flex min-w-max gap-4">
        {STAGES.map((s) => {
          const items = byStage.get(s.value) ?? []
          return (
            <div key={s.value} className="w-72 shrink-0">
              <div className="mb-2 flex items-center gap-2 px-1">
                <span className="text-sm font-semibold">{s.label}</span>
                <span className="text-muted-foreground text-xs">
                  {items.length}
                </span>
              </div>
              <div className="min-h-24 space-y-2 rounded-lg bg-muted/40 p-2">
                {items.length === 0 ? (
                  <p className="text-muted-foreground px-2 py-6 text-center text-xs">
                    Nothing here yet
                  </p>
                ) : (
                  items.map((p) => <ProjectCard key={p.id} project={p} />)
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

function MobileStageTabs({
  byStage,
}: {
  byStage: Map<ProjectStage, PipelineProject[]>
}) {
  const [index, setIndex] = useState(0)
  const touchStartX = useRef<number | null>(null)
  const active = STAGES[index]!
  const items = byStage.get(active.value) ?? []

  function handleTouchStart(e: React.TouchEvent) {
    touchStartX.current = e.touches[0]?.clientX ?? null
  }

  function handleTouchEnd(e: React.TouchEvent) {
    const startX = touchStartX.current
    touchStartX.current = null
    if (startX === null) return
    const endX = e.changedTouches[0]?.clientX ?? startX
    setIndex((current) =>
      swipeToAdjacentStageIndex(current, STAGES.length, endX - startX)
    )
  }

  return (
    <Tabs
      value={active.value}
      onValueChange={(v) => {
        const i = STAGES.findIndex((s) => s.value === v)
        if (i >= 0) setIndex(i)
      }}
    >
      <div className="-mx-4 overflow-x-auto px-4">
        <TabsList className="w-max">
          {STAGES.map((s) => (
            <TabsTrigger
              key={s.value}
              value={s.value}
              className="whitespace-nowrap"
            >
              {s.label}
              <span className="text-muted-foreground ml-1 text-xs">
                {(byStage.get(s.value) ?? []).length}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
      </div>

      {/* Swipe left/right here to move to the adjacent stage tab, same
          touch-start/touch-end delta pattern as the document lightbox
          (`document-gallery.tsx` / `lib/pipeline/lightbox.ts`), but with
          clamped (not wrapping) index math — see `lib/pipeline/stage-tabs.ts`
          for why. */}
      <div
        className="mt-3 space-y-2"
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {items.length === 0 ? (
          <p className="text-muted-foreground px-2 py-10 text-center text-sm">
            Nothing here yet.
          </p>
        ) : (
          items.map((p) => <ProjectCard key={p.id} project={p} />)
        )}
      </div>
    </Tabs>
  )
}

function ProjectCard({ project: p }: { project: PipelineProject }) {
  const dl = deadlineMeta(p.deadline)
  const install =
    [p.installation_start_date, p.installation_end_date]
      .filter(Boolean)
      .join(" → ") || null

  const flags: string[] = []
  if (p.deposit_received) flags.push("Deposit")
  if (p.handover_completed) flags.push("Handover")
  if (p.warranty_registered) flags.push("Warranty")

  return (
    <Card className="gap-0 py-0 transition-colors hover:border-ring">
      <CardContent className="space-y-2 p-3">
        <Link href={`/projects/${p.id}`} className="block space-y-1.5">
          <div className="text-sm leading-snug font-medium">{p.name}</div>
          <div className="text-muted-foreground text-xs">
            {p.client?.name ?? "—"}
          </div>

          {dl ? (
            <div
              className={cn(
                "inline-flex items-center gap-1 text-xs",
                dl.tone === "danger" && "text-red-600 dark:text-red-400",
                dl.tone === "warning" && "text-amber-600 dark:text-amber-400"
              )}
            >
              <CalendarClock className="size-3" />
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
            </div>
          ) : null}

          {install ? (
            <div className="text-muted-foreground text-xs">
              Install {install}
            </div>
          ) : null}

          {p.owner ? (
            <div className="text-muted-foreground flex items-center gap-1 text-xs">
              <User className="size-3" />
              {p.owner}
            </div>
          ) : null}

          {flags.length > 0 ? (
            <div className="flex flex-wrap gap-1 pt-0.5">
              {flags.map((f) => (
                <Badge
                  key={f}
                  variant="outline"
                  className="border-emerald-200 bg-emerald-50 text-emerald-700 text-xs dark:border-emerald-900 dark:bg-emerald-950 dark:text-emerald-300"
                >
                  {f}
                </Badge>
              ))}
            </div>
          ) : null}
        </Link>

        {/* Not inside the Link above — nesting an interactive Select trigger
            inside an anchor is invalid HTML and would fight the anchor's own
            click handling. Stopping propagation here just prevents this
            control's clicks from bubbling into anything above it in the
            tree; card click-to-navigate still works via the Link. */}
        <div onClick={(e) => e.stopPropagation()}>
          <StageSelect projectId={p.id} stage={p.stage} />
        </div>
      </CardContent>
    </Card>
  )
}
