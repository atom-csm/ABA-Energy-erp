import { describe, it, expect } from "vitest"

import { bahtText } from "./baht-text"

describe("bahtText (satang → Thai words, ตัวอักษร line on quotations)", () => {
  it("zero", () => {
    expect(bahtText(0)).toBe("ศูนย์บาทถ้วน")
  })

  it("whole baht gets ถ้วน", () => {
    expect(bahtText(100)).toBe("หนึ่งบาทถ้วน")
  })

  it("uses เอ็ด for a trailing 1 after tens", () => {
    expect(bahtText(1100)).toBe("สิบเอ็ดบาทถ้วน")
    expect(bahtText(2100)).toBe("ยี่สิบเอ็ดบาทถ้วน")
  })

  it("uses เอ็ด for a units 1 after higher places", () => {
    expect(bahtText(10100)).toBe("หนึ่งร้อยเอ็ดบาทถ้วน")
  })

  it("uses ยี่ for 2 in the tens place", () => {
    expect(bahtText(2500)).toBe("ยี่สิบห้าบาทถ้วน")
  })

  it("matches the real quotation total: ฿164,588.00", () => {
    expect(bahtText(16458800)).toBe(
      "หนึ่งแสนหกหมื่นสี่พันห้าร้อยแปดสิบแปดบาทถ้วน"
    )
  })

  it("matches the BOQ grand total with satang: ฿184,184.45", () => {
    expect(bahtText(18418445)).toBe(
      "หนึ่งแสนแปดหมื่นสี่พันหนึ่งร้อยแปดสิบสี่บาทสี่สิบห้าสตางค์"
    )
  })

  it("satang-only amounts still name the baht part as zero", () => {
    expect(bahtText(45)).toBe("ศูนย์บาทสี่สิบห้าสตางค์")
  })

  it("หนึ่งสตางค์ edge", () => {
    expect(bahtText(101)).toBe("หนึ่งบาทหนึ่งสตางค์")
  })

  it("เอ็ดสตางค์ edge (21 satang)", () => {
    expect(bahtText(21)).toBe("ศูนย์บาทยี่สิบเอ็ดสตางค์")
  })

  it("millions use ล้าน grouping", () => {
    expect(bahtText(100000000)).toBe("หนึ่งล้านบาทถ้วน")
    expect(bahtText(123456789)).toBe(
      "หนึ่งล้านสองแสนสามหมื่นสี่พันห้าร้อยหกสิบเจ็ดบาทแปดสิบเก้าสตางค์"
    )
  })

  it("multi-million recursion (สิบล้าน)", () => {
    expect(bahtText(1234567800)).toBe(
      "สิบสองล้านสามแสนสี่หมื่นห้าพันหกร้อยเจ็ดสิบแปดบาทถ้วน"
    )
  })
})
