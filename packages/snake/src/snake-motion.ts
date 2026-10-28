// The grass snake's motion sheet (spec P-11, L-26, L-27): every number the
// world moves by, in body lengths (BL, snout to tail tip; 1 BL = 34 anterior
// body widths BW) and seconds, with its provenance:
//
//   tracked     docs/SNAKE_FOOTAGE_LOG.md: Forza1000, 20260520_180515-grass-snake.webm
//               (CC BY-SA 4.0), tracked with qa/tools/footage/snake-spine.mjs and
//               measured with qa/tools/footage/snake-measure.mjs (Grade B)
//   measured    direct frame/pixel measurement from the same clip
//   literature  Jayne (1986) Copeia 1986(4):915–927; Hailey & Davies (1986)
//   inferred    reasoned from the tracked clip + literature
//   guess       a design value with no clip measurement yet
//
// Coordinates are world units (the picture is 1 high), y up.

/**
 * Conversion between anterior body widths (BW, directly measured in the clip)
 * and total body length (BL, snout to tail tip). literature: European Natrix
 * natrix total length is 32–36× mid-anterior width (Hailey & Davies 1986).
 */
export const BL_IN_BW = 34;

/**
 * The outline from above, half-widths in BL against u (0 snout, 1 tail tip).
 * measured (docs/SNAKE_FOOTAGE_LOG.md): oval-triangular head (length ≈ 1.42 BW =
 * 0.042 BL, width ≈ 1.12 BW = 0.033 BL), slight neck constriction at the collar
 * (width ≈ 0.86 BW = 0.025 BL), anterior trunk width 1.0 BW = 0.0294 BL.
 * literature: midbody widens slightly (~1.06 BW), vent at u ≈ 0.79, tail tapers
 * over the posterior 21 % of total length.
 */
export const OUTLINE = {
  /** Where the head plates end and the yellow collar begins, in BL. measured. */
  headEnd: 0.04,
  /** [u, half-width in BL] pairs, interpolated smoothly; snout rounded over u < 0.013. */
  halfWidth: [
    [0, 0],
    [0.013, 0.0132],
    [0.026, 0.0192],
    [0.04, 0.017],
    [0.055, 0.0148],
    [0.12, 0.0168],
    [0.38, 0.0182],
    [0.64, 0.0158],
    [0.79, 0.0116],
    [0.9, 0.0062],
    [0.97, 0.0026],
    [1, 0.001],
  ] as const,
  /** Yellow and black Natrix collar bands along u (BL). measured. */
  collar: {
    yellowStart: 0.037,
    yellowEnd: 0.055,
    blackStart: 0.053,
    blackEnd: 0.073,
  },
  /** Forked black tongue, in BL. measured: extends ~1.0–1.2 BW (0.038 BL) ahead of snout. */
  tongue: {
    length: 0.038,
    forkAt: 0.54,
    forkSpread: 0.012,
    width: 0.003,
  },
} as const;

/**
 * Terrestrial lateral undulation wave (spec L-26, L-27).
 * tracked (Grade B): on solid ground pushing against discrete anchor points
 * (plank edges in the clip; embedded meadow stones and grass stems in the
 * habitat), the body follows the head's path with near-zero lateral slip
 * (0.0004 BL/frame at 60 fps); anterior bend median is 0.281 rad at 4 BW
 * (0.118 BL) and 0.453 rad at 7.5 BW (0.221 BL).
 */
export const WEAVE = {
  /** Distance advanced along the path per full head-weave cycle, in BL. tracked. */
  wavelength: 0.48,
  /** Peak heading weave angle around the course direction, radians. tracked. */
  amplitude: 0.28,
  /** Secondary harmonic amplitude so S-loops vary naturally around stones and grass tufts. inferred. */
  secondary: 0.08,
} as const;

/**
 * Forward speeds along the head's winding path, in BL/s.
 * tracked (Grade B, 27–44 s active window): median advancing speed 3.21 BW/s =
 * 0.094 BL/s, 90th percentile 6.57 BW/s = 0.193 BL/s.
 * Round 1 ([0.075, 0.165] flat per bout) gave median 3.66 BW/s and p90 5.12 BW/s.
 * Round 3 pairs [0.058, 0.185] BL/s with a peaked within-bout surge envelope so
 * median advancing speed matches 3.2 BW/s (0.094 BL/s) while p90 reaches ~6.3 BW/s.
 */
