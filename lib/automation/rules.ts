/**
 * Pure follow-up rules. DB-independent so it can be unit-tested in isolation and
 * reused by the cron scan. Dates are compared as 'YYYY-MM-DD' strings (lexical
 * order == chronological order for this format — same convention as
 * `lib/dates.ts` `isPastDue`). A follow-up is DUE when its date is on or before
 * `todayISO`; future dates and null dates never qualify.
 */

import type { Enums } from "@/lib/types/database"

/** A project projected to just the fields the rule needs. */
export type ProjectFollowUp = {
  id: string
  name: string
  next_follow_up_date: string | null
  stage: Enums<"project_stage">
}

/** An activity projected to just the fields the rule needs. `title` optional. */
export type ActivityFollowUp = {
  id: string
  title?: string | null
  due_date: string | null
  done: boolean
  type: Enums<"activity_type">
}

/** What the rule emits per due item; consumed by the dispatch layer. */
export type ReminderSpec = {
  entity: "project" | "activity"
  entityId: string
  title: string
  dueDate: string
}

/**
 * Project stages that are closed and therefore never need a follow-up
 * reminder. `archive` is the one closed stage post-merge (it covers done/won
 * *and* lost/dead projects — see docs/PROJECT_PIPELINE_REDESIGN.md).
 */
const CLOSED_STAGES: ReadonlySet<Enums<"project_stage">> = new Set(["archive"])

/** True when an ISO date (YYYY-MM-DD) is today or earlier. Null → false. */
function isDueOrOverdue(dateISO: string | null, todayISO: string): boolean {
  if (!dateISO) return false
  return dateISO <= todayISO
}

/** Human label for an activity that has no explicit title, derived from its type. */
function activityTitleFallback(type: Enums<"activity_type">): string {
  const labels: Record<Enums<"activity_type">, string> = {
    note: "Follow up on note",
    call: "Follow up: call",
    email: "Follow up: email",
    meeting: "Follow up: meeting",
    follow_up: "Follow-up due",
  }
  return labels[type] ?? "Follow-up due"
}

/**
 * Given projects + activities and today's Bangkok date, return reminder specs
 * for every item that is due or overdue. Excludes archived projects, done
 * activities, and any item without a date. Order: projects first, then
 * activities, each in input order (callers may re-sort).
 */
export function dueFollowUps(
  projects: ProjectFollowUp[],
  activities: ActivityFollowUp[],
  todayISO: string
): ReminderSpec[] {
  const specs: ReminderSpec[] = []

  for (const project of projects) {
    if (CLOSED_STAGES.has(project.stage)) continue
    if (!isDueOrOverdue(project.next_follow_up_date, todayISO)) continue
    specs.push({
      entity: "project",
      entityId: project.id,
      title: project.name,
      dueDate: project.next_follow_up_date as string,
    })
  }

  for (const activity of activities) {
    if (activity.done) continue
    if (!isDueOrOverdue(activity.due_date, todayISO)) continue
    const title = activity.title?.trim() || activityTitleFallback(activity.type)
    specs.push({
      entity: "activity",
      entityId: activity.id,
      title,
      dueDate: activity.due_date as string,
    })
  }

  return specs
}
