import Link from "next/link"
import { ArrowLeft } from "lucide-react"

import { createClient } from "@/lib/supabase/server"
import { requireOrgContext } from "@/lib/auth"
import { todayISO } from "@/lib/dates"

import { PageHeader } from "@/components/page-header"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"

import { createQuote } from "../actions"
import { QuoteForm, type QuoteFormValues } from "../_components/quote-form"
import type { Option } from "../_components/form-fields"

export const dynamic = "force-dynamic"

export default async function NewQuotePage({
  searchParams,
}: {
  // `?projectId=` — the project detail page's "+ New quote" button (CR-001
  // ST-7), matching the `?clientId=` prefill convention already used by
  // `/projects/new`.
  searchParams: Promise<{ projectId?: string }>
}) {
  await requireOrgContext()
  const { projectId } = await searchParams
  const supabase = await createClient()

  const [clientsRes, projectsRes, prefillProjectRes] = await Promise.all([
    supabase.from("clients").select("id, name").order("name"),
    supabase.from("projects").select("id, name").order("name"),
    projectId
      ? supabase
          .from("projects")
          .select("id, client_id")
          .eq("id", projectId)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  const clients: Option[] = (clientsRes.data ?? []).map((c) => ({
    value: c.id,
    label: c.name,
  }))
  const projects: Option[] = (projectsRes.data ?? []).map((p) => ({
    value: p.id,
    label: p.name,
  }))

  // Best-effort: also prefill the client if the prefilled project has one,
  // so linking a quote from a project page doesn't require re-picking its
  // client. Falls back to blank (still pickable) if the project or its
  // client isn't found.
  const prefillClientId = prefillProjectRes.data?.client_id ?? ""

  const defaultValues: QuoteFormValues = {
    client_id: prefillClientId,
    project_id: projectId ?? "",
    number: "",
    issue_date: todayISO(),
    valid_until: "",
    discountBaht: 0,
    systemSizeKwp: 0,
    panelModel: "",
    inverterModel: "",
    batteryOption: "",
    warrantyYears: 0,
    paybackYears: 0,
    proposalAssumptions: "",
    includedScope: "",
    excludedScope: "",
    notes: "",
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="New quote"
        description="Draft a proposal — add line items after creating it."
      >
        <Button variant="outline" render={<Link href="/quotes" />}>
          <ArrowLeft /> Back
        </Button>
      </PageHeader>

      <Card className="max-w-3xl">
        <CardContent>
          <QuoteForm
            clients={clients}
            projects={projects}
            defaultValues={defaultValues}
            submitLabel="Create quote"
            action={createQuote}
          />
        </CardContent>
      </Card>
    </div>
  )
}
