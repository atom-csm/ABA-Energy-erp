import { formatTHB, satangToBaht, type Satang } from "@/lib/money"
import {
  computeQuoteTotals,
  splitPayment,
  type VatMode,
} from "@/lib/quotes/pricing"
import { bahtText } from "@/lib/thai/baht-text"
import { formatThaiDate } from "@/lib/thai/buddhist-date"
import { escapeHtml } from "./printable"

/**
 * Thai-format quotation renderer (CR-002 ST-6) — layout modeled on the real
 * sent quotation TSD11026164: bundle parents as priced rows with numbered
 * unpriced component sub-rows (1.1, 1.2 …), discount → VAT → grand total
 * with the amount in Thai words (ตัวอักษร), a two-installment payment
 * schedule, terms, and signature blocks. Pure function: HTML string in/out,
 * print-friendly, no external assets.
 */

/**
 * Company block shown in the header and signature area. No org-branding
 * settings screen exists yet (a deliberate CR-002 scope cut) — edit here.
 */
export const COMPANY_PROFILE = {
  nameTh: "บริษัท อาชาไนย อินฟินิท จำกัด",
  addressTh: "84 หมู่7 ต.บ้านเป็ด อ.เมืองขอนแก่น 40000",
  phone: "087-772-7673, 093-525-5994",
  signerName: "นายธาราเทพ ห่วงสกุลไทย",
}

export type ThaiQuoteChild = {
  description: string
  quantity: number
  unit: string | null
}

export type ThaiQuoteItem = {
  description: string
  quantity: number
  unit: string | null
  unitPriceSatang: Satang
  amountSatang: Satang
  children: ThaiQuoteChild[]
}

export type ThaiQuoteDoc = {
  number: string
  issueDate: string | null
  validUntil: string | null
  clientName: string
  projectTitle: string | null
  items: ThaiQuoteItem[]
  discountSatang: Satang
  vatMode: VatMode
  depositPct: number
  terms: string | null
  notes: string | null
}

