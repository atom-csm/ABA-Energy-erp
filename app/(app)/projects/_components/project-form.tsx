"use client"

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
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import type { Enums } from "@/lib/types/database"

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

const NONE = "none"

const FormSchema = z.object({
  name: z.string().min(1, "Project name is required"),
  clientId: z.string(),
  stage: z.enum([
    "electric_bill_collection",
    "site_survey",
    "quotation_and_proposal",
    "negotiation_and_followup",
    "installation",
    "payment",
    "after_sales",
    "archive",
  ]),
  deadline: z.string(),
  owner: z.string(),
  installationStartDate: z.string(),
  installationEndDate: z.string(),
  installationCrew: z.string(),
  depositReceived: z.boolean(),
  handoverCompleted: z.boolean(),
  warrantyRegistered: z.boolean(),
})

type FormInput = z.input<typeof FormSchema>
export type ProjectFormValues = z.output<typeof FormSchema>

export type ClientOption = { id: string; name: string }

export function ProjectForm({
  action,
  clients,
  defaultValues,
  submitLabel = "Create project",
}: {
  action: (values: ProjectFormValues) => Promise<{ error?: string }>
  clients: ClientOption[]
  defaultValues?: Partial<FormInput>
  submitLabel?: string
}) {
  const form = useForm<FormInput, unknown, ProjectFormValues>({
    resolver: zodResolver(FormSchema),
    defaultValues: {
      name: "",
      clientId: NONE,
      stage: "electric_bill_collection",
      deadline: "",
      owner: "",
      installationStartDate: "",
      installationEndDate: "",
      installationCrew: "",
      depositReceived: false,
      handoverCompleted: false,
      warrantyRegistered: false,
      ...defaultValues,
    },
  })

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(async (values) => {
          const res = await action(values)
          // On success the action redirects (throws), so we only reach here on error.
          if (res?.error) toast.error(res.error)
        })}
        className="space-y-5"
      >
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Project name</FormLabel>
              <FormControl>
                <Input placeholder="e.g. Website automation" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid gap-5 sm:grid-cols-3">
          <FormField
            control={form.control}
            name="clientId"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Client</FormLabel>
                <Select
                  value={field.value}
                  onValueChange={(v) => field.onChange(v ?? NONE)}
                >
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="No client">
                        {(v: string | null) =>
                          !v || v === NONE
                            ? "No client"
                            : (clients.find((c) => c.id === v)?.name ?? "No client")
                        }
                      </SelectValue>
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    <SelectItem value={NONE}>No client</SelectItem>
                    {clients.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="stage"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Stage</FormLabel>
                <Select
                  value={field.value}
                  onValueChange={(v) => field.onChange(v)}
                >
                  <FormControl>
                    <SelectTrigger className="w-full">
                      <SelectValue>
                        {(v: ProjectStage) => STAGE_LABEL[v]}
                      </SelectValue>
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {STAGE_OPTIONS.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="deadline"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Deadline</FormLabel>
                <FormControl>
                  <Input type="date" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

        </div>

        <FormField
          control={form.control}
          name="owner"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Owner</FormLabel>
              <FormControl>
                <Input placeholder="Who owns delivery?" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <section className="space-y-4 rounded-lg border p-4">
          <div>
            <h2 className="text-sm font-semibold">Installation tracker</h2>
            <p className="text-muted-foreground text-xs">Track crew, install dates, deposit, handover, and warranty readiness.</p>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <FormField control={form.control} name="installationStartDate" render={({ field }) => (<FormItem><FormLabel>Install start</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>)} />
            <FormField control={form.control} name="installationEndDate" render={({ field }) => (<FormItem><FormLabel>Install end</FormLabel><FormControl><Input type="date" {...field} /></FormControl><FormMessage /></FormItem>)} />
          </div>
          <FormField control={form.control} name="installationCrew" render={({ field }) => (<FormItem><FormLabel>Crew / contractor</FormLabel><FormControl><Input placeholder="ABA install team / contractor" {...field} /></FormControl><FormMessage /></FormItem>)} />
          <div className="grid gap-5 sm:grid-cols-3">
            <FormField control={form.control} name="depositReceived" render={({ field }) => (<FormItem><FormLabel>Deposit received</FormLabel><Select value={field.value ? "yes" : "no"} onValueChange={(v)=>field.onChange(v === "yes")}><FormControl><SelectTrigger className="w-full"><SelectValue /></SelectTrigger></FormControl><SelectContent><SelectItem value="no">No</SelectItem><SelectItem value="yes">Yes</SelectItem></SelectContent></Select><FormMessage /></FormItem>)} />
            <FormField control={form.control} name="handoverCompleted" render={({ field }) => (<FormItem><FormLabel>Handover done</FormLabel><Select value={field.value ? "yes" : "no"} onValueChange={(v)=>field.onChange(v === "yes")}><FormControl><SelectTrigger className="w-full"><SelectValue /></SelectTrigger></FormControl><SelectContent><SelectItem value="no">No</SelectItem><SelectItem value="yes">Yes</SelectItem></SelectContent></Select><FormMessage /></FormItem>)} />
            <FormField control={form.control} name="warrantyRegistered" render={({ field }) => (<FormItem><FormLabel>Warranty registered</FormLabel><Select value={field.value ? "yes" : "no"} onValueChange={(v)=>field.onChange(v === "yes")}><FormControl><SelectTrigger className="w-full"><SelectValue /></SelectTrigger></FormControl><SelectContent><SelectItem value="no">No</SelectItem><SelectItem value="yes">Yes</SelectItem></SelectContent></Select><FormMessage /></FormItem>)} />
          </div>
        </section>

        <div className="flex gap-2">
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {submitLabel}
          </Button>
        </div>
      </form>
    </Form>
  )
}
