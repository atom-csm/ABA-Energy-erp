import { describe, it, expect } from "vitest"

import {
  applyAdjustment,
  sumChildrenAmount,
  computeQuoteTotals,
  splitPayment,
} from "./pricing"

describe("applyAdjustment", () => {
  it("returns the base price unchanged when pct is null", () => {
    expect(applyAdjustment(400000, null)).toBe(400000)
  })

  it("applies a positive percentage (rounded to integer satang)", () => {
    // ฿4,000.00 + 12.5% = ฿4,500.00
    expect(applyAdjustment(400000, 12.5)).toBe(450000)
  })

  it("applies a negative percentage (discount)", () => {
    // ฿4,000.00 - 5% = ฿3,800.00
    expect(applyAdjustment(400000, -5)).toBe(380000)
  })

  it("rounds half up on fractional satang", () => {
    // 333 × 1.5% = 337.995 → 338
    expect(applyAdjustment(333, 1.5)).toBe(338)
  })

  it("-100% floors the price at zero", () => {
    expect(applyAdjustment(400000, -100)).toBe(0)
  })
})

describe("sumChildrenAmount", () => {
  it("sums quantity × base price over the children", () => {
    expect(
      sumChildrenAmount([
        { quantity: 8, unitPriceSatang: 400000 }, // 8 panels @ ฿4,000
        { quantity: 1, unitPriceSatang: 3200000 }, // inverter ฿32,000
      ])
    ).toBe(8 * 400000 + 3200000)
  })

  it("returns 0 for no children", () => {
    expect(sumChildrenAmount([])).toBe(0)
  })

  it("rounds fractional quantities per line, not on the total", () => {
    // 2.5m × ฿28.01 = 7002.5 satang → 7003 (per line)
    expect(
      sumChildrenAmount([
        { quantity: 2.5, unitPriceSatang: 2801 },
        { quantity: 2.5, unitPriceSatang: 2801 },
      ])
    ).toBe(7003 + 7003)
  })
})

describe("computeQuoteTotals", () => {
  const items = [
    // bundle parent: priced, counted
    { amountSatang: 15613500, parentItemId: null },
    // bundle children: excluded from totals
    { amountSatang: 0, parentItemId: "parent-1" },
    { amountSatang: 999999, parentItemId: "parent-1" }, // even a priced child is excluded
    // standalone priced line (optimizers)
    { amountSatang: 1600000, parentItemId: null },
  ]

  it("subtotal counts only top-level lines; children are excluded", () => {
    const t = computeQuoteTotals(items, 0, "none")
    expect(t.subtotalSatang).toBe(15613500 + 1600000)
  })

  it("applies the discount before VAT", () => {
    // matches TSD11026164: 17,213,500 - 754,700 = 16,458,800 satang
    const t = computeQuoteTotals(items, 754700, "none")
    expect(t.afterDiscountSatang).toBe(16458800)
    expect(t.vatSatang).toBe(0)
    expect(t.grandTotalSatang).toBe(16458800)
  })

  it("add_7 mode adds 7% VAT on the discounted amount", () => {
    // ฿172,135 ex-VAT → VAT ฿12,049.45 → ฿184,184.45 (the BOQ's numbers)
    const t = computeQuoteTotals(
      [{ amountSatang: 17213500, parentItemId: null }],
      0,
      "add_7"
    )
    expect(t.vatSatang).toBe(1204945)
    expect(t.grandTotalSatang).toBe(18418445)
  })

  it("never lets a discount push totals below zero", () => {
    const t = computeQuoteTotals(
      [{ amountSatang: 1000, parentItemId: null }],
      5000,
      "add_7"
    )
    expect(t.afterDiscountSatang).toBe(0)
    expect(t.vatSatang).toBe(0)
    expect(t.grandTotalSatang).toBe(0)
  })
})

describe("splitPayment", () => {
  it("splits 50/50 like the real quotation", () => {
    // ฿164,588 → ฿82,294 + ฿82,294
    const s = splitPayment(16458800, 50)
    expect(s.depositSatang).toBe(8229400)
    expect(s.balanceSatang).toBe(8229400)
  })

  it("gives the rounding remainder to the balance", () => {
    const s = splitPayment(1001, 50)
    expect(s.depositSatang).toBe(501)
    expect(s.balanceSatang).toBe(500)
    expect(s.depositSatang + s.balanceSatang).toBe(1001)
  })

  it("handles 100% deposit", () => {
    const s = splitPayment(16458800, 100)
    expect(s.depositSatang).toBe(16458800)
    expect(s.balanceSatang).toBe(0)
  })
})
