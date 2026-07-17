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
import { Checkbox } from "@/components/ui/checkbox"
import { PART_CATEGORIES, PHASE_OPTIONS } from "@/lib/parts/categories"
import { Constants } from "@/lib/types/database"

import { SelectField } from "./form-fields"

const Schema = z.object({
  sku: z.string().min(1, "SKU is required"),
  name: z.string().min(1, "Name is required"),
  brandModel: z.string().optional(),
  category: z.enum(Constants.public.Enums.part_category),
  unit: z.string().min(1, "Unit is required"),
  phaseCompat: z.string().optional(),
  defaultSellingPriceBaht: z.coerce.number().min(0).optional(),
  remark: z.string().optional(),
  isActive: z.boolean().optional(),
})

type Values = z.infer<typeof Schema>

export function PartForm({
  action,
  defaultValues,
  submitLabel = "Save part",
  /** When true, the action redirects on success, so we don't toast here. */
  redirectsOnSuccess = false,
}: {
  action: (values: Values) => Promise<{ error?: string }>
  defaultValues?: Partial<Values>
  submitLabel?: string
  redirectsOnSuccess?: boolean
}) {
  const router = useRouter()
  const form = useForm<z.input<typeof Schema>, unknown, Values>({
    resolver: zodResolver(Schema),
    defaultValues: {
      sku: defaultValues?.sku ?? "",
      name: defaultValues?.name ?? "",
      brandModel: defaultValues?.brandModel ?? "",
      category: defaultValues?.category ?? "other",
      unit: defaultValues?.unit ?? "",
      phaseCompat: defaultValues?.phaseCompat ?? "",
      defaultSellingPriceBaht: defaultValues?.defaultSellingPriceBaht ?? 0,
      remark: defaultValues?.remark ?? "",
      isActive: defaultValues?.isActive ?? true,
    },
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
          if (!redirectsOnSuccess) {
            toast.success("Saved")
            router.refresh()
          }
        })}
        className="space-y-4"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Name</FormLabel>
                <FormControl>
                  <Input placeholder="PV Module (N-type, Tier-1)" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="sku"
            render={({ field }) => (
              <FormItem>
                <FormLabel>SKU</FormLabel>
                <FormControl>
                  <Input placeholder="PV-LONGI-650" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="brandModel"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Brand / model / spec</FormLabel>
              <FormControl>
                <Input placeholder="Longi Hi-MO X10 (650W)" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid gap-4 sm:grid-cols-3">
          <SelectField
            name="category"
            label="Category"
            placeholder="Select category"
            options={PART_CATEGORIES.map((c) => ({
              value: c.value,
              label: c.label,
            }))}
          />
          <FormField
            control={form.control}
            name="unit"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Unit</FormLabel>
                <FormControl>
                  <Input placeholder="pc / set / m / pair / lot" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <SelectField
            name="phaseCompat"
            label="Phase"
            placeholder="Select phase"
            options={PHASE_OPTIONS}
            optional
            noneLabel="Not specified"
          />
        </div>

        <FormField
          control={form.control}
          name="defaultSellingPriceBaht"
          render={({ field }) => (
            <FormItem className="sm:max-w-xs">
              <FormLabel>Default selling price (฿, ex-VAT)</FormLabel>
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
              <FormDescription>
                Prefills new quote lines — still editable per quote. Leave 0 if
                unset.
              </FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="remark"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Remark</FormLabel>
              <FormControl>
                <Textarea
                  placeholder="e.g. 8 × 650W = 5.2 kWp DC"
                  rows={3}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="isActive"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center gap-2">
              <FormControl>
                <Checkbox
                  checked={field.value ?? true}
                  onCheckedChange={(checked) => field.onChange(checked === true)}
                />
              </FormControl>
              <FormLabel className="!mt-0">
                Active (shown in the quote parts picker)
              </FormLabel>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex items-center gap-2">
          <Button type="submit" disabled={form.formState.isSubmitting}>
            {submitLabel}
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={form.formState.isSubmitting}
            onClick={() => router.back()}
          >
            Cancel
          </Button>
        </div>
      </form>
    </Form>
  )
}
