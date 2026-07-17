/**
 * Thai baht amount in words — the "(ตัวอักษร)" line on Thai quotations and
 * receipts. Input is integer satang (lib/money.ts). Standard reading rules:
 * ยี่สิบ for 2 in the tens place, เอ็ด for a units 1 preceded by higher
 * digits, ล้าน grouping for millions (recursive for ≥ ล้านล้าน), บาทถ้วน
 * when there are no satang.
 */

const DIGITS = [
  "ศูนย์",
  "หนึ่ง",
  "สอง",
  "สาม",
  "สี่",
  "ห้า",
  "หก",
  "เจ็ด",
  "แปด",
  "เก้า",
]

const PLACES = ["", "สิบ", "ร้อย", "พัน", "หมื่น", "แสน"]

/** Read 1..999,999 in Thai. */
function readBelowMillion(n: number): string {
  let out = ""
  const s = String(n)
  for (let i = 0; i < s.length; i++) {
    const digit = Number(s[i])
    const place = s.length - i - 1
    if (digit === 0) continue
    if (place === 1) {
      if (digit === 1) out += "สิบ"
      else if (digit === 2) out += "ยี่สิบ"
      else out += DIGITS[digit] + "สิบ"
    } else if (place === 0 && digit === 1 && n > 9) {
      out += "เอ็ด"
    } else {
      out += DIGITS[digit] + PLACES[place]
    }
  }
  return out
}

/** Read any non-negative integer in Thai, grouping by ล้าน. */
function readNumber(n: number): string {
  if (n === 0) return DIGITS[0]
  if (n < 1_000_000) return readBelowMillion(n)
  const millions = Math.floor(n / 1_000_000)
  const rest = n % 1_000_000
  return readNumber(millions) + "ล้าน" + (rest > 0 ? readBelowMillion(rest) : "")
}

/** Format integer satang as Thai words: 16458800 → "หนึ่งแสนหกหมื่นสี่พันห้าร้อยแปดสิบแปดบาทถ้วน". */
export function bahtText(satang: number): string {
  const baht = Math.floor(satang / 100)
  const st = satang % 100
  const bahtPart = readNumber(baht) + "บาท"
  if (st === 0) return bahtPart + "ถ้วน"
  return bahtPart + readNumber(st) + "สตางค์"
}
