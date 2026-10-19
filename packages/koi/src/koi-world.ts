// The koi's world: one kohaku in a murky pond, a few floating leaves, and
// food when a visitor drops some. Pure and seeded (spec A-1 to A-4): the
// renderers draw it, the QA soaks run it in Node.
//
// What the koi wants, in order: to get away when touched (startle), to eat
// food it has noticed (food, gulp), and otherwise to patrol the pond in
// beats and glides, hovering now and then (cruise, glide, hover). Every
// number comes from the motion sheet (koi-motion.ts).
//
// Coordinates: the picture is 1 high and `aspect` wide, y up.

import {
  angleDelta,
  approach,
  clamp,
  contain,
  createPictureEdge,
  createSwimBody,
  moveSwimBody,
  placeSwimBody,
  relaxSwimBody,
  scaleSwimBody,
  seeded,
  smooth,
  stepSecondary,
  stepSwimBody,
  turnSwimBody,
  type Emit,
  type SceneWorld,
  type SecondaryPoint,
  type SwimBody,
} from '@critters/critter-kit';
import {
  BEAT_GLIDE,
  FEED,
  FREQUENCY,
  MEANDER,
  PECTORAL,
  POSE,
  RELAX,
  SPEED,
  STARTLE,
  STRIDE,
  TURN,
  WANDER,
  WAVE,
} from './koi-motion';
import { koiDistance } from './koi-shape';

/** The picture's soft edge: a squarish oval (E-11 to E-14). */
export const PICTURE = createPictureEdge({ inset: [0.03, 0.03], power: 3.2, softness: 22 });
/** The koi's head stays inside this much of the picture; it turns away well before. */
const ARENA = 0.74;

export type KoiTap = 'koi' | 'water' | 'outside';
export type KoiState = 'cruise' | 'glide' | 'hover' | 'food' | 'gulp' | 'startle';

export interface Pellet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** 1 while floating, 0 once eaten (shrinks to nothing as it's taken). */
  left: number;
  spin: number;
  eaten: boolean;
}

export interface Leaf {
  x: number;
  y: number;
  angle: number;
  turn: number;
  vx: number;
  vy: number;
  size: number;
  kind: number;
}

const SPINE_POINTS = 17;
/** Turning on the spot with the pectorals, rad/s (guess). */
const PIVOT_RATE = 1.1;
const MAX_LEAVES = 4;

/** Body length for a picture of this aspect, world units: smaller on a narrow phone picture. */
export const bodyLengthFor = (aspect: number) => 0.15 + 0.03 * clamp((aspect - 0.85) / 0.65, 0, 1);

export class KoiWorld implements SceneWorld<KoiTap> {
  aspect: number;
  readonly koi: SwimBody;
  state: KoiState = 'cruise';
  /** Seconds in the current state, and how long it lasts. */
  time = 0;
  until = 0;
  /** Speed of the head along its heading, world units/s. */
  speed = 0;
  /** Tail beats per second while beating. */
  frequency = 1;
  beatTarget = 0;
  beatsLeft = 0;
  targetX = 0;
  targetY = 0;
  /** Seconds before it reacts to food it hasn't noticed yet (−1: nothing new). */
  noticeIn = -1;
  /** The pellet it is going for, or −1. */
  pellet = -1;
  cooldown = 0;
  /** C-start: which way it turns (1 left, −1 right) and how far. */
  startleSign = 1;
  startleTurn = 0;
  /** How much of it is done. */
  private turned = 0;
  private readonly meanderPhase: number;
  /** Drawn pose only: bank into turns (radians, + rolls the back toward the fish's left) and head lift. */
  roll = 0;
  pitch = 0;
  readonly pellets: Pellet[];
  readonly leaves: Leaf[] = [];
  /** Fin angles from the body's axis, radians: [left, right]. */
  readonly pectoralAngle: [number, number] = [PECTORAL.folded, PECTORAL.folded];
  readonly pelvicAngle: [number, number] = [0.5, 0.5];
  /** Fin tips in the body's frame (x back, y out), lagging the angle the fish sets (secondary motion). */
  private readonly finTips: [SecondaryPoint, SecondaryPoint];
  private spread = 0;
  /** Food close by but off to one side: it stops beating and pivots with its fins. */
  private pivot = 0;
  private scull = 0;
  private turnRate = 0;
  private clock = 0;
  private readonly random: () => number;
  private readonly emit: Emit;

