import { describe, it, expect } from "vitest"

import {
  getNextIndex,
  getPrevIndex,
  mapKeyToLightboxAction,
  handleLightboxKey,
  swipeDeltaToAction,
} from "@/lib/pipeline/lightbox"

describe("getNextIndex", () => {
  it("advances by one", () => {
    expect(getNextIndex(5, 0)).toBe(1)
    expect(getNextIndex(5, 3)).toBe(4)
  })

  it("wraps from the last index back to 0", () => {
    expect(getNextIndex(5, 4)).toBe(0)
  })

  it("stays at 0 with a single item", () => {
    expect(getNextIndex(1, 0)).toBe(0)
  })

  it("returns the current index unchanged when there are no items", () => {
    expect(getNextIndex(0, 0)).toBe(0)
  })
})

describe("getPrevIndex", () => {
  it("goes back by one", () => {
    expect(getPrevIndex(5, 3)).toBe(2)
  })

  it("wraps from index 0 back to the last index", () => {
    expect(getPrevIndex(5, 0)).toBe(4)
  })

  it("stays at 0 with a single item", () => {
    expect(getPrevIndex(1, 0)).toBe(0)
  })

  it("returns the current index unchanged when there are no items", () => {
    expect(getPrevIndex(0, 0)).toBe(0)
  })
})

describe("mapKeyToLightboxAction", () => {
  it("maps ArrowLeft to prev, ArrowRight to next, Escape to close", () => {
    expect(mapKeyToLightboxAction("ArrowLeft")).toBe("prev")
    expect(mapKeyToLightboxAction("ArrowRight")).toBe("next")
    expect(mapKeyToLightboxAction("Escape")).toBe("close")
  })

  it("returns null for an unmapped key", () => {
    expect(mapKeyToLightboxAction("Tab")).toBeNull()
    expect(mapKeyToLightboxAction("a")).toBeNull()
    expect(mapKeyToLightboxAction("")).toBeNull()
  })
})

describe("handleLightboxKey", () => {
  it("resolves ArrowRight to the next index and a 'next' action", () => {
    expect(handleLightboxKey("ArrowRight", 5, 3)).toEqual({ action: "next", index: 4 })
  })

  it("resolves ArrowLeft to the prev index and a 'prev' action, wrapping", () => {
    expect(handleLightboxKey("ArrowLeft", 5, 0)).toEqual({ action: "prev", index: 4 })
  })

  it("resolves Escape to a 'close' action with the index unchanged", () => {
    expect(handleLightboxKey("Escape", 5, 2)).toEqual({ action: "close", index: 2 })
  })

  it("returns null for a key with no mapping", () => {
    expect(handleLightboxKey("Tab", 5, 2)).toBeNull()
  })
})

describe("swipeDeltaToAction", () => {
  it("treats a large enough leftward swipe as 'next'", () => {
    expect(swipeDeltaToAction(-80)).toBe("next")
  });

  it("treats a large enough rightward swipe as 'prev'", () => {
    expect(swipeDeltaToAction(80)).toBe("prev")
  })

  it("ignores small movements below the threshold (a tap, not a swipe)", () => {
    expect(swipeDeltaToAction(10)).toBeNull()
    expect(swipeDeltaToAction(-10)).toBeNull()
    expect(swipeDeltaToAction(0)).toBeNull()
  })

  it("respects a custom threshold", () => {
    expect(swipeDeltaToAction(30, 20)).toBe("prev")
    expect(swipeDeltaToAction(15, 20)).toBeNull()
  })

  it("treats exactly the threshold as a swipe (inclusive boundary)", () => {
    expect(swipeDeltaToAction(50)).toBe("prev")
    expect(swipeDeltaToAction(-50)).toBe("next")
  })
})
