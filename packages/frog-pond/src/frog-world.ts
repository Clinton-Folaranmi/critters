// Frogs, lily pads and fireflies (midges by day) for the pond study, in
// either light. Units are canvas-height; y points up; x runs from 0 to the
// canvas aspect ratio.
//
// A frog is a small 2D rig seen from above: a body that squashes, stretches
// and shifts its weight, two three-segment hind legs with webbed feet and two
// forelegs, all driven by per-side pose channels. Behaviour is a state
// machine — sit, crouch, air, land, swim, dive — and each state authors its
// own pose curves, so a jump always loads, pushes off one leg a beat before
// the other, gathers in flight, lands forefeet first and settles.
// FROG_ART_DIRECTION.md describes what each pose is meant to read as.

import { WATER_CX, WATER_CY, openDistance, shoreDistance } from './frog-bank';
import { TAU, clamp, smoothstep } from './frog-math';

const HIND_SEGMENTS = 3;
const FORE_SEGMENTS = 2;
/** Capsules per frog: [thigh, shin, foot, upper arm, forearm] × left/right. */
export const FROG_CAPSULES = (HIND_SEGMENTS + FORE_SEGMENTS) * 2;
export const MAX_PADS = 8;
export const MAX_FLIES = 8;
/** Motes: fireflies (or midges) startled up out of the grass by a tap on the bank. */
export const MAX_MOTES = 6;
/** How much larger a frog draws at the top of a leap (per unit of height). */
export const FROG_LIFT = 0.35;

type FrogState = 'sit' | 'turn' | 'crouch' | 'air' | 'land' | 'swim' | 'dive';

/** What a tap did: moved a frog, only startled one, rocked a pad, hit water, or landed on the bank (or reeds). */
export type TapResult = 'frog' | 'frog-startle' | 'pad' | 'water' | 'bank';

export interface Pad {
  x: number;
  y: number;
  homeX: number;
  homeY: number;
  radius: number;
  angle: number;
  notch: number;
  /** 0 … 1, how torn the rim is. */
  damage: number;
  vx: number;
  vy: number;
  spin: number;
  bob: number;
  bobPhase: number;
  age: number;
  occupant: number;
  /** Frog that has chosen this pad mid-jump or mid-climb, or -1. */
  reserved: number;
  /** Eases toward 1 while a frog sits on the pad; the leaf dips under it. */
  load: number;
  loadX: number;
  loadY: number;
  /** A short-lived dimple where the pad was tapped or landed on (pad-local). */
  press: number;
  pressX: number;
  pressY: number;
}

export interface Firefly {
  x: number;
  y: number;
  vx: number;
  vy: number;
  homeX: number;
  homeY: number;
  range: number;
  height: number;
  phase: number;
  rate: number;
  glow: number;
  fade: number;
  respawn: number;
}

export interface Frog {
  x: number;
  y: number;
  z: number;
  heading: number;
  size: number;
  palette: number;
  breathRate: number;
  state: FrogState;
  time: number;
  pad: number;
  padX: number;
  padY: number;
  padHeading: number;
  // Jump.
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  toPad: number;
  flight: number;
  peak: number;
  crouchFor: number;
  /** Which hind leg pushes first: 1 left, -1 right. */
  lead: number;
  // Pose channels. hind -0.2 (tight crouch) … 1.1 (driven back), fore -0.6
  // (reaching forward) … 1 (swept back), web 0 (toes together) … 1 (spread).
  hindL: number;
  hindR: number;
  foreL: number;
  foreR: number;
  webL: number;
  webR: number;
  /**
   * Limb yaw about the hip or shoulder, radians, frog-local (+ is
   * counter-clockwise). Lets a foot stay planted while the body pivots over
   * it, and lets legs trail in the water or air while the body turns.
   */
  yawHL: number;
  yawHR: number;
  yawFL: number;
  yawFR: number;
  /**
   * Feet pinned to the leaf (pad-local position, weight 0 … 1): while a
   * weight is up, pose() aims that limb at its anchor so it does not slide.
   */
  anchors: FootAnchor[];
  /** Smoothed heading rate, rad/s; drives trailing limbs and body lag. */
  spin: number;
  /** Heading at take-off; the airborne turn is spread across the flight. */
  airFrom: number;
  /** Body length ÷ width scale: <1 squashed, >1 stretched. */
  stretch: number;
  /** Weight shift in body lengths; positive moves the body back over the hips. */
  lean: number;
  /** Small body yaw relative to the heading. */
  slip: number;
  /** 1 at touchdown, decaying. */
  impact: number;
  /** A flinch acknowledging a tap that can't change what the frog is doing. */
  startle: number;
  startleCool: number;
  /** Where the eyes look, as an angle from the heading. */
  look: number;
  // Values the renderers and hit test use, derived in pose().
  bodyHeading: number;
  bodyStretch: number;
  blink: number;
  blinkIn: number;
  throat: number;
  breath: number;
  croakIn: number;
  croak: number;
  // Tongue, in world units; strike 0 … 1 … 0 over one catch.
  tongue: number;
  tongueX: number;
  tongueY: number;
  tongueFly: number;
  hunger: number;
  submerge: number;
  speed: number;
  kickIn: number;
  kick: number;
  /** Outside hind leg of a steering stroke: 1 left, -1 right. */
  kickSide: number;
  /**
   * Steering in the current stroke, -1 … 1 (positive turns left). Zero is a
   * straight stroke with mirrored, synchronous hind legs.
   */
  steer: number;
  /** Minimum time in the water before a swimming frog climbs out. */
  swimFor: number;
  /** The pad a swimmer has settled on heading for, once it starts home (-1: not yet). */
  homeTo: number;
  idleIn: number;
  turnTo: number;
  /** Short on-pad weight shift, kept separate from a hop or swim turn. */
  turnFromHeading: number;
  /** Signed heading change of the on-pad shift. */
  turnBy: number;
  turnFromPadX: number;
  turnFromPadY: number;
  turnFor: number;
  /** The on-pad shift is setting up a hop that is already chosen. */
  hopAfterTurn: boolean;
}

/** A foot pinned to its pad, and (phase 1) the step carrying it elsewhere. */
interface FootAnchor {
  /** The pad the foot is on (it can outlast the frog's own pad for a few
   * frames of a push-off), or -1. */
  pad: number;
  /** Pad-local position, world units. */
  x: number;
  y: number;
  /** How firmly pose() holds the foot there, 0 … 1. */
  w: number;
  /**
   * Turn-step bookkeeping: 0 planted; odd while a step carries the foot
   * from (fromX, fromY) to (toX, toY); even once that step is done.
   */
  phase: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
}

export type RippleEmitter = (x: number, y: number, strength: number) => void;

/** A mote rising from the grass: where it is, how high, and how far through its short life. */
export interface Mote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  height: number;
  /** Seconds since it rose, and how long it lasts (0: free). */
  age: number;
  life: number;
}

// Pads: radius, notch width, rim damage, age. The first four are the frogs'
// stages (three occupied, one spare); the rest are supporting pads — a bud
// near the left bank, and pads drifting off the open edges of the picture
// that frogs leave alone. No pad touches the bank (see stepPads).
const PADS: ReadonlyArray<readonly [number, number, number, number]> = [
  [0.155, 0.3, 0.15, 0.2],
  [0.135, 0.22, 0.0, 0.05],
  [0.125, 0.34, 0.45, 0.55],
  [0.115, 0.26, 0.0, 0.15],
  [0.05, 0.4, 0.0, 0.0],
  [0.13, 0.28, 0.35, 0.7],
  [0.1, 0.3, 0.2, 0.45],
  [0.09, 0.24, 0.6, 0.85],
];
// Where each pad floats (share of width, share of height), spaced unevenly:
// on a wide picture (aspect 1.48), and rearranged for a narrow one (0.91,
// a phone), where the same shares of the width would crowd the stages
// together. Between the two the homes are blended by aspect.
const PAD_HOMES_WIDE: ReadonlyArray<readonly [number, number]> = [
  [0.36, 0.6],
  [0.72, 0.66],
  [0.66, 0.36],
  [0.49, 0.4],
  [0.22, 0.8],
  [0.95, 0.42],
  [0.53, 0.95],
  [0.87, 0.14],
];
const PAD_HOMES_NARROW: ReadonlyArray<readonly [number, number]> = [
  [0.36, 0.69],
  [0.72, 0.66],
  [0.73, 0.36],
  [0.42, 0.39],
  [0.15, 0.85],
  [1.04, 0.44],
  [0.53, 0.95],
  [0.87, 0.14],
];
const NARROW_ASPECT = 0.91;
const WIDE_ASPECT = 1.48;
/** A pad's home in world units at an aspect. */
function padHome(index: number, aspect: number) {
  const t = smoothstep(NARROW_ASPECT, WIDE_ASPECT, aspect);
  const [nu, nv] = PAD_HOMES_NARROW[index];
  const [wu, wv] = PAD_HOMES_WIDE[index];
  return [(nu + (wu - nu) * t) * aspect, nv + (wv - nv) * t] as const;
}
const FROGS = [
  { pad: 0, size: 0.112, palette: 0, heading: 0.35, breath: 1.18 },
  { pad: 1, size: 0.1, palette: 1, heading: 2.75, breath: 1.41 },
  { pad: 2, size: 0.118, palette: 2, heading: -2.1, breath: 1.27 },
] as const;
// Firefly clusters (share of width, share of height, range, count): around
// the frogs' stages and the reeds, leaving open water quiet.
const FLY_CLUSTERS: ReadonlyArray<readonly [number, number, number, number]> = [
  [0.24, 0.76, 0.08, 3],
  [0.8, 0.52, 0.075, 3],
  [0.52, 0.42, 0.06, 2],
];

// The water ends at the bank (bottom and left, frog-bank.ts) and runs out of
// the picture elsewhere. Animals keep a little way off the bank, and inside
// the old soft oval on the open sides. A pad keeps this far off the bank.
const BANK_CLEARANCE = 0.012;
const PAD_CLEARANCE = 0.015;
/** Pads further out than this (in pond radii) are scenery, not stages. */
const STAGE_REACH = 0.8;

/** A mote's life, in seconds, and how many rise from one tap on the grass. */
const MOTE_LIFE = 1.6;
const MOTES_PER_TAP = 4;

const angleDelta = (to: number, from: number) => Math.atan2(Math.sin(to - from), Math.cos(to - from));
const approach = (value: number, target: number, rate: number, dt: number) =>
  value + (target - value) * (1 - Math.exp(-rate * dt));
const smooth = (t: number) => smoothstep(0, 1, t);
const mix = (a: number, b: number, t: number) => a + (b - a) * t;
/** Left then right, for per-side loops (hoisted so a frame allocates nothing). */
const SIDES = [1, -1] as const;
const YAWS = ['yawHL', 'yawHR', 'yawFL', 'yawFR'] as const;
const HIND_THEN_FORE = [false, true] as const;
const limbScratch: [number, number] = [0, 0];
/**
 * End of a limb chain (ankle or wrist) in frog-local body lengths, for a
 * pose-channel value t and a yaw about the hip or shoulder. Written into
 * `out` (a shared scratch pair unless given), which is returned.
 */