  /** The fish's shadow on the floor: offset down and right of it (light from the upper left). */
  shadowAlpha = 0.42;
  readonly surfaceShadow = { x: 0.02, y: -0.024 };
  readonly pelletSize = 0.016;
  private readonly offset = { x: 0, y: 0 };

  constructor(aspect: number, seed = 7, emit: Emit = () => {}) {
    this.aspect = aspect;
    this.random = seeded(seed);
    this.meanderPhase = this.random() * Math.PI * 2;
    this.emit = emit;
    const length = bodyLengthFor(aspect);
    this.koi = createSwimBody(length, SPINE_POINTS, aspect * 0.3, 0.42, 0.35);
    this.koi.beat = 0.6;
    this.finTips = [0, 1].map(() => ({ x: Math.cos(PECTORAL.folded), y: Math.sin(PECTORAL.folded), vx: 0, vy: 0 })) as [
      SecondaryPoint,
      SecondaryPoint,
    ];
    this.pellets = Array.from({ length: FEED.pellets }, () => ({
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      left: 0,
      spin: 0,
      eaten: true,
    }));
    for (let i = 0; i < MAX_LEAVES; i++) {
      this.leaves.push({
        x: aspect * [0.78, 0.18, 0.62, 0.36][i],
        y: [0.78, 0.7, 0.2, 0.86][i],
        angle: this.random() * Math.PI * 2,
        turn: (this.random() - 0.5) * 0.05,
        vx: (this.random() - 0.5) * 0.004,
        vy: (this.random() - 0.5) * 0.004,
        size: 0.06 + this.random() * 0.025,
        kind: i % 2,
      });
    }
    // The first motive: a little food already floating across the pond.
    this.scatter(aspect * 0.7, 0.58, 2, false);
    this.noticeIn = 0.8;
    this.startCruise();
    // Settle into a stroke, so the first frame (and the reduced-motion still) shows a swimming fish.
    for (let i = 0; i < 90; i++) this.step(1 / 60, true);
  }

  // ---- Scene interface -------------------------------------------------------------

  resize(aspect: number, settle = false) {
    if (aspect === this.aspect || !Number.isFinite(aspect) || aspect <= 0) return;
    const k = aspect / this.aspect;
    this.aspect = aspect;
    moveSwimBody(this.koi, this.koi.x * (k - 1), 0);
    scaleSwimBody(this.koi, bodyLengthFor(aspect));
    this.keepInside(settle);
    this.targetX *= k;
    for (const p of this.pellets) {
      p.x *= k;
      this.containPoint(p, ARENA * 0.96);
    }
    for (const leaf of this.leaves) leaf.x *= k;
  }

  step(dt: number, quiet = false) {
    const step = clamp(dt, 0, 0.05);
    if (step <= 0) return;
    this.clock += step;
    this.time += step;
    this.cooldown = Math.max(0, this.cooldown - step);
    this.drift(step);
    this.decide(step, quiet);
    this.swim(step);
    this.fins(step);
  }

  tap(x: number, y: number, tolerance = 0): KoiTap {
    if (PICTURE.distance(x, y, this.aspect) > 1) return 'outside';
    if (koiDistance(this.koi.spine, this.koi.length, x, y) <= tolerance + 0.006) {
      this.startle(x, y);
      return 'koi';
    }
    this.scatter(x, y, 3, true);
    return 'water';
  }

  disturbCentre(): KoiTap {
    this.scatter(this.aspect / 2 + (this.random() - 0.5) * 0.1, 0.5 + (this.random() - 0.5) * 0.1, 3, true);
    return 'water';
  }

  check() {
    const issues: string[] = [];
    const { spine, lengths } = this.koi;
    for (let i = 0; i < spine.length; i++) {
      if (!Number.isFinite(spine[i].x + spine[i].y)) {
        issues.push('koi spine is not finite');
        break;
      }
      if (i > 0) {
        const d = Math.hypot(spine[i].x - spine[i - 1].x, spine[i].y - spine[i - 1].y);
        if (Math.abs(d - lengths[i - 1]) > lengths[i - 1] * 1e-3) issues.push('koi spine segment changed length');
      }
    }
    if (PICTURE.distance(spine[0].x, spine[0].y, this.aspect) > 0.95) issues.push("koi's head left the clear water");
    if (!Number.isFinite(this.speed + this.koi.heading)) issues.push('koi speed or heading is not finite');
    return issues;
  }

