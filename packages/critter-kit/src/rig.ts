// Limb chains (spec B-1, B-3). A limb is a short chain of segments rooted at
// a hip or shoulder; one extension value t (0 folded … 1 extended) bends
// every joint together, from its folded angle toward its extended one, and a
// yaw turns the whole chain about its root. Coordinates are animal-local, in
// body lengths: x toward the head, y to the animal's left. Angles are given
// for the left side (side = 1); the right side (side = −1) mirrors them.

/** One limb's shape: its root, its segment lengths, and each joint's angle at the two key poses. */
export interface LimbSpec {
  /** Hip or shoulder of the left limb, body lengths. */
  readonly root: readonly [number, number];
  readonly lengths: readonly number[];
  /** Joint angles (radians, left side) at t = 0 and t = 1, one per segment. */
  readonly folded: readonly number[];
  readonly extended: readonly number[];
}

const scratch: [number, number] = [0, 0];

/**
 * The end of a limb chain (ankle or wrist) for extension `t` and `yaw` about
 * its root, with the body shifted back by `lean`. Written into `out` (a
 * shared scratch pair unless given), which is returned.
 */
export function limbEnd(
  spec: LimbSpec,
  side: number,
  t: number,
  yaw: number,
  lean: number,
  out: [number, number] = scratch,
) {
  const { lengths, folded, extended } = spec;
  let x = spec.root[0] - lean;
  let y = spec.root[1] * side;
  for (let j = 0; j < lengths.length; j++) {
    const a = folded[j] + (extended[j] - folded[j]) * t;
    x += Math.cos(a * side + yaw) * lengths[j];
    y += Math.sin(a * side + yaw) * lengths[j];
  }
  out[0] = x;
  out[1] = y;
  return out;
}

/** How far a limb chain reaches from its root at extension `t`. */
export function limbReach(spec: LimbSpec, side: number, t: number, lean: number) {
  const end = limbEnd(spec, side, t, 0, lean);
  return Math.hypot(end[0] - (spec.root[0] - lean), end[1] - spec.root[1] * side);
}

/**
 * Writes a limb's segments as capsules (x0, y0, x1, y1 per segment) into
 * `out` from index `offset`; returns the index after the last one written.
 */
export function poseChain(
  spec: LimbSpec,
  side: number,
  t: number,
  yaw: number,
  lean: number,
  out: { [index: number]: number },
  offset: number,
) {
  const { lengths, folded, extended } = spec;
  let x = spec.root[0] - lean;
  let y = spec.root[1] * side;
  let o = offset;
  for (let j = 0; j < lengths.length; j++) {
    const a = folded[j] + (extended[j] - folded[j]) * t;
    const nx = x + Math.cos(a * side + yaw) * lengths[j];
    const ny = y + Math.sin(a * side + yaw) * lengths[j];
    out[o] = x;
    out[o + 1] = y;
    out[o + 2] = nx;
    out[o + 3] = ny;
    o += 4;
    x = nx;
    y = ny;
  }
  return o;
}
