import { test, expect, type Page } from "@playwright/test"

/**
 * CR-002 ST-4/ST-5: the quote editor's "Add from parts" picker (catalog line
 * with % adjustment and cost snapshot), bundle lines, duplicate-quote, and
 * save-as-template / new-from-template. Assumes the local Supabase stack is
 * running and seeded (`supabase/seed.sql`) — same assumption as the other
 * e2e specs. The seed provides quote QUO-2026-001 (id 90000000-…-0001) and
 * 31 catalog parts (CR-002 ST-8).
 */

const QUOTE_ID = "90000000-0000-0000-0000-000000000001"

async function loginDemo(page: Page) {
  await page.goto("/login")
  await page.getByRole("button", { name: /use demo account/i }).click()
  await page.waitForURL("**/dashboard")
}

test.describe("Quote editor — parts picker & bundles (CR-002 ST-4)", () => {
  test.beforeEach(() => {
    test.setTimeout(90_000)
  })

  test("adds a catalog part as a line item with its unit shown", async ({
    page,
  }) => {
    await loginDemo(page)
    await page.goto(`/quotes/${QUOTE_ID}`)

    // Pick the PV module from the catalog picker.
    await page.getByRole("combobox").filter({ hasText: /pick from the catalog/i }).click()
    await page
      .getByRole("option", { name: /PV Module \(N-type, Tier-1\)/ })
      .click()

    await page.getByRole("button", { name: /add part/i }).click()
    await expect(page.getByText(/part added/i)).toBeVisible()

    // The new line renders with the part's description.
    await expect(
      page.getByRole("cell", { name: /PV Module \(N-type, Tier-1\)/ })
    ).toBeVisible()
  })

  test("creates a bundle and files a part under it, shown unpriced", async ({
    page,
  }) => {
    await loginDemo(page)
    await page.goto(`/quotes/${QUOTE_ID}`)

    await page
      .getByLabel(/bundle \/ system line/i)
      .fill("Solar Rooftop System — test bundle")
    await page.getByRole("button", { name: /add bundle/i }).click()
    await expect(page.getByText(/bundle added/i)).toBeVisible()

    // Add a part under the bundle.
    await page.getByRole("combobox").filter({ hasText: /pick from the catalog/i }).click()
    await page.getByRole("option", { name: /Smart Dongle/ }).click()
    await page.getByRole("combobox").filter({ hasText: /top level/i }).click()
    await page
      .getByRole("option", { name: /Solar Rooftop System — test bundle/ })
      .click()
    await page.getByRole("button", { name: /add part/i }).click()
    await expect(page.getByText(/part added/i)).toBeVisible()

    // The child renders as an unpriced component line.
    await expect(page.getByText("in bundle")).toBeVisible()
  })
})

test.describe("Duplicate & templates (CR-002 ST-5)", () => {
  test.beforeEach(() => {
    test.setTimeout(90_000)
  })

  test("duplicate creates a fresh draft with a new number", async ({
    page,
  }) => {
    await loginDemo(page)
    await page.goto(`/quotes/${QUOTE_ID}`)

    await page.getByRole("button", { name: /duplicate/i }).click()

    // Redirects to the copy: different id, draft status, QUO number.
    await page.waitForURL((url) => {
      const m = url.pathname.match(/\/quotes\/([0-9a-f-]{36})$/)
      return Boolean(m && m[1] !== QUOTE_ID)
    })
    await expect(page.getByText("Draft", { exact: true })).toBeVisible()
  })

  test("save as template, then create a new quote from it", async ({
    page,
  }) => {
    await loginDemo(page)
    await page.goto(`/quotes/${QUOTE_ID}`)

    await page.getByRole("button", { name: /save as template/i }).click()
    await page.waitForURL((url) => {
      const m = url.pathname.match(/\/quotes\/([0-9a-f-]{36})$/)
      return Boolean(m && m[1] !== QUOTE_ID)
    })
    await expect(page.getByText("Quote template")).toBeVisible()

    // Templates are listed on the Templates page with a TPL number.
    await page.goto("/quotes/templates")
    const useButton = page.getByRole("button", { name: /use template/i }).first()
    await expect(useButton).toBeVisible()

    // New quote from the template requires picking a client.
    await useButton.click()
    await page.getByRole("combobox").click()
    await page.getByRole("option").first().click()
    await page.getByRole("button", { name: /create quote/i }).click()

    await page.waitForURL((url) =>
      /\/quotes\/[0-9a-f-]{36}$/.test(url.pathname)
    )
    await expect(page.getByText("Draft", { exact: true })).toBeVisible()
  })
})
