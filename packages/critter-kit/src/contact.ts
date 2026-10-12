// Contact and planting (spec C-1 to C-7). A foot touching a surface is pinned
// to a point in that surface's own frame, so a floating pad or a swaying
// branch carries it; every frame the leg is re-aimed at its pin and its reach
// solved. A foot moves only by stepping. A static ground is a surface at the
// origin with angle 0.

import { angleDelta } from './motion';
import { limbEnd, limbReach, type LimbSpec } from './rig';

/** A frame things can stand on: its origin in world units and its rotation. */
export interface Surface {
  x: number;
  y: number;
  angle: number;
}

/** A world point in a surface's frame. Written into `out`, which is returned. */
export function toSurface(surface: Surface, wx: number, wy: number, out: [number, number] = [0, 0]) {
  const dx = wx - surface.x;
  const dy = wy - surface.y;
  const c = Math.cos(-surface.angle);
  const s = Math.sin(-surface.angle);
  out[0] = dx * c - dy * s;
  out[1] = dx * s + dy * c;
  return out;
}

/** A point in a surface's frame, in world units. Written into `out`, which is returned. */
export function fromSurface(surface: Surface, lx: number, ly: number, out: [number, number] = [0, 0]) {
  const c = Math.cos(surface.angle);
  const s = Math.sin(surface.angle);
  out[0] = surface.x + lx * c - ly * s;
  out[1] = surface.y + lx * s + ly * c;
  return out;
}

const solved: [number, number] = [0, 0];

/**
 * Re-aims a planted limb at its pin. `tx, ty` is the pin in the animal's own
 * frame (body lengths); the extension that reaches it is found by bisection
 * over `lo … hi` (keep `hi` below full stretch, so a planted leg stays
 * compact and the foot gives a little rather than the leg being hauled
 * straight, C-5). Returns [extension, yaw correction] in a shared pair: blend
 * them in by the pin's weight, and clamp the yaw.
 */
export function solvePin(
  spec: LimbSpec,
  side: number,
  lean: number,
  yaw: number,
  tx: number,
  ty: number,
  lo: number,
  hi: number,
) {
  const rootX = spec.root[0] - lean;
  const rootY = spec.root[1] * side;
  const want = Math.hypot(tx - rootX, ty - rootY);
  const rising = limbReach(spec, side, hi, lean) >= limbReach(spec, side, lo, lean);
  for (let i = 0; i < 12; i++) {
    const mid = (lo + hi) / 2;
    if (limbReach(spec, side, mid, lean) < want === rising) lo = mid;
    else hi = mid;
  }
  const t = (lo + hi) / 2;
  const end = limbEnd(spec, side, t, yaw, lean);
  solved[0] = t;
  solved[1] = angleDelta(Math.atan2(ty - rootY, tx - rootX), Math.atan2(end[1] - rootY, end[0] - rootX));
  return solved;
}

/**
 * Where a stepping foot is at progress `w` (0 … 1) from `from` to `to`, all
 * in one surface's frame. Seen from above, a lifted foot draws in toward the
 * body (`cx, cy`) by `pull` rather than sliding straight across (C-3). Written
 * into `out`, which is returned.
 */
export function stepArc(
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  w: number,
  cx: number,
  cy: number,
  pull: number,
  out: [number, number] = [0, 0],
) {
  const x = fromX + (toX - fromX) * w;
  const y = fromY + (toY - fromY) * w;
  const inward = Math.hypot(cx - x, cy - y) || 1;
  out[0] = x + ((cx - x) / inward) * pull;
  out[1] = y + ((cy - y) / inward) * pull;
  return out;
}
