/**
 * CR-001 ST-7 — "stage N of 8" progress indicator for the project detail
 * page's overview card. See docs/PROJECT_PIPELINE_REDESIGN.md: 'Header: name,
 * client, current stage badge, "stage 3 of 8" progress bar.'
 *
 * Purely presentational; the index math itself lives in
 * `lib/pipeline/progress.ts` (pure, unit-tested).
 */

import { Progress } from "@/components/ui/progress"
import { getStageProgress } from "@/lib/pipeline/progress"
import type { ProjectStage } from "@/lib/pipeline/stages"

export function StageProgressHeader({ stage }: { stage: ProjectStage }) {
  const { position, total } = getStageProgress(stage)
  const pct = Math.round((position / total) * 100)

  return (
    <div className="flex items-center gap-3">
      <span className="text-muted-foreground shrink-0 text-xs font-medium">
        Stage {position} of {total}
      </span>
      <Progress value={pct} className="max-w-40 flex-1" />
    </div>
  )
}