function limbEnd(
  side: number,
  fore: boolean,
  t: number,
  yaw: number,
  lean: number,
  out: [number, number] = limbScratch,
) {
  const lengths = fore ? FORE_LENGTHS : HIND_LENGTHS;
  const folded = fore ? FORE_TUCKED : HIND_FOLDED;
  const extended = fore ? FORE_SWEPT : HIND_EXTENDED;
  let x = (fore ? SHOULDER[0] : HIP[0]) - lean;
  let y = (fore ? SHOULDER[1] : HIP[1]) * side;
  for (let j = 0; j < lengths.length; j++) {
    const a = folded[j] + (extended[j] - folded[j]) * t;
    x += Math.cos(a * side + yaw) * lengths[j];
    y += Math.sin(a * side + yaw) * lengths[j];
  }
  out[0] = x;
  out[1] = y;
  return out;
}
/** How far a limb chain reaches from its hip or shoulder at extension t. */
function limbReach(side: number, fore: boolean, t: number, lean: number) {
  const end = limbEnd(side, fore, t, 0, lean);
  return Math.hypot(end[0] - ((fore ? SHOULDER[0] : HIP[0]) - lean), end[1] - (fore ? SHOULDER[1] : HIP[1]) * side);
}
/** Order of Frog.anchors: hind left, hind right, fore left, fore right. */
const anchorIndex = (side: number, fore: boolean) => (fore ? 2 : 0) + (side === 1 ? 0 : 1);

// Joint angles (radians, frog-local, measured on the left side) at the two
// hind-leg key poses, and segment lengths in body lengths.
// A top-down leap needs a bent, paddle-like silhouette. A fully straight
// three-bone chain looks like a stick figure even when the timing is correct.
const HIND_LENGTHS = [0.37, 0.36, 0.25] as const;
const HIND_FOLDED = [0.62, 3.5, 0.85] as const;
// Keep the airborne push visibly articulated: the shin folds under the thigh
// rather than making one ruler-straight silhouette behind a small body.
const HIND_EXTENDED = [2.52, 4.15, 2.58] as const;
const FORE_LENGTHS = [0.2, 0.26] as const;
const FORE_TUCKED = [1.2, 0.3] as const;
const FORE_SWEPT = [2.55, 2.9] as const;
const HIP = [-0.3, 0.13] as const;
const SHOULDER = [0.12, 0.15] as const;
/** Hind toes reach this far beyond the ankle, fore toes a little less far. */
export const HIND_TOE = 0.23;
export const FORE_TOE = 0.11;

// Jump timing, in seconds.
const CROUCH_CALM = 0.19;
const CROUCH_URGENT = 0.075;
const CROUCH_CLIMB = 0.16;
const PUSH = 0.075;
const PUSH_STAGGER = 0.052;
const LANDING = 0.3;
// Swim timing.
const KICK = 0.12;
const KICK_END = 0.18;
const RECOVER = 0.34;
const STARTLE_COOLDOWN = 0.35;
/** Seconds before a swim ends that the frog starts to steer for its pad. */
const HOMING = 2;
/** How far a swimmer's trailing legs keep off the bank (world units). */
const LEG_CLEARANCE = 0.004;

export class FrogWorld {
  readonly pads: Pad[];
  readonly frogs: Frog[];
  readonly flies: Firefly[];
  readonly motes: Mote[];
  /** Frog-local leg capsules (body-length units): ax, ay, bx, by per capsule. */
  readonly capsules: Float32Array;
  private aspect: number;
  private seed = 40213;
  private emit: RippleEmitter;
  /** Scratch list for freePads(), reused every frame. */
  private free: number[] = [];

  constructor(aspect: number, emit: RippleEmitter, frogCount: number = FROGS.length) {
    this.aspect = aspect;
    this.emit = emit;
    this.pads = PADS.slice(0, MAX_PADS).map(([radius, notch, damage, age], index) => {
      const [x, y] = padHome(index, aspect);
      return {
        x,
        y,
        homeX: x,
        homeY: y,
        radius,
        angle: index * 2.39 + 0.6,
        notch,
        damage,
        vx: 0,
        vy: 0,
        spin: 0,
        bob: 0,
        bobPhase: index * 1.3,
        age,
        occupant: -1,
        reserved: -1,
        load: 0,
        loadX: 0,
        loadY: 0,
        press: 0,
        pressX: 0,
        pressY: 0,
      };
    });
    this.frogs = FROGS.slice(0, clamp(frogCount, 1, FROGS.length)).map((spec, index) => {
      const pad = this.pads[spec.pad];
      pad.occupant = index;
      pad.load = 1;
      const frog: Frog = {
        x: pad.x,
        y: pad.y,
        z: 0,
        heading: spec.heading,
        size: spec.size,
        palette: spec.palette,
        breathRate: spec.breath,
        state: 'sit',
        time: 0,
        pad: spec.pad,
        padX: 0,
        padY: 0,
        padHeading: angleDelta(spec.heading, pad.angle),
        fromX: 0,
        fromY: 0,
        toX: 0,
        toY: 0,
        toPad: -1,
        flight: 0.4,
        peak: 0.1,
        crouchFor: CROUCH_CALM,
        lead: index % 2 ? -1 : 1,
        hindL: 0,
        hindR: 0,
        foreL: 0,
        foreR: 0,
        webL: 0.25,
        webR: 0.25,
        yawHL: 0,
        yawHR: 0,
        yawFL: 0,
        yawFR: 0,
        spin: 0,
        anchors: Array.from({ length: 4 }, () => ({
          pad: -1,
          x: 0,
          y: 0,
          w: 0,
          phase: 0,
          fromX: 0,
          fromY: 0,
          toX: 0,
          toY: 0,
        })),
        airFrom: spec.heading,
        stretch: 1,
        lean: 0,
        slip: 0,
        impact: 0,
        startle: 0,
        startleCool: 0,
        look: 0,
        bodyHeading: spec.heading,
        bodyStretch: 1,
        blink: 0,
        blinkIn: 1.5 + index * 1.3,
        throat: 0.12,
        breath: index * 1.7,
        croakIn: 4 + index * 3.1,
        croak: -1,
        tongue: 0,
        tongueX: 0,
        tongueY: 0,
        tongueFly: -1,
        hunger: 2 + index,
        submerge: 0,
        speed: 0,
        kickIn: 0,
        kick: -1,
        kickSide: 1,
        steer: 0,
        swimFor: 0,
        homeTo: -1,
        idleIn: 4.5 + index * 2.6,
        turnTo: spec.heading,
        turnFromHeading: spec.heading,
        turnBy: 0,
        turnFromPadX: 0,
        turnFromPadY: 0,
        turnFor: 0.5,
        hopAfterTurn: false,
      };
      return frog;
    });
    this.flies = [];
    for (const [u, v, range, count] of FLY_CLUSTERS) {
      for (let i = 0; i < count && this.flies.length < MAX_FLIES; i++) {
        const index = this.flies.length;
        const a = this.random() * TAU;
        const r = range * Math.sqrt(this.random());
        this.flies.push({
          x: u * aspect + Math.cos(a) * r,
          y: v + Math.sin(a) * r,
          vx: 0,
          vy: 0,
          homeX: u * aspect,
          homeY: v,
          range,
          height: 0.03 + this.random() * 0.05,
          phase: index * 1.1 + this.random(),
          rate: 0.45 + this.random() * 0.6,
          // Lit from the start, so the reduced-motion still shows them too.
          glow: 0.35 + (index % 3) * 0.3,
          fade: 1,
          respawn: 0,
        });
      }
    }
    this.motes = Array.from({ length: MAX_MOTES }, () => ({ x: 0, y: 0, vx: 0, vy: 0, height: 0, age: 0, life: 0 }));
    this.capsules = new Float32Array(this.frogs.length * FROG_CAPSULES * 4);
    for (const frog of this.frogs) {
      this.pose(frog);
      this.anchorAll(frog);
    }
  }

  private random() {
    this.seed = (Math.imul(this.seed, 1664525) + 1013904223) >>> 0;
    return this.seed / 4294967296;
  }

  // ---- The visible pond ------------------------------------------------------

  /**
   * Below 1 inside the swimmable water, 1 at its edge, above 1 beyond it:
   * the open-water oval, or near the bank, whichever is closer. Shrunk by a
   * margin in world units.
   */
  pondDistance(x: number, y: number, margin = 0) {
    const bank = 1 - (shoreDistance(x, y, this.aspect) - margin - BANK_CLEARANCE) / 0.3;
    return Math.max(openDistance(x, y, this.aspect, margin), bank);
  }

  /** Pulls a point back inside the swimmable water (less a margin), toward its middle. */
  private contain(point: { x: number; y: number }, margin: number) {
    if (this.pondDistance(point.x, point.y, margin) <= 1) return;
    const cx = this.aspect * WATER_CX;
    let inside = 0;
    let outside = 1;
    for (let i = 0; i < 14; i++) {
      const t = (inside + outside) / 2;
      const d = this.pondDistance(cx + (point.x - cx) * t, WATER_CY + (point.y - WATER_CY) * t, margin);
      if (d <= 1) inside = t;
      else outside = t;
    }
    point.x = cx + (point.x - cx) * inside;
    point.y = WATER_CY + (point.y - WATER_CY) * inside;
  }

  /** Nudges a drifting pad back off the bank. */
  private keepOffBank(pad: Pad) {
    const clear = shoreDistance(pad.x, pad.y, this.aspect) - pad.radius - PAD_CLEARANCE;
    if (clear >= 0) return;
    const e = 0.002;
    let gx = shoreDistance(pad.x + e, pad.y, this.aspect) - shoreDistance(pad.x - e, pad.y, this.aspect);
    let gy = shoreDistance(pad.x, pad.y + e, this.aspect) - shoreDistance(pad.x, pad.y - e, this.aspect);
    const g = Math.hypot(gx, gy) || 1;
    gx /= g;
    gy /= g;
    pad.x -= gx * clear;
    pad.y -= gy * clear;
    const into = pad.vx * gx + pad.vy * gy;
    if (into < 0) {
      pad.vx -= gx * into;
      pad.vy -= gy * into;
    }
  }

  /**
   * A new canvas shape. Pads keep their place in the picture and drift
   * toward the layout for the new shape on their springs; with `settle`
   * (nothing is moving yet, or never will: the reduced-motion still) they
   * go straight there.
   */
  resize(aspect: number, settle = false) {
    if (aspect === this.aspect) return;
    const scale = aspect / this.aspect;
    this.aspect = aspect;
    this.pads.forEach((pad, index) => {
      [pad.homeX, pad.homeY] = padHome(index, aspect);
      if (settle) {
        pad.x = pad.homeX;
        pad.y = pad.homeY;
        pad.vx = 0;
        pad.vy = 0;
      } else {
        pad.x *= scale;
      }
    });
    for (const mote of this.motes) mote.x *= scale;
    for (const fly of this.flies) {
      fly.x *= scale;
      fly.homeX *= scale;
    }
    for (const frog of this.frogs) {
      frog.x *= scale;
      frog.fromX *= scale;
      frog.toX *= scale;
      if (frog.pad >= 0) {
        this.ridePad(frog);
      } else if (frog.state === 'swim' || frog.state === 'dive') {
        this.contain(frog, frog.size * 0.8);
      } else if (frog.state === 'air' && frog.toPad < 0) {
        const target = { x: frog.toX, y: frog.toY };
        this.contain(target, frog.size);
        frog.toX = target.x;
        frog.toY = target.y;
      }
    }
  }

