/**
 * Gross-profit percentage for a quote line (CR-002): the BOQ's "GP %"
 * column, computed live from the selling price and the supplier cost
 * snapshotted onto the line — never stored.
 */

/**
 * GP% = (price − cost) / price × 100. Null when the cost is unknown or the
 * price is zero (no meaningful margin, and no division by zero).
 */
export function gpPercent(
  unitPriceSatang: number,
  unitCostSatang: number | null
): number | null {
  if (unitCostSatang === null) return null
  if (unitPriceSatang <= 0) return null
  return ((unitPriceSatang - unitCostSatang) / unitPriceSatang) * 100
}
