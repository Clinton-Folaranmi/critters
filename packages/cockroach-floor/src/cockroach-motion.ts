// The cockroach's motion sheet (spec P-11, L-30): every number the world
// moves by, in body lengths (BL) and seconds, with where it comes from.
//
//   measured  docs/COCKROACH_FOOTAGE_LOG.md: Weihmann, Brun and Pycroft 2017,
//             Additional file 3, Nauphoeta cinerea at 250 fps, measured frame
//             by frame (stances in docs/footage/weihmann2017-file3.stances.json;
//             one body length = 195 px there = 27 mm)
//   inferred  reasoned from the measurements in that log (its Inference lines)
//   guess     a design value with no source yet; replace when one is found
//
// Coordinates are the animal's own: x toward the head, y to the animal's
// left. The legs are L/R 1–3, front to back. The clip can't tell the animal's
// left from its right (spec: a mirrored top view would swap them); the gait
// is the same either way.

import type { GaitSpec, LimbSpec } from '@critters/critter-kit';

/** Body outline, BL. measured: 195 × 77 px on frame 60; pronotum ≈ 0.23 of the length. */
export const BODY = {
  length: 1,
  width: 0.4,
  /** The pronotum (head shield) covers the front 0.23. */
  pronotum: 0.23,
  /** guess: the wing pads (short tegmina) reach from the pronotum to 0.55 of the length. */
  tegmina: 0.55,
  /** guess: visible abdominal segments behind the tegmina. */
  segments: 6,
} as const;

/**
 * The gait (measured, all six legs). Touch-down phases in the upper middle
 * leg's stride, from the slower stretch: the alternating tripod, as the
 * authors also report for this clip (front in hind's stride 0.95 measured
 * against their 0.9). Stride length and duty factor against speed from the
 * two stretches of the clip. Duty here is "still on the floor as seen from
 * above", the right number for a top-down picture (measured; true contact is
 * shorter, the authors' 0.52 and 0.45).
 */
export const GAIT: GaitSpec = {
  offsets: { R2: 0, R1: 0.52, R3: 0.58, L1: 0.04, L2: 0.48, L3: 0.02 },
  table: {
    speed: [4.19, 5.76],
    strideLength: [0.434, 0.486],
    duty: [0.65, 0.48],
  },
};

/** Speeds, BL/s. measured: the two stretches of the clip (0.112 and 0.160 m/s). */
export const SPEED = {
  walk: 4.19,
  /** The faster stretch; a real escape runs faster still (Additional file 2: about 7.4 BL/s, the tripod loosening). */
  run: 5.76,
  /** guess: how quickly speed changes, per second (an exponential approach rate). */
  accelerate: 6,
} as const;

/**
 * Where each foot lands at touch-down, relative to the body centre (BL).
 * measured: the footfalls' positions at touch-down (front about 0.43 ahead
 * and 0.21 out, middle 0.20 ahead and 0.28 out, hind 0.26 behind and 0.26
 * out). Swinging feet aim here, shifted forward by how far the body will
 * travel before the foot lands (inferred: the stance then centres on it).
 * These are the centres of the pixels that stay still, i.e. of the planted
 * tarsus; the leg chain ends at the tarsus tip, TIP_OUT further out.
 */
export const FOOTHOLD: Readonly<Record<'1' | '2' | '3', readonly [number, number]>> = {
  '1': [0.43, 0.21],
  '2': [0.2, 0.28],
  '3': [-0.26, 0.26],
};

/**
 * How much further out than the measured foothold the tarsus tip lands (BL).
 * measured on frame 58 against a 10 px grid: the tips stand 0.28 (front),
 * 0.31 to 0.40 (middle) and 0.28 (hind) out from the midline, 0.05 or so
 * beyond the footholds above.
 */
export const TIP_OUT = 0.05;

/**
 * Follow the leader (measured six times; inferred as a rule): a middle foot
 * lands where the front foot on its side just left, under 1 mm behind along
 * the path (0.02 BL) and about 2.6 mm further out (0.1 BL). guess: it does
 * so only when that footprint is within `within` BL of where the middle
 * foot would land anyway; a footprint left behind by a pivot or a stop isn't
 * followed.
 */
export const FOLLOW = { behind: 0.02, out: 0.1, within: 0.15 } as const;