  step(deltaSeconds: number) {
    const dt = Math.min(deltaSeconds, 0.05);
    if (dt <= 0) return;
    this.stepPads(dt);
    this.stepFlies(dt);
    this.stepMotes(dt);
    for (let i = 0; i < this.frogs.length; i++) this.stepFrog(this.frogs[i], i, dt);
    this.separateSwimmers();
    for (let i = 0; i < this.frogs.length; i++) {
      const frog = this.frogs[i];
      this.pose(frog);
      if (frog.pad < 0 && frog.state !== 'air' && frog.state !== 'land') this.keepLegsOffBank(frog, i);
    }
  }

  /**
   * Containment keeps a swimmer's body off the bank, but its hind legs trail
   * well behind it (and its forefeet reach ahead), and turning back from the
   * shore they would slip under the grass. This moves the frog clear, away
   * from the shore, just far enough that every joint and toe stays on the
   * water. (A frog in the air is drawn over the bank, so it may cross it.)
   */
  private keepLegsOffBank(frog: Frog, index: number) {
    for (let pass = 0; pass < 2; pass++) {
      const scale = frog.size * (1 + frog.z * FROG_LIFT);
      const c = Math.cos(frog.bodyHeading);
      const s = Math.sin(frog.bodyHeading);
      let need = 0;
      let atX = 0;
      let atY = 0;
      const base = index * FROG_CAPSULES * 4;
      for (let k = 0; k < FROG_CAPSULES; k++) {
        const part = k % 5;
        const o = base + k * 4;
        // Each joint as drawn (with its thickness), and the toe fans.
        let lx = this.capsules[o + 2];
        let ly = this.capsules[o + 3];
        let radius = part === 0 ? 0.09 : 0.05;
        if (part === 2 || part === 4) {
          const toe = part === 2 ? HIND_TOE : FORE_TOE;
          const dx = lx - this.capsules[o];
          const dy = ly - this.capsules[o + 1];
          const len = Math.hypot(dx, dy) || 1;
          lx += (dx / len) * toe * 0.55;
          ly += (dy / len) * toe * 0.55;
          radius = toe * 0.6;
        }
        lx *= frog.bodyStretch;
        ly /= frog.bodyStretch;
        const wx = frog.x + (lx * c - ly * s) * scale;
        const wy = frog.y + (lx * s + ly * c) * scale;
        const short = radius * scale + LEG_CLEARANCE - shoreDistance(wx, wy, this.aspect);
        if (short > need) {
          need = short;
          atX = wx;
          atY = wy;
        }
      }
      if (need <= 0) return;
      const e = 0.002;
      const gx = shoreDistance(atX + e, atY, this.aspect) - shoreDistance(atX - e, atY, this.aspect);
      const gy = shoreDistance(atX, atY + e, this.aspect) - shoreDistance(atX, atY - e, this.aspect);
      const g = Math.hypot(gx, gy) || 1;
      frog.x += (gx / g) * need;
      frog.y += (gy / g) * need;
      this.contain(frog, frog.size * 0.8);
    }
  }

  // ---- Pads: float on a spring toward home, bob and spin when pushed.
  private stepPads(dt: number) {
    for (const pad of this.pads) {
      pad.vx += (-(pad.x - pad.homeX) * 1.6 - pad.vx * 1.4) * dt;
      pad.vy += (-(pad.y - pad.homeY) * 1.6 - pad.vy * 1.4) * dt;
      pad.x += pad.vx * dt;
      pad.y += pad.vy * dt;
      this.keepOffBank(pad);
      pad.spin *= Math.exp(-1.6 * dt);
      pad.angle += pad.spin * dt;
      pad.bob *= Math.exp(-2.4 * dt);
      pad.bobPhase += dt * 9;
      pad.press *= Math.exp(-3.2 * dt);
      const occupant = pad.occupant >= 0 ? this.frogs[pad.occupant] : null;
      pad.load = approach(pad.load, occupant ? 1 : 0, 4, dt);
      if (occupant) {
        pad.loadX = occupant.padX;
        pad.loadY = occupant.padY;
      }
    }
  }

  private push(pad: Pad, x: number, y: number, dirX: number, dirY: number, strength: number) {
    pad.vx += dirX * strength;
    pad.vy += dirY * strength;
    // An off-centre push turns the pad a little.
    pad.spin += (((x - pad.x) * dirY - (y - pad.y) * dirX) / pad.radius) * strength * 9;
    pad.bob = Math.min(1, pad.bob + strength * 14);
  }

  private pressPad(pad: Pad, x: number, y: number, amount: number) {
    const c = Math.cos(-pad.angle);
    const s = Math.sin(-pad.angle);
    const dx = x - pad.x;
    const dy = y - pad.y;
    pad.pressX = dx * c - dy * s;
    pad.pressY = dx * s + dy * c;
    pad.press = Math.max(pad.press, amount);
  }

  // ---- Fireflies: a slow drift around their cluster, with an irregular blink.
  private stepFlies(dt: number) {
    for (const fly of this.flies) {
      if (fly.respawn > 0) {
        fly.respawn -= dt;
        if (fly.respawn <= 0) {
          const a = this.random() * TAU;
          const r = fly.range * Math.sqrt(this.random());
          fly.x = fly.homeX + Math.cos(a) * r;
          fly.y = fly.homeY + Math.sin(a) * r;
          fly.vx = 0;
          fly.vy = 0;
          fly.fade = 0;
        }
        continue;
      }
      fly.fade = Math.min(1, fly.fade + dt * 0.6);
      fly.vx += (this.random() - 0.5) * 0.22 * dt;
      fly.vy += (this.random() - 0.5) * 0.22 * dt;
      // A loose leash back to the cluster.
      const dx = fly.homeX - fly.x;
      const dy = fly.homeY - fly.y;
      const d = Math.hypot(dx, dy);
      if (d > fly.range) {
        fly.vx += (dx / d) * dt * 0.04;
        fly.vy += (dy / d) * dt * 0.04;
      }
      const speed = Math.hypot(fly.vx, fly.vy);
      if (speed > 0.03) {
        fly.vx *= 0.03 / speed;
        fly.vy *= 0.03 / speed;
      }
      fly.x += fly.vx * dt;
      fly.y += fly.vy * dt;
      fly.phase += dt * fly.rate;
      const pulse = Math.max(0, Math.sin(fly.phase * TAU));
      fly.glow = (0.25 + 0.75 * pulse ** 3) * fly.fade;
    }
  }

  // ---- Pad bookkeeping -------------------------------------------------------

  private padFree(padIndex: number, frogIndex: number) {
    const pad = this.pads[padIndex];
    return pad.occupant === -1 && (pad.reserved === -1 || pad.reserved === frogIndex);
  }

  /**
   * Pads a frog could sit on: free, big enough for it, and well inside the
   * pond. Returns their indices in a list that is reused on the next call.
   */
  private freePads(frogIndex: number) {
    const size = this.frogs[frogIndex].size;
    const free = this.free;
    free.length = 0;
    this.pads.forEach((pad, index) => {
      if (
        this.padFree(index, frogIndex) &&
        pad.radius >= size * 0.95 &&
        this.pondDistance(pad.x, pad.y) < STAGE_REACH
      ) {
        free.push(index);
      }
    });
    return free;
  }

  private release(frogIndex: number) {
    const frog = this.frogs[frogIndex];
    if (frog.toPad >= 0 && this.pads[frog.toPad].reserved === frogIndex) {
      this.pads[frog.toPad].reserved = -1;
    }
    frog.toPad = -1;
  }

  private startJump(frog: Frog, index: number, toX: number, toY: number, toPad: number, crouchFor: number) {
    this.release(index);
    if (toPad >= 0) this.pads[toPad].reserved = index;
    frog.toPad = toPad;
    frog.toX = toX;
    frog.toY = toY;
    const distance = Math.hypot(toX - frog.x, toY - frog.y);
    frog.flight = clamp(0.26 + distance * 0.9, 0.34, 0.62);
    frog.peak = clamp(0.1 + distance * 0.55, 0.12, 0.3);
    if (frog.state === 'swim' || frog.state === 'dive') frog.peak *= 0.55;
    frog.crouchFor = crouchFor;
    frog.turnTo = Math.atan2(toY - frog.y, toX - frog.x);
    // The leg on the outside of the turn pushes first.
    frog.lead = angleDelta(frog.turnTo, frog.heading) >= 0 ? -1 : 1;
    frog.state = 'crouch';
    frog.time = 0;
    frog.tongue = 0;
    frog.tongueFly = -1;
    frog.croak = -1;
    frog.hopAfterTurn = false;
    // On a leaf the feet grip through the whole load-up.
    if (frog.pad >= 0) this.anchorAll(frog);
    // A calm frog facing well away from where it means to go first shifts
    // its weight part of the way round on the pad; an escape just goes. The
    // rest of the heading change happens in the crouch and in the air.
    const off = angleDelta(frog.turnTo, frog.heading);
    if (frog.pad >= 0 && crouchFor === CROUCH_CALM && Math.abs(off) > 0.45) {
      this.startTurn(frog, frog.heading + clamp(off, -0.75, 0.75));
      frog.hopAfterTurn = true;
    }
  }

  private chooseHop(frog: Frog, index: number, awayFrom?: number) {
    const urgent = awayFrom !== undefined;
    const candidates = this.freePads(index)
      .filter((padIndex) => padIndex !== frog.pad)
      .map((padIndex) => {
        const pad = this.pads[padIndex];
        const dx = pad.x - frog.x;
        const dy = pad.y - frog.y;
        const distance = Math.hypot(dx, dy);
        let score = -Math.abs(distance - 0.3);
        // A calm frog favours somewhere roughly ahead of it.
        if (!urgent) score -= Math.abs(angleDelta(Math.atan2(dy, dx), frog.heading)) * 0.06;
        if (urgent) {
          const off = Math.abs(angleDelta(Math.atan2(dy, dx), awayFrom));
          if (off > 1.4) score -= 10;
          score -= off * 0.2;
        }
        return { pad, padIndex, distance, score };
      })
      .filter((c) => c.distance > 0.12 && c.distance < 0.55)
      .sort((a, b) => b.score - a.score);
    const crouch = urgent ? CROUCH_URGENT : CROUCH_CALM;
    // Sometimes a frog just slips into the water instead.
    if (candidates.length && candidates[0].score > -5 && (urgent || this.random() > 0.25)) {
      const { pad, padIndex } = candidates[0];
      const a = this.random() * TAU;
      const r = pad.radius * 0.25 * this.random();
      this.startJump(frog, index, pad.x + Math.cos(a) * r, pad.y + Math.sin(a) * r, padIndex, crouch);
      return;
    }
    // Into open water: try landing spots clear of every pad, inside the pond.
    const base = awayFrom ?? frog.heading + (this.random() - 0.5) * 1.6;
    const margin = frog.size * 0.9;
    for (let attempt = 0; attempt < 14; attempt++) {
      const direction = base + (attempt ? (this.random() - 0.5) * (0.8 + attempt * 0.25) : 0);
      const reach = 0.2 + this.random() * 0.14;
      const x = frog.x + Math.cos(direction) * reach;
      const y = frog.y + Math.sin(direction) * reach;
      if (this.pondDistance(x, y, margin) < 1 && this.openWater(x, y, frog.size * 0.7)) {
        this.startJump(frog, index, x, y, -1, crouch);
        return;
      }
    }
    // Nowhere good nearby: a short hop toward the middle of the pond.
    const toCentre = Math.atan2(WATER_CY - frog.y, this.aspect * WATER_CX - frog.x);
    const target = { x: frog.x + Math.cos(toCentre) * 0.18, y: frog.y + Math.sin(toCentre) * 0.18 };
    this.contain(target, margin);
    this.startJump(frog, index, target.x, target.y, -1, crouch);
  }

