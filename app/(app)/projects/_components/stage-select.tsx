"use client"

/**
 * CR-001 ST-4 built the soft-gate `updateProjectStage` server action; ST-7
 * builds the override-confirm UI it deferred (see the action's `warning`
 * doc-comment in `../actions.ts`). When advancing would leave unmet
 * requirements, this now opens a dialog listing what's missing with a reason
 * field and a "Proceed anyway" resubmit — instead of the old no-op toast.
 *
 * Shared between `/projects` (kanban/list cards) and `/projects/[id]`
 * (detail page overview), so the dialog lives here rather than being
 * duplicated per page.
 */

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { AlertTriangle, X } from "lucide-react"

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { STAGES, type ProjectStage, type StageRequirement } from "@/lib/pipeline/stages"
import { updateProjectStage } from "../actions"

const STAGE_LABEL = Object.fromEntries(
  STAGES.map((s) => [s.value, s.label])
) as Record<ProjectStage, string>

export function StageSelect({
  projectId,
  stage,
}: {
  projectId: string
  stage: ProjectStage
}) {
  const [pending, startTransition] = useTransition()
  const [overridePending, startOverrideTransition] = useTransition()

  // Set when `updateProjectStage` comes back with `{ warning }` — the target
  // stage the caller tried to move to, plus the unmet requirements for the
  // project's *current* stage that are blocking it.
  const [confirm, setConfirm] = useState<{
    targetStage: ProjectStage
    requirements: StageRequirement[]
  } | null>(null)
  const [overrideReason, setOverrideReason] = useState("")
  const [overrideError, setOverrideError] = useState<string | null>(null)

  function closeConfirm() {
    setConfirm(null)
    setOverrideReason("")
    setOverrideError(null)
  }

  function requestStageChange(targetStage: ProjectStage) {
    startTransition(async () => {
      const res = await updateProjectStage({ id: projectId, stage: targetStage })
      if (res?.error) {
        toast.error(res.error)
      } else if (res?.warning) {
        setConfirm({ targetStage, requirements: res.warning.requirements })
        setOverrideReason("")
        setOverrideError(null)
      } else {
        toast.success("Stage updated")
      }
    })
  }

  function submitOverride() {
    if (!confirm) return
    startOverrideTransition(async () => {
      setOverrideError(null)
      const res = await updateProjectStage({
        id: projectId,
        stage: confirm.targetStage,
        override: true,
        overrideReason,
      })
      if (res?.error) {
        // Most commonly the "Only owners and admins can override…" capability
        // error — surface it inline (not just a toast) so it isn't missed
        // while the dialog is open, per CR-001 ST-7.
        setOverrideError(res.error)
        toast.error(res.error)
      } else if (res?.warning) {
        // Shouldn't normally happen (a non-empty reason always satisfies
        // decideStageAdvance's override path) — but don't silently drop it.
        setOverrideError("Requirements are still unmet. Add a reason and try again.")
      } else {
        toast.success("Stage updated (override recorded)")
        closeConfirm()
      }
    })
  }

  const unmet = confirm?.requirements.filter((r) => !r.met) ?? []

  return (
    <>
      <Select
        value={stage}
        disabled={pending}
        onValueChange={(v) => {
          if (!v || v === stage) return
          requestStageChange(v as ProjectStage)
        }}
      >
        <SelectTrigger size="sm">
          <SelectValue>{(v: ProjectStage) => STAGE_LABEL[v]}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {STAGES.map((s) => (
            <SelectItem key={s.value} value={s.value}>
              {s.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Dialog
        open={confirm !== null}
        onOpenChange={(open) => {
          if (!open) closeConfirm()
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-4 text-amber-600 dark:text-amber-400" />
              Can&apos;t advance yet
            </DialogTitle>
            <DialogDescription>
              Moving from <strong>{STAGE_LABEL[stage]}</strong> to{" "}
              <strong>{confirm ? STAGE_LABEL[confirm.targetStage] : ""}</strong> still
              needs:
            </DialogDescription>
          </DialogHeader>

          <ul className="space-y-1.5 text-sm">
            {unmet.map((r) => (
              <li key={r.label} className="flex items-start gap-2">
                <X className="mt-0.5 size-4 shrink-0 text-destructive" />
                {r.label}
              </li>
            ))}
          </ul>

          <div className="space-y-1.5">
            <Label htmlFor="override-reason">Reason for overriding</Label>
            <Textarea
              id="override-reason"
              placeholder="e.g. Customer verbally confirmed, paperwork to follow"
              value={overrideReason}
              onChange={(e) => setOverrideReason(e.target.value)}
              disabled={overridePending}
            />
          </div>

          {overrideError ? (
            <p className="text-sm text-destructive">{overrideError}</p>
          ) : null}

          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button
              onClick={submitOverride}
              disabled={overridePending || overrideReason.trim().length === 0}
            >
              Proceed anyway
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