/**
 * Leg geometry, BL, left side. measured: how far each leg reaches beyond the
 * body's edge when stretched (front 33, middle 45, hind 75 px of a 195 px
 * body: 0.17, 0.23, 0.38 BL; the front and hind legs here reach 0.17 and
 * 0.39, the middle 0.32, which it never stretches to while walking); and,
 * from the footage frames, that every knee points away from the body: back
 * and out on the front and middle legs, forward and out on the hind leg,
 * whose zigzag therefore bends the other way (`bend` −1). guess: the split
 * into femur, tibia and tarsus (0.4 : 0.4 : 0.2), where the legs attach, and
 * the joint angles of the folded and extended poses. The extension value
 * folds the leg into a zigzag and straightens it.
 *
 * `angle` sets only the resting direction the leg's yaw is measured from
 * (REFLEX.aim): solvePin draws the same pose whatever it is. Each is chosen
 * so the yaw a stance needs, from 0.12 BL ahead of the foothold to 0.4 BL
 * behind it, is centred on zero (front −1.35 … 1.44, middle −1.05 … 1.10,
 * hind −0.65 … 0.66 rad).
 */
const leg = (root: readonly [number, number], length: number, angle: number, bend = 1): LimbSpec => ({
  root,
  lengths: [length * 0.4, length * 0.4, length * 0.2],
  folded: [angle + 0.9 * bend, angle - 1.3 * bend, angle - 0.7 * bend],
  extended: [angle + 0.12 * bend, angle - 0.05 * bend, angle - 0.15 * bend],
});
export const LEGS: Readonly<Record<'1' | '2' | '3', LimbSpec>> = {
  '1': leg([0.2, 0.13], 0.4, 1.7),
  '2': leg([0.08, 0.15], 0.42, 1.85),
  '3': leg([-0.08, 0.15], 0.56, 2.3, -1),
};
/** Planted legs search their extension in this range when solving a pin; below 0 folds tighter than the folded pose. */
export const REACH: readonly [number, number] = [-0.5, 0.98];

/**
 * The reflex step (spec C-5; guess for the numbers): a planted foot its leg
 * can no longer reach within `miss` BL (the body has carried it too far, or
 * under itself) steps back to its foothold at once, in `time` seconds, rather
 * than the leg being hauled straight. Legs aim at most `aim` radians off
 * their resting direction.
 */
export const REFLEX = { miss: 0.03, time: 0.08, aim: 2 } as const;

/** Antennae, BL. guess: about 0.9 BL long (frames show them at or past the body length), sweeping. */
export const ANTENNA = {
  length: 0.9,
  segments: 8,
  /** guess: resting sweep, radians either side, and its period in seconds (sign of life, B-8). */
  sweep: 0.35,
  sweepPeriod: 2.6,
} as const;

/**
 * A small side-to-side yaw of the body once per stride (inferred from the
 * authors' result that the centre of mass oscillates sideways once per
 * stride; amplitude a guess), radians.
 */
export const STRIDE_YAW = 0.035;

/**
 * Behaviour timings, seconds. All guesses for now: feeding at a crumb,
 * resting, and searching after a long rest without food (a motive, P-2).
 */
export const BEHAVIOUR = {
  feed: [3, 6],
  rest: [4, 9],
  /** Guess: after this long without food, it searches (walks to a point it hasn't been). */
  searchAfter: [6, 10],
  /** A tap on the animal: it runs away this long, then slows (H-3: committed, then a cooldown). */
  flee: [0.9, 1.6],
  tapCooldown: 0.35,
} as const;

/**
 * Turning (spec L-6, C-4, P-4; guess for the numbers). The heading follows a
 * turn rate whose change is limited to `accel` rad/s² (no spins, Q-21), and
 * which slows as the heading nears the target, so a turn starts, runs and
 * stops over a few frames. While walking or running the heading changes only
 * with the distance actually travelled, at most `curvature` radians per BL.
 * A turn on the spot pivots at up to `pivotRate` rad/s, stepping all the
 * while (the gait clock advances `stepPerRadian` BL per radian turned), until
 * the heading is within `aligned` of the target; it starts when the target
 * is more than `straightAhead` off and the animal is slow, or when it walks
 * into the edge of the floor. An escape turns first and then runs, at up to
 * `escapeRate` (real escape turns are faster still and over within tens of
 * milliseconds; not yet sourced, and slowed here so the turn reads).
 */
export const TURN = {
  curvature: 3.2,
  pivotRate: 1.6,
  escapeRate: 9,
  accel: 300,
  straightAhead: 0.6,
  aligned: 0.05,
  stepPerRadian: 0.9,
} as const;
