/**
 * Zoom and pan math for the district choropleth.
 *
 * Pure and platform-free so the clamping rules can be unit tested without a
 * device: the gesture wiring lives in the screen, but *how far the map may move*
 * is decided here, and that is the part that goes wrong quietly (a map panned
 * off-screen looks like a rendering bug, not a gesture bug).
 *
 * The rule: scaled content always covers the viewport. At scale 1 the offset must
 * be 0, and at scale s the offset may not exceed the half-extent the scaling
 * added, so no edge of the container can be left showing empty background.
 */

export interface MapTransform {
  scale: number;
  x: number;
  y: number;
}

export const MIN_SCALE = 1;
export const MAX_SCALE = 4;
/** One tap of the zoom button. Multiplicative, so zoom in then out is a no-op. */
export const ZOOM_STEP = 1.5;

export function resetTransform(): MapTransform {
  return { scale: MIN_SCALE, x: 0, y: 0 };
}

export function clampScale(scale: number): number {
  // NaN means the gesture produced nothing usable, so fall back to 1. An
  // infinity is a *direction*: a pinch spike should clamp to the nearest bound
  // rather than throwing away the zoom the user was in the middle of.
  if (Number.isNaN(scale)) return MIN_SCALE;
  if (scale === Number.POSITIVE_INFINITY) return MAX_SCALE;
  if (scale === Number.NEGATIVE_INFINITY) return MIN_SCALE;
  if (!Number.isFinite(scale)) return MIN_SCALE;
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, scale));
}

function clamp(value: number, min: number, max: number): number {
  const clamped = Math.min(max, Math.max(min, value));
  // `Math.min(-0, 0)` yields -0, which is numerically equal to 0 but breaks any
  // deep-equality check (and looks like a sign bug in a state diff).
  return clamped === 0 ? 0 : clamped;
}

/**
 * Clamp a transform so the scaled map still covers the viewport.
 *
 * ``width``/``height`` are the unscaled map size. At scale 1 the allowed offset
 * is exactly zero; the limit grows linearly with the extra extent scaling adds.
 */
export function clampTransform(
  transform: MapTransform,
  width: number,
  height: number,
): MapTransform {
  const scale = clampScale(transform.scale);
  const maxX = ((scale - 1) * Math.max(0, width)) / 2;
  const maxY = ((scale - 1) * Math.max(0, height)) / 2;
  return {
    scale,
    x: clamp(Number.isFinite(transform.x) ? transform.x : 0, -maxX, maxX),
    y: clamp(Number.isFinite(transform.y) ? transform.y : 0, -maxY, maxY),
  };
}

/** Apply a multiplicative zoom, clamped, keeping the current pan where valid. */
export function zoomBy(
  transform: MapTransform,
  factor: number,
  width: number,
  height: number,
): MapTransform {
  return clampTransform({ ...transform, scale: transform.scale * factor }, width, height);
}

/**
 * Set an absolute scale (a pinch gesture), clamped, and re-clamp the pan for it.
 *
 * The pan is kept rather than recentred, so pinching a district and releasing
 * does not throw the user back to the middle of the map.
 */
export function scaleTo(
  transform: MapTransform,
  scale: number,
  width: number,
  height: number,
): MapTransform {
  return clampTransform({ ...transform, scale }, width, height);
}

/** Apply a pan delta, clamped. */
export function panBy(
  transform: MapTransform,
  dx: number,
  dy: number,
  width: number,
  height: number,
): MapTransform {
  return clampTransform({ ...transform, x: transform.x + dx, y: transform.y + dy }, width, height);
}

export function canZoomIn(transform: MapTransform): boolean {
  return clampScale(transform.scale) < MAX_SCALE;
}

export function canZoomOut(transform: MapTransform): boolean {
  return clampScale(transform.scale) > MIN_SCALE;
}

/** True when there is nothing to reset - lets the UI disable the control. */
export function isDefaultTransform(transform: MapTransform): boolean {
  return transform.scale === MIN_SCALE && transform.x === 0 && transform.y === 0;
}
