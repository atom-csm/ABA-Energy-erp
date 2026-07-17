"use client"

import { useRouter } from "next/navigation"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { Boxes } from "lucide-react"

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

import { addBundleItem } from "../actions"

const Schema = z.object({
  description: z.string().min(1, "Description is required"),
  unitPriceBaht: z.coerce.number().min(0),
})

type Values = z.infer<typeof Schema>

/**
 * Create a bundle line — the single priced row the customer sees, with
 * component parts added under it (shown qty-only, like รายการ 1.1–1.11 on a
 * real quotation). Price can start at 0 and be set from the children later.
 */
export function AddBundleForm({ quoteId }: { quoteId: string }) {
  const router = useRouter()
  const form = useForm<z.input<typeof Schema>, unknown, Values>({
    resolver: zodResolver(Schema),
    defaultValues: { description: "", unitPriceBaht: 0 },
  })

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(async (values) => {
          const res = await addBundleItem({ quote_id: quoteId, ...values })
          if (res?.error) {
            toast.error(res.error)
            return
          }
          toast.success("Bundle added")
          form.reset({ description: "", unitPriceBaht: 0 })
          router.refresh()
        })}
        className="grid items-start gap-3 sm:grid-cols-[1fr_auto_auto]"
      >
        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Bundle / system line</FormLabel>
              <FormControl>
                <Input
                  placeholder="Solar Rooftop System — Huawei 5.2 kW 1-phase"
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="unitPriceBaht"
          render={({ field }) => (
            <FormItem className="sm:w-36">
              <FormLabel>Bundle price (฿)</FormLabel>
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
        <div className="flex items-end">
          <Button type="submit" variant="outline" disabled={form.formState.isSubmitting}>
            <Boxes /> Add bundle
          </Button>
        </div>
      </form>
    </Form>
  )
}
