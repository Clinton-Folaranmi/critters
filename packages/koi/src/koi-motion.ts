// The koi's motion sheet (spec P-11): every number the world moves by, in
// body lengths (BL, snout to tail tip) and seconds, with where it comes from.
//
//   measured  docs/KOI_FOOTAGE_LOG.md: The Nature Box, "Koi carp in a park"
//             (CC BY 4.0), one frame measured by eye (±15 %)
//   literature  docs/CRITTER_PRIOR_WORK.md and the sources it cites
//   inferred  reasoned from the above; the log's Inference lines
//   guess     a design value with no source yet; replace when one is found
//
// Coordinates are world units (the picture is 1 high), y up.

import type { SwimShape } from 'critter-kit';

/**
 * The outline from above, half-widths in BL against u (0 snout, 1 tail tip).
 * measured (27.9 s, one frame): widest about 0.20 BL a third of the way back;
 * caudal peduncle about 0.06 BL; tail fin about the last fifth.
 */
export const OUTLINE = {
  /** Where the body ends and the tail fin begins. */
  peduncle: 0.8,
  /** [u, half-width] pairs, interpolated smoothly; the snout is rounded over its first 0.07. */
  halfWidth: [
    [0, 0],
    [0.035, 0.05],
    [0.08, 0.072],
    [0.18, 0.096],
    [0.3, 0.101],
    [0.42, 0.094],
    [0.55, 0.074],
    [0.68, 0.047],
    [0.8, 0.031],
    [0.86, 0.034],
  ] as const,
  /** Tail fin: its half-span at the tip (measured ≈ 0.09) and its fork's depth (guess). */
  tailSpan: 0.095,
  tailFork: 0.07,
  /** Pectoral fins: root at u, length, width (measured ≈ 0.09 long on that frame; width a guess). */
  pectoral: { at: 0.2, length: 0.13, width: 0.06 },
  /** Pelvic fins (guess: smaller, about halfway back). */
  pelvic: { at: 0.47, length: 0.075, width: 0.038 },
} as const;

/**
 * The body wave. literature: carangiform fish keep the front fifth nearly
 * still and swing the tail about 0.10 BL each side, with a wavelength near
 * 1.05 BL (CRITTER_PRIOR_WORK, Videler's envelope). The bend limit is a guess
 * that only stops a C-start folding the body over itself.
 */
export const WAVE: SwimShape = {
  wavelength: 1.05,
  tailAmplitude: 0.1,
  envelope: [0.22, -0.55, 1.33],
  maxBend: 0.55,
};

/**
 * Distance per tail beat, BL. literature: Bainbridge's U = L(0.75f − 1) gives
 * about 0.75 BL per beat. tracked (grade B): the filmed koi's bend against its
 * turn rate implies about 1 BL/s at 1.1 beats/s, which this stride gives.
 */
export const STRIDE = 0.75;

/** Swimming speeds, BL/s. guess: an unhurried pond koi; the footage is too handheld to time. */
export const SPEED = {
  cruise: 0.42,
  /** Swimming to food it has seen. */
  approach: 0.75,
  /** The dash when spooked (guess; well below a carp's maximum). */
  burst: 1.9,
  /** How fast speed follows the tail while beating, 1/s (guess). */
  gain: 2.2,
  /** Glide: speed decays as e^(−t/τ) with the tail still (guess). */
  glideTau: 1.7,
} as const;

/**
 * Tail beats per second. tracked (grade B, docs/KOI_FOOTAGE_LOG.md): about
 * 1.1 Hz while cruising (interquartile 0.9–1.3), from 26 s of the clip; the
 * tracking noise is close to the beat's size, so treat it as a range.
 */
export const FREQUENCY = { cruise: 1.1, min: 0.8, max: 5.5 } as const;

/**
 * Beat and glide. tracked (grade B): the filmed koi beat about 77 % of the
 * time, with short coasts between bouts (angle-independent: it's timing).
 * Bout and coast lengths are guesses set to give that share.
 */
