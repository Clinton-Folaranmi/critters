/** Mutable state for a passive, damped point following a driven target. */
export interface SecondaryPoint {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/**
 * Advances an undriven point toward a target with a spring and drag. This is
 * for secondary motion (such as a fin tip or antenna); the result must not
 * feed back into the main body or its locomotion. Mutates state, no allocation.
 * `stiffness` is in 1/s² and `damping` in 1/s.
 */
export function stepSecondary(
  state: SecondaryPoint,
  targetX: number,
  targetY: number,
  dt: number,
  stiffness: number,
  damping: number,
) {
  const step = Math.max(0, Math.min(dt, 1 / 30));
  state.vx += ((targetX - state.x) * stiffness - state.vx * damping) * step;
  state.vy += ((targetY - state.y) * stiffness - state.vy * damping) * step;
  state.x += state.vx * step;
  state.y += state.vy * step;
}
