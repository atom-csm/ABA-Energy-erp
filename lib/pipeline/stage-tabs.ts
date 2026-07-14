/**
 * CR-001 ST-6 — pure navigation logic for the mobile "swipeable stage tabs"
 * on the projects list page (see docs/PROJECT_PIPELINE_REDESIGN.md's "List
 * page (/projects)" section: "horizontal swipeable stage tabs + a vertical
 * card list per stage").
 *
 * This intentionally does NOT reuse `swipeDeltaToAction`'s index math
 * (`getNextIndex`/`getPrevIndex` in `lib/pipeline/lightbox.ts`) even though it
 * reuses the delta→direction decision itself. The lightbox navigates a photo
 * gallery, where wrapping from the last photo back to the first is the
 * expected, harmless carousel behavior. Stage tabs are a fixed, ordered
 * pipeline (Electric bill collection → ... → Archive) — swiping right past
 * the first stage or left past the last stage should do nothing, not silently
 * jump to the opposite end of the pipeline, which would look like the
 * project's stage just teleported. So this clamps to the valid range instead
 * of wrapping.
 */

import { swipeDeltaToAction } from "./lightbox"

/**
 * Given the currently active stage tab index, the total tab count, and a
 * horizontal touch-drag distance (`touchend.clientX - touchstart.clientX`),
 * returns the index the active tab should move to. A swipe too short to
 * count as a swipe (see `swipeDeltaToAction`'s threshold) returns `current`
 * unchanged, as does a swipe past either end of the tab list.
 */
export function swipeToAdjacentStageIndex(
  current: number,
  count: number,
  deltaX: number,
  threshold = 50
): number {
  if (count <= 0) return current
  const action = swipeDeltaToAction(deltaX, threshold)
  if (!action) return current
  if (action === "next") return Math.min(current + 1, count - 1)
  return Math.max(current - 1, 0)
}