export const BEAT_GLIDE = {
  beats: [3, 7],
  glide: [0.6, 1.6],
  /** Share of a full tail beat when cruising (guess: slow swimming is shallower). */
  cruiseBeat: 1,
} as const;

/**
 * Turning. tracked (grade B): the filmed koi's body bend (median 0.26 rad,
 * 90th percentile 0.59) means turns of about 1–2 BL radius, rarely tighter
 * than 0.8. It steers gradually: turn rate = gain × how far off course, up to
 * the limit (gain a guess). (The tracked "turn rate" itself is mostly the head
 * wagging with each beat, so it isn't used.)
 */
export const TURN = { maxRate: 1.4, minRadius: 0.8, gain: 0.9 } as const;

/**
 * Meandering: a slow, seeded wobble on the heading, so a cruising koi weaves
 * rather than drawing straight lines (tracked: it never held a heading for
 * long). Amplitude, radians, and periods, s (guesses).
 */
export const MEANDER = { amplitude: 0.3, periods: [3.1, 5.2] } as const;

/**
 * Straightening. tracked (grade B): the filmed koi's body was rarely bent
 * more than 0.6 rad (90th percentile) and didn't hold a curve once slow. Below
 * `below` BL/s the body eases straight at `rate` per second (guess).
 */
export const RELAX = { rate: 1.6, below: 0.45 } as const;

/**
 * Banking and lifting the head (drawn only). observed: the filmed koi roll
 * into turns, showing a flank, and lift the head to take food at the surface.
 * Roll = gain × turn rate × speed (BL/s), capped; pitch when feeding. Guesses.
 */
export const POSE = { rollGain: 0.5, rollMax: 0.45, feedPitch: 0.5, depth: 1.25 } as const;

/**
 * Spooked, when touched: it swishes away. inferred: a lab C-start (stage 1 of
 * 11–18 ms in a sunfish, Jayne and Lauder 1993) snaps the whole body round
 * faster than one frame; drawn that way it reads as a jump, and pond koi used
 * to people rarely do it. So the koi turns hard along a curve with fast, full
 * tail beats instead. All values are guesses.
 */
export const STARTLE = {
  /** Heading change, radians. */
  turn: [1.0, 2.0],
  /** Fastest turn, rad/s, and the tightest radius at speed, BL. */
  turnRate: 5,
  radius: 0.3,
  /** Tail beats per second while dashing. */
  frequency: 3.2,
  /** How fast it gets up to speed, 1/s. */
  gain: 7,
  /** Seconds of dashing before it coasts. */
  burst: 0.7,
  /** After a dash, taps on the fish only make it flinch for this long (spec H-3). */
  cooldown: 2.2,
} as const;

/**
 * Feeding. observed (3.5 s): a koi taking food at the surface sets off rings
 * around its head. Timings are guesses.
 */
export const FEED = {
  /** Seconds between a pellet landing and the koi turning to it. */
  notice: [0.35, 0.9],
  /** The mouth takes a pellet within this distance, BL. */
  reach: 0.06,
  /** It slows to a stop over this distance, BL. */
  slowWithin: 0.9,
  /** A pause after each mouthful, s (pectorals flared, tail still). */
  gulp: [0.35, 0.6],
  /** At most this many pellets float at once. */
  pellets: 9,
} as const;

/** Wandering: hover now and then (guess), and pick a new spot within the clear water this often (guess). */
export const WANDER = {
  hoverChance: 0.12,
  hover: [1.6, 3.6],
  /** Pectoral sculling while hovering, Hz (guess). */
  scull: 1.4,
} as const;

/** Pectoral fins: angle from the body, radians; folded at speed, spread to brake and hover (guess). */
export const PECTORAL = { folded: 0.35, spread: 1.15, stiffness: 140, damping: 16 } as const;
