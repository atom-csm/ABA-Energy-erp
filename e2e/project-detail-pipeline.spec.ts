import { test, expect, type Page } from "@playwright/test"

/**
 * CR-001 ST-7: the project detail page's stage header/progress, live
 * "what's needed to move forward" checklist, the override-confirm dialog
 * (the part ST-4 deferred), the quotes section's "+ New quote" prefill link,
 * and the media/upload section. Assumes the local Supabase stack is running
 * and seeded (`supabase/seed.sql`), with env loaded
 * (`set -a && . ./.env.local`) — same assumption as e2e/v2.spec.ts and
 * e2e/projects-pipeline.spec.ts.
 *
 * "Internal: Solar Mining Pilot" (seeded id
 * e0000000-0000-0000-0000-000000000004) is seeded in `site_survey` with no
 * `solar_surveys` row at all, so `getStageRequirements` always reports its
 * one requirement ("Site survey completed") as unmet — a deterministic
 * override-dialog trigger that doesn't depend on "today"-relative seed data.
 */

const PROJECT_ID = "e0000000-0000-0000-0000-000000000004"
const PROJECT_NAME = "Internal: Solar Mining Pilot"

async function loginDemo(page: Page) {
  await page.goto("/login")
  await page.getByRole("button", { name: /use demo account/i }).click()
  await page.waitForURL("**/dashboard")
}

async function loginAs(page: Page, email: string) {
  await page.goto("/login")
  await page.getByLabel("Email").fill(email)
  await page.getByLabel("Password").fill("AbaDemo123!")
  await page.getByRole("button", { name: /^sign in$/i }).click()
  await page.waitForURL("**/dashboard")
}

test.describe("Project detail — pipeline (CR-001 ST-7)", () => {
  test.beforeEach(() => {
    test.setTimeout(90_000) // dev server compiles routes lazily on first hit
  })

  test("shows the stage progress header and the live checklist for an unmet requirement", async ({
    page,
  }) => {
    await loginDemo(page)
    await page.goto(`/projects/${PROJECT_ID}`)

    // Site survey is stage 2 of 8.
    await expect(page.getByText("Stage 2 of 8")).toBeVisible()

    // No solar_surveys row exists for this project, so the checklist should
    // show the requirement as unmet, computed live — not hand-maintained
    // copy.
    await expect(page.getByText("To move forward")).toBeVisible()
    await expect(page.getByText("Site survey completed")).toBeVisible()
  })

  test("owner: advancing past an unmet requirement opens the override dialog, and a reason lets it proceed", async ({
    page,
  }) => {
    await loginDemo(page) // demo@aba-energy.local is seeded as 'owner'
    await page.goto(`/projects/${PROJECT_ID}`)

    await page.getByRole("combobox").first().click()
    await page.getByRole("option", { name: "Quotation and Proposal", exact: true }).click()

    // Soft gate: the stage did NOT change yet — a dialog appears instead.
    await expect(page.getByText("Can't advance yet")).toBeVisible()
    await expect(page.getByText("Site survey completed")).toBeVisible()

    const proceedButton = page.getByRole("button", { name: "Proceed anyway" })
    await expect(proceedButton).toBeDisabled()

    await page
      .getByLabel("Reason for overriding")
      .fill("Internal pilot — proceeding without a formal survey record.")
    await expect(proceedButton).toBeEnabled()
    await proceedButton.click()

    await expect(page.getByText(/stage updated/i)).toBeVisible()
    await expect(page.getByText("Can't advance yet")).not.toBeVisible()
  })

  test("member: overriding is rejected with the capability error surfaced in the dialog", async ({
    page,
  }) => {
    await loginAs(page, "sales@aba-energy.local") // seeded 'member', not owner/admin
    await page.goto(`/projects/${PROJECT_ID}`)

    await page.getByRole("combobox").first().click()
    await page.getByRole("option", { name: "Quotation and Proposal", exact: true }).click()
    await expect(page.getByText("Can't advance yet")).toBeVisible()

    await page.getByLabel("Reason for overriding").fill("Trying to skip ahead")
    await page.getByRole("button", { name: "Proceed anyway" }).click()

    // Not a silent no-op — the exact capability error from updateProjectStage
    // renders inside the still-open dialog.
    await expect(
      page.getByText(/only owners and admins can override/i)
    ).toBeVisible()
  })

  test("quotes section links '+ New quote' with a ?projectId= prefill", async ({
    page,
  }) => {
    await loginDemo(page)
    await page.goto(`/projects/${PROJECT_ID}`)

    const newQuoteLink = page.getByRole("link", { name: /new quote/i })
    await expect(newQuoteLink).toHaveAttribute("href", `/quotes/new?projectId=${PROJECT_ID}`)

    await newQuoteLink.click()
    await page.waitForURL(`**/quotes/new?projectId=${PROJECT_ID}`)
    // The project select should come prefilled with this project.
    await expect(page.getByText(PROJECT_NAME)).toBeVisible()
  })

  test("media section renders the upload control for the project's current stage", async ({
    page,
  }) => {
    await loginDemo(page)
    await page.goto(`/projects/${PROJECT_ID}`)

    await expect(
      page.getByRole("button", { name: /add photo or file/i })
    ).toBeVisible()
  })
})