export const SPEED = {
  /** Typical exploratory crawl speed range, BL/s. tracked (Round 3; Round 1: [0.075, 0.165]). */
  crawl: [0.058, 0.185] as const,
  /** Brisker crawl when drawn to a tap on the planks, BL/s. tracked p90. */
  investigate: 0.195,
  /** Fast escape slither when touched, BL/s. literature (Jayne 1986: 0.5–1.0 BL/s). */
  burst: 0.54,
  /** How quickly forward speed ramps up when a crawl bout starts, 1/s. tracked. */
  accelGain: 4.2,
  /** How quickly the snake halts on the planks when pausing (no aquatic glide), s. tracked. */
  stopTau: 0.11,
} as const;

/**
 * Intermittent crawl-and-pause rhythm.
 * tracked (Grade B): advancing 52.6 % of the time in the 27–44 s active window
 * (38.1 % across the full 45 s clip), in bouts of 1.8–4.5 s separated by 0.8–3.0 s pauses.
 * Round 1 ([1.9, 3.8] crawl, [1.4, 2.9] pause) gave shareMoving = 0.595.
 * Round 3 ([1.6, 3.1] crawl, [1.7, 3.3] pause) brings shareMoving to ~0.52.
 */
export const BOUT = {
  crawl: [1.6, 3.1] as const,
  pause: [1.7, 3.3] as const,
} as const;

/**
 * Course steering across the planks.
 * tracked (Grade B): head turn rate while moving median 0.687 rad/s, p90 3.453 rad/s
 * (combining the distance-driven head weave with course turns along plank edges).
 * Round 3 lowers slow meanderAmp (0.42 -> 0.16) so plank runs don't stack extra bend
 * onto the S-weave, and steers toward the open side of the deck before reaching the wall.
 */
export const TURN = {
  /** Maximum course-steering rate (excluding the head weave), rad/s. tracked (Round 3; Round 1: 1.35). */
  maxCourseRate: 1.85,
  /** Proportional course-steering gain. inferred (Round 3; Round 1: 1.2). */
  gain: 1.35,
  /** Slow course meander amplitude (radians) and periods (s). inferred (Round 3; Round 1: 0.42). */
  meanderAmp: 0.16,
  meanderPeriods: [4.8, 8.2] as const,
} as const;

/**
 * Forked tongue flicks and head probing during pauses and slow crawling.
 * measured (docs/SNAKE_FOOTAGE_LOG.md): tongue extends ~1.0 BW in 0.25–0.45 s bursts.
 */
export const TONGUE = {
  duration: [0.28, 0.42] as const,
  /** Oscillations of the forked tips per flick burst. literature. */
  oscillations: 2.5,
  /** Seconds between flicks while paused vs while crawling. measured. */
  pauseInterval: [0.55, 1.25] as const,
  crawlInterval: [1.3, 2.6] as const,
} as const;

/**
 * 3D head/neck lift and lateral head probing while paused (spec P-17).
 * observed: the snake raises its head and anterior neck off the planks when pausing
 * or crossing a plank gap, casting a wider offset shadow down-left, and pivots its
 * head slightly left/right without sliding its trunk.
 */
export const POSE = {
  /** Maximum head-neck probe angle while paused, radians. observed. */
  probeMax: 0.2,
  /** Rate at which head probe angle settles, 1/s. inferred. */
  probeGain: 3.5,
  /** Head/neck lift (0 planted, 1 raised ~0.5 BW off the planks) when paused vs crawling. observed. */
  liftPause: 0.65,
  liftCrawl: 0.22,
  liftInspect: 0.85,
} as const;

/**
 * Startle recoil when a visitor taps the snake (spec H-3).
 * inferred from Jayne (1986): rapid head turn away from the stimulus and brisk
 * lateral undulation along the new escape course, with zero sideways slip of the rear trunk.
 */
export const STARTLE = {
  turn: [1.1, 1.9] as const,
  turnRate: 4.2,
  burst: 0.85,
  cooldown: 2.2,
} as const;

/**
 * Investigating a visitor's tap on the wooden planks (substrate vibration / scent spot).
 * guess: timings for noticing and tongue-flicking the tapped spot.
 */
export const SCENT = {
  notice: [0.15, 0.4] as const,
  /** Distance from snout at which the snake pauses to tongue-flick the spot, BL. */
  reach: 0.048,
  /** Duration of the tongue-flick inspection pause at the spot, s. */
  inspect: [1.1, 1.8] as const,
  maxSpots: 6,
} as const;