  /** Clear of every pad, and of any frog already in the water. */
  private openWater(x: number, y: number, margin: number) {
    return (
      this.pads.every((pad) => Math.hypot(pad.x - x, pad.y - y) > pad.radius + margin) &&
      this.frogs.every(
        (frog) =>
          (frog.state !== 'swim' && frog.state !== 'dive') ||
          Math.hypot(frog.x - x, frog.y - y) > frog.size * 1.6 + margin,
      )
    );
  }

  // ---- Frogs -----------------------------------------------------------------

  private stepFrog(frog: Frog, index: number, dt: number) {
    frog.time += dt;
    const headingBefore = frog.heading;

    // Blinks and breathing run in every state.
    frog.blinkIn -= dt;
    if (frog.blinkIn <= 0) {
      frog.blink = 1;
      frog.blinkIn = 2 + this.random() * 5;
    }
    frog.blink = Math.max(0, frog.blink - dt * 6);
    frog.breath += dt * TAU * frog.breathRate;
    frog.startle = Math.max(0, frog.startle - dt * 4);
    frog.startleCool = Math.max(0, frog.startleCool - dt);
    frog.impact = Math.max(0, frog.impact - dt * 5);

    switch (frog.state) {
      case 'sit':
        this.sit(frog, index, dt);
        break;
      case 'turn':
        this.turnOnPad(frog, index, dt);
        break;
      case 'crouch':
        this.crouch(frog, dt);
        break;
      case 'air':
        this.air(frog, index, dt);
        break;
      case 'land':
        this.landing(frog, dt);
        break;
      case 'swim':
      case 'dive':
        this.swim(frog, index, dt);
        break;
    }
    frog.spin = approach(frog.spin, angleDelta(frog.heading, headingBefore) / dt, 20, dt);

    // Tongue strike, independent of the body state machine.
    if (frog.tongueFly >= 0) {
      const t = frog.time;
      const fly = this.flies[frog.tongueFly];
      if (t < 0.09) {
        frog.tongue = t / 0.09;
        frog.tongueX = fly.x;
        frog.tongueY = fly.y;
      } else if (t < 0.24) {
        if (fly.respawn <= 0) {
          fly.respawn = 5 + this.random() * 6;
          fly.glow = 0;
        }
        frog.tongue = 1 - (t - 0.09) / 0.15;
      } else {
        frog.tongue = 0;
        frog.tongueFly = -1;
      }
    }
  }

  /** Sets both sides of a limb channel toward a target at the same rate. */
  private both(frog: Frog, channel: 'hind' | 'fore' | 'web', target: number, rate: number, dt: number) {
    const l = `${channel}L` as const;
    const r = `${channel}R` as const;
    frog[l] = approach(frog[l], target, rate, dt);
    frog[r] = approach(frog[r], target, rate, dt);
  }

  /**
   * A one-sided counterpart to both(). Frogs often load one side while the
   * opposite side is still supporting them; treating every joint as a paired
   * servo is the quickest way to make a living animal look mechanical.
   */
  private limb(frog: Frog, side: number, channel: 'hind' | 'fore' | 'web', target: number, rate: number, dt: number) {
    if (channel === 'hind') {
      if (side === 1) frog.hindL = approach(frog.hindL, target, rate, dt);
      else frog.hindR = approach(frog.hindR, target, rate, dt);
    } else if (channel === 'fore') {
      if (side === 1) frog.foreL = approach(frog.foreL, target, rate, dt);
      else frog.foreR = approach(frog.foreR, target, rate, dt);
    } else if (side === 1) {
      frog.webL = approach(frog.webL, target, rate, dt);
    } else {
      frog.webR = approach(frog.webR, target, rate, dt);
    }
  }

  /**
   * Limbs that are not planted lag behind a turning body: water or air drags
   * them to the outside of the turn, so the frog bends into a curve instead
   * of rotating as one rigid shape.
   */
  private trail(frog: Frog, rate: number, dt: number) {
    const hind = clamp(-frog.spin * 0.3, -0.4, 0.4);
    const fore = clamp(-frog.spin * 0.1, -0.15, 0.15);
    frog.yawHL = approach(frog.yawHL, hind, rate, dt);
    frog.yawHR = approach(frog.yawHR, hind, rate, dt);
    frog.yawFL = approach(frog.yawFL, fore, rate, dt);
    frog.yawFR = approach(frog.yawFR, fore, rate, dt);
  }

  private crouch(frog: Frog, dt: number) {
    // Weight goes back over the hips, the hind legs fold tight and the feet
    // spread to grip. On a pad the frog squares up a little toward where it
    // is going; in water it holds its line and turns only once moving.
    // From the water this is also the recovery stroke, so it folds from a
    // long glide pose: a little slower, and a little longer (CROUCH_CLIMB).
    const water = frog.pad < 0;
    this.limb(frog, frog.lead, 'hind', -0.16, water ? 18 : 30, dt);
    this.limb(frog, -frog.lead, 'hind', -0.1, water ? 15 : 20, dt);
    this.limb(frog, frog.lead, 'fore', 0.06, 18, dt);
    this.limb(frog, -frog.lead, 'fore', 0.16, 16, dt);
    this.limb(frog, frog.lead, 'web', 0.62, 14, dt);
    this.limb(frog, -frog.lead, 'web', 0.48, 11, dt);
    frog.stretch = approach(frog.stretch, 0.88, 22, dt);
    frog.lean = approach(frog.lean, 0.07, 22, dt);
    frog.slip = approach(frog.slip, 0, 10, dt);
    if (frog.pad >= 0) {
      frog.heading += this.pads[frog.pad].spin * dt;
      // The twist builds up rather than starting at full rate, and the feet
      // stay gripping the leaf while the body squares up over them.
      const urgent = frog.crouchFor <= CROUCH_URGENT;
      const rate = (urgent ? 5 : 2.2) * smooth(frog.time / 0.06);
      frog.heading += clamp(angleDelta(frog.turnTo, frog.heading), -rate * dt, rate * dt);
      // Feet stay anchored (see startJump); their yaw is the aim, not this.
      for (const key of YAWS) frog[key] = approach(frog[key], 0, 10, dt);
      // Loading onto the hips takes the weight off the forefeet, which ease
      // off the leaf rather than being dragged by the lean and the twist.
      for (const side of SIDES) {
        const anchor = frog.anchors[anchorIndex(side, true)];
        anchor.w = approach(anchor.w, 0, 8, dt);
      }
    } else {
      frog.submerge = approach(frog.submerge, 0.12, 10, dt);
      this.trail(frog, 8, dt);
    }
    if (frog.time >= frog.crouchFor) {
      const index = this.frogs.indexOf(frog);
      frog.state = 'air';
      frog.time = 0;
      frog.fromX = frog.x;
      frog.fromY = frog.y;
      frog.airFrom = frog.heading;
      if (frog.pad >= 0) {
        const pad = this.pads[frog.pad];
        if (pad.occupant === index) pad.occupant = -1;
        // The push-off shoves the pad back the other way.
        this.push(pad, frog.x, frog.y, -Math.cos(frog.heading), -Math.sin(frog.heading), 0.012 * (frog.size / 0.1));
        this.pressPad(pad, frog.x, frog.y, 0.7);
      } else if (frog.submerge > 0) {
        this.emit(frog.x, frog.y, 0.35);
      }
      frog.pad = -1;
      frog.speed = 0;
    }
    this.ridePad(frog);
  }

  private air(frog: Frog, index: number, dt: number) {
    const a = frog.time;
    const t = clamp(a / frog.flight, 0, 1);
    frog.x = frog.fromX + (frog.toX - frog.fromX) * t;
    frog.y = frog.fromY + (frog.toY - frog.fromY) * t;
    frog.z = 4 * frog.peak * t * (1 - t);
    // Whatever turn is left is spread across the flight, easing in and out,
    // rather than snapped round at take-off.
    frog.heading = frog.airFrom + angleDelta(frog.turnTo, frog.airFrom) * smooth(t / 0.8);
    // Clear of the water within a few frames of leaving it.
    frog.submerge = approach(frog.submerge, 0, 30, dt);
    // The feet leave the leaf over the first frames of the push, as the
    // body is driven away from them, not all at once at take-off.
    for (const anchor of frog.anchors) {
      anchor.w = approach(anchor.w, 0, 30, dt);
      if (anchor.w < 0.01) anchor.pad = -1;
    }
    this.trail(frog, 16, dt);

    // Hind legs: the lead leg drives back first and the other a beat later,
    // toes spread for the push; they stay long through the rise, then gather
    // under the body for the landing.
    // Start gathering before the apex; holding a fully straight leg through
    // most of the arc overwhelms the compact body in a top-down view.
    const gather = smooth((t - 0.38) / 0.4);
    const settle = smooth((a - 0.12) / 0.2);
    for (const side of SIDES) {
      const push = smooth((a - (side === frog.lead ? 0 : PUSH_STAGGER)) / PUSH);
      const extended = -0.16 + 1.12 * push - 0.12 * settle;
      const hind = mix(extended, 0.04, gather);
      // Forelegs stay tucked along the flanks in the push and rise, then the
      // lead side reaches forward first to catch the landing.
      const reach = smooth((t - (side === frog.lead ? 0.52 : 0.67)) / 0.27);
      const fore = mix(0.2 + 0.16 * push, -0.5, reach);
      const web = mix(1, 0.28, smooth((a - (side === frog.lead ? 0.06 : 0.095)) / 0.13)) + 0.22 * gather;
      // Very fast, but eased: the push must not pop from the crouch pose.
      this.limb(frog, side, 'hind', hind, 55, dt);
      this.limb(frog, side, 'fore', fore, 40, dt);
      this.limb(frog, side, 'web', web, 40, dt);
    }
    const launch = smooth(a / PUSH) * (1 - smooth((a - 0.08) / 0.2));
    frog.stretch = 1 + 0.13 * launch + 0.02 * (1 - gather);
    frog.lean = approach(frog.lean, -0.02 * (1 - gather), 18, dt);
    // The staggered push yaws the body a touch toward the trailing side.
    frog.slip = 0.06 * frog.lead * Math.sin(Math.PI * t);
    if (t >= 1) this.land(frog, index);
  }

