"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { Copy, BookmarkPlus, FilePlus2 } from "lucide-react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

import {
  duplicateQuote,
  saveQuoteAsTemplate,
  createQuoteFromTemplate,
} from "../actions"

/** Redirecting server actions: on success navigation happens server-side. */
function useRun() {
  const [pending, startTransition] = useTransition()
  const run = (fn: () => Promise<{ error?: string }>) =>
    startTransition(async () => {
      const res = await fn()
      if (res?.error) toast.error(res.error)
    })
  return { pending, run }
}

export function DuplicateQuoteButton({ quoteId }: { quoteId: string }) {
  const { pending, run } = useRun()
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() => run(() => duplicateQuote(quoteId))}
    >
      <Copy /> Duplicate
    </Button>
  )
}

export function SaveAsTemplateButton({ quoteId }: { quoteId: string }) {
  const { pending, run } = useRun()
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() => run(() => saveQuoteAsTemplate(quoteId))}
    >
      <BookmarkPlus /> Save as template
    </Button>
  )
}

export function UseTemplateDialog({
  templateId,
  templateLabel,
  clients,
}: {
  templateId: string
  templateLabel: string
  clients: { value: string; label: string }[]
}) {
  const [open, setOpen] = useState(false)
  const [clientId, setClientId] = useState("")
  const { pending, run } = useRun()

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>
        <FilePlus2 /> Use template
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New quote from “{templateLabel}”</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Client</label>
            <Select value={clientId || undefined} onValueChange={(v) => setClientId(v ?? "")}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Pick the client" />
              </SelectTrigger>
              <SelectContent>
                {clients.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            disabled={pending || !clientId}
            onClick={() =>
              run(() =>
                createQuoteFromTemplate({
                  template_id: templateId,
                  client_id: clientId,
                })
              )
            }
          >
            Create quote
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}
