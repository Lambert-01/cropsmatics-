/**
 * Touch intent for the time-series plot.
 *
 * The chart sits inside a scrolling screen, so a plain `onStartShouldSetResponder
 * => true` claim at touch start would hand the chart the responder immediately.
 * On Android that asks the parent to disallow intercepting further motion
 * events, and the screen stops scrolling the moment a finger lands on the plot.
 *
 * The rules here are deliberately dumb and pure so they can be unit tested
 * without a simulator:
 *
 * - **A scrub is a horizontal drag.** The plot claims the responder only once
 *   movement is clearly horizontal, so a vertical drag keeps belonging to the
 *   scroll view and the plot is cancelled rather than fighting it.
 * - **A tap barely moves.** Anything inside the slop radius at touch end
 *   selects the nearest period; anything larger was a drag (a scrub if the
 *   plot won it, a scroll if the parent did) and must not select.
 */

/** Movement, in points, that separates an intentional drag from jitter. */
export const GESTURE_SLOP = 10;

export interface TouchPoint {
  x: number;
  y: number;
}

const delta = (start: TouchPoint, current: TouchPoint) => ({
  dx: Math.abs(current.x - start.x),
  dy: Math.abs(current.y - start.y),
});

/**
 * Whether a movement from `start` to `current` is a scrub intent.
 *
 * Horizontal dominance is required, not just total distance: a mostly-vertical
 * swipe that drifts sideways a little is still a scroll.
 */
export function isScrubIntent(
  start: TouchPoint | null,
  current: TouchPoint,
  threshold: number = GESTURE_SLOP,
): boolean {
  if (!start) return false;
  const { dx, dy } = delta(start, current);
  return dx >= threshold && dx > dy;
}

/**
 * Whether a completed touch moved less than the slop radius in any direction,
 * i.e. it was a tap rather than a drag.
 */
export function isTapMovement(
  start: TouchPoint | null,
  current: TouchPoint,
  slop: number = GESTURE_SLOP,
): boolean {
  if (!start) return false;
  const { dx, dy } = delta(start, current);
  return dx <= slop && dy <= slop;
}
