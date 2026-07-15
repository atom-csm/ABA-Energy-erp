/**
 * Surveys folded into the Projects page: every `solar_surveys` row now
 * requires a `project_id` (see the "survey_project_required" migration), so
 * this is the one place surveys get created/browsed instead of the old
 * standalone /surveys list.
 */

import Link from "next/link"
import { FilePlus2, ClipboardCheck } from "lucide-react"

import { EmptyState } from "@/components/empty-state"
import { Button } from "@/components/ui/button"
import { formatDate } from "../_lib/dates"

export type ProjectSurvey = {
  id: string
  title: string
  status: string
  scheduled_date: string | null
  completed_date: string | null
  roof_type: string | null
  roof_area_sqm: number | null
  meter_phase: string | null
}

export function SurveysSection({
  projectId,
  surveys,
}: {
  projectId: string
  surveys: ProjectSurvey[]
}) {
  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button
          size="sm"
          render={<Link href={`/surveys/new?projectId=${projectId}`} />}
        >
          <FilePlus2 data-icon="inline-start" /> New survey
        </Button>
      </div>

      {surveys.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title="No surveys yet"
          description="Schedule a site survey to record roof, meter, and breaker details."
          className="border-0 p-6"
        />
      ) : (
        <ul className="divide-y rounded-md border">
          {surveys.map((s) => (
            <li key={s.id} className="flex items-center gap-3 px-3 py-2.5">
              <Link
                href={`/surveys/${s.id}`}
                className="min-w-0 flex-1 truncate text-sm font-medium hover:underline"
              >
                {s.title}
              </Link>
              <span className="text-muted-foreground hidden shrink-0 text-xs sm:inline">
                {[s.roof_type, s.roof_area_sqm ? `${s.roof_area_sqm} sqm` : null, s.meter_phase]
                  .filter(Boolean)
                  .join(" · ") || "—"}
              </span>
              <span className="text-muted-foreground hidden shrink-0 text-xs sm:inline">
                {s.scheduled_date ? formatDate(s.scheduled_date) : "—"}
              </span>
              <span className="shrink-0 text-xs font-medium capitalize">
                {s.status.replaceAll("_", " ")}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
