"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Trash2 } from "lucide-react"

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"

import { deletePart, deleteSupplier, deleteSupplierPrice } from "../actions"

function ConfirmDelete({
  title,
  description,
  onConfirm,
  small,
}: {
  title: string
  description: string
  onConfirm: () => Promise<{ error?: string } | void>
  small?: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  return (
    <AlertDialog>
      <AlertDialogTrigger
        render={
          small ? (
            <Button variant="ghost" size="sm" aria-label={title} />
          ) : (
            <Button variant="destructive" size="sm" />
          )
        }
      >
        <Trash2 />
        {small ? null : "Delete"}
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const res = await onConfirm()
                if (res?.error) {
                  toast.error(res.error)
                  return
                }
                router.refresh()
              })
            }
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export function DeletePartButton({ id, name }: { id: string; name: string }) {
  return (
    <ConfirmDelete
      title={`Delete ${name}?`}
      description="This permanently removes the part and its supplier prices. Existing quote lines keep their snapshot but lose the catalog link."
      onConfirm={() => deletePart(id)}
    />
  )
}

export function DeleteSupplierButton({
  id,
  name,
}: {
  id: string
  name: string
}) {
  return (
    <ConfirmDelete
      small
      title={`Delete ${name}?`}
      description="This permanently removes the supplier and all of its prices across the catalog."
      onConfirm={() => deleteSupplier(id)}
    />
  )
}

export function DeleteSupplierPriceButton({
  id,
  partId,
  supplierName,
}: {
  id: string
  partId: string
  supplierName: string
}) {
  return (
    <ConfirmDelete
      small
      title={`Remove ${supplierName}'s price?`}
      description="This removes this supplier's price for this part. Quote lines that used it keep their snapshotted cost."
      onConfirm={() => deleteSupplierPrice(id, partId)}
    />
  )
}