  /** Where the fish's shadow falls on the floor, relative to the fish. */
  shadowOffset() {
    this.offset.x = this.koi.length * 0.1;
    this.offset.y = -this.koi.length * 0.12;
    return this.offset;
  }

  // ---- Food and leaves -------------------------------------------------------------------

  /** Drops `count` pellets around (x, y); a ripple shows where they landed. */
  private scatter(x: number, y: number, count: number, ripple: boolean) {
    const centre = { x, y };
    this.containPoint(centre, ARENA * 0.94);
    for (let n = 0; n < count; n++) {
      let slot = this.pellets.findIndex((p) => p.eaten);
      if (slot < 0) {
        // Full: the oldest one not being eaten makes room.
        slot = this.pellets.findIndex((_, i) => i !== this.pellet);
      }
      const angle = this.random() * Math.PI * 2;
      const spread = 0.008 + this.random() * 0.016;
      Object.assign(this.pellets[slot], {
        x: centre.x + Math.cos(angle) * spread * 0.4,
        y: centre.y + Math.sin(angle) * spread * 0.4,
        vx: Math.cos(angle) * spread * 1.8,
        vy: Math.sin(angle) * spread * 1.8,
        left: 1,
        spin: this.random() * Math.PI,
        eaten: false,
      });
    }
    if (ripple) this.emit(centre.x, centre.y, 0.55);
    // It notices food after a moment, unless it's busy escaping or already eating.
    if (this.noticeIn < 0 && this.state !== 'food' && this.state !== 'gulp') {
      this.noticeIn = this.between(FEED.notice);
    }
  }

