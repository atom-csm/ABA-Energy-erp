import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

import { createPart } from "../actions"
import { PartForm } from "../_components/part-form"

export default function NewPartPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="New part"
        description="Add a part to the catalog. Supplier prices are added on the part's page after saving."
      >
        <Button variant="ghost" render={<Link href="/parts" />}>
          <ArrowLeft />
          Back to parts
        </Button>
      </PageHeader>

      <Card>
        <CardContent className="pt-6">
          <PartForm
            action={createPart}
            submitLabel="Create part"
            redirectsOnSuccess
          />
        </CardContent>
      </Card>
    </div>
  )
}
