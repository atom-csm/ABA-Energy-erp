"use client"

import { useTransition } from "react"
import { toast } from "sonner"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { Enums } from "@/lib/types/database"
import { updateProjectStage } from "../actions"

type ProjectStage = Enums<"project_stage">

const STAGE_OPTIONS: { value: ProjectStage; label: string }[] = [
  { value: "electric_bill_collection", label: "Electric bill collection" },
  { value: "site_survey", label: "Site survey" },
  { value: "quotation_and_proposal", label: "Quotation & proposal" },
  { value: "negotiation_and_followup", label: "Negotiation & follow-up" },
  { value: "installation", label: "Installation" },
  { value: "payment", label: "Payment" },
  { value: "after_sales", label: "After-sales" },
  { value: "archive", label: "Archive" },
]

const STAGE_LABEL = Object.fromEntries(
  STAGE_OPTIONS.map((s) => [s.value, s.label])
) as Record<ProjectStage, string>

export function StageSelect({
  projectId,
  stage,
}: {
  projectId: string
  stage: ProjectStage
}) {
  const [pending, startTransition] = useTransition()

  return (
    <Select
      value={stage}
      disabled={pending}
      onValueChange={(v) => {
        if (!v || v === stage) return
        startTransition(async () => {
          const res = await updateProjectStage({
            id: projectId,
            stage: v as ProjectStage,
          })
          if (res?.error) {
            toast.error(res.error)
          } else if (res?.warning) {
            // Soft gate (CR-001 ST-4): the stage did NOT change. The real
            // "confirm override" checklist UI is ST-7 — for now, surface the
            // unmet requirement(s) as a no-op toast, same convention as
            // other action errors in this app.
            const unmet = res.warning.requirements
              .filter((r) => !r.met)
              .map((r) => r.label)
              .join(", ")
            toast.error(
              unmet
                ? `Can't advance yet: ${unmet}`
                : "Can't advance yet: requirements not met"
            )
          } else {
            toast.success("Stage updated")
          }
        })
      }}
    >
      <SelectTrigger size="sm">
        <SelectValue>{(v: ProjectStage) => STAGE_LABEL[v]}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {STAGE_OPTIONS.map((s) => (
          <SelectItem key={s.value} value={s.value}>
            {s.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