  private drift(dt: number) {
    for (const p of this.pellets) {
      if (p.eaten) {
        p.left = Math.max(0, p.left - dt * 6);
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.exp(-dt * 2.5);
      p.vy *= Math.exp(-dt * 2.5);
      p.spin += dt * 0.1;
      this.containPoint(p, ARENA * 0.96);
    }
    for (const leaf of this.leaves) {
      leaf.x += leaf.vx * dt;
      leaf.y += leaf.vy * dt;
      leaf.angle += leaf.turn * dt;
      // Leaves drifting toward the edge turn back gently.
      if (PICTURE.distance(leaf.x, leaf.y, this.aspect) > 0.86) {
        leaf.vx += (this.aspect / 2 - leaf.x) * dt * 0.01;
        leaf.vy += (0.5 - leaf.y) * dt * 0.01;
      }
    }
  }

  /** Below 1 inside `margin` of the picture. */
  private readonly region = (x: number, y: number, margin: number) => PICTURE.distance(x, y, this.aspect) / margin;

  private containPoint(point: { x: number; y: number }, within: number) {
    contain(point, this.aspect / 2, 0.5, this.region, within);
  }

  // ---- Behaviour -----------------------------------------------------------------------

  private between(range: readonly [number, number] | readonly number[]) {
    return range[0] + (range[1] - range[0]) * this.random();
  }

  private nearestPellet() {
    const head = this.koi.spine[0];
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < this.pellets.length; i++) {
      const p = this.pellets[i];
      if (p.eaten) continue;
      const d = Math.hypot(p.x - head.x, p.y - head.y);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  /** A new place to swim to, inside the clear water and not straight behind it. */
  private pickTarget() {
    const L = this.koi.length;
    for (let tries = 0; tries < 12; tries++) {
      const angle = this.koi.heading + (this.random() - 0.5) * 1.5;
      const distance = L * (2.5 + this.random() * 3);
      const x = this.koi.x + Math.cos(angle) * distance;
      const y = this.koi.y + Math.sin(angle) * distance;
      if (PICTURE.distance(x, y, this.aspect) < ARENA * 0.9) {
        this.targetX = x;
        this.targetY = y;
        return;
      }
    }
    // Nothing ahead fits: somewhere toward the middle.
    this.targetX = this.aspect / 2 + (this.random() - 0.5) * this.aspect * 0.4;
    this.targetY = 0.5 + (this.random() - 0.5) * 0.3;
  }

  private startCruise() {
    this.state = 'cruise';
    this.time = 0;
    this.beatsLeft = Math.round(this.between(BEAT_GLIDE.beats));
    if (Math.hypot(this.targetX - this.koi.x, this.targetY - this.koi.y) < this.koi.length * 0.8) this.pickTarget();
  }

  private startle(x: number, y: number) {
    const koi = this.koi;
    // Which side of the fish was touched: it turns the other way.
    const side = -Math.sin(koi.heading) * (x - koi.x) + Math.cos(koi.heading) * (y - koi.y);
    this.startleSign = side > 0 ? -1 : 1;
    this.emit(koi.spine[2].x, koi.spine[2].y, this.cooldown > 0 ? 0.45 : 1);
    if (this.cooldown > 0 && this.state === 'startle') return;
    this.state = 'startle';
    this.time = 0;
    // A second touch soon after only makes it flinch: a smaller turn, a shorter dash.
    const scale = this.cooldown > 0 ? 0.35 : 1;
    this.startleTurn = this.between(STARTLE.turn) * scale;
    this.turned = 0;
    this.until = STARTLE.burst * (0.5 + 0.5 * scale) + 0.4;
    this.cooldown = STARTLE.cooldown;
    this.pellet = -1;
  }

  private decide(dt: number, quiet: boolean) {
    const koi = this.koi;
    const L = koi.length;
    if (this.noticeIn >= 0 && this.state !== 'startle') {
      this.noticeIn -= dt;
      if (this.noticeIn < 0 && this.nearestPellet() >= 0) {
        this.state = 'food';
        this.time = 0;
      }
    }
    if (this.state !== 'food') this.pivot = 0;
    switch (this.state) {
      case 'cruise': {
        this.beatTarget = BEAT_GLIDE.cruiseBeat;
        this.frequency = FREQUENCY.cruise;
        if (Math.hypot(this.targetX - koi.x, this.targetY - koi.y) < L * 0.6) this.pickTarget();
        if (this.beatsLeft <= 0) {
          this.state = 'glide';
          this.time = 0;
          this.until = this.between(BEAT_GLIDE.glide);
        }
        break;
      }
      case 'glide': {
        this.beatTarget = 0;
        if (this.time >= this.until) {
          if (this.random() < WANDER.hoverChance) {
            this.state = 'hover';
            this.time = 0;
            this.until = this.between(WANDER.hover);
          } else this.startCruise();
        }
        break;
      }
      case 'hover': {
        this.beatTarget = 0;
        if (this.time >= this.until) {
          this.pickTarget();
          this.startCruise();
        }
        break;
      }
      case 'food': {
        this.pellet = this.nearestPellet();
        if (this.pellet < 0) {
          this.noticeIn = -1;
          this.startCruise();
          break;
        }
        // Never chase one pellet for ever: give up and come back to it later.
        if (this.time > 10) {
          this.noticeIn = this.between(FEED.notice) + 3;
          this.pickTarget();
          this.startCruise();
          break;
        }
        const p = this.pellets[this.pellet];
        const head = koi.spine[0];
        const d = Math.hypot(p.x - head.x, p.y - head.y);
        this.targetX = p.x;
        this.targetY = p.y;
        const bearing = angleDelta(Math.atan2(p.y - head.y, p.x - head.x), koi.heading);
        const off = Math.abs(bearing);
        // Close by and off to one side: brake and pivot toward it with the fins, rather than circle.
        this.pivot = d < FEED.slowWithin * L * 1.6 && off > (this.pivot ? 0.25 : 0.6) ? Math.sign(bearing) : 0;
        // Close in slowly; slower still when the food isn't ahead.
        const near = clamp(d / (FEED.slowWithin * L), 0.2, 1) * (0.4 + 0.6 * Math.max(0, Math.cos(off)));
        this.beatTarget = this.pivot ? 0 : 0.45 + 0.5 * near;
        this.frequency = clamp(
          (SPEED.approach * near) / (STRIDE * Math.max(this.beatTarget, 0.45)),
          FREQUENCY.min,
          FREQUENCY.max,
        );
        if (d < FEED.reach * L + this.pelletSize * 0.5 || (d < FEED.reach * L * 2.4 && off < 0.5)) {
          p.eaten = true;
          if (!quiet) this.emit(p.x, p.y, 0.7);
          this.state = 'gulp';
          this.time = 0;
          this.until = this.between(FEED.gulp);
        }
        break;
      }
      case 'gulp': {
        this.beatTarget = 0;
        if (this.time >= this.until) {
          if (this.nearestPellet() >= 0) {
            this.state = 'food';
            this.time = 0;
          } else {
            this.noticeIn = -1;
            this.pickTarget();
            this.startCruise();
          }
        }
        break;
      }
      case 'startle': {
        if (this.time >= this.until) {
          this.state = 'glide';
          this.time = 0;
          this.until = this.between(BEAT_GLIDE.glide) + 0.6;
          this.pickTarget();
          if (this.nearestPellet() >= 0) this.noticeIn = this.between(FEED.notice) + 1.2;
        }
        break;
      }
    }
  }

  private swim(dt: number) {
    const koi = this.koi;
    const L = koi.length;
    let heading = koi.heading;
    const oldPhase = koi.phase;

    if (this.state === 'startle') {
      this.swimStartle(dt);
      return;
    }

    // Steering: toward the target, turned back from the edge of the clear water.
    let desired = Math.atan2(this.targetY - koi.y, this.targetX - koi.x);
    if (this.state === 'cruise' || this.state === 'glide') {
      const [a, b] = MEANDER.periods;
      desired +=
        MEANDER.amplitude *
        (0.6 * Math.sin((this.clock * Math.PI * 2) / a + this.meanderPhase) +
          0.4 * Math.sin((this.clock * Math.PI * 2) / b + this.meanderPhase * 1.7));
    }
    const lookX = koi.x + Math.cos(heading) * L * 0.9;
    const lookY = koi.y + Math.sin(heading) * L * 0.9;
    const edge = PICTURE.distance(lookX, lookY, this.aspect);
    // (Food is always within reach, so going for it overrides the edge.)
    if (edge > ARENA * 0.92 && this.state !== 'food') {
      const home = Math.atan2(0.5 - koi.y, this.aspect / 2 - koi.x);
      const w = smooth(clamp((edge - ARENA * 0.92) / 0.12, 0, 1));
      desired = heading + angleDelta(desired, heading) * (1 - w) + angleDelta(home, heading) * w;
    }
    const speedBL = this.speed / L;
    const maxRate = Math.min(TURN.maxRate, speedBL / TURN.minRadius + 0.12);
    // Steer gradually: the further off course, the faster it turns (a fish that is
    // only a little off doesn't swing round at its tightest).
    const error = angleDelta(desired, heading);
    const turn = clamp(error * TURN.gain * dt, -maxRate * dt, maxRate * dt);
    this.turnRate = turn / dt;

    // Hovering, or food off to one side: turn on the spot with the fins.
    if (this.state === 'hover' || this.state === 'gulp' || this.pivot) {
      const rate = this.pivot ? PIVOT_RATE : 0.35;
      const spot = clamp(angleDelta(desired, heading), -rate * dt, rate * dt);
      if (this.pivot || (this.state === 'hover' && this.time > 0.6)) turnSwimBody(koi, spot, 0.4);
      this.turnRate = spot / dt;
      heading = koi.heading;
    } else heading += turn;

    // Thrust: beating pushes speed toward the beat's stride; gliding lets it decay.
    koi.beat = approach(koi.beat, this.beatTarget, 3, dt);
    const thrust = koi.beat * this.frequency * STRIDE * L;
    if (koi.beat > 0.05) this.speed = approach(this.speed, Math.max(thrust, this.speed * 0.98), SPEED.gain, dt);
    const tau = this.state === 'gulp' || this.pivot ? 0.35 : this.state === 'hover' ? 0.6 : SPEED.glideTau;
    if (koi.beat <= 0.05 || this.speed > thrust) this.speed *= Math.exp(-dt / tau);
    // A hovering koi isn't quite still.
    if (this.state === 'hover') this.speed = Math.max(this.speed, L * 0.015);

    stepSwimBody(koi, WAVE, dt, this.speed, heading, this.frequency);
    // Slow or still, the body eases straight instead of holding the last curve it swam.
    relaxSwimBody(koi, RELAX.rate * dt * clamp(1 - this.speed / L / RELAX.below, 0, 1));
    if (this.state === 'cruise' && koi.phase < oldPhase) this.beatsLeft--;
    this.keepInside(false);
  }

  /**
   * Spooked (STARTLE): it swishes away. The head turns hard along a real
   * curve while the tail beats fast and full, then it coasts. Every part of
   * the body only ever moves along the path and the wave, so nothing jumps.
   */
  private swimStartle(dt: number) {
    const koi = this.koi;
    const L = koi.length;
    const t = this.time;
    const share = this.startleTurn / STARTLE.turn[1];
    const burst = t < STARTLE.burst;
    // Turn away: as fast as the speed allows, until the planned turn is done.
    const turnLeft = this.startleTurn - this.turned;
    const rate = Math.min(STARTLE.turnRate, this.speed / (STARTLE.radius * L));
    const turn = Math.min(Math.max(0, turnLeft), rate * dt);
    this.turned += turn;
    this.turnRate = (this.startleSign * turn) / dt;
    koi.bend = 0;
    this.beatTarget = burst ? 1 : 0;
    this.frequency = STARTLE.frequency;
    koi.beat = approach(koi.beat, this.beatTarget, burst ? 6 : 3, dt);
    const target = SPEED.burst * L * (0.55 + 0.45 * share);
    if (burst) this.speed = approach(this.speed, target, STARTLE.gain, dt);
    else this.speed *= Math.exp(-dt / SPEED.glideTau);
    let heading = koi.heading + this.startleSign * turn;
    // Stay in the water: the dash bends away from the edge.
    const edge = PICTURE.distance(koi.x, koi.y, this.aspect);
    if (edge > ARENA * 0.9) {
      const home = Math.atan2(0.5 - koi.y, this.aspect / 2 - koi.x);
      heading += clamp(angleDelta(home, heading), -rate * dt, rate * dt);
    }
    stepSwimBody(koi, WAVE, dt, this.speed, heading, this.frequency);
    this.keepInside(false);
  }

  /** Keeps the head inside the clear water (a resize, a burst near the edge). */
  private keepInside(settle: boolean) {
    const koi = this.koi;
    const point = { x: koi.x, y: koi.y };
    contain(point, this.aspect / 2, 0.5, this.region, ARENA);
    const dx = point.x - koi.x;
    const dy = point.y - koi.y;
    if (dx === 0 && dy === 0) return;
    if (settle) placeSwimBody(koi, point.x, point.y, koi.heading);
    else moveSwimBody(koi, dx, dy);
  }

  // ---- Fins (secondary motion) ------------------------------------------------------------

  private fins(dt: number) {
    const L = this.koi.length;
    const speedBL = this.speed / L;
    // Bank into a turn; lift the head to take food at the surface.
    const roll = clamp(POSE.rollGain * this.turnRate * Math.min(speedBL, 1.5), -POSE.rollMax, POSE.rollMax);
    this.roll = approach(this.roll, roll, 4, dt);
    let lift = 0;
    if (this.state === 'gulp') lift = POSE.feedPitch;
    else if (this.state === 'food' && this.pellet >= 0) {
      const p = this.pellets[this.pellet];
      const d = Math.hypot(p.x - this.koi.spine[0].x, p.y - this.koi.spine[0].y) / L;
      lift = POSE.feedPitch * clamp(1 - d / 0.5, 0, 1);
    }
    this.pitch = approach(this.pitch, lift, 5, dt);
    // Spread to brake, hover, gulp and turn slowly; folded flat at speed.
    let spread = 0.2;
    if (this.state === 'hover' || this.state === 'gulp' || this.pivot) spread = 1;
    else if (this.state === 'glide') spread = 0.45;
    else if (this.state === 'food') spread = 0.35 + 0.5 * (1 - clamp(speedBL / SPEED.approach, 0, 1));
    if (this.state === 'startle') spread = 0;
    spread *= 1 - clamp((speedBL - 0.8) / 1.2, 0, 1);
    this.spread = approach(this.spread, spread, 4, dt);
    this.scull += dt * WANDER.scull * Math.PI * 2;
    const scull = this.state === 'hover' ? 0.22 * this.spread : 0.06 * this.spread;
    for (let k = 0; k < 2; k++) {
      const side = k === 0 ? 1 : -1;
      // A turn swings the outer fin out a little and tucks the inner one (and the spring lags it).
      const turning = clamp(-side * this.turnRate * 0.18, -0.25, 0.25);
      const angle =
        PECTORAL.folded +
        (PECTORAL.spread - PECTORAL.folded) * this.spread +
        scull * Math.sin(this.scull + k * Math.PI) +
        turning;
      const tip = this.finTips[k];
      stepSecondary(tip, Math.cos(angle), Math.sin(angle), dt, PECTORAL.stiffness, PECTORAL.damping);
      this.pectoralAngle[k] = Math.atan2(tip.y, Math.max(0.05, tip.x));
      this.pelvicAngle[k] = 0.45 + 0.25 * this.spread + 0.05 * Math.sin(this.scull * 0.7 + k * Math.PI);
    }
  }
}
