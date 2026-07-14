"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Plus, ShieldCheck, FileSignature, Wrench, HeartHandshake, ExternalLink, Trash2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { addHandoverEvidence, removeHandoverEvidence } from "../actions"
import { cn } from "@/lib/utils"
import { formatDateTime } from "@/lib/dates"

type Kind = "handover" | "warranty" | "commissioning" | "after_sale"

type Evidence = {
  id: string
  kind: Kind
  note: string | null
  evidence_url: string | null
  signed_by: string | null
  signed_at: string | null
  created_by: string | null
  created_at: string
}

const KIND_META: Record<Kind, { label: string; tone: string; icon: React.ComponentType<{ className?: string }> }> = {
  handover:        { label: "Handover",         tone: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200", icon: FileSignature },
  warranty:        { label: "Warranty",         tone: "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-200", icon: ShieldCheck },
  commissioning:   { label: "Commissioning",    tone: "bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-200", icon: Wrench },
  after_sale:      { label: "After-sale",       tone: "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200", icon: HeartHandshake },
}

const KINDS: Kind[] = ["handover", "warranty", "commissioning", "after_sale"]

export function HandoverEvidenceSection({ projectId, items }: { projectId: string; items: Evidence[] }) {
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<Kind>("handover")
  const [note, setNote] = useState("")
  const [url, setUrl] = useState("")
  const [signedBy, setSignedBy] = useState("")
  const [signedAt, setSignedAt] = useState<string>("")
  const [pending, startTransition] = useTransition()
  const [removingId, startRemove] = useTransition()

  function reset() {
    setNote("")
    setUrl("")
    setSignedBy("")
    setSignedAt("")
    setKind("handover")
  }

  function submit() {
    startTransition(async () => {
      const res = await addHandoverEvidence({
        projectId,
        kind,
        note: note.trim() ? note.trim() : undefined,
        evidenceUrl: url.trim() ? url.trim() : undefined,
        signedBy: signedBy.trim() ? signedBy.trim() : undefined,
        signedAt: signedAt ? new Date(signedAt).toISOString() : undefined,
      })
      if (res?.error) {
        toast.error(res.error)
        return
      }
      toast.success("Evidence saved")
      reset()
      setOpen(false)
    })
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-muted-foreground text-sm">
          {items.length === 0
            ? "No handover evidence recorded yet."
            : `${items.length} record${items.length === 1 ? "" : "s"}.`}
        </div>
        <Button
          type="button"
          size="sm"
          variant={open ? "outline" : "default"}
          onClick={() => setOpen((v) => !v)}
        >
          <Plus className="size-4" /> {open ? "Cancel" : "Add evidence"}
        </Button>
      </div>

      {open ? (
        <div className="space-y-3 rounded-md border bg-card p-3">
          <div className="flex flex-wrap gap-1.5">
            {KINDS.map((k) => {
              const meta = KIND_META[k]
              const Icon = meta.icon
              return (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-medium",
                    kind === k ? meta.tone + " border-transparent" : "border-border text-muted-foreground hover:bg-muted"
                  )}
                >
                  <Icon className="size-3" /> {meta.label}
                </button>
              )
            })}
          </div>
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note: what was handed over, who was present, conditions accepted…"
            rows={3}
          />
          <Input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Evidence URL (Drive folder, photo album, warranty PDF, e-sign doc…)"
          />
          <div className="grid gap-2 sm:grid-cols-2">
            <Input
              value={signedBy}
              onChange={(e) => setSignedBy(e.target.value)}
              placeholder="Signed by (customer name / rep)"
            />
            <Input
              type="datetime-local"
              value={signedAt}
              onChange={(e) => setSignedAt(e.target.value)}
              aria-label="Signed at"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => { reset(); setOpen(false) }} disabled={pending}>
              Cancel
            </Button>
            <Button type="button" onClick={submit} disabled={pending}>
              {pending ? "Saving…" : "Save evidence"}
            </Button>
          </div>
        </div>
      ) : null}

      {items.length > 0 ? (
        <ul className="divide-y rounded-md border">
          {items.map((it) => {
            const meta = KIND_META[it.kind]
            const Icon = meta.icon
            return (
              <li key={it.id} className="flex items-start gap-3 px-3 py-2.5">
                <div className={cn("mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md", meta.tone)}>
                  <Icon className="size-3.5" />
                </div>
                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary" className="font-normal">
                      {meta.label}
                    </Badge>
                    {it.signed_by ? (
                      <span className="text-muted-foreground text-xs">
                        by {it.signed_by}
                        {it.signed_at ? ` · ${formatDateTime(it.signed_at)}` : ""}
                      </span>
                    ) : null}
                    <span className="text-muted-foreground ml-auto text-xs">
                      {formatDateTime(it.created_at)}
                    </span>
                  </div>
                  {it.note ? <p className="text-sm whitespace-pre-wrap">{it.note}</p> : null}
                  {it.evidence_url ? (
                    <a
                      href={it.evidence_url}
                      target="_blank"
                      rel="noreferrer"
                      className="text-primary inline-flex items-center gap-1 text-xs hover:underline"
                    >
                      Open evidence <ExternalLink className="size-3" />
                    </a>
                  ) : null}
                </div>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label="Remove evidence"
                  disabled={removingId}
                  onClick={() =>
                    startRemove(async () => {
                      const res = await removeHandoverEvidence({ id: it.id, projectId })
                      if (res?.error) toast.error(res.error)
                      else toast.success("Evidence removed")
                    })
                  }
                >
                  <Trash2 className="size-4" />
                </Button>
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}
