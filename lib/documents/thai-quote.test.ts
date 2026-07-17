import { describe, it, expect } from "vitest"

import { renderThaiQuoteHtml, type ThaiQuoteDoc } from "./thai-quote"

const baseDoc: ThaiQuoteDoc = {
  number: "TSD11026164",
  issueDate: "2026-07-07",
  validUntil: "2026-08-06",
  clientName: "ภญ.ภานุช ไตรศิริวาณิชย์",
  projectTitle: "โครงการติดตั้งระบบ Solar Rooftop บ้านยาภานุช หลังมข.",
  items: [
    {
      description: "Solar Rooftop System - Huawei 5.20 กิโลวัตต์ 1 เฟส",
      quantity: 1,
      unit: "ชุด",
      unitPriceSatang: 15613500,
      amountSatang: 15613500,
      children: [
        {
          description: "แผงโซล่าเซลล์ LONGI Hi-MO X10 650W",
          quantity: 8,
          unit: "แผง",
        },
        {
          description: "Inverter Huawei SUN2000-5K-LB0",
          quantity: 1,
          unit: "เครื่อง",
        },
      ],
    },
    {
      description: "Optimizer Huawei SUN2000-600W-P",
      quantity: 8,
      unit: "เครื่อง",
      unitPriceSatang: 200000,
      amountSatang: 1600000,
      children: [],
    },
  ],
  discountSatang: 754700,
  vatMode: "none",
  depositPct: 50,
  terms: "รับประกันติดตั้ง 5 ปี เฉพาะบริเวณติดตั้ง",
  notes: null,
}

describe("renderThaiQuoteHtml", () => {
  it("numbers parents 1..N and children i.1, i.2 …", () => {
    const html = renderThaiQuoteHtml(baseDoc)
    expect(html).toContain("1.1 แผงโซล่าเซลล์ LONGI Hi-MO X10 650W")
    expect(html).toContain("1.2 Inverter Huawei SUN2000-5K-LB0")
    // The optimizer is parent #2.
    expect(html).toMatch(/>2<\/td>[\s\S]*?Optimizer Huawei/)
  })

  it("children show qty/unit but no prices", () => {
    const html = renderThaiQuoteHtml(baseDoc)
    // The child row block between 1.1 and 1.2 must not contain a ฿ amount.
    const childBlock = html.slice(
      html.indexOf("1.1 แผงโซล่าเซลล์"),
      html.indexOf("1.2 Inverter")
    )
    expect(childBlock).toContain("แผง")
    expect(childBlock).not.toContain("฿")
  })

  it("shows discount, post-discount total, and the Thai-words line (no VAT)", () => {
    const html = renderThaiQuoteHtml(baseDoc)
    expect(html).toContain("ส่วนลด")
    // ฿172,135 − ฿7,547 = ฿164,588
    expect(html).toContain("164,588.00")
    expect(html).toContain("หนึ่งแสนหกหมื่นสี่พันห้าร้อยแปดสิบแปดบาทถ้วน")
    // vat_mode none → VAT row shows 0.
    expect(html).toMatch(/Vat \(7%\)[\s\S]*?>0</)
  })

  it("add_7 mode computes and shows VAT on the discounted amount", () => {
    const html = renderThaiQuoteHtml({ ...baseDoc, vatMode: "add_7" })
    // 16,458,800 satang × 7% = 1,152,116 satang → ฿11,521.16
    expect(html).toContain("11,521.16")
    expect(html).toContain("176,109.16")
  })

  it("prints the two-installment payment schedule from deposit_pct", () => {
    const html = renderThaiQuoteHtml(baseDoc)
    expect(html).toContain("งวดที่ 1")
    expect(html).toContain("งวดที่ 2")
    // 50% of ฿164,588 = ฿82,294 each.
    const matches = html.match(/82,294\.00/g) ?? []
    expect(matches.length).toBeGreaterThanOrEqual(2)
  })

  it("renders Buddhist-calendar dates and escapes HTML in user text", () => {
    const html = renderThaiQuoteHtml({
      ...baseDoc,
      clientName: 'A <script>alert("x")</script> Co.',
    })
    expect(html).toContain("07 ก.ค. 2569")
    expect(html).not.toContain("<script>alert")
  })
})
