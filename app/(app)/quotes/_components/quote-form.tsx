"use client"

import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"

import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
  FormDescription,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"

import { SelectField, type Option } from "./form-fields"

const Schema = z.object({
  client_id: z.string().min(1, "Choose a client"),
  project_id: z.string().optional(),
  number: z.string().optional(),
  issue_date: z.string().optional(),
  valid_until: z.string().optional(),
  discountBaht: z.coerce.number().min(0, "Discount must be 0 or more"),
  systemSizeKwp: z.coerce.number().min(0).optional(),
  panelModel: z.string().optional(),
  inverterModel: z.string().optional(),
  batteryOption: z.string().optional(),
  warrantyYears: z.coerce.number().min(0).optional(),
  paybackYears: z.coerce.number().min(0).optional(),
  proposalAssumptions: z.string().optional(),
  includedScope: z.string().optional(),
  excludedScope: z.string().optional(),
  notes: z.string().optional(),
})

type Values = z.infer<typeof Schema>
/** The exact payload shape `action` receives on submit (Zod output of the form). */
export type QuoteFormSubmitValues = Values

export type QuoteFormValues = {
  client_id: string
  project_id: string
  number: string
  issue_date: string
  valid_until: string
  discountBaht: number
  systemSizeKwp: number
  panelModel: string
  inverterModel: string
  batteryOption: string
  warrantyYears: number
  paybackYears: number
  proposalAssumptions: string
  includedScope: string
  excludedScope: string
  notes: string
}

export function QuoteForm({
  clients,
  projects,
  defaultValues,
  submitLabel,
  action,
}: {
  clients: Option[]
  projects: Option[]
  defaultValues: QuoteFormValues
  submitLabel: string
  action: (values: Values) => Promise<{ error?: string } | void>
}) {
  const router = useRouter()
  const form = useForm<z.input<typeof Schema>, unknown, Values>({
    resolver: zodResolver(Schema),
    defaultValues,
  })

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(async (values) => {
          const res = await action(values)
          if (res?.error) {
            toast.error(res.error)
            return
          }
          // createQuote redirects on success (no return); update returns {}.
          toast.success("Quote saved")
          router.refresh()
        })}
        className="space-y-5"
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <SelectField
            name="client_id"
            label="Client"
            placeholder="Select a client"
            options={clients}
          />
          <SelectField
            name="project_id"
            label="Project"
            placeholder="No project"
            options={projects}
            optional
            noneLabel="No project"
            description="Optional — link to a project."
          />
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="number"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Quote number</FormLabel>
                <FormControl>
                  <Input placeholder="Auto (QUO-2026-00X)" {...field} />
                </FormControl>
                <FormDescription>
                  Leave blank to auto-number.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="discountBaht"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Discount (฿)</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    min={0}
                    step="0.01"
                    inputMode="decimal"
                    name={field.name}
                    ref={field.ref}
                    onBlur={field.onBlur}
                    value={(field.value ?? "") as number | string}
                    onChange={field.onChange}
                  />
                </FormControl>
                <FormDescription>Absolute amount off the subtotal.</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="issue_date"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Issue date</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="valid_until"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Valid until</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <section className="space-y-4 rounded-lg border p-4">
          <div>
            <h2 className="text-sm font-semibold">Solar proposal spec</h2>
            <p className="text-muted-foreground text-xs">Capture technical scope and assumptions for the customer proposal/PDF.</p>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <FormField control={form.control} name="systemSizeKwp" render={({ field }) => (<FormItem><FormLabel>System size (kWp)</FormLabel><FormControl><Input type="number" min={0} step="0.01" inputMode="decimal" name={field.name} ref={field.ref} onBlur={field.onBlur} value={(field.value ?? "") as number | string} onChange={field.onChange} /></FormControl><FormMessage /></FormItem>)} />
            <FormField control={form.control} name="paybackYears" render={({ field }) => (<FormItem><FormLabel>Payback (years)</FormLabel><FormControl><Input type="number" min={0} step="0.01" inputMode="decimal" name={field.name} ref={field.ref} onBlur={field.onBlur} value={(field.value ?? "") as number | string} onChange={field.onChange} /></FormControl><FormMessage /></FormItem>)} />
            <FormField control={form.control} name="panelModel" render={({ field }) => (<FormItem><FormLabel>Panel model</FormLabel><FormControl><Input placeholder="Panel brand/model" {...field} /></FormControl><FormMessage /></FormItem>)} />
            <FormField control={form.control} name="inverterModel" render={({ field }) => (<FormItem><FormLabel>Inverter model</FormLabel><FormControl><Input placeholder="Inverter brand/model" {...field} /></FormControl><FormMessage /></FormItem>)} />
            <FormField control={form.control} name="batteryOption" render={({ field }) => (<FormItem><FormLabel>Battery / EV option</FormLabel><FormControl><Input placeholder="Optional battery / EV charger scope" {...field} /></FormControl><FormMessage /></FormItem>)} />
            <FormField control={form.control} name="warrantyYears" render={({ field }) => (<FormItem><FormLabel>Warranty (years)</FormLabel><FormControl><Input type="number" min={0} step="0.01" inputMode="decimal" name={field.name} ref={field.ref} onBlur={field.onBlur} value={(field.value ?? "") as number | string} onChange={field.onChange} /></FormControl><FormMessage /></FormItem>)} />
          </div>
          <FormField control={form.control} name="includedScope" render={({ field }) => (<FormItem><FormLabel>Included scope</FormLabel><FormControl><Textarea rows={3} placeholder="Equipment, installation, monitoring, handover…" {...field} /></FormControl><FormMessage /></FormItem>)} />
          <FormField control={form.control} name="excludedScope" render={({ field }) => (<FormItem><FormLabel>Excluded scope</FormLabel><FormControl><Textarea rows={3} placeholder="Civil work, meter upgrade, permits, optional add-ons…" {...field} /></FormControl><FormMessage /></FormItem>)} />
          <FormField control={form.control} name="proposalAssumptions" render={({ field }) => (<FormItem><FormLabel>Proposal assumptions</FormLabel><FormControl><Textarea rows={3} placeholder="Yield/payback assumptions; avoid guaranteed claims." {...field} /></FormControl><FormMessage /></FormItem>)} />
        </section>

        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Notes</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="Scope, assumptions, terms…"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end gap-2">
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {submitLabel}
          </Button>
        </div>
      </form>
    </Form>
  )
}
