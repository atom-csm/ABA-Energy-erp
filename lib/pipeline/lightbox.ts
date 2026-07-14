/**
 * CR-001 ST-5 — pure navigation logic for the full-screen document lightbox
 * (see docs/PROJECT_PIPELINE_REDESIGN.md's "tap-to-open full-screen
 * swipeable photo/video viewer"). No DOM dependency: the actual component
 * wires these onto `keydown`/`touchstart`/`touchend` handlers, but the
 * "given N items and a current index, what's next" arithmetic, the
 * keyboard-key mapping, and the swipe-delta-to-direction decision are all
 * plain functions of primitives, so they're fully unit-tested here rather
 * than only exercised by clicking through a real browser.
 */

export type LightboxAction = "prev" | "next" | "close"

/** Next index, wrapping from the last item back to 0. `count <= 0` is a no-op. */
export function getNextIndex(count: number, current: number): number {
  if (count <= 0) return current
  return (current + 1) % count
}

/** Previous index, wrapping from 0 back to the last item. `count <= 0` is a no-op. */
export function getPrevIndex(count: number, current: number): number {
  if (count <= 0) return current
  return (current - 1 + count) % count
}

/** Maps a `KeyboardEvent.key` to a lightbox action, or `null` if unmapped. */
export function mapKeyToLightboxAction(key: string): LightboxAction | null {
  switch (key) {
    case "ArrowLeft":
      return "prev"
    case "ArrowRight":
      return "next"
    case "Escape":
      return "close"
    default:
      return null
  }
}

/**
 * Resolves a keydown directly to the action *and* the resulting index, so
 * the component's keydown handler is a single call: unmapped keys resolve to
 * `null` (do nothing), `close` leaves the index unchanged (the caller closes
 * the viewer instead of navigating).
 */
export function handleLightboxKey(
  key: string,
  count: number,
  current: number
): { action: LightboxAction; index: number } | null {
  const action = mapKeyToLightboxAction(key)
  if (!action) return null

  if (action === "close") return { action, index: current }
  const index = action === "next" ? getNextIndex(count, current) : getPrevIndex(count, current)
  return { action, index }
}

/**
 * Turns a horizontal touch-drag distance (`touchend.clientX -
 * touchstart.clientX`) into a navigation direction: a swipe left (negative
 * delta) means "next," a swipe right (positive delta) means "prev." Anything
 * short of `threshold` px is treated as a tap/jitter, not a swipe, and
 * returns `null` — the component's touch handler still needs a tap (not
 * swipe) to do something separate (e.g. toggle controls), so this
 * intentionally doesn't claim every touch interaction.
 */
export function swipeDeltaToAction(deltaX: number, threshold = 50): "prev" | "next" | null {
  if (deltaX <= -threshold) return "next"
  if (deltaX >= threshold) return "prev"
  return null
}
