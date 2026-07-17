import { describe, it, expect } from "vitest"

import { buildThaiQuoteDocx } from "./thai-quote-docx"
import type { ThaiQuoteDoc } from "./thai-quote"

const doc: ThaiQuoteDoc = {
  number: "QUO-2026-042",
  issueDate: "2026-07-17",
  validUntil: null,
  clientName: "Test Client",
  projectTitle: "Solar Rooftop 5 kW",
  items: [
    {
      description: "Solar Rooftop System",
      quantity: 1,
      unit: "ชุด",
      unitPriceSatang: 15613500,
      amountSatang: 15613500,
      children: [{ description: "PV Module", quantity: 8, unit: "แผง" }],
    },
  ],
  discountSatang: 0,
  vatMode: "add_7",
  depositPct: 50,
  terms: "รับประกันติดตั้ง 5 ปี",
  notes: null,
}

describe("buildThaiQuoteDocx", () => {
  it("produces a valid non-empty .docx (zip) buffer", async () => {
    const buffer = await buildThaiQuoteDocx(doc)
    expect(buffer.length).toBeGreaterThan(1000)
    // DOCX is a zip: PK magic bytes.
    expect(buffer[0]).toBe(0x50)
    expect(buffer[1]).toBe(0x4b)
  })

  it("embeds the quote number, client, and Thai-words total in the document XML", async () => {
    const buffer = await buildThaiQuoteDocx(doc)
    // The main document part is stored deflated; use the zip lib docx itself
    // depends on to read it back.
    const { default: JSZip } = await import("jszip")
    const zip = await JSZip.loadAsync(buffer)
    const xml = await zip.file("word/document.xml")!.async("string")
    expect(xml).toContain("QUO-2026-042")
    expect(xml).toContain("Test Client")
    expect(xml).toContain("PV Module")
    // ฿156,135 + 7% VAT = ฿167,064.45 in Thai words ends with สตางค์.
    expect(xml).toContain("สตางค์")
    expect(xml).toContain("งวดที่ 1")
  })
})