  private landing(frog: Frog, dt: number) {
    const k = frog.time;
    // Compress on contact, then one small after-bounce before settling.
    frog.stretch = 1 - 0.19 * Math.exp(-k / 0.07) * Math.cos((TAU * k) / 0.27) * smooth(k / 0.03);
    frog.foreL = mix(frog.foreL, 0, smooth((k - 0.015) / LANDING));
    frog.foreR = mix(frog.foreR, 0, smooth((k - 0.05) / LANDING));
    this.limb(frog, frog.lead, 'hind', k < 0.1 ? -0.12 : 0, 16, dt);
    this.limb(frog, -frog.lead, 'hind', k < 0.13 ? -0.08 : 0, 12, dt);
    this.limb(frog, frog.lead, 'web', 0.34, 8, dt);
    this.limb(frog, -frog.lead, 'web', 0.24, 7, dt);
    frog.lean = -0.045 * Math.exp(-k / 0.08);
    frog.slip = approach(frog.slip, 0, 12, dt);
    this.trail(frog, 12, dt);
    this.ridePad(frog);
    if (k >= LANDING) {
      frog.state = 'sit';
      frog.time = 0;
      frog.idleIn = 3.5 + this.random() * 5.5;
      // Settled: the feet are down, and stay down while the body breathes.
      this.anchorAll(frog);
    }
  }

  private ridePad(frog: Frog) {
    if (frog.pad < 0) return;
    const pad = this.pads[frog.pad];
    const c = Math.cos(pad.angle);
    const s = Math.sin(pad.angle);
    frog.x = pad.x + frog.padX * c - frog.padY * s;
    frog.y = pad.y + frog.padX * s + frog.padY * c;
    // Settled frogs turn with their leaf. (The crouch follows the leaf's spin
    // in crouch(); it also squares up to its jump.)
    if (frog.state === 'sit' || frog.state === 'turn' || frog.state === 'land') {
      frog.heading = pad.angle + frog.padHeading;
    }
  }

  /**
   * Starts a small on-pad reorientation. Only called with a reason: to face a
   * hop that is already chosen, or a firefly just outside the frog's view.
   */
  private startTurn(frog: Frog, target: number) {
    frog.state = 'turn';
    frog.time = 0;
    frog.turnFromHeading = frog.heading;
    frog.turnFromPadX = frog.padX;
    frog.turnFromPadY = frog.padY;
    frog.turnBy = angleDelta(target, frog.heading);
    this.anchorAll(frog);
    frog.turnFor = 0.5 + Math.min(Math.abs(frog.turnBy), 0.75) * 0.3 + this.random() * 0.08;
    frog.lead = frog.turnBy >= 0 ? -1 : 1;
  }

  /**
   * A low, compact reorientation on the leaf. The hindquarters are the
   * pivot: the body swings round a point over the hips, so the head end
   * travels and the rear barely moves. Every foot stays planted while the
   * body turns over it (its yaw counter-rotates), then takes one short, low
   * step to catch up: the inside forefoot first, leading into the turn, the
   * outside one, then the hind feet once the swing is nearly done. Nothing
   * slides, and nothing is lifted high enough to read as a display.
   */
  private turnOnPad(frog: Frog, index: number, dt: number) {
    const pad = this.pads[frog.pad];
    if (!pad) {
      frog.state = 'sit';
      frog.time = 0;
      frog.hopAfterTurn = false;
      return;
    }
    const p = clamp(frog.time / frog.turnFor, 0, 1);
    const angle = frog.turnBy;
    const inside = angle >= 0 ? 1 : -1;
    const from = angleDelta(frog.turnFromHeading, pad.angle);
    // The pivot sits between the middle of the back and the inside hip: the
    // rear stays nearly put, while neither end travels further than a short
    // forearm or a compact hind leg can follow between steps.
    const pivotLocalX = HIP[0] * 0.45;
    const pivotLocalY = HIP[1] * 0.45 * inside;
    const pivotX = frog.turnFromPadX + (Math.cos(from) * pivotLocalX - Math.sin(from) * pivotLocalY) * frog.size;
    const pivotY = frog.turnFromPadY + (Math.sin(from) * pivotLocalX + Math.cos(from) * pivotLocalY) * frog.size;
    const place = (swung: number) => {
      const c = Math.cos(swung);
      const sn = Math.sin(swung);
      const ox = frog.turnFromPadX - pivotX;
      const oy = frog.turnFromPadY - pivotY;
      return [pivotX + ox * c - oy * sn, pivotY + ox * sn + oy * c, from + swung] as const;
    };
    const swingAt = (q: number) => angle * smooth((q - 0.08) / 0.8);
    const [px, py, heading] = place(swingAt(p));
    frog.padX = px;
    frog.padY = py;
    frog.padHeading = angleDelta(heading, 0);

    // Every foot stays anchored to the leaf except while stepping, when it
    // is lifted slightly and carried to where it will rest relative to the
    // body as that step ends. A forearm only reaches so far, so the forefeet
    // patter, two short alternating steps each, leading with the inside
    // one; each hind foot steps once, the outside one mid-swing so the leg
    // never trails out straight, the inside one (nearest the pivot) last.
    const step = (start: number, span: number) => smooth((p - start) / span);
    const lift = (w: number) => Math.sin(Math.PI * w);
    const steps = [
      { side: inside, fore: true, start: 0.04, span: 0.24 },
      { side: -inside, fore: true, start: 0.22, span: 0.24 },
      { side: -inside, fore: false, start: 0.3, span: 0.3 },
      { side: inside, fore: true, start: 0.44, span: 0.24 },
      { side: -inside, fore: true, start: 0.62, span: 0.26 },
      { side: inside, fore: false, start: 0.62, span: 0.3 },
    ];
    for (let id = 0; id < steps.length; id++) {
      const { side, fore, start, span } = steps[id];
      const w = step(start, span);
      const anchor = frog.anchors[anchorIndex(side, fore)];
      const rest = fore ? 0.02 : -0.06;
      // anchor.phase is 2·id + 1 while step id is under way, 2·id + 2 after.
      if (anchor.phase < 2 * id + 1 && w > 0) {
        // Where this foot will rest, on the leaf, once the step is done.
        const [endX, endY, endHeading] = place(swingAt(start + span));
        const [qx, qy] = limbEnd(side, fore, rest, 0, 0);
        const lx = qx * frog.stretch * frog.size;
        const ly = (qy / frog.stretch) * frog.size;
        anchor.phase = 2 * id + 1;
        anchor.fromX = anchor.x;
        anchor.fromY = anchor.y;
        anchor.toX = endX + lx * Math.cos(endHeading) - ly * Math.sin(endHeading);
        anchor.toY = endY + lx * Math.sin(endHeading) + ly * Math.cos(endHeading);
      }
      if (anchor.phase === 2 * id + 1) {
        // Seen from above, a lifted foot draws in a little toward the body
        // on its way to the new spot, rather than sliding straight across.
        const x = mix(anchor.fromX, anchor.toX, w);
        const y = mix(anchor.fromY, anchor.toY, w);
        const inward = Math.hypot(frog.padX - x, frog.padY - y) || 1;
        const pull = lift(w) * frog.size * 0.1;
        anchor.x = x + ((frog.padX - x) / inward) * pull;
        anchor.y = y + ((frog.padY - y) / inward) * pull;
        anchor.w = 1;
        if (w >= 1) anchor.phase = 2 * id + 2;
      }
      // The toes close as the foot comes up and spread as it is set down.
      if (w > 0 && w < 1) this.limb(frog, side, 'web', (fore ? 0.2 : 0.34) - 0.16 * lift(w), 18, dt);
      if (fore) this.limb(frog, side, 'fore', rest, 10, dt);
      else this.limb(frog, side, 'hind', rest, 10, dt);
    }
    for (const key of YAWS) frog[key] = approach(frog[key], 0, 10, dt);
    const shift = Math.sin(Math.PI * p);
    frog.stretch = approach(frog.stretch, 0.95, 12, dt);
    // Weight rocks back onto the hips for the swing.
    frog.lean = approach(frog.lean, 0.03 * shift, 12, dt);
    frog.slip = approach(frog.slip, 0, 10, dt);
    this.ridePad(frog);

    if (p >= 1) {
      frog.time = 0;
      if (frog.hopAfterTurn) {
        // Straight on into the already-chosen hop's crouch.
        frog.hopAfterTurn = false;
        frog.state = 'crouch';
        this.anchorAll(frog);
        frog.lead = angleDelta(frog.turnTo, frog.heading) >= 0 ? -1 : 1;
      } else {
        frog.state = 'sit';
        frog.idleIn = 4 + this.random() * 6 + index * 0.4;
      }
    }
  }

