/**
 * Pure quote-pricing math (CR-002): % price adjustment over a catalog base
 * price, bundle roll-up, bundle-aware quote totals with VAT, and the
 * deposit/balance payment split. All money is integer satang (lib/money.ts);
 * nothing here touches the DB or DOM.
 */

export type VatMode = "none" | "add_7"

const VAT_RATE = 0.07

/**
 * Selling price for a catalog line: base price adjusted by a percentage
 * (e.g. +12.5 or -5). Null pct means "no adjustment". Never below zero.
 */
export function applyAdjustment(
  baseUnitPriceSatang: number,
  adjustmentPct: number | null
): number {
  if (adjustmentPct === null) return baseUnitPriceSatang
  return Math.max(
    0,
    Math.round(baseUnitPriceSatang * (1 + adjustmentPct / 100))
  )
}

/**
 * Suggested price for a bundle parent: Σ round(quantity × unit price) over
 * its children — rounded per line, matching how amount_satang is computed.
 */
export function sumChildrenAmount(
  children: { quantity: number; unitPriceSatang: number }[]
): number {
  return children.reduce(
    (acc, c) => acc + Math.round(c.quantity * c.unitPriceSatang),
    0
  )
}

export type QuoteTotals = {
  subtotalSatang: number
  afterDiscountSatang: number
  vatSatang: number
  grandTotalSatang: number
}

/**
 * Quote totals from its line items. Bundle children (parentItemId set) are
 * excluded — the parent's amount is authoritative. Discount applies before
 * VAT; totals never go negative.
 */
export function computeQuoteTotals(
  items: { amountSatang: number; parentItemId: string | null }[],
  discountSatang: number,
  vatMode: VatMode
): QuoteTotals {
  const subtotalSatang = items
    .filter((it) => it.parentItemId === null)
    .reduce((acc, it) => acc + it.amountSatang, 0)
  const afterDiscountSatang = Math.max(0, subtotalSatang - discountSatang)
  const vatSatang =
    vatMode === "add_7" ? Math.round(afterDiscountSatang * VAT_RATE) : 0
  return {
    subtotalSatang,
    afterDiscountSatang,
    vatSatang,
    grandTotalSatang: afterDiscountSatang + vatSatang,
  }
}

export type PaymentSplit = {
  depositSatang: number
  balanceSatang: number
}

/**
 * Two-installment split (งวดที่ 1 / งวดที่ 2): deposit is rounded, the balance
 * absorbs the remainder so the parts always sum to the total exactly.
 */
export function splitPayment(
  grandTotalSatang: number,
  depositPct: number
): PaymentSplit {
  const depositSatang = Math.round((grandTotalSatang * depositPct) / 100)
  return {
    depositSatang,
    balanceSatang: grandTotalSatang - depositSatang,
  }
}
