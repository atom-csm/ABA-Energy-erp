import { test, expect, type Page } from "@playwright/test"

/**
 * CR-001 ST-6: the `/projects` list page's kanban board (desktop) and
 * swipeable stage tabs + card list (mobile). Assumes the local Supabase stack
 * is running and seeded (`supabase/seed.sql`), with env loaded
 * (`set -a && . ./.env.local`) — same assumption as e2e/v2.spec.ts's existing
 * "projects board groups cards by pipeline stage" test.
 *
 * Seeded projects span every stage (see `supabase/seed.sql`), including two
 * in `site_survey` ("Internal: Solar Mining Pilot" and "Battery / EV Charger
 * Add-on") — useful for confirming a column/tab holds more than one card.
 */

async function loginDemo(page: Page) {
  await page.goto("/login")
  await page.getByRole("button", { name: /use demo account/i }).click()
  await page.waitForURL("**/dashboard")
}

test.describe("Projects pipeline board", () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(90_000) // dev server compiles routes lazily on first hit
    await loginDemo(page)
  })

  test("desktop: a project renders under the column matching its stage", async ({
    page,
  }) => {
    await page.goto("/projects")

    // "Factory Solar — Food Processing" is seeded with stage 'after_sales'.
    // Its card should sit inside the "After-sales" column, not any other.
    const afterSalesColumn = page
      .locator("div.w-72")
      .filter({ has: page.getByText("After-sales", { exact: true }) })
    await expect(
      afterSalesColumn.getByText("Factory Solar — Food Processing")
    ).toBeVisible()

    // The same project should NOT also show up in an unrelated column, e.g.
    // "Payment" (seeded project there is a different one).
    const paymentColumn = page
      .locator("div.w-72")
      .filter({ has: page.getByText("Payment", { exact: true }) })
    await expect(
      paymentColumn.getByText("Factory Solar — Food Processing")
    ).toHaveCount(0)

    // Site survey has two seeded projects — both land in the same column.
    const siteSurveyColumn = page
      .locator("div.w-72")
      .filter({ has: page.getByText("Site survey", { exact: true }) })
    await expect(
      siteSurveyColumn.getByText("Internal: Solar Mining Pilot")
    ).toBeVisible()
    await expect(
      siteSurveyColumn.getByText("Battery / EV Charger Add-on")
    ).toBeVisible()
  })

  test("desktop: every stage column renders, even ones with nothing selected in view", async ({
    page,
  }) => {
    await page.goto("/projects")
    // All 8 stage labels should render as column headings regardless of
    // how many (or how few) projects are in each — the point of always
    // showing the column, per docs/PROJECT_PIPELINE_REDESIGN.md.
    for (const label of [
      "Electric bill collection",
      "Site survey",
      "Quotation and Proposal",
      "Negotiation and Follow-up",
      "Installation",
      "Payment",
      "After-sales",
      "Archive",
    ]) {
      await expect(page.getByText(label, { exact: true }).first()).toBeVisible()
    }
  })

  test("mobile: tapping a stage tab filters the card list to that stage", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await page.goto("/projects")

    // Switch to the "Payment" tab and confirm its seeded project shows, while
    // a project from a different stage does not.
    await page.getByRole("tab", { name: /payment/i }).click()
    await expect(
      page.getByText("Solar Rooftop 41.6 kWp — Khon Kaen Cold Storage")
    ).toBeVisible()
    await expect(
      page.getByText("Factory Solar — Food Processing")
    ).toHaveCount(0)

    // Switch again to "Archive" and confirm the list changes accordingly.
    await page.getByRole("tab", { name: /archive/i }).click()
    await expect(page.getByText("Solar Quote (lost)")).toBeVisible()
    await expect(
      page.getByText("Solar Rooftop 41.6 kWp — Khon Kaen Cold Storage")
    ).toHaveCount(0)
  })

  test("card click still navigates to the project detail page", async ({
    page,
  }) => {
    await page.goto("/projects")
    await page.getByText("Factory Solar — Food Processing").click()
    await page.waitForURL("**/projects/**")
    await expect(
      page.getByRole("heading", { name: "Factory Solar — Food Processing" })
    ).toBeVisible()
  })
})