  private sit(frog: Frog, index: number, dt: number) {
    frog.z = 0;
    frog.stretch = approach(frog.stretch, 1 + 0.008 * Math.sin(frog.breath), 7, dt);

    // Even at rest the feet breathe at slightly different rates; this keeps
    // a held pose from reading as a symmetrical icon without making it busy.
    const gait = frog.breath * 0.72 + index * 1.91;
    for (const side of SIDES) {
      const hindEase = Math.sin(gait + side * 0.8) * 0.014;
      const foreEase = Math.sin(gait * 1.13 + side * 2.2) * 0.012;
      this.limb(frog, side, 'hind', hindEase, 4.5, dt);
      this.limb(frog, side, 'fore', foreEase, 4.5, dt);
      this.limb(frog, side, 'web', 0.22 + Math.max(0, hindEase) * 1.8, 4, dt);
    }
    for (const key of YAWS) frog[key] = approach(frog[key], 0, 6, dt);
    // The feet stay anchored (set down by the landing or the last turn step),
    // so breathing and weight shifts move the body over them, not the feet.
    // An imperceptible creep back toward the middle of the leaf, so repeated
    // turns never walk a frog to the rim. Faster would read as sliding.
    frog.padX = approach(frog.padX, 0, 0.15, dt);
    frog.padY = approach(frog.padY, 0, 0.15, dt);
    frog.lean = approach(frog.lean, 0, 6, dt);
    frog.slip = approach(frog.slip, 0, 6, dt);

    // Throat: quiet breathing, with the occasional croak (three swells).
    frog.croakIn -= dt;
    if (frog.croakIn <= 0 && frog.croak < 0) {
      frog.croak = 0;
      frog.croakIn = 8 + this.random() * 14;
    }
    let throat = 0.12 + 0.08 * Math.sin(frog.breath);
    if (frog.croak >= 0) {
      // Three swells of the throat, one per pulse of the call.
      frog.croak += dt;
      const pulse = Math.max(0, Math.sin(frog.croak * TAU * 2.4));
      throat = Math.max(throat, pulse * (frog.croak < 1.25 ? 1 : 0));
      if (frog.croak > 1.3) frog.croak = -1;
    }
    frog.throat = approach(frog.throat, throat, 20, dt);

    // The eyes follow the nearest lit firefly in front of the frog.
    const mouthX = frog.x + Math.cos(frog.heading) * frog.size * 0.45;
    const mouthY = frog.y + Math.sin(frog.heading) * frog.size * 0.45;
    const reach = frog.size * 2.6;
    let target = -1;
    let nearest = Infinity;
    let look = 0;
    // A lit fly within reach but beside or behind the frog: worth shifting
    // round for, which is the only reason a settled frog turns on its pad.
    let aside = 0;
    let asideNearest = Infinity;
    this.flies.forEach((fly, i) => {
      if (fly.respawn > 0 || fly.fade < 0.9) return;
      const dx = fly.x - mouthX;
      const dy = fly.y - mouthY;
      const d = Math.hypot(dx, dy);
      const off = angleDelta(Math.atan2(dy, dx), frog.heading);
      if (d < reach * 1.6 && Math.abs(off) < 1.5 && d < nearest) {
        nearest = d;
        look = off;
        if (d < reach && Math.abs(off) < 1.1) target = i;
      } else if (d < reach && Math.abs(off) >= 1.1 && Math.abs(off) < 1.9 && d < asideNearest) {
        asideNearest = d;
        aside = off;
      }
    });
    frog.look = approach(frog.look, clamp(look, -0.9, 0.9), 4, dt);

    // Hunting: a firefly within reach, roughly ahead, gets the tongue.
    frog.hunger -= dt;
    if (frog.hunger <= 0 && frog.tongueFly < 0) {
      if (target >= 0) {
        // The eyes and tongue can track a fly without spinning the whole
        // animal on its pad. Full body reorientation uses turnOnPad().
        frog.tongueFly = target;
        frog.time = 0;
        frog.hunger = 6 + this.random() * 8;
        frog.croak = -1;
      } else if (aside !== 0 && this.random() < 0.18) {
        // Shift round just enough to bring it into reach; the eyes and
        // tongue do the rest.
        frog.hunger = 0.6 + this.random() * 0.8;
        this.startTurn(frog, frog.heading + Math.sign(aside) * Math.min(0.75, Math.abs(aside) - 0.5));
        this.ridePad(frog);
        return;
      } else {
        frog.hunger = 0.3;
      }
    }

    // Otherwise a settled frog mostly stays settled: now and then it hops
    // or slips into the water, and it only turns as part of that.
    frog.idleIn -= dt;
    if (frog.idleIn <= 0 && frog.tongueFly < 0) {
      if (this.random() < 0.4) {
        this.chooseHop(frog, index);
      } else {
        frog.idleIn = 4 + this.random() * 6;
      }
    }
    this.ridePad(frog);
  }

  private land(frog: Frog, index: number) {
    frog.z = 0;
    frog.time = 0;
    frog.impact = 1;
    const dirX = Math.cos(frog.heading);
    const dirY = Math.sin(frog.heading);
    let target = frog.toPad;
    if (target < 0) {
      // Came down on a free pad after all? Then sit on it.
      target = this.pads.findIndex(
        (pad, padIndex) =>
          this.padFree(padIndex, index) &&
          pad.radius >= frog.size * 0.95 &&
          this.pondDistance(pad.x, pad.y) < STAGE_REACH &&
          Math.hypot(pad.x - frog.x, pad.y - frog.y) < pad.radius * 0.85,
      );
    }
    if (target >= 0 && this.padFree(target, index)) {
      this.release(index);
      const pad = this.pads[target];
      pad.occupant = index;
      frog.pad = target;
      const dx = frog.x - pad.x;
      const dy = frog.y - pad.y;
      const c = Math.cos(-pad.angle);
      const s = Math.sin(-pad.angle);
      frog.padX = dx * c - dy * s;
      frog.padY = dx * s + dy * c;
      frog.padHeading = angleDelta(frog.heading, pad.angle);
      frog.turnTo = frog.heading;
      frog.state = 'land';
      this.push(pad, frog.x, frog.y, dirX, dirY, 0.05 * (frog.size / 0.08));
      this.pressPad(pad, frog.x, frog.y, 1);
      this.emit(pad.x, pad.y, 0.45);
      return;
    }
    // Into the water: a splash, a moment under, then swimming.
    this.release(index);
    frog.state = 'swim';
    frog.submerge = Math.max(frog.submerge, 0.25);
    frog.speed = 0.08;
    frog.kickIn = 0.35;
    frog.kick = -1;
    frog.swimFor = 3 + this.random() * 4;
    frog.homeTo = -1;
    this.emit(frog.x, frog.y, 1);
    for (const pad of this.pads) {
      const d = Math.hypot(pad.x - frog.x, pad.y - frog.y);
      if (d < 0.25 && d > 0.001) {
        this.push(pad, pad.x, pad.y, (pad.x - frog.x) / d, (pad.y - frog.y) / d, 0.012 * (1 - d / 0.25));
      }
    }
  }

  private swim(frog: Frog, index: number, dt: number) {
    frog.z = 0;
    frog.throat = approach(frog.throat, 0, 8, dt);
    frog.look = approach(frog.look, 0, 4, dt);
    const diving = frog.state === 'dive';
    if (diving && frog.time > 1.7) {
      frog.state = 'swim';
      frog.time = 0;
      // Once the scare has passed it soon heads back out, for whichever pad
      // is nearest now.
      frog.swimFor = Math.min(frog.swimFor, 1.5 + this.random() * 1.5);
      frog.homeTo = -1;
    }
    // Just after a splash-down the frog is briefly deeper, then it rises to
    // swim at the surface; a dive takes it further under.
    const entering = !diving && frog.time < 0.45;
    frog.submerge = approach(frog.submerge, diving ? 1 : entering ? 0.8 : 0.4, diving ? 6 : entering ? 9 : 1.5, dt);

    // Head for the nearest free pad, and climb out when close. Once the
    // frog has started for one it keeps to it while it stays free, rather
    // than dithering between two at much the same distance.
    let target = -1;
    let best = Infinity;
    const free = this.freePads(index);
    if (frog.homeTo >= 0 && free.includes(frog.homeTo)) {
      target = frog.homeTo;
      best = Math.hypot(this.pads[target].x - frog.x, this.pads[target].y - frog.y);
    } else {
      frog.homeTo = -1;
      for (const padIndex of free) {
        const pad = this.pads[padIndex];
        const d = Math.hypot(pad.x - frog.x, pad.y - frog.y);
        if (d < best) {
          best = d;
          target = padIndex;
        }
      }
    }
    const leaving = frog.state === 'swim' && frog.time > frog.swimFor;
    // Over the last seconds of the swim the frog comes round toward the pad
    // it will climb onto, so it isn't still heading away when it's time.
    const homing = frog.state === 'swim' && target >= 0 ? smooth((frog.time - frog.swimFor + HOMING) / HOMING) : 0;
    if (!diving) {
      // A gently wandering swim first, rather than straight back out.
      // The drift is small enough that these stay straight strokes.
      const wander = frog.heading + Math.sin(frog.time * 0.6 + index * 2) * 0.32;
      if (target >= 0 && homing > 0) {
        frog.homeTo = target;
        const pad = this.pads[target];
        const toPad = Math.atan2(pad.y - frog.y, pad.x - frog.x);
        frog.turnTo = wander + angleDelta(toPad, wander) * homing;
        if (leaving && frog.kick < 0) {
          // Out onto the pad it was making for, or any free one it has
          // come up against on the way.
          for (const padIndex of free) {
            const other = this.pads[padIndex];
            if (Math.hypot(other.x - frog.x, other.y - frog.y) < other.radius + frog.size * 0.8) {
              this.startJump(frog, index, other.x, other.y, padIndex, CROUCH_CLIMB);
              return;
            }
          }
        }
      } else if (!leaving) {
        frog.turnTo = wander;
      }
      // Steer round pads that are not the destination, round other
      // swimmers, and back from the edge of the pond.
      const goalX = Math.cos(frog.turnTo);
      const goalY = Math.sin(frog.turnTo);
      let steerX = goalX;
      let steerY = goalY;
      this.pads.forEach((pad, padIndex) => {
        if (padIndex === target && homing > 0) return;
        const dx = frog.x - pad.x;
        const dy = frog.y - pad.y;
        const d = Math.hypot(dx, dy);
        const reach = pad.radius + frog.size * 1.2;
        if (d < reach && d > 0.001) {
          const push = (1 - d / reach) * 3;
          const nx = dx / d;
          const ny = dy / d;
          // Heading home past a pad that lies in the way, the frog swims
          // round it (on the side it is already heading for) rather than
          // just being held off it, which could leave it circling.
          const blocking = homing * Math.max(0, -(nx * goalX + ny * goalY));
          const side = Math.cos(frog.heading) * -ny + Math.sin(frog.heading) * nx >= 0 ? 1 : -1;
          steerX += nx * push * (1 - 0.5 * blocking) - ny * side * push * blocking;
          steerY += ny * push * (1 - 0.5 * blocking) + nx * side * push * blocking;
        }
      });
      this.frogs.forEach((other, otherIndex) => {
        if (otherIndex === index || (other.state !== 'swim' && other.state !== 'dive')) return;
        const dx = frog.x - other.x;
        const dy = frog.y - other.y;
        const d = Math.hypot(dx, dy);
        const reach = (frog.size + other.size) * 1.8;
        // A frog on its way home gives others less room (it never touches
        // them: see separateSwimmers), so it isn't turned right round.
        const give = 2.5 * (1 - 0.6 * homing);
        if (d < reach && d > 0.001) {
          steerX += (dx / d) * (1 - d / reach) * give;
          steerY += (dy / d) * (1 - d / reach) * give;
        }
      });
      const edge = this.pondDistance(frog.x, frog.y, frog.size);
      if (edge > 0.7) {
        const toCentreX = this.aspect * WATER_CX - frog.x;
        const toCentreY = WATER_CY - frog.y;
        const d = Math.hypot(toCentreX, toCentreY) || 1;
        const pull = (edge - 0.7) * 12;
        steerX += (toCentreX / d) * pull;
        steerY += (toCentreY / d) * pull;
      }
      frog.turnTo = Math.atan2(steerY, steerX);
    }

    // Steering belongs to a stroke, not to the glide: it is read from the
    // wanted heading during the recovery and frozen when the kick starts.
    // Small corrections stay straight strokes.
    const wanted = angleDelta(frog.turnTo, frog.heading);
    if (frog.kick < 0) {
      frog.steer = Math.sign(wanted) * smooth((Math.abs(wanted) - 0.26) / 0.6);
      frog.kickSide = frog.steer >= 0 ? -1 : 1;
    }
    const steer = Math.abs(frog.steer);
    // Turning, the body lags its own path a little and the legs trail to the
    // outside of the curve, so a swimming turn reads as a bend.
    frog.slip = approach(frog.slip, clamp(-frog.spin * 0.07, -0.08, 0.08), 6, dt);
    frog.lean = approach(frog.lean, 0, 6, dt);
    this.trail(frog, 7, dt);

    // Frog kick, in three parts. Recovery: both knees draw in under the body,
    // toes closed. Kick: a short, strong, mirrored extension with the webs
    // spread — this is when the speed comes. Glide: legs held long and
    // together behind, toes closed, forelegs tucked; nothing moves for most
    // of the stroke. Only a steering stroke is uneven: the outside leg drives
    // fully, the inside one a little later and shorter.
    frog.kickIn -= dt;
    if (frog.kickIn <= 0 && frog.kick < 0) {
      frog.kick = 0;
      // A frog that means to turn strokes sooner: turning comes only with
      // distance travelled, so a glide would take it round slowly.
      frog.kickIn = diving ? 0.55 : (1.15 + this.random() * 0.7) * (1 - 0.4 * steer);
      const back = frog.size * 0.9;
      const kickX = frog.x - Math.cos(frog.heading) * back;
      const kickY = frog.y - Math.sin(frog.heading) * back;
      this.emit(kickX, kickY, diving ? 0.1 : 0.16);
    }
    if (frog.kick >= 0) {
      const before = Math.min(frog.kick, KICK);
      frog.kick += dt;
      const power = diving && frog.time < 0.5 ? 0.2 : diving ? 0.14 : 0.075;
      frog.speed += (power * (1 - 0.15 * steer) * (Math.min(frog.kick, KICK) - before)) / KICK;
      for (const side of SIDES) {
        const inside = steer > 0 && side !== frog.kickSide;
        const delay = inside ? 0.04 * steer : 0;
        const reach = inside ? 1 - 0.3 * steer : 1;
        const drive = smooth((frog.kick - delay) / (KICK - 0.02));
        this.limb(frog, side, 'hind', -0.04 + drive * 1.08 * reach, 34, dt);
        this.limb(frog, side, 'web', 0.2 + drive * 0.8 * reach, 30, dt);
        this.limb(frog, side, 'fore', 0.22, 12, dt);
      }
      frog.stretch = approach(frog.stretch, 1.08, 20, dt);
      if (frog.kick > KICK_END) frog.kick = -1;
    } else if (frog.kickIn < RECOVER) {
      // A dive's recovery is squeezed into a tenth of a second.
      const quick = diving && frog.kickIn < 0.12 ? 2.6 : 1;
      for (const side of SIDES) {
        // A steering stroke recovers the outside leg a little further in.
        const outside = steer > 0 && side === frog.kickSide ? steer : 0;
        this.limb(frog, side, 'hind', -0.04 - 0.05 * outside, 11 * quick, dt);
        this.limb(frog, side, 'web', 0.08, 12 * quick, dt);
        this.limb(frog, side, 'fore', 0.2, 8, dt);
      }
      frog.stretch = approach(frog.stretch, 0.96, 7, dt);
    } else {
      // The glide: mirrored and still. The legs ease from the kick's full
      // reach to a long, bent trail and hold it; the webs fold at once.
      for (const side of SIDES) {
        this.limb(frog, side, 'hind', 0.64, 3.2, dt);
        this.limb(frog, side, 'web', 0.1, 10, dt);
        this.limb(frog, side, 'fore', 0.24, 6, dt);
      }
      frog.stretch = approach(frog.stretch, 1.03, 3, dt);
    }
    frog.speed *= Math.exp(-2.1 * dt);
    const startX = frog.x;
    const startY = frog.y;
    frog.x += Math.cos(frog.heading) * frog.speed * dt;
    frog.y += Math.sin(frog.heading) * frog.speed * dt;
    const atBank = this.pondDistance(frog.x, frog.y, frog.size * 0.8) > 1;
    this.contain(frog, frog.size * 0.8);
    // Heading only changes with distance travelled, along a curve whose
    // tightness is set by the stroke, so a slow frog cannot yaw in place.
    // Against the bank the stroke's push still counts: the feet push off it,
    // which is the only way a frog swimming into the edge can come round.
    const travelled = atBank ? frog.speed * dt : Math.hypot(frog.x - startX, frog.y - startY);
    const turn = (3 + 17 * steer) * travelled;
    frog.heading += clamp(wanted, -turn, turn);

    // Gently shove floating pads aside instead of swimming through them.
    for (const pad of this.pads) {
      const dx = pad.x - frog.x;
      const dy = pad.y - frog.y;
      const d = Math.hypot(dx, dy);
      if (d < pad.radius && d > 0.001 && pad.occupant !== -1) {
        pad.vx += (dx / d) * dt * 0.05;
        pad.vy += (dy / d) * dt * 0.05;
      }
    }
  }

