"use client"

import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { Plus } from "lucide-react"

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
import { Checkbox } from "@/components/ui/checkbox"

import { upsertSupplierPrice } from "../actions"
import { SelectField, type Option } from "./form-fields"

const Schema = z.object({
  supplierId: z.string().min(1, "Pick a supplier"),
  unitCostExVatBaht: z.coerce.number().min(0),
  unitCostIncVatBaht: z.coerce.number().min(0),
  isPreferred: z.boolean().optional(),
})

type Values = z.infer<typeof Schema>

/**
 * Add or re-quote a supplier's price for this part. Both VAT variants are
 * entered as quoted by the supplier; the ×1.07 button just prefills inc-VAT
 * from ex-VAT for the common clean-7% case.
 */
export function SupplierPriceForm({
  partId,
  suppliers,
}: {
  partId: string
  suppliers: Option[]
}) {
  const router = useRouter()
  const form = useForm<z.input<typeof Schema>, unknown, Values>({
    resolver: zodResolver(Schema),
    defaultValues: {
      supplierId: "",
      unitCostExVatBaht: 0,
      unitCostIncVatBaht: 0,
      isPreferred: false,
    },
  })

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(async (values) => {
          const res = await upsertSupplierPrice({ partId, ...values })
          if (res?.error) {
            toast.error(res.error)
            return
          }
          toast.success("Price saved")
          form.reset({
            supplierId: "",
            unitCostExVatBaht: 0,
            unitCostIncVatBaht: 0,
            isPreferred: false,
          })
          router.refresh()
        })}
        className="grid items-start gap-3 sm:grid-cols-[1fr_auto_auto_auto_auto_auto]"
      >
        <SelectField
          name="supplierId"
          label="Supplier"
          placeholder="Pick a supplier"
          options={suppliers}
        />
        <FormField
          control={form.control}
          name="unitCostExVatBaht"
          render={({ field }) => (
            <FormItem className="sm:w-32">
              <FormLabel>Cost ex-VAT (฿)</FormLabel>
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
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="flex items-end pb-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              const ex = Number(form.getValues("unitCostExVatBaht") ?? 0)
              form.setValue(
                "unitCostIncVatBaht",
                Math.round(ex * 1.07 * 100) / 100
              )
            }}
          >
            ×1.07 →
          </Button>
        </div>
        <FormField
          control={form.control}
          name="unitCostIncVatBaht"
          render={({ field }) => (
            <FormItem className="sm:w-32">
              <FormLabel>Cost inc-VAT (฿)</FormLabel>
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
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="isPreferred"
          render={({ field }) => (
            <FormItem className="flex flex-row items-center gap-2 pb-2 sm:self-end">
              <FormControl>
                <Checkbox
                  checked={field.value ?? false}
                  onCheckedChange={(checked) => field.onChange(checked === true)}
                />
              </FormControl>
              <FormLabel className="!mt-0 whitespace-nowrap">Preferred</FormLabel>
            </FormItem>
          )}
        />
        <div className="flex items-end">
          <Button type="submit" disabled={form.formState.isSubmitting}>
            <Plus /> Save price
          </Button>
        </div>
      </form>
    </Form>
  )
}