/** ฿-less number for table cells: 15613500 satang → "156,135.00". */
function money(satang: Satang): string {
  return satangToBaht(satang).toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function fmtQty(quantity: number): string {
  return String(Number(quantity))
}

export function renderThaiQuoteHtml(doc: ThaiQuoteDoc): string {
  const totals = computeQuoteTotals(
    doc.items.map((it) => ({
      amountSatang: it.amountSatang,
      parentItemId: null,
    })),
    doc.discountSatang,
    doc.vatMode
  )
  const split = splitPayment(totals.grandTotalSatang, doc.depositPct)

  const rows = doc.items
    .map((it, i) => {
      const no = i + 1
      const parentRow = `
        <tr class="item">
          <td class="c">${no}</td>
          <td>${escapeHtml(it.description)}</td>
          <td class="c">${fmtQty(it.quantity)}</td>
          <td class="c">${escapeHtml(it.unit ?? "")}</td>
          <td class="r">${money(it.unitPriceSatang)}</td>
          <td class="r">${money(it.amountSatang)}</td>
        </tr>`
      const childRows = it.children
        .map(
          (child, j) => `
        <tr class="sub">
          <td></td>
          <td class="sub-desc">${no}.${j + 1} ${escapeHtml(child.description)}</td>
          <td class="c">${fmtQty(child.quantity)}</td>
          <td class="c">${escapeHtml(child.unit ?? "")}</td>
          <td></td>
          <td></td>
        </tr>`
        )
        .join("")
      return parentRow + childRows
    })
    .join("")

  const discountRows =
    doc.discountSatang > 0
      ? `
      <tr><td colspan="5" class="r label">ส่วนลด</td><td class="r">${money(doc.discountSatang)}</td></tr>
      <tr><td colspan="5" class="r label">ราคาหลังส่วนลด</td><td class="r">${money(totals.afterDiscountSatang)}</td></tr>`
      : ""

  const termsBlock = doc.terms
    ? `<div class="terms-free">${escapeHtml(doc.terms).replace(/\n/g, "<br>")}</div>`
    : ""

  const notesBlock = doc.notes
    ? `<p class="note">หมายเหตุ : ${escapeHtml(doc.notes)}</p>`
    : ""

  return `<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8">
<title>เสนอราคา ${escapeHtml(doc.number)}</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body {
    font-family: "Sarabun", "TH Sarabun New", "Leelawadee UI", "Noto Sans Thai", sans-serif;
    color: #111; margin: 0; padding: 32px; font-size: 13px; line-height: 1.5;
  }
  .sheet { max-width: 800px; margin: 0 auto; }
  h1 { text-align: center; font-size: 18px; margin: 0 0 16px; }
  .head { display: flex; justify-content: space-between; gap: 16px; border-top: 2px solid #111; padding-top: 10px; }
  .head .co { font-weight: 700; }
  .head .meta div { display: flex; gap: 8px; }
  .head .meta .k { color: #555; min-width: 52px; }
  .cust { border-top: 1px solid #ccc; margin-top: 10px; padding-top: 8px; }
  .proj { margin: 10px 0; font-weight: 700; }
  table.items { width: 100%; border-collapse: collapse; margin-top: 8px; }
  table.items th, table.items td { border: 1px solid #999; padding: 5px 8px; vertical-align: top; }
  table.items th { background: #eef2f7; font-weight: 700; }
  td.c { text-align: center; } td.r, th.r { text-align: right; }
  tr.sub td { border-top: 0; border-bottom: 0; color: #333; }
  .sub-desc { padding-left: 18px; }
  td.label { font-weight: 700; background: #fafafa; }
  tr.grand td { font-weight: 700; background: #eef2f7; font-size: 14px; }
  .note { color: #444; margin: 8px 0 0; }
  .tnc { margin-top: 20px; }
  .tnc h2 { font-size: 14px; background: #eef2f7; padding: 6px 8px; margin: 0 0 8px; }
  .tnc table { width: 100%; }
  .tnc td { padding: 2px 8px 2px 0; vertical-align: top; }
  .tnc .k { font-weight: 700; white-space: nowrap; }
  .terms-free { white-space: pre-line; margin-top: 6px; }
  .sign { display: flex; justify-content: space-between; margin-top: 48px; gap: 24px; }
  .sign .box { text-align: center; width: 45%; }
  .sign .line { margin-top: 48px; border-top: 1px dotted #555; padding-top: 4px; }
  @media print { body { padding: 0; } .sheet { max-width: none; } }
</style>
</head>
<body>
<div class="sheet">
  <h1>เสนอราคา / Quotation</h1>

  <div class="head">
    <div>
      <div class="co">${escapeHtml(COMPANY_PROFILE.nameTh)}</div>
      <div>ที่อยู่ ${escapeHtml(COMPANY_PROFILE.addressTh)}</div>
      <div>เบอร์โทร ${escapeHtml(COMPANY_PROFILE.phone)}</div>
    </div>
    <div class="meta">
      <div><span class="k">วันที่ :</span><span>${escapeHtml(formatThaiDate(doc.issueDate) ?? "—")}</span></div>
      <div><span class="k">เลขที่</span><span>${escapeHtml(doc.number)}</span></div>
      ${doc.validUntil ? `<div><span class="k">อ้างอิง:</span><span>ยืนราคาถึง ${escapeHtml(formatThaiDate(doc.validUntil) ?? "")}</span></div>` : ""}
    </div>
  </div>

  <div class="cust">
    <div><strong>เรียน :</strong> ${escapeHtml(doc.clientName)}</div>
  </div>

  ${doc.projectTitle ? `<div class="proj">Project details : ${escapeHtml(doc.projectTitle)}</div>` : ""}

  <table class="items">
    <thead>
      <tr>
        <th style="width:36px">No.</th>
        <th>Description</th>
        <th style="width:52px">Qty</th>
        <th style="width:64px">Unit</th>
        <th style="width:110px" class="r">Unit price (THB)</th>
        <th style="width:110px" class="r">Amount (THB)</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
      <tr><td colspan="5" class="r label">รวม</td><td class="r">${money(totals.subtotalSatang)}</td></tr>
      ${discountRows}
      <tr><td colspan="5" class="r label">Vat (7%)</td><td class="r">${doc.vatMode === "add_7" ? money(totals.vatSatang) : "0"}</td></tr>
      <tr class="grand">
        <td colspan="4">(ตัวอักษร) ${escapeHtml(bahtText(totals.grandTotalSatang))}</td>
        <td class="r">รวมเป็นเงินทั้งสิ้น</td>
        <td class="r">${money(totals.grandTotalSatang)}</td>
      </tr>
    </tbody>
  </table>

  ${notesBlock}

  <div class="tnc">
    <h2>Terms and Conditions</h2>
    <table>
      <tr>
        <td class="k">เงื่อนไขการชำระเงิน</td>
        <td>
          งวดที่ 1 - ${Number(doc.depositPct)}% มัดจำ เพื่อยืนยันคำสั่งซื้อ เป็นจำนวนเงิน ${money(split.depositSatang)} บาท<br>
          งวดที่ 2 - ${100 - Number(doc.depositPct)}% เมื่องานแล้วเสร็จ เป็นจำนวนเงิน ${money(split.balanceSatang)} บาท
        </td>
      </tr>
    </table>
    ${termsBlock}
  </div>

  <div class="sign">
    <div class="box">
      <div>อนุมัติสั่งซื้อตามเงื่อนไข</div>
      <div class="line">( .................................................... )</div>
      <div>วันที่ ..........................................</div>
    </div>
    <div class="box">
      <div>ในนาม ${escapeHtml(COMPANY_PROFILE.nameTh)}</div>
      <div class="line">( ${escapeHtml(COMPANY_PROFILE.signerName)} )</div>
      <div>วันที่ : ${escapeHtml(formatThaiDate(doc.issueDate) ?? "")}</div>
    </div>
  </div>
</div>
</body>
</html>`
}

/** Re-exported for the DOCX route (ST-7) so both outputs share one shape. */
export function thaiQuoteTotals(doc: ThaiQuoteDoc) {
  const totals = computeQuoteTotals(
    doc.items.map((it) => ({
      amountSatang: it.amountSatang,
      parentItemId: null,
    })),
    doc.discountSatang,
    doc.vatMode
  )
  return { totals, split: splitPayment(totals.grandTotalSatang, doc.depositPct), formatTHB }
}
