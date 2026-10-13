// Footfall timing for legged animals (spec section 7.1; Hildebrand's gait
// diagrams). Every leg runs the same cycle, offset by its own touch-down
// phase, and spends `duty` of the cycle planted. The cycle advances with the
// distance the body travels, one cycle per stride length, so a walk can
// speed up, slow down or stop without a planted foot sliding (L-5): stride
// length and duty factor are read from a table against speed, measured from
// footage. Legs are named L/R for side and 1, 2, 3 … front to back (a
// quadruped's forelegs are L1/R1, its hind legs L2/R2).
//
// The state is a plain object updated in place, so a frame allocates nothing.

/** Stride length and duty factor against speed, all in body lengths (BL) and BL/s; read by linear interpolation, clamped at both ends. */
export interface GaitTable {
  readonly speed: readonly number[];
  readonly strideLength: readonly number[];
  readonly duty: readonly number[];
}

export interface GaitSpec {
  /** Touch-down phase of each leg within the cycle, 0 … 1. */
  readonly offsets: Readonly<Record<string, number>>;
  readonly table: GaitTable;
}

export interface GaitState {
  /** Cycle position, 0 … 1 (wraps). */
  phase: number;
  /** Current speed, BL/s, as last given to advanceGait(). */
  speed: number;
}

export const createGaitState = (phase = 0): GaitState => ({ phase, speed: 0 });

/** Linear interpolation through (xs, ys), clamped to the end values; xs ascending. */
export function interpolate(xs: readonly number[], ys: readonly number[], x: number) {
  if (x <= xs[0]) return ys[0];
  const last = xs.length - 1;
  if (x >= xs[last]) return ys[last];
  let k = 1;
  while (xs[k] < x) k++;
  const t = (x - xs[k - 1]) / (xs[k] - xs[k - 1]);
  return ys[k - 1] + (ys[k] - ys[k - 1]) * t;
}

export const strideLengthAt = (spec: GaitSpec, speed: number) =>
  interpolate(spec.table.speed, spec.table.strideLength, speed);
export const dutyAt = (spec: GaitSpec, speed: number) => interpolate(spec.table.speed, spec.table.duty, speed);

/**
 * Moves the cycle on by `distance` body lengths travelled at `speed` BL/s.
 * At a standstill (distance 0) the cycle holds: feet stay where they are.
 */
export function advanceGait(state: GaitState, spec: GaitSpec, distance: number, speed: number) {
  state.speed = speed;
  state.phase = (state.phase + distance / strideLengthAt(spec, speed)) % 1;
  if (state.phase < 0) state.phase += 1;
}

/** Where a leg is in its own cycle, 0 … 1: 0 is touch-down, `duty` is lift-off. */
export function legPhase(state: GaitState, spec: GaitSpec, leg: string) {
  const p = (state.phase - spec.offsets[leg]) % 1;
  return p < 0 ? p + 1 : p;
}

/** Whether a leg's foot is planted now. */
export const isStance = (state: GaitState, spec: GaitSpec, leg: string) =>
  legPhase(state, spec, leg) < dutyAt(spec, state.speed);

/**
 * How far through its swing a leg is, 0 … 1 (lift-off to touch-down), or −1
 * while it is planted. contact.ts carries the foot along stepArc() by this.
 */
export function swingProgress(state: GaitState, spec: GaitSpec, leg: string) {
  const duty = dutyAt(spec, state.speed);
  const p = legPhase(state, spec, leg);
  return p < duty ? -1 : (p - duty) / (1 - duty);
}

/**
 * The alternating tripod of insects (spec 7.1): L1, R2 and L3 together, half
 * a cycle from R1, L2 and R3.
 */
export const TRIPOD_OFFSETS: Readonly<Record<string, number>> = { L1: 0, R2: 0, L3: 0, R1: 0.5, L2: 0.5, R3: 0.5 };

/**
 * A wave gait with `pairs` legs a side (millipedes, slow insects, spiders):
 * steps run from back to front along each side, the two sides half a cycle
 * apart. With n pairs, each leg lands 1/(2n) of the cycle after the one
 * behind it.
 */
export function waveOffsets(pairs: number) {
  const offsets: Record<string, number> = {};
  for (let k = 1; k <= pairs; k++) {
    offsets['L' + k] = (pairs - k) / (2 * pairs);
    offsets['R' + k] = 0.5 + (pairs - k) / (2 * pairs);
  }
  return offsets;
}

/**
 * A symmetrical four-legged gait in Hildebrand's terms: each forefoot lands
 * `phase` of the cycle after the hind foot on its side, the two sides half a
 * cycle apart. phase ≈ 0.25 is a mammal's lateral-sequence walk, ≈ 0.4–0.5 a
 * lizard's or salamander's slow walk, 0.5 a trot. L1/R1 are the forelegs,
 * L2/R2 the hind legs.
 */
export function quadrupedOffsets(phase: number) {
  return { L2: 0, L1: phase % 1, R2: 0.5, R1: (0.5 + phase) % 1 };
}
