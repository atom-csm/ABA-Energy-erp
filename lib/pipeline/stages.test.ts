import { describe, it, expect } from "vitest"

import {
  STAGES,
  getStageRequirements,
  type ProjectPipelineState,
} from "@/lib/pipeline/stages"
import { Constants } from "@/lib/types/database"

/**
 * A state where every signal is "unmet" — used as a base so each test only
 * overrides the field(s) it cares about.
 */
const emptyState: ProjectPipelineState = {
  stage: "electric_bill_collection",
  monthlyBillSatang: null,
  surveyCompleted: false,
  sentQuoteCount: 0,
  invoiceCount: 0,
  installationStarted: false,
  handoverEvidenceCount: 0,
}

describe("STAGES", () => {
  it("lists exactly the 8 project_stage enum values, in enum order", () => {
    expect(STAGES.map((s) => s.value)).toEqual(Constants.public.Enums.project_stage)
  })

  it("gives every stage a non-empty human label", () => {
    for (const stage of STAGES) {
      expect(stage.label.length).toBeGreaterThan(0)
    }
  })
})

describe("getStageRequirements", () => {
  describe("electric_bill_collection — requires monthlyBillSatang to be set", () => {
    it("is unmet when monthlyBillSatang is null", () => {
      const result = getStageRequirements({ ...emptyState, monthlyBillSatang: null })
      expect(result.canAdvance).toBe(false)
      expect(result.requirements).toHaveLength(1)
      expect(result.requirements[0]!.met).toBe(false)
    })

    it("is met when monthlyBillSatang is a positive integer", () => {
      const result = getStageRequirements({ ...emptyState, monthlyBillSatang: 250_000 })
      expect(result.canAdvance).toBe(true)
      expect(result.requirements[0]!.met).toBe(true)
    })

    // Judgment call: `monthly_bill_satang` has a DB check of `>= 0`, so 0 is a
    // legal *entered* value (e.g. a placeholder or genuinely tiny bill) — it
    // is not reused as a sentinel for "not set" the way some codebases do.
    // Only `null` means "not yet collected." So 0 counts as satisfied.
    it("treats monthlyBillSatang of 0 as satisfied (an entered value, not a placeholder for unset)", () => {
      const result = getStageRequirements({ ...emptyState, monthlyBillSatang: 0 })
      expect(result.canAdvance).toBe(true)
      expect(result.requirements[0]!.met).toBe(true)
    })
  })

  describe("site_survey — requires surveyCompleted", () => {
    it("is unmet when surveyCompleted is false", () => {
      const result = getStageRequirements({
        ...emptyState,
        stage: "site_survey",
        surveyCompleted: false,
      })
      expect(result.canAdvance).toBe(false)
      expect(result.requirements[0]!.met).toBe(false)
    })

    it("is met when surveyCompleted is true", () => {
      const result = getStageRequirements({
        ...emptyState,
        stage: "site_survey",
        surveyCompleted: true,
      })
      expect(result.canAdvance).toBe(true)
      expect(result.requirements[0]!.met).toBe(true)
    })
  })

  describe("quotation_and_proposal — requires sentQuoteCount >= 1", () => {
    it("is unmet when sentQuoteCount is 0", () => {
      const result = getStageRequirements({
        ...emptyState,
        stage: "quotation_and_proposal",
        sentQuoteCount: 0,
      })
      expect(result.canAdvance).toBe(false)
      expect(result.requirements[0]!.met).toBe(false)
    })

    it("is met when sentQuoteCount is exactly 1 (boundary)", () => {
      const result = getStageRequirements({
        ...emptyState,
        stage: "quotation_and_proposal",
        sentQuoteCount: 1,
      })
      expect(result.canAdvance).toBe(true)
      expect(result.requirements[0]!.met).toBe(true)
    })

    it("is met when sentQuoteCount is greater than 1", () => {
      const result = getStageRequirements({
        ...emptyState,
        stage: "quotation_and_proposal",
        sentQuoteCount: 3,
      })
      expect(result.canAdvance).toBe(true)
    })
  })

  describe("negotiation_and_followup — no hard requirement, always satisfied", () => {
    it("reports satisfied even when every other signal is unmet", () => {
      const result = getStageRequirements({
        ...emptyState,
        stage: "negotiation_and_followup",
      })
      expect(result.canAdvance).toBe(true)
      expect(result.requirements).toEqual([])
    })

    it("still reports satisfied when unrelated signals happen to be set", () => {
      const result = getStageRequirements({
        ...emptyState,
        stage: "negotiation_and_followup",
        monthlyBillSatang: null,
        surveyCompleted: false,
        sentQuoteCount: 0,
      })
      expect(result.canAdvance).toBe(true)
    })
  })

  describe("installation — requires installationStarted", () => {
    it("is unmet when installationStarted is false", () => {
      const result = getStageRequirements({
        ...emptyState,
        stage: "installation",
        installationStarted: false,
      })
      expect(result.canAdvance).toBe(false)
      expect(result.requirements[0]!.met).toBe(false)
    })

    it("is met when installationStarted is true", () => {
      const result = getStageRequirements({
        ...emptyState,
        stage: "installation",
        installationStarted: true,
      })
      expect(result.canAdvance).toBe(true)
      expect(result.requirements[0]!.met).toBe(true)
    })
  })

  describe("payment — requires invoiceCount >= 1", () => {
    it("is unmet when invoiceCount is 0", () => {
      const result = getStageRequirements({
        ...emptyState,
        stage: "payment",
        invoiceCount: 0,
      })
      expect(result.canAdvance).toBe(false)
      expect(result.requirements[0]!.met).toBe(false)
    })

    it("is met when invoiceCount is exactly 1 (boundary)", () => {
      const result = getStageRequirements({
        ...emptyState,
        stage: "payment",
        invoiceCount: 1,
      })
      expect(result.canAdvance).toBe(true)
      expect(result.requirements[0]!.met).toBe(true)
    })
  })

  describe("after_sales — requires handoverEvidenceCount >= 1", () => {
    it("is unmet when handoverEvidenceCount is 0", () => {
      const result = getStageRequirements({
        ...emptyState,
        stage: "after_sales",
        handoverEvidenceCount: 0,
      })
      expect(result.canAdvance).toBe(false)
      expect(result.requirements[0]!.met).toBe(false)
    })

    it("is met when handoverEvidenceCount is exactly 1 (boundary)", () => {
      const result = getStageRequirements({
        ...emptyState,
        stage: "after_sales",
        handoverEvidenceCount: 1,
      })
      expect(result.canAdvance).toBe(true)
      expect(result.requirements[0]!.met).toBe(true)
    })
  })

  describe("archive — terminal stage, no requirement, always satisfied", () => {
    it("reports satisfied regardless of any other signal", () => {
      const result = getStageRequirements({ ...emptyState, stage: "archive" })
      expect(result.canAdvance).toBe(true)
      expect(result.requirements).toEqual([])
    })
  })

  it("returns the stage it was asked about, unchanged", () => {
    const result = getStageRequirements({ ...emptyState, stage: "payment", invoiceCount: 2 })
    expect(result.stage).toBe("payment")
  })
})
