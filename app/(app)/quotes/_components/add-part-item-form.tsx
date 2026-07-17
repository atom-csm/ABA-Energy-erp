"use client"

import { useMemo } from "react"
import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { PackagePlus } from "lucide-react"

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
import { formatTHB } from "@/lib/money"
import { applyAdjustment } from "@/lib/quotes/pricing"
import { gpPercent } from "@/lib/quotes/margin"

import { addPartQuoteItem } from "../actions"
import { SelectField } from "./form-fields"

export type PickerSupplierPrice = {
  id: string
  supplierName: string
  unitCostExVatSatang: number
  isPreferred: boolean
}

export type PickerPart = {
  id: string
  sku: string
  name: string
  brandModel: string | null
  unit: string
  defaultSellingPriceSatang: number | null
  prices: PickerSupplierPrice[]
}

const Schema = z.object({
  partId: z.string().min(1, "Pick a part"),
  supplierPriceId: z.string().optional(),
  parentItemId: z.string().optional(),
  quantity: z.coerce.number().positive("Quantity must be greater than 0"),
  adjustmentPct: z.coerce.number().min(-100).max(1000).optional(),
})

type Values = z.infer<typeof Schema>

/**
 * "Add from parts": pick a catalog part, choose which supplier's cost backs
 * it, adjust the selling price by a percentage, and optionally file it under
 * a bundle line. Price and GP% preview live via the same pure lib the server
 * uses, so what you see is what gets stored.
 */
export function AddPartItemForm({
  quoteId,
  parts,
  bundleOptions,
}: {
  quoteId: string
  parts: PickerPart[]
  bundleOptions: { value: string; label: string }[]
}) {
  const router = useRouter()
  const form = useForm<z.input<typeof Schema>, unknown, Values>({
    resolver: zodResolver(Schema),
    defaultValues: {
      partId: "",
      supplierPriceId: "",
      parentItemId: "",
      quantity: 1,
      adjustmentPct: 0,
    },
  })

  const partId = form.watch("partId")
  const supplierPriceId = form.watch("supplierPriceId")
  const quantity = Number(form.watch("quantity") ?? 0)
  const adjustmentPct = Number(form.watch("adjustmentPct") ?? 0)

  const part = useMemo(
    () => parts.find((p) => p.id === partId),
    [parts, partId]
  )
  const chosenPrice = useMemo(() => {
    if (!part) return undefined
    if (supplierPriceId) return part.prices.find((p) => p.id === supplierPriceId)
    return part.prices.find((p) => p.isPreferred) ?? part.prices[0]
  }, [part, supplierPriceId])

  const base = part?.defaultSellingPriceSatang ?? 0
  const unitPrice = applyAdjustment(base, adjustmentPct || null)
  const gp = gpPercent(unitPrice, chosenPrice?.unitCostExVatSatang ?? null)

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(async (values) => {
          const res = await addPartQuoteItem({
            quote_id: quoteId,
            part_id: values.partId,
            supplier_price_id: values.supplierPriceId || "",
            parent_item_id: values.parentItemId || "",
            quantity: values.quantity,
            adjustmentPct: values.adjustmentPct,
          })
          if (res?.error) {
            toast.error(res.error)
            return
          }
          toast.success("Part added")
          form.reset({
            partId: "",
            supplierPriceId: "",
            parentItemId: "",
            quantity: 1,
            adjustmentPct: 0,
          })
          router.refresh()
        })}
        className="space-y-3"
      >
        <div className="grid items-start gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1.5fr_1fr]">
          <SelectField
            name="partId"
            label="Part"
            placeholder="Pick from the catalog"
            options={parts.map((p) => ({
              value: p.id,
              label: `${p.name}${p.brandModel ? ` — ${p.brandModel}` : ""} (${p.sku})`,
            }))}
          />
          <SelectField
            name="supplierPriceId"
            label="Supplier cost"
            placeholder={
              part && part.prices.length === 0
                ? "No prices recorded"
                : "Preferred supplier"
            }
            optional
            noneLabel="Preferred supplier"
            options={(part?.prices ?? []).map((p) => ({
              value: p.id,
              label: `${p.supplierName} · ${formatTHB(p.unitCostExVatSatang)}`,
            }))}
          />
          {bundleOptions.length > 0 ? (
            <SelectField
              name="parentItemId"
              label="Under bundle"
              placeholder="Top level"
              optional
              noneLabel="Top level (priced line)"
              options={bundleOptions}
            />
          ) : null}
        </div>

        <div className="grid items-start gap-3 sm:grid-cols-[auto_auto_1fr_auto]">
          <FormField
            control={form.control}
            name="quantity"
            render={({ field }) => (
              <FormItem className="sm:w-24">
                <FormLabel>Qty{part ? ` (${part.unit})` : ""}</FormLabel>
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
            name="adjustmentPct"
            render={({ field }) => (
              <FormItem className="sm:w-28">
                <FormLabel>Adjust %</FormLabel>
                <FormControl>
                  <Input
                    type="number"
                    step="0.5"
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
          <div className="text-muted-foreground self-end pb-2 text-sm">
            {part ? (
              <>
                {formatTHB(base)}
                {adjustmentPct ? (
                  <>
                    {" "}
                    {adjustmentPct > 0 ? "+" : ""}
                    {adjustmentPct}% → <span className="text-foreground font-medium">{formatTHB(unitPrice)}</span>
                  </>
                ) : null}
                {" · "}
                {quantity > 0 ? (
                  <>line {formatTHB(Math.round(quantity * unitPrice))}</>
                ) : null}
                {gp !== null ? (
                  <span className={gp < 0 ? "text-destructive" : ""}>
                    {" "}
                    · GP {gp.toFixed(1)}%
                  </span>
                ) : (
                  " · no cost on file"
                )}
              </>
            ) : (
              "Pick a part to preview pricing"
            )}
          </div>
          <div className="flex items-end">
            <Button type="submit" disabled={form.formState.isSubmitting}>
              <PackagePlus /> Add part
            </Button>
          </div>
        </div>
      </form>
    </Form>
  )
}
