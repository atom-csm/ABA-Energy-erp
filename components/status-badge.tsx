import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import type { Enums } from "@/lib/types/database"

type Tone = "neutral" | "info" | "progress" | "success" | "warning" | "danger"

const TONE: Record<Tone, string> = {
  neutral: "bg-muted text-muted-foreground border-transparent",
  info: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border-transparent",
  progress:
    "bg-violet-100 text-violet-800 dark:bg-violet-950 dark:text-violet-300 border-transparent",
  success:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border-transparent",
  warning:
    "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300 border-transparent",
  danger: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300 border-transparent",
}

function Pill({ label, tone }: { label: string; tone: Tone }) {
  return (
    <Badge variant="outline" className={cn("font-medium", TONE[tone])}>
      {label}
    </Badge>
  )
}

const PROJECT_STAGE: Record<Enums<"project_stage">, { label: string; tone: Tone }> = {
  electric_bill_collection: { label: "Electric bill collection", tone: "neutral" },
  site_survey: { label: "Site survey", tone: "info" },
  quotation_and_proposal: { label: "Quotation & proposal", tone: "progress" },
  negotiation_and_followup: { label: "Negotiation & follow-up", tone: "warning" },
  installation: { label: "Installation", tone: "progress" },
  payment: { label: "Payment", tone: "warning" },
  after_sales: { label: "After-sales", tone: "info" },
  archive: { label: "Archive", tone: "success" },
}

const INVOICE_STATUS: Record<Enums<"invoice_status">, { label: string; tone: Tone }> = {
  draft: { label: "Draft", tone: "neutral" },
  sent: { label: "Sent", tone: "info" },
  partially_paid: { label: "Partially paid", tone: "warning" },
  paid: { label: "Paid", tone: "success" },
  overdue: { label: "Overdue", tone: "danger" },
  cancelled: { label: "Cancelled", tone: "neutral" },
}

const TASK_STATUS: Record<Enums<"task_status">, { label: string; tone: Tone }> = {
  todo: { label: "To do", tone: "neutral" },
  in_progress: { label: "In progress", tone: "progress" },
  done: { label: "Done", tone: "success" },
}

export function ProjectStageBadge({ stage }: { stage: Enums<"project_stage"> }) {
  const { label, tone } = PROJECT_STAGE[stage]
  return <Pill label={label} tone={tone} />
}

export function InvoiceStatusBadge({ status }: { status: Enums<"invoice_status"> }) {
  const { label, tone } = INVOICE_STATUS[status]
  return <Pill label={label} tone={tone} />
}

export function TaskStatusBadge({ status }: { status: Enums<"task_status"> }) {
  const { label, tone } = TASK_STATUS[status]
  return <Pill label={label} tone={tone} />
}
