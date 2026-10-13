// Distances to the shapes an animal is drawn with, so taps are tested against
// what is drawn (spec B-2, I-2): blended body ellipses, limb capsules, and
// discs for toe fans or fins. All in the animal's own units; negative inside.

/** Approximate signed distance to an axis-aligned ellipse of radii (rx, ry) centred at the origin. */
export const ellipseDistance = (px: number, py: number, rx: number, ry: number) =>
  (Math.hypot(px / rx, py / ry) - 1) * Math.min(rx, ry);

/** Signed distance from (qx, qy) to a capsule from (ax, ay) to (bx, by) of the given radius. */
export function capsuleDistance(
  qx: number,
  qy: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
  radius: number,
) {
  const abx = bx - ax;
  const aby = by - ay;
  const h = Math.max(0, Math.min(1, ((qx - ax) * abx + (qy - ay) * aby) / (abx * abx + aby * aby)));
  return Math.hypot(qx - ax - abx * h, qy - ay - aby * h) - radius;
}
