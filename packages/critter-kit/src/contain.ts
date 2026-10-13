// Keeping animals and scenery where the picture says they can be (spec E-1
// to E-3). A boundary is any distance function of (x, y) plus one argument
// (a margin, an aspect), so callers pass a function they made once and
// nothing is allocated per frame.

/** A region test: below or at 1 inside, above 1 outside. */
export type RegionDistance = (x: number, y: number, arg: number) => number;
/** A signed distance: positive inside, negative outside. */
export type SignedDistance = (x: number, y: number, arg: number) => number;

/**
 * Pulls a point back inside a region, toward (cx, cy), by bisection along the
 * line between them (14 halvings: under 1e-4 of the distance).
 */
export function contain(
  point: { x: number; y: number },
  cx: number,
  cy: number,
  region: RegionDistance,
  arg: number,
  iterations = 14,
) {
  if (region(point.x, point.y, arg) <= 1) return;
  let inside = 0;
  let outside = 1;
  for (let i = 0; i < iterations; i++) {
    const t = (inside + outside) / 2;
    const d = region(cx + (point.x - cx) * t, cy + (point.y - cy) * t, arg);
    if (d <= 1) inside = t;
    else outside = t;
  }
  point.x = cx + (point.x - cx) * inside;
  point.y = cy + (point.y - cy) * inside;
}

const gradientScratch: [number, number] = [0, 0];

/** The unit gradient of a signed distance at (x, y), by central differences of step e (a shared pair). */
export function gradient(distance: SignedDistance, arg: number, x: number, y: number, e = 0.002) {
  const gx = distance(x + e, y, arg) - distance(x - e, y, arg);
  const gy = distance(x, y + e, arg) - distance(x, y - e, arg);
  const g = Math.hypot(gx, gy) || 1;
  gradientScratch[0] = gx / g;
  gradientScratch[1] = gy / g;
  return gradientScratch;
}

/**
 * Pushes a disc of `radius` back off a boundary until `clearance` remains
 * between its rim and the boundary, and removes any velocity into it.
 */
export function pushOff(
  body: { x: number; y: number; vx: number; vy: number },
  radius: number,
  clearance: number,
  distance: SignedDistance,
  arg: number,
) {
  const clear = distance(body.x, body.y, arg) - radius - clearance;
  if (clear >= 0) return;
  const [gx, gy] = gradient(distance, arg, body.x, body.y);
  body.x -= gx * clear;
  body.y -= gy * clear;
  const into = body.vx * gx + body.vy * gy;
  if (into < 0) {
    body.vx -= gx * into;
    body.vy -= gy * into;
  }
}

/**
 * Moves two bodies apart along the line between them when closer than
 * `min`, each by half the overlap but at most `maxStep`. Returns whether they
 * moved (the caller re-contains them).
 */
export function separate(a: { x: number; y: number }, b: { x: number; y: number }, min: number, maxStep: number) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy);
  if (d >= min) return false;
  const nx = d > 1e-5 ? dx / d : 1;
  const ny = d > 1e-5 ? dy / d : 0;
  const overlap = Math.min((min - d) / 2, maxStep);
  a.x -= nx * overlap;
  a.y -= ny * overlap;
  b.x += nx * overlap;
  b.y += ny * overlap;
  return true;
}
