import { test, expect, type Page } from "@playwright/test"
import { createClient } from "@supabase/supabase-js"

/**
 * V2 feature smoke tests: CSV export (satang→baht), saved-view/stage filtering,
 * the audit trail, and signup password policy. Assumes the local Supabase stack
 * is running and seeded, with env loaded (`set -a && . ./.env.local`).
 */

const admin = () =>
  createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  )

async function loginDemo(page: Page) {
  await page.goto("/login")
  await page.getByRole("button", { name: /use demo account/i }).click()
  await page.waitForURL("**/dashboard")
}

test("invoices CSV exports amounts in baht, not satang", async ({ page }) => {
  await loginDemo(page)
  const res = await page.request.get("/finance/invoices/export")
  expect(res.status()).toBe(200)
  expect(res.headers()["content-type"]).toContain("csv")
  const body = await res.text()
  expect(body).toContain("Number") // header row present
  // INV-2026-001 is 9,000,000 satang → 90000 baht. Must be baht, never raw satang.
  expect(body).toContain("90000")
  expect(body).not.toContain("9000000")
})

test("projects board groups cards by pipeline stage", async ({ page }) => {
  await loginDemo(page)
  await page.goto("/projects")
  // The seed spans multiple stages; at least the two most distinctive labels
  // should render as separate stage-group headings.
  await expect(page.getByText("Installation", { exact: true }).first()).toBeVisible()
  await expect(page.getByText("Archive", { exact: true }).first()).toBeVisible()
})

test("signup enforces the password policy and gates submit", async ({ page }) => {
  await page.goto("/signup")
  await page.getByLabel("Email").fill("newperson@example.com")
  const submit = page.getByRole("button", { name: /create account/i })

  await page.getByLabel("Password").fill("short")
  await expect(submit).toBeDisabled()
  await expect(page.locator("ul.text-destructive li").first()).toBeVisible()

  await page.getByLabel("Password").fill("AbaDemo123!")
  await expect(submit).toBeEnabled()
})

test("changing a project stage writes a stage_changed audit entry shown in /audit", async ({
  page,
}) => {
  const a = admin()
  const { data: project } = await a
    .from("projects")
    .select("id,name,stage")
    .neq("stage", "archive")
    .limit(1)
    .single()
  expect(project).toBeTruthy()

  await loginDemo(page)
  await page.goto(`/projects/${project!.id}`)

  // Base UI Select (the stage changer) → open and pick a different stage.
  await page.getByRole("combobox").first().click()
  const target = project!.stage === "site_survey" ? "Payment" : "Site survey"
  await page.getByRole("option", { name: target, exact: true }).click()
  await expect(page.getByText(/stage updated/i)).toBeVisible()

  // The audit row is written by the server action.
  await expect
    .poll(async () => {
      const { count } = await a
        .from("audit_log")
        .select("*", { count: "exact", head: true })
        .eq("entity_id", project!.id)
        .eq("action", "stage_changed")
      return count ?? 0
    })
    .toBeGreaterThan(0)

  // And it renders in the activity feed.
  await page.goto("/audit")
  await expect(page.getByText(/moved project/i).first()).toBeVisible()
})
