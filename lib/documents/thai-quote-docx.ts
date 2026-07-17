import {
  Document,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
  AlignmentType,
  BorderStyle,
  ShadingType,
} from "docx"

import { satangToBaht, type Satang } from "@/lib/money"
import { computeQuoteTotals, splitPayment } from "@/lib/quotes/pricing"
import { bahtText } from "@/lib/thai/baht-text"
import { formatThaiDate } from "@/lib/thai/buddhist-date"
import { COMPANY_PROFILE, type ThaiQuoteDoc } from "./thai-quote"

/**
 * Editable Word export of a quotation (CR-002 ST-7) — same content and
 * layout as the Thai printable, generated programmatically so the engineer
 * can download, fix any small detail in Word, and send. Generated in code
 * (docx lib) rather than from the legacy docxtpl template: same fields, no
 * binary-template placeholder surgery.
 */

const FONT = "TH Sarabun New"
const SIZE = 24 // half-points → 12pt

function money(satang: Satang): string {
  return satangToBaht(satang).toLocaleString("th-TH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
}

function run(text: string, opts: { bold?: boolean } = {}): TextRun {
  return new TextRun({ text, bold: opts.bold, font: FONT, size: SIZE })
}

function para(
  text: string,
  opts: { bold?: boolean; align?: (typeof AlignmentType)[keyof typeof AlignmentType] } = {}
): Paragraph {
  return new Paragraph({
    alignment: opts.align,
    children: [run(text, { bold: opts.bold })],
  })
}

function cell(
  text: string,
  opts: {
    bold?: boolean
    align?: (typeof AlignmentType)[keyof typeof AlignmentType]
    shaded?: boolean
    columnSpan?: number
  } = {}
): TableCell {
  return new TableCell({
    columnSpan: opts.columnSpan,
    shading: opts.shaded
      ? { type: ShadingType.CLEAR, fill: "EEF2F7" }
      : undefined,
    children: [
      new Paragraph({
        alignment: opts.align,
        children: [run(text, { bold: opts.bold })],
      }),
    ],
  })
}

export async function buildThaiQuoteDocx(doc: ThaiQuoteDoc): Promise<Buffer> {
  const totals = computeQuoteTotals(
    doc.items.map((it) => ({ amountSatang: it.amountSatang, parentItemId: null })),
    doc.discountSatang,
    doc.vatMode
  )
  const split = splitPayment(totals.grandTotalSatang, doc.depositPct)

  const header = [
    cell("No.", { bold: true, shaded: true, align: AlignmentType.CENTER }),
    cell("Description", { bold: true, shaded: true }),
    cell("Qty", { bold: true, shaded: true, align: AlignmentType.CENTER }),
    cell("Unit", { bold: true, shaded: true, align: AlignmentType.CENTER }),
    cell("Unit price (THB)", { bold: true, shaded: true, align: AlignmentType.RIGHT }),
    cell("Amount (THB)", { bold: true, shaded: true, align: AlignmentType.RIGHT }),
  ]

  const itemRows = doc.items.flatMap((it, i) => {
    const no = i + 1
    const parent = new TableRow({
      children: [
        cell(String(no), { align: AlignmentType.CENTER }),
        cell(it.description, { bold: it.children.length > 0 }),
        cell(String(Number(it.quantity)), { align: AlignmentType.CENTER }),
        cell(it.unit ?? "", { align: AlignmentType.CENTER }),
        cell(money(it.unitPriceSatang), { align: AlignmentType.RIGHT }),
        cell(money(it.amountSatang), { align: AlignmentType.RIGHT }),
      ],
    })
    const children = it.children.map(
      (child, j) =>
        new TableRow({
          children: [
            cell(""),
            cell(`${no}.${j + 1} ${child.description}`),
            cell(String(Number(child.quantity)), { align: AlignmentType.CENTER }),
            cell(child.unit ?? "", { align: AlignmentType.CENTER }),
            cell(""),
            cell(""),
          ],
        })
    )
    return [parent, ...children]
  })

  const totalRow = (label: string, value: string, opts: { shaded?: boolean } = {}) =>
    new TableRow({
      children: [
        cell(label, {
          bold: true,
          columnSpan: 5,
          align: AlignmentType.RIGHT,
          shaded: opts.shaded,
        }),
        cell(value, { bold: true, align: AlignmentType.RIGHT, shaded: opts.shaded }),
      ],
    })

  const totalsRows = [
    totalRow("รวม", money(totals.subtotalSatang)),
    ...(doc.discountSatang > 0
      ? [
          totalRow("ส่วนลด", money(doc.discountSatang)),
          totalRow("ราคาหลังส่วนลด", money(totals.afterDiscountSatang)),
        ]
      : []),
    totalRow("Vat (7%)", doc.vatMode === "add_7" ? money(totals.vatSatang) : "0"),
    new TableRow({
      children: [
        cell(`(ตัวอักษร) ${bahtText(totals.grandTotalSatang)}`, {
          bold: true,
          columnSpan: 4,
          shaded: true,
        }),
        cell("รวมเป็นเงินทั้งสิ้น", {
          bold: true,
          align: AlignmentType.RIGHT,
          shaded: true,
        }),
        cell(money(totals.grandTotalSatang), {
          bold: true,
          align: AlignmentType.RIGHT,
          shaded: true,
        }),
      ],
    }),
  ]

  const document = new Document({
    styles: {
      default: { document: { run: { font: FONT, size: SIZE } } },
    },
    sections: [
      {
        children: [
          para("เสนอราคา / Quotation", { bold: true, align: AlignmentType.CENTER }),
          para(""),
          para(COMPANY_PROFILE.nameTh, { bold: true }),
          para(`ที่อยู่ ${COMPANY_PROFILE.addressTh}`),
          para(`เบอร์โทร ${COMPANY_PROFILE.phone}`),
          para(`วันที่ : ${formatThaiDate(doc.issueDate) ?? "—"}    เลขที่ ${doc.number}`),
          ...(doc.validUntil
            ? [para(`อ้างอิง: ยืนราคาถึง ${formatThaiDate(doc.validUntil) ?? ""}`)]
            : []),
          para(""),
          para(`เรียน : ${doc.clientName}`, { bold: true }),
          ...(doc.projectTitle
            ? [para(`Project details : ${doc.projectTitle}`, { bold: true })]
            : []),
          para(""),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: {
              top: { style: BorderStyle.SINGLE, size: 4, color: "999999" },
              bottom: { style: BorderStyle.SINGLE, size: 4, color: "999999" },
              left: { style: BorderStyle.SINGLE, size: 4, color: "999999" },
              right: { style: BorderStyle.SINGLE, size: 4, color: "999999" },
              insideHorizontal: { style: BorderStyle.SINGLE, size: 2, color: "999999" },
              insideVertical: { style: BorderStyle.SINGLE, size: 2, color: "999999" },
            },
            rows: [new TableRow({ children: header }), ...itemRows, ...totalsRows],
          }),
          para(""),
          ...(doc.notes ? [para(`หมายเหตุ : ${doc.notes}`)] : []),
          para("Terms and Conditions", { bold: true }),
          para(
            `เงื่อนไขการชำระเงิน  งวดที่ 1 - ${Number(doc.depositPct)}% มัดจำ เพื่อยืนยันคำสั่งซื้อ เป็นจำนวนเงิน ${money(split.depositSatang)} บาท`
          ),
          para(
            `                     งวดที่ 2 - ${100 - Number(doc.depositPct)}% เมื่องานแล้วเสร็จ เป็นจำนวนเงิน ${money(split.balanceSatang)} บาท`
          ),
          ...(doc.terms ? doc.terms.split("\n").map((line) => para(line)) : []),
          para(""),
          para(""),
          para(
            `อนุมัติสั่งซื้อตามเงื่อนไข                                        ในนาม ${COMPANY_PROFILE.nameTh}`
          ),
          para(""),
          para(
            `( .................................................... )                    ( ${COMPANY_PROFILE.signerName} )`
          ),
          para(
            `วันที่ ..........................................                    วันที่ : ${formatThaiDate(doc.issueDate) ?? ""}`
          ),
        ],
      },
    ],
  })

  return Packer.toBuffer(document)
}
