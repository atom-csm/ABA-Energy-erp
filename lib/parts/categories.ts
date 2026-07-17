import type { Enums } from "@/lib/types/database"

export type PartCategory = Enums<"part_category">

/**
 * Display order and labels for part categories — mirrors the BOQ's lettered
 * sections A–G, which is how the team already talks about the parts list.
 */
export const PART_CATEGORIES: { value: PartCategory; label: string }[] = [
  { value: "pv_modules_inverter", label: "A. Main equipment — PV modules & inverter" },
  { value: "mounting_structure", label: "B. Mounting structure" },
  { value: "dc_side", label: "C. DC side" },
  { value: "ac_side", label: "D. AC side" },
  { value: "earthing_grounding", label: "E. Earthing / grounding" },
  { value: "conduit_bos_misc", label: "F. Conduit / BOS / misc" },
  { value: "labor_services", label: "G. Labor & services" },
  { value: "other", label: "Other" },
]

export function partCategoryLabel(value: PartCategory): string {
  return PART_CATEGORIES.find((c) => c.value === value)?.label ?? value
}

export const PHASE_OPTIONS: { value: string; label: string }[] = [
  { value: "both", label: "Both" },
  { value: "1_phase", label: "1-phase" },
  { value: "3_phase", label: "3-phase" },
]

export function phaseLabel(value: string | null): string {
  if (!value) return "—"
  return PHASE_OPTIONS.find((p) => p.value === value)?.label ?? value
}
