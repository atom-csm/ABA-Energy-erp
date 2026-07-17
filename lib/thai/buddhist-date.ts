/**
 * Thai Buddhist-calendar date display for quotation documents:
 * ISO CE date string ("2026-07-07") → "07 ก.ค. 2569". String-parsed, no
 * Date object — avoids timezone shifts on date-only values.
 */

const THAI_MONTHS_ABBR = [
  "ม.ค.",
  "ก.พ.",
  "มี.ค.",
  "เม.ย.",
  "พ.ค.",
  "มิ.ย.",
  "ก.ค.",
  "ส.ค.",
  "ก.ย.",
  "ต.ค.",
  "พ.ย.",
  "ธ.ค.",
]

export function formatThaiDate(isoDate: string | null): string | null {
  if (!isoDate) return null
  const [y, m, d] = isoDate.split("-").map(Number)
  if (!y || !m || !d || m < 1 || m > 12) return null
  return `${String(d).padStart(2, "0")} ${THAI_MONTHS_ABBR[m - 1]} ${y + 543}`
}
