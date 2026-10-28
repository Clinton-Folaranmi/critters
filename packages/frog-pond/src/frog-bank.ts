// Where the pond's water is, and the picture's edge. Pure maths, no DOM.
//
// The pond is all water (board r2, docs/FROG_VISUAL_DIRECTION.md r0): it runs
// out of the picture on every side. Three shapes, all in world units:
//
// - the open-water oval (openDistance): swimmers' bodies stay inside it;
// - the swimmers' outline (pictureDistance): a squarish oval a little in from
//   the canvas that their trailing legs stay inside;
// - the drawn picture (pictureEdge, bankMaskUrl, pictureRingUrl): the whole
//   canvas with rounded corners. The page masks the scene to it, and taps
//   count anywhere inside it.
//
// World units: canvas heights, y up, x from 0 to the aspect ratio.

// Where swimmers' bodies may go: a soft oval around the middle (semi-axes as
// shares of width and height).
const OPEN_RX = 0.465;
const OPEN_RY = 0.46;
/**
 * The point swimmers steer back toward and are contained toward (shares of
 * width and height). It sits up and right of the oval's centre because it was
 * set when a bank closed the bottom and left; it stays, because moving it
 * would change every swimmer's path on every side (the frog motion is frozen).
 */
export const WATER_CX = 0.6;
export const WATER_CY = 0.6;

/** 0 in the middle of the pond, 1 at the edge of the open water (the soft oval). */
export function openDistance(x: number, y: number, aspect: number, margin = 0) {
  return Math.hypot(
    (x - aspect / 2) / Math.max(0.05, OPEN_RX * aspect - margin),
    (y - 0.5) / Math.max(0.05, OPEN_RY - margin),
  );
}

// ---- The swimmers' outline ------------------------------------------------------

/**
 * The outline a swimmer's legs keep inside: a squarish oval (a superellipse)
 * a little in from the canvas all round. It was the page's faded edge before
 * board r2; the picture is now drawn to the full rounded rectangle (below),
 * but the frogs' containment keeps this outline so their motion is unchanged.
 * Its semi-axes, in world units.
 */
const swimRadii = (aspect: number) => [aspect / 2 - 0.05, 0.45] as const;
/** The superellipse's exponent: |x|^n + |y|^n = 1. */
const SWIM_POWER = 2 / 0.6;

/** Below 1 inside the swimmers' outline, 1 on it, above 1 outside. */
function swimEdge(x: number, y: number, aspect: number) {
  const [rx, ry] = swimRadii(aspect);
  const dx = Math.abs(x - aspect / 2) / rx;
  const dy = Math.abs(y - 0.5) / ry;
  return (dx ** SWIM_POWER + dy ** SWIM_POWER) ** (1 / SWIM_POWER);
}

/**
 * Roughly how far inside the swimmers' outline a point is, in world units:
 * positive inside, 0 on the outline, negative beyond it. (swimEdge scaled by
 * the shorter semi-axis, so it never overstates the room.)
 */
export function pictureDistance(x: number, y: number, aspect: number) {
  const [rx, ry] = swimRadii(aspect);
  return (1 - swimEdge(x, y, aspect)) * Math.min(rx, ry);
}

// ---- The drawn picture -----------------------------------------------------------

const svg = (aspect: number, body: string) =>
  `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${(aspect * 1000).toFixed(0)} 1000' preserveAspectRatio='none'>${body}</svg>`;
const cssUrl = (markup: string) => `url("data:image/svg+xml,${encodeURIComponent(markup)}")`;

/** The drawn picture's corner radius, in world units (board r2: a near-rectangle). */
const PICTURE_CORNER = 0.03;

/**
 * Where a point sits against the drawn picture, the whole canvas with
 * rounded corners: 0 at the middle of its shorter side, below 1 inside, 1 on
 * the edge, above 1 outside. Taps beyond 1 are on the page, not the pond.
 */
export function pictureEdge(x: number, y: number, aspect: number) {
  const hx = aspect / 2;
  const hy = 0.5;
  // Signed distance to a rounded rectangle (negative inside).
  const qx = Math.abs(x - hx) - (hx - PICTURE_CORNER);
  const qy = Math.abs(y - hy) - (hy - PICTURE_CORNER);
  const outside = Math.hypot(Math.max(qx, 0), Math.max(qy, 0));
  const sd = outside + Math.min(Math.max(qx, qy), 0) - PICTURE_CORNER;
  return 1 + sd / Math.min(hx, hy);
}
/** How far inside the picture's edge the keyboard-focus ring runs, in world units. */
const RING_INSET = 0.014;

/** A rounded rectangle inset by `inset` world units, in the 1000-high viewBox. */
const roundedRect = (aspect: number, inset: number, extra: string) => {
  const k = 1000;
  const r = Math.max(0, PICTURE_CORNER - inset) * k;
  return (
    `<rect x='${(inset * k).toFixed(1)}' y='${(inset * k).toFixed(1)}' width='${((aspect - inset * 2) * k).toFixed(1)}' ` +
    `height='${((1 - inset * 2) * k).toFixed(1)}' rx='${r.toFixed(1)}' ry='${r.toFixed(1)}' ${extra}/>`
  );
};

/**
 * The picture's drawn edge, as a CSS mask image: the whole canvas with
 * softly rounded corners, as on board r2 (the water runs out of the picture
 * on every side; no porthole). Sized in world units, so it fits any aspect.
 * Taps follow the same shape (pictureEdge).
 */
export function bankMaskUrl(aspect: number) {
  return cssUrl(svg(aspect, roundedRect(aspect, 0, `fill='black'`)));
}

/**
 * A keyboard-focus ring just inside the picture's edge, as a CSS mask
 * image: a line `width` CSS pixels wide following the rounded rectangle.
 */
export function pictureRingUrl(aspect: number, width: number) {
  return cssUrl(
    svg(
      aspect,
      roundedRect(
        aspect,
        RING_INSET,
        `fill='none' stroke='black' stroke-width='${width}' vector-effect='non-scaling-stroke'`,
      ),
    ),
  );
}
