/**
 * CR-001 ST-7 — "what's needed to move forward" checklist. Purely
 * presentational: the caller (the project detail page) assembles the live
 * `StageRequirement[]` via `loadProjectPipelineState` + `getStageRequirements`
 * (see `../actions.ts`) so this never hand-maintains its own copy of what's
 * required.
 */

import { CheckCircle2, Circle } from "lucide-react"

import { cn } from "@/lib/utils"
import type { StageRequirement } from "@/lib/pipeline/stages"

export function StageChecklist({
  requirements,
}: {
  requirements: StageRequirement[]
}) {
  if (requirements.length === 0) {
    return (
      <p className="text-muted-foreground text-sm">
        Nothing required to leave this stage — advance whenever you&apos;re ready.
      </p>
    )
  }

  return (
    <ul className="space-y-1.5">
      {requirements.map((r) => (
        <li key={r.label} className="flex items-center gap-2 text-sm">
          {r.met ? (
            <CheckCircle2 className="size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <Circle className="text-muted-foreground size-4 shrink-0" />
          )}
          <span className={cn(!r.met && "text-muted-foreground")}>{r.label}</span>
        </li>
      ))}
    </ul>
  )
}
