// Easing and angles for poses and headings, in the forms the creature
// worlds step with (spec B-4).

import { smoothstep } from './math';

/** The signed difference `to − from`, wrapped into (−π, π]. */
export const angleDelta = (to: number, from: number) => Math.atan2(Math.sin(to - from), Math.cos(to - from));

/**
 * Eases `value` toward `target` at `rate` per second: v += (target − v) · (1 − e^(−rate·dt)).
 * Frame-rate independent: two half steps move as far as one whole step.
 */
export const approach = (value: number, target: number, rate: number, dt: number) =>
  value + (target - value) * (1 - Math.exp(-rate * dt));

/** smoothstep over 0 … 1. */
export const smooth = (t: number) => smoothstep(0, 1, t);

/** Linear interpolation from `a` to `b`. */
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;
