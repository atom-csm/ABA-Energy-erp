"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Sigma } from "lucide-react"

import { Button } from "@/components/ui/button"

import { setBundlePriceFromChildren } from "../actions"

/** "Σ from parts" — set the bundle's price to the sum of its component lines. */
export function BundlePriceButton({ itemId }: { itemId: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={pending}
      title="Set price from component lines"
      onClick={() =>
        startTransition(async () => {
          const res = await setBundlePriceFromChildren(itemId)
          if (res?.error) {
            toast.error(res.error)
            return
          }
          toast.success("Bundle price updated")
          router.refresh()
        })
      }
    >
      <Sigma />
    </Button>
  )
}
