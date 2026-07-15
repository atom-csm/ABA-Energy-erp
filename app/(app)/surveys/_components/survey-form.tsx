"use client"

import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

const STATUSES = [
  { value: "scheduled", label: "Scheduled" },
  { value: "completed", label: "Completed" },
  { value: "needs_engineer", label: "Needs engineer" },
  { value: "blocked", label: "Blocked" },
  { value: "cancelled", label: "Cancelled" },
] as const

const Schema = z.object({
  title: z.string().min(1, "Survey title is required"),
  status: z.enum(["scheduled", "completed", "needs_engineer", "blocked", "cancelled"]),
  scheduledDate: z.string().optional(),
  completedDate: z.string().optional(),
  roofType: z.string().optional(),
  roofAreaSqm: z.coerce.number().min(0).optional(),
  meterPhase: z.string().optional(),
  mainBreakerAmp: z.coerce.number().min(0).optional(),
  shadingNotes: z.string().optional(),
  structuralNotes: z.string().optional(),
  photoFolderUrl: z.string().optional(),
  resultSummary: z.string().optional(),
})

export type SurveyFormValues = z.output<typeof Schema>

export function SurveyForm({
  action,
  defaultValues,
  submitLabel = "Save survey",
}: {
  action: (values: SurveyFormValues) => Promise<{ error?: string }>
  defaultValues?: Partial<SurveyFormValues>
  submitLabel?: string
}) {
  const form = useForm<z.input<typeof Schema>, unknown, SurveyFormValues>({
    resolver: zodResolver(Schema),
    defaultValues: {
      title: "",
      status: "scheduled",
      scheduledDate: "",
      completedDate: "",
      roofType: "",
      roofAreaSqm: 0,
      meterPhase: "",
      mainBreakerAmp: 0,
      shadingNotes: "",
      structuralNotes: "",
      photoFolderUrl: "",
      resultSummary: "",
      ...defaultValues,
    },
  })

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(async (values) => {
          const res = await action(values)
          if (res?.error) toast.error(res.error)
        })}
        className="space-y-5"
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <FormField control={form.control} name="title" render={({ field }) => (
            <FormItem><FormLabel>Survey title</FormLabel><FormControl><Input placeholder="Survey — customer/site" {...field} /></FormControl><FormMessage /></FormItem>
          )} />
          <FormField control={form.control} name="status" render={({ field }) => (
            <FormItem><FormLabel>Status</FormLabel><Select value={field.value} onValueChange={field.onChange}><FormControl><SelectTrigger className="w-full"><SelectValue /></SelectTrigger></FormControl><SelectContent>{STATUSES.map((s)=><SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}</SelectContent></Select><FormMessage /></FormItem>
          )} />
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <FormField control={form.control} name="scheduledDate" render={({ field }) => (<FormItem><FormLabel>Scheduled date</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>)} />
          <FormField control={form.control} name="completedDate" render={({ field }) => (<FormItem><FormLabel>Completed date</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>)} />
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <FormField control={form.control} name="roofType" render={({ field }) => (<FormItem><FormLabel>Roof type</FormLabel><FormControl><Input placeholder="Metal sheet, tile, flat roof…" {...field} /></FormControl><FormMessage /></FormItem>)} />
          <FormField control={form.control} name="roofAreaSqm" render={({ field: { value, ...field } }) => (<FormItem><FormLabel>Roof area (sqm)</FormLabel><FormControl><Input type="number" inputMode="decimal" min={0} step="0.01" {...field} value={(value ?? "") as string | number} /></FormControl><FormMessage /></FormItem>)} />
          <FormField control={form.control} name="meterPhase" render={({ field }) => (<FormItem><FormLabel>Meter phase</FormLabel><FormControl><Input placeholder="1-phase / 3-phase" {...field} /></FormControl><FormMessage /></FormItem>)} />
          <FormField control={form.control} name="mainBreakerAmp" render={({ field: { value, ...field } }) => (<FormItem><FormLabel>Main breaker (A)</FormLabel><FormControl><Input type="number" inputMode="numeric" min={0} step="1" {...field} value={(value ?? "") as string | number} /></FormControl><FormMessage /></FormItem>)} />
        </div>

        <FormField control={form.control} name="photoFolderUrl" render={({ field }) => (<FormItem><FormLabel>Photo folder URL</FormLabel><FormControl><Input placeholder="Google Drive / Supabase Storage URL" {...field} /></FormControl><FormMessage /></FormItem>)} />
        <FormField control={form.control} name="shadingNotes" render={({ field }) => (<FormItem><FormLabel>Shading notes</FormLabel><FormControl><Textarea rows={3} {...field} /></FormControl><FormMessage /></FormItem>)} />
        <FormField control={form.control} name="structuralNotes" render={({ field }) => (<FormItem><FormLabel>Structural notes</FormLabel><FormControl><Textarea rows={3} {...field} /></FormControl><FormMessage /></FormItem>)} />
        <FormField control={form.control} name="resultSummary" render={({ field }) => (<FormItem><FormLabel>Result summary</FormLabel><FormControl><Textarea rows={3} {...field} /></FormControl><FormMessage /></FormItem>)} />

        <Button type="submit" disabled={form.formState.isSubmitting}>{submitLabel}</Button>
      </form>
    </Form>
  )
}