  /**
   * Swimmers never stay overlapped: any contact is eased apart a little each
   * frame (lower index first), so a frog is never visibly shoved.
   */
  private separateSwimmers() {
    const frogs = this.frogs;
    for (let i = 0; i < frogs.length; i++) {
      const a = frogs[i];
      if (a.state !== 'swim' && a.state !== 'dive') continue;
      for (let j = i + 1; j < frogs.length; j++) {
        const b = frogs[j];
        if (b.state !== 'swim' && b.state !== 'dive') continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d = Math.hypot(dx, dy);
        const min = (a.size + b.size) * 0.8;
        if (d >= min) continue;
        const nx = d > 1e-5 ? dx / d : 1;
        const ny = d > 1e-5 ? dy / d : 0;
        const overlap = Math.min((min - d) / 2, 0.004);
        a.x -= nx * overlap;
        a.y -= ny * overlap;
        b.x += nx * overlap;
        b.y += ny * overlap;
        this.contain(a, a.size * 0.8);
        this.contain(b, b.size * 0.8);
      }
    }
  }

  /** Builds the frog-local leg capsules from the current pose channels. */
  private pose(frog: Frog) {
    const index = this.frogs.indexOf(frog);
    const out = this.capsules;
    let o = index * FROG_CAPSULES * 4;
    // A startle pulls the limbs in and squeezes the body.
    const flinch = frog.startle;
    frog.bodyHeading = frog.heading + frog.slip;
    frog.bodyStretch = frog.stretch * (1 - 0.05 * flinch);
    const scale = frog.size * (1 + frog.z * FROG_LIFT);
    const bc = Math.cos(-frog.bodyHeading);
    const bs = Math.sin(-frog.bodyHeading);
    for (const side of SIDES) {
      for (const fore of HIND_THEN_FORE) {
        const lengths = fore ? FORE_LENGTHS : HIND_LENGTHS;
        const folded = fore ? FORE_TUCKED : HIND_FOLDED;
        const extended = fore ? FORE_SWEPT : HIND_EXTENDED;
        const rootX = (fore ? SHOULDER[0] : HIP[0]) - frog.lean;
        const rootY = (fore ? SHOULDER[1] : HIP[1]) * side;
        let t = fore
          ? clamp((side === 1 ? frog.foreL : frog.foreR) - 0.2 * flinch, -0.6, 1)
          : clamp((side === 1 ? frog.hindL : frog.hindR) - 0.14 * flinch, -0.25, 1.15);
        // The whole chain turns about the hip (or shoulder) by the limb's yaw.
        let yaw = fore ? (side === 1 ? frog.yawFL : frog.yawFR) : side === 1 ? frog.yawHL : frog.yawHR;
        // A planted foot: aim the limb at its anchor on the leaf and adjust
        // its reach a little, so the foot stays put while the body moves.
        const anchor = frog.anchors[anchorIndex(side, fore)];
        const pad = anchor.pad >= 0 ? this.pads[anchor.pad] : null;
        if (pad && anchor.w > 0.001) {
          const ac = Math.cos(pad.angle);
          const as = Math.sin(pad.angle);
          const wx = pad.x + anchor.x * ac - anchor.y * as - frog.x;
          const wy = pad.y + anchor.x * as + anchor.y * ac - frog.y;
          const tx = (wx * bc - wy * bs) / scale / frog.bodyStretch;
          const ty = ((wx * bs + wy * bc) / scale) * frog.bodyStretch;
          const want = Math.hypot(tx - rootX, ty - rootY);
          // Reach grows with extension over the limb's range; a bisection
          // finds the extension that puts the foot back on its anchor.
          // (The foreleg's reach peaks near 0.7, so it searches below that. A
          // planted hind leg stays compact; past that the foot gives a little
          // rather than the leg being hauled out straight.)
          let lo = fore ? -0.6 : -0.25;
          let hi = fore ? 0.7 : 0.6;
          const rising = limbReach(side, fore, hi, frog.lean) >= limbReach(side, fore, lo, frog.lean);
          for (let i = 0; i < 12; i++) {
            const mid = (lo + hi) / 2;
            if (limbReach(side, fore, mid, frog.lean) < want === rising) lo = mid;
            else hi = mid;
          }
          const solved = (lo + hi) / 2;
          const end = limbEnd(side, fore, solved, yaw, frog.lean);
          const aim = angleDelta(Math.atan2(ty - rootY, tx - rootX), Math.atan2(end[1] - rootY, end[0] - rootX));
          t = mix(t, solved, anchor.w);
          yaw += clamp(aim, -1.3, 1.3) * anchor.w;
        }
        let x = rootX;
        let y = rootY;
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
      }
    }
  }

  /** Where a foot (ankle or wrist) is now, in its pad's frame. */
  private footOnPad(frog: Frog, side: number, fore: boolean) {
    const pad = this.pads[frog.pad];
    const index = this.frogs.indexOf(frog);
    const k = (side === 1 ? 0 : 5) + (fore ? 4 : 2);
    const o = (index * FROG_CAPSULES + k) * 4;
    const scale = frog.size * (1 + frog.z * FROG_LIFT);
    const lx = this.capsules[o + 2] * frog.bodyStretch * scale;
    const ly = (this.capsules[o + 3] / frog.bodyStretch) * scale;
    const c = Math.cos(frog.bodyHeading);
    const s = Math.sin(frog.bodyHeading);
    const wx = frog.x + lx * c - ly * s - pad.x;
    const wy = frog.y + lx * s + ly * c - pad.y;
    const pc = Math.cos(-pad.angle);
    const ps = Math.sin(-pad.angle);
    return [wx * pc - wy * ps, wx * ps + wy * pc] as const;
  }

  /** Pins a foot where it is now, fully or partly (weight 0 … 1). */
  private anchorFoot(frog: Frog, side: number, fore: boolean, weight = 1) {
    if (frog.pad < 0) return;
    const [x, y] = this.footOnPad(frog, side, fore);
    const anchor = frog.anchors[anchorIndex(side, fore)];
    anchor.pad = frog.pad;
    anchor.x = x;
    anchor.y = y;
    anchor.w = weight;
    anchor.phase = 0;
  }

  private anchorAll(frog: Frog) {
    for (const side of SIDES) {
      this.anchorFoot(frog, side, false);
      this.anchorFoot(frog, side, true);
    }
  }

  // ---- Input -----------------------------------------------------------------

  /**
   * Signed distance (world units, negative inside) from a point to what a frog
   * visibly occupies: its body and head, the current leg capsules and the toe
   * fans, using the same transform the renderers draw with.
   */
  frogDistance(index: number, x: number, y: number) {
    const frog = this.frogs[index];
    const scale = frog.size * (1 + frog.z * FROG_LIFT);
    const c = Math.cos(-frog.bodyHeading);
    const s = Math.sin(-frog.bodyHeading);
    const dx = (x - frog.x) / scale;
    const dy = (y - frog.y) / scale;
    const qx = (dx * c - dy * s) / frog.bodyStretch;
    const qy = (dx * s + dy * c) * frog.bodyStretch;
    const ellipse = (px: number, py: number, rx: number, ry: number) =>
      (Math.hypot(px / rx, py / ry) - 1) * Math.min(rx, ry);
    const bx = qx + frog.lean;
    let d = Math.min(ellipse(bx + 0.1, qy, 0.42, 0.28), ellipse(bx - 0.26, qy, 0.28, 0.24));
    const base = index * FROG_CAPSULES * 4;
    for (let k = 0; k < FROG_CAPSULES; k++) {
      const o = base + k * 4;
      const ax = this.capsules[o];
      const ay = this.capsules[o + 1];
      const abx = this.capsules[o + 2] - ax;
      const aby = this.capsules[o + 3] - ay;
      const part = k % 5;
      const h = clamp(((qx - ax) * abx + (qy - ay) * aby) / (abx * abx + aby * aby), 0, 1);
      d = Math.min(d, Math.hypot(qx - ax - abx * h, qy - ay - aby * h) - (part === 0 ? 0.09 : 0.05));
      // Feet: a disc covering the toe fan beyond the ankle or wrist.
      if (part === 2 || part === 4) {
        const toe = part === 2 ? HIND_TOE : FORE_TOE;
        const len = Math.hypot(abx, aby) || 1;
        const fx = ax + abx + (abx / len) * toe * 0.55;
        const fy = ay + aby + (aby / len) * toe * 0.55;
        d = Math.min(d, Math.hypot(qx - fx, qy - fy) - toe * 0.6);
      }
    }
    return d * scale * Math.min(frog.bodyStretch, 1 / frog.bodyStretch);
  }

  /** The frog under a point, drawn topmost first, within a touch tolerance. */
  private frogAt(x: number, y: number, tolerance: number, inWater: boolean) {
    let hit = -1;
    let best = Infinity;
    this.frogs.forEach((frog, index) => {
      if (frog.submerge >= 0.02 !== inWater) return;
      const d = this.frogDistance(index, x, y) - tolerance;
      if (d > 0) return;
      // Where two frogs overlap, the higher one (drawn on top) wins.
      const rank = d - frog.z;
      if (rank < best) {
        best = rank;
        hit = index;
      }
    });
    return hit;
  }

  private startleFrog(frog: Frog) {
    frog.blink = 1;
    frog.startle = 1;
    frog.startleCool = STARTLE_COOLDOWN;
  }

  /**
   * Where a tap landed and what it did. A frog that is crouching or in the air
   * can't change course, so a tap there only makes it flinch (a crouch is
   * hurried along); any tap on a frog is then ignored for a short cooldown,
   * so repeated taps never restart or reposition a movement.
   *
   * `covered`: the point is under grass or reeds drawn over the water (the
   * renderer knows; see frog-scene.ts). Only a frog on a pad or in the air,
   * drawn above the bank, can be tapped there; otherwise it's the bank.
   */
  tap(x: number, y: number, tolerance = 0.014, covered = false): TapResult {
    let index = this.frogAt(x, y, tolerance, false);
    if (index < 0 && covered) return this.tapBank(x, y);
    if (index < 0 && !this.padAt(x, y)) index = this.frogAt(x, y, tolerance, true);
    if (index >= 0) return this.tapFrog(index, x, y);
    const pad = this.padAt(x, y);
    if (pad) {
      const d = Math.hypot(x - pad.x, y - pad.y);
      const nx = d > 0.001 ? (pad.x - x) / d : 0;
      const ny = d > 0.001 ? (pad.y - y) / d : 0;
      this.push(pad, x, y, nx, ny, 0.03);
      this.pressPad(pad, x, y, 1);
      if (pad.occupant >= 0) {
        const frog = this.frogs[pad.occupant];
        frog.blink = 1;
        frog.stretch = Math.min(frog.stretch, 0.92);
      }
      return 'pad';
    }
    if (shoreDistance(x, y, this.aspect) < 0) return this.tapBank(x, y);
    return 'water';
  }

  /**
   * A tap on the bank, or on the grass or reeds hanging over the water: a
   * few fireflies (by day, midges) start up out of the grass and drift off,
   * and near the waterline the water shivers too. The water isn't touched
   * otherwise.
   */
  tapBank(x: number, y: number): TapResult {
    for (let n = 0; n < MOTES_PER_TAP; n++) {
      // Reuse a free mote, or else the oldest.
      let slot = this.motes[0];
      for (const mote of this.motes) {
        if (mote.life <= 0) {
          slot = mote;
          break;
        }
        if (mote.age / mote.life > slot.age / slot.life) slot = mote;
      }
      const a = this.random() * TAU;
      const speed = 0.025 + this.random() * 0.03;
      slot.x = x + Math.cos(a) * 0.006;
      slot.y = y + Math.sin(a) * 0.006;
      slot.vx = Math.cos(a) * speed;
      slot.vy = Math.sin(a) * speed + 0.012;
      slot.height = 0.004;
      slot.age = -n * 0.07;
      slot.life = MOTE_LIFE * (0.75 + this.random() * 0.5);
    }
    const shore = shoreDistance(x, y, this.aspect);
    if (shore > -0.05) {
      // The nearest bit of water, found along the shore's gradient.
      const e = 0.002;
      let gx = shoreDistance(x + e, y, this.aspect) - shoreDistance(x - e, y, this.aspect);
      let gy = shoreDistance(x, y + e, this.aspect) - shoreDistance(x, y - e, this.aspect);
      const g = Math.hypot(gx, gy) || 1;
      gx /= g;
      gy /= g;
      const step = 0.008 - shore;
      this.emit(x + gx * step, y + gy * step, 0.35 * (1 + shore / 0.05));
    }
    return 'bank';
  }

  // ---- Motes: rise out of the grass, drift, glow (or flicker) and are gone.
  private stepMotes(dt: number) {
    for (const mote of this.motes) {
      if (mote.life <= 0) continue;
      mote.age += dt;
      if (mote.age < 0) continue;
      if (mote.age >= mote.life) {
        mote.life = 0;
        continue;
      }
      mote.vx *= Math.exp(-1.2 * dt);
      mote.vy *= Math.exp(-1.2 * dt);
      mote.vx += (this.random() - 0.5) * 0.3 * dt;
      mote.vy += (this.random() - 0.5) * 0.3 * dt;
      mote.x += mote.vx * dt;
      mote.y += mote.vy * dt;
      mote.height = Math.min(0.09, mote.height + dt * 0.05);
    }
  }

  /** How visible a mote is now (0 … 1): it brightens as it rises, then fades. */
  moteGlow(mote: Mote) {
    if (mote.life <= 0 || mote.age <= 0) return 0;
    const t = mote.age / mote.life;
    return smooth(t / 0.15) * (1 - smooth((t - 0.45) / 0.55));
  }

  private padAt(x: number, y: number) {
    let hit: Pad | null = null;
    let best = Infinity;
    for (const pad of this.pads) {
      const d = Math.hypot(x - pad.x, y - pad.y) / pad.radius;
      if (d <= 1 && d < best) {
        best = d;
        hit = pad;
      }
    }
    return hit;
  }

  private tapFrog(index: number, x: number, y: number): TapResult {
    const frog = this.frogs[index];
    if (frog.startleCool > 0) return 'frog-startle';
    if (frog.state === 'air') {
      this.startleFrog(frog);
      return 'frog-startle';
    }
    if (frog.state === 'crouch') {
      frog.crouchFor = Math.min(frog.crouchFor, frog.time + 0.02);
      this.startleFrog(frog);
      return 'frog-startle';
    }
    const away = Math.atan2(frog.y - y, frog.x - x);
    const direction =
      Math.hypot(frog.x - x, frog.y - y) > frog.size * 0.12 ? away : frog.heading + Math.PI + (this.random() - 0.5);
    frog.startleCool = STARTLE_COOLDOWN;
    frog.blink = 1;
    if (frog.state === 'swim' || frog.state === 'dive') {
      frog.state = 'dive';
      frog.time = 0;
      // The escape stroke steers: the frog curves away as it moves rather
      // than swinging round before it goes.
      frog.turnTo = frog.heading + clamp(angleDelta(direction, frog.heading), -1.2, 1.2);
      // A very short recovery, then the escape kick.
      frog.kickIn = 0.1;
      frog.kick = -1;
      this.emit(frog.x, frog.y, 0.5);
      return 'frog';
    }
    frog.tongueFly = -1;
    frog.tongue = 0;
    this.chooseHop(frog, index, direction);
    return 'frog';
  }

  /**
   * The keyboard action: a pebble in the middle of the pond. Nearby pads
   * rock, and the frog nearest the centre reacts as if it had been tapped.
   */
  disturbCentre(): TapResult {
    const x = this.aspect * 0.55;
    const y = 0.55;
    this.emit(x, y, 0.9);
    for (const pad of this.pads) {
      const d = Math.hypot(pad.x - x, pad.y - y);
      if (d < 0.35 && d > 0.001) {
        this.push(pad, pad.x, pad.y, (pad.x - x) / d, (pad.y - y) / d, 0.02 * (1 - d / 0.35));
      }
    }
    let nearest = -1;
    let best = Infinity;
    this.frogs.forEach((frog, index) => {
      const d = Math.hypot(frog.x - x, frog.y - y);
      if (d < best) {
        best = d;
        nearest = index;
      }
    });
    if (nearest < 0) return 'water';
    const frog = this.frogs[nearest];
    // Flee from the splash; a frog right on the centre just goes backwards.
    const from =
      best > 0.01
        ? { x, y }
        : {
            x: frog.x + Math.cos(frog.heading),
            y: frog.y + Math.sin(frog.heading),
          };
    return this.tapFrog(nearest, from.x, from.y);
  }

  /** Dev check: every invariant the renderers and state machine rely on. */
  check(): string[] {
    const issues: string[] = [];
    this.pads.forEach((pad, i) => {
      if (pad.occupant >= 0) {
        const frog = this.frogs[pad.occupant];
        if (!frog || frog.pad !== i) issues.push(`pad ${i} lists frog ${pad.occupant}, which is not on it`);
      }
      if (pad.reserved >= 0 && this.frogs[pad.reserved]?.toPad !== i) {
        issues.push(`pad ${i} is reserved for frog ${pad.reserved}, which is not heading there`);
      }
    });
    this.frogs.forEach((frog, i) => {
      if (!Number.isFinite(frog.x + frog.y + frog.z + frog.heading)) issues.push(`frog ${i} has a non-finite pose`);
      if (frog.pad >= 0 && this.pads[frog.pad].occupant !== i)
        issues.push(`frog ${i} is on pad ${frog.pad} without owning it`);
      if (frog.toPad >= 0 && this.pads[frog.toPad].reserved !== i)
        issues.push(`frog ${i} targets pad ${frog.toPad} without a reservation`);
      if (
        (frog.state === 'swim' || frog.state === 'dive') &&
        this.pondDistance(frog.x, frog.y, frog.size * 0.8) > 1.001
      ) {
        issues.push(`frog ${i} is swimming outside the visible pond`);
      }
    });
    return issues;
  }
}
