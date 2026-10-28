// The grass snake's world: one Natrix natrix on a sunlit mossy bank with
// embedded meadow stones and overhanging grass blades, weaving along its path
// with zero sideways slip (spec L-26, L-27), pausing to flick its forked
// tongue, coming over to tongue-flick where a visitor taps and rustles the
// grass, and recoiling into a brisk escape slither when touched. Pure and
// seeded (spec A-1 to A-4): the renderers draw it, the QA checks run it in Node.
//
// Coordinates: the picture is 1 high and `aspect` wide, y up.

import {
  angleDelta,
  approach,
  clamp,
  contain,
  createPictureEdge,
  createTrail,
  recordTrail,
  sampleTrail,
  seeded,
  smooth,
  type ChainPoint,
  type Emit,
  type SceneWorld,
  type Trail,
} from '@critters/critter-kit';
import { BL_IN_BW, BOUT, POSE, SCENT, SPEED, STARTLE, TONGUE, TURN, WEAVE } from './snake-motion';
import { MEADOW_STONES } from './snake-paint';
import { snakeDistance } from './snake-shape';

/** The picture's soft edge: a squarish oval over the mossy bank (E-11 to E-14). */
export const PICTURE = createPictureEdge({ inset: [0.03, 0.03], power: 3.2, softness: 22 });
/** The snake's head stays inside this fraction of the picture; it steers back before reaching the rim. */
const ARENA = 0.72;

export type SnakeTap = 'snake' | 'plank' | 'outside';
export type SnakeState = 'crawl' | 'pause' | 'investigate' | 'inspect' | 'startle';

export interface ScentSpot {
  x: number;
  y: number;
  /** 1 when tapped, fading to 0 as it is inspected. */
  strength: number;
  angle: number;
  active: boolean;
}

export interface PlankLeaf {
  x: number;
  y: number;
  angle: number;
  size: number;
  kind: number;
}

/**
 * An overhanging meadow grass blade rooted on the bank or beside a stone.
 * Drawn in the foreground `canopy` layer over the snake; sways in the breeze
 * and parts/rustles when brushed by the snake or tapped by the visitor.
 */
export interface GrassBlade {
  /** Normalized x fraction of `aspect` so resizing preserves tuft placement. */
  fx: number;
  x: number;
  y: number;
  baseAngle: number;
  length: number;
  width: number;
  /** Natural curvature along the blade, radians. */
  arch: number;
  /** 0: fresh green fescue (`grassA`); 1: warm golden-olive sedge (`grassB`). */
  kind: number;
  phase: number;
  /** Dynamic angular deflection from wind + snake contact + visitor tap rustle, radians. */
  sway: number;
  swayVel: number;
}

/** 35 spine points from snout (0) to tail tip (34): 34 segments of 1 BW each (1 BL = 34 BW). */
export const SPINE_POINTS = BL_IN_BW + 1;

/**
 * Body length for a picture of this aspect, world units.
 * Sized so the snake's midbody is ~32–36 px wide on desktop (~16 px on phone)
 * while its 2-wave S-curve stays completely inside the picture (spec L-16).
 */
export const bodyLengthFor = (aspect: number) => 0.76 + 0.18 * clamp((aspect - 0.85) / 0.65, 0, 1);

export class SnakeWorld implements SceneWorld<SnakeTap> {
  aspect: number;
  length: number;
  readonly spine: ChainPoint[];
  private readonly trail: Trail;
  state: SnakeState = 'crawl';
  /** Seconds in the current state, and when it transitions. */
  time = 0;
  until = 0;
  /** Forward speed along the head's path, world units/s. */
  speed = 0;
  /** Target crawl speed for the current bout, in BL/s. */
  crawlTargetBL = 0.11;
  /** Underlying course direction across the bank, radians. */
  course = 0.22;
  /** Instantaneous heading of the neck (course + distance-driven weave), radians. */
  neckHeading = 0.22;
  /** Instantaneous heading of the snout (neckHeading + head probe angle), radians. */
  heading = 0.22;
  /** Phase of the head weave, advancing strictly with distance travelled (L-26, L-27). */
  weavePhase = 0;
  /** Ground position of spine[1] (1 BW behind the snout, at the collar). */
  private neckX = 0;
  private neckY = 0;
  /** Small lateral head-probe angle while paused/inspecting, radians. */
  probeAngle = 0;
  private probeTarget = 0;
  /** 3D lift of the head and anterior neck off the ground (0 planted, 1 raised ~0.5 BW, P-17). */
  headLift: number = POSE.liftCrawl;
  /** Forked tongue extension (0 retracted, 1 fully extended ~1 BW ahead of snout) and lateral tip wag. */
  tongueExt = 0;
  tongueWiggle = 0;
  private tongueTimer = 0;
  private tongueDuration = 0.34;
  private nextTongueIn = 0.5;
  /** Goal coordinates on the meadow bank. */
  targetX = 0;
  targetY = 0;
  /** Seconds before reacting to a new bank tap (−1: none pending). */
  noticeIn = -1;
  /** Active scent/rustle spot index, or −1. */
  spotIndex = -1;
  cooldown = 0;
  startleSign = 1;
  startleTurn = 0;
  private startleTurned = 0;
  private readonly meanderPhase: number;
  private clock = 0;
  private readonly random: () => number;
  private readonly emit: Emit;

  readonly spots: ScentSpot[];
  readonly leaves: PlankLeaf[] = [];
  readonly grass: GrassBlade[] = [];
  /** Cast shadow opacity and base offset (light from the upper-right, shadow down-left, matching footage). */
  shadowAlpha = 0.58;
  private readonly offset = { x: 0, y: 0 };

  constructor(aspect: number, seed = 7, emit: Emit = () => {}) {
    this.aspect = aspect;
    this.random = seeded(seed);
    this.meanderPhase = this.random() * Math.PI * 2;
    this.emit = emit;
    this.length = bodyLengthFor(aspect);

    const segLen = this.length / BL_IN_BW;
    this.spine = Array.from({ length: SPINE_POINTS }, (_, i) => ({
      x: aspect * 0.5 - i * segLen,
      y: 0.5,
    }));
    this.course = 0.22;
    this.weavePhase = 0.2;
    this.neckX = aspect * 0.08;
    this.neckY = 0.38;
    this.trail = createTrail(this.length * 1.25, segLen * 0.18, this.neckX, this.neckY, this.course);

    this.spots = Array.from({ length: SCENT.maxSpots }, () => ({
      x: 0,
      y: 0,
      strength: 0,
      angle: 0,
      active: false,
    }));

    // Quiet fallen leaves resting on the soil near the path edge (E-34, E-35).
    const leafCoords = [
      [0.24, 0.59],
      [0.52, 0.28],
      [0.71, 0.66],
      [0.36, 0.69],
    ] as const;
    for (let i = 0; i < leafCoords.length; i++) {
      this.leaves.push({
        x: aspect * leafCoords[i][0],
        y: leafCoords[i][1],
        angle: this.random() * Math.PI * 2,
        size: 0.038 + this.random() * 0.012,
        kind: i % 2,
      });
    }

    // Slender overhanging sedge/fescue stems rooted along the grassy bank rim and beside
    // the path-edge cobbles. Sized to match the fine quadratic-Bezier turf blades painted
    // on the floor so they blend seamlessly into the bank while leaning out over the
    // earthen basking path (crossing over the snake's back and parting when brushed or tapped).
    const tuftSpecs: readonly [number, number, number, number, number][] = [
      // [fx, y, meanAngle, bladeCount, lengthScale]
      [0.29, 0.62, -0.92, 7, 1.05],
      [0.39, 0.66, -1.35, 6, 0.96],
      [0.44, 0.32, 1.22, 7, 1.08],
      [0.55, 0.31, 1.62, 6, 0.98],
      [0.64, 0.63, -1.28, 6, 1.02],
      [0.21, 0.35, 0.55, 6, 0.96],
      [0.75, 0.38, 2.28, 6, 0.98],
      [0.73, 0.61, -2.15, 5, 0.92],
    ];
    for (let t = 0; t < tuftSpecs.length; t++) {
      const [tfx, ty, baseDir, count, lenScale] = tuftSpecs[t];
      for (let b = 0; b < count; b++) {
        const isBasal = b >= count - 2;
        const normIdx = b / Math.max(1, count - 1) - 0.5;
        const spread = normIdx * (isBasal ? 1.45 : 0.88) + (this.random() - 0.5) * 0.22;
        const fx = tfx + (this.random() - 0.5) * 0.012;
        const y = ty + (this.random() - 0.5) * 0.012;
        const tierLen = isBasal ? 0.042 + this.random() * 0.022 : 0.072 + this.random() * 0.038;
        this.grass.push({
          fx,
          x: fx * aspect,
          y,
          baseAngle: baseDir + spread,
          length: tierLen * lenScale,
          width: (isBasal ? 0.0055 : 0.0072) + this.random() * 0.0024,
          arch: (b % 2 === 0 ? 1 : -1) * (0.22 + this.random() * 0.24),
          kind: (t + b) % 3 === 0 ? 1 : 0,
          phase: this.random() * Math.PI * 2,
          sway: 0,
          swayVel: 0,
        });
      }
    }

    // Pre-populate the trail by marching the snake forward 1.02 BL along its sinusoidal weave,
    // curving in a broad S-arc across the left-central meadow clearing so the head finishes near
    // the middle of the bank (x ≈ 0.54 * aspect) aimed smoothly toward the open right side.
    const warmupSteps = 220;
    const stepDist = (this.length * 1.02) / warmupSteps;
    for (let i = 0; i < warmupSteps; i++) {
      const p = i / warmupSteps;
      this.course = 0.48 * Math.sin(p * Math.PI * 1.65 - 0.35) + 0.12;
      this.advanceAlongWeave(stepDist);
    }
    this.keepInside(true);
    this.syncSpineFromTrail();

    // Place the initial scent/rustle spot ahead of the snout along its current course
    // so the snake glides smoothly toward it with its forked tongue extended.
    this.startCrawl();
    const aheadX = clamp(this.spine[0].x + Math.cos(this.heading) * this.length * 0.16, aspect * 0.28, aspect * 0.74);
    const aheadY = clamp(this.spine[0].y + Math.sin(this.heading) * this.length * 0.16, 0.3, 0.7);
    this.targetX = aheadX;
    this.targetY = aheadY;
    this.placeSpot(aheadX, aheadY, false);
    this.noticeIn = 0.15;
    this.triggerTongue();
    this.tongueTimer = this.tongueDuration * 0.45;
    this.updateTongue(0);
    this.updateGrass(0);
  }

  // ---- Scene interface -------------------------------------------------------------

  resize(aspect: number, settle = false) {
    if (aspect === this.aspect || !Number.isFinite(aspect) || aspect <= 0) return;
    const k = aspect / this.aspect;
    const oldLength = this.length;
    this.aspect = aspect;
    this.length = bodyLengthFor(aspect);
    const scale = this.length / oldLength;

    const oldNeckX = this.neckX;
    this.neckX *= k;
    this.shiftAndScaleTrail(this.neckX - oldNeckX, 0, scale);
    this.keepInside(settle);
    this.syncSpineFromTrail();

    this.targetX *= k;
    for (const spot of this.spots) {
      spot.x *= k;
      this.containPoint(spot, ARENA * 0.95);
    }
    for (const leaf of this.leaves) leaf.x *= k;
    for (const blade of this.grass) blade.x = blade.fx * aspect;
  }

  step(dt: number, quiet = false) {
    const step = clamp(dt, 0, 0.05);
    if (step <= 0) return;
    this.clock += step;
    this.time += step;
    this.cooldown = Math.max(0, this.cooldown - step);
    this.fadeSpots(step);
    this.decide(step, quiet);
    this.slither(step);
    this.updatePoseAndTongue(step);
    this.updateGrass(step);
  }

  tap(x: number, y: number, tolerance = 0): SnakeTap {
    if (PICTURE.distance(x, y, this.aspect) > 1) return 'outside';
    if (snakeDistance(this.spine, this.length, x, y) <= tolerance + 0.008) {
      this.startle(x, y);
      return 'snake';
    }
    this.placeSpot(x, y, true);
    return 'plank';
  }

  disturbCentre(): SnakeTap {
    const x = this.aspect * (0.44 + (this.random() - 0.5) * 0.2);
    const y = 0.5 + (this.random() - 0.5) * 0.18;
    this.placeSpot(x, y, true);
    return 'plank';
  }

  check(): string[] {
    const issues: string[] = [];
    const segLen = this.length / BL_IN_BW;
    for (let i = 0; i < this.spine.length; i++) {
      const p = this.spine[i];
      if (!Number.isFinite(p.x + p.y)) {
        issues.push('snake spine is not finite');
        break;
      }
      if (i > 0) {
        const d = Math.hypot(p.x - this.spine[i - 1].x, p.y - this.spine[i - 1].y);
        if (d > segLen * 1.05 || d < segLen * 0.45) {
          issues.push('snake spine segment stretched');
          break;
        }
      }
    }
    if (PICTURE.distance(this.spine[0].x, this.spine[0].y, this.aspect) > 0.96) {
      issues.push("snake's head left the picture");
    }
    if (!Number.isFinite(this.speed + this.heading + this.course)) {
      issues.push('snake speed or heading is not finite');
    }
    return issues;
  }

  /** Base shadow offset on the ground (key light from upper-right -> shadow down-left, P-17). */
  shadowOffset() {
    this.offset.x = -this.length * 0.011;
    this.offset.y = -this.length * 0.013;
    return this.offset;
  }

  // ---- Spots, grass rustle, and arena containment ----------------------------------

  private readonly region = (x: number, y: number, margin: number) => PICTURE.distance(x, y, this.aspect) / margin;

  private containPoint(point: { x: number; y: number }, within: number) {
    contain(point, this.aspect / 2, 0.5, this.region, within);
  }

  private between(range: readonly [number, number]): number {
    return range[0] + (range[1] - range[0]) * this.random();
  }

  private rustleGrassAt(x: number, y: number, radius: number, impulse: number) {
    for (const b of this.grass) {
      const midX = b.x + Math.cos(b.baseAngle) * b.length * 0.55;
      const midY = b.y + Math.sin(b.baseAngle) * b.length * 0.55;
      const d = Math.hypot(midX - x, midY - y);
      if (d < radius) {
        const away = Math.atan2(midY - y, midX - x);
        const sign = angleDelta(away, b.baseAngle) >= 0 ? 1 : -1;
        const falloff = 1 - d / radius;
        b.swayVel += sign * impulse * falloff;
      }
    }
  }

  private placeSpot(x: number, y: number, ring: boolean) {
    const pt = { x, y };
    this.containPoint(pt, ARENA * 0.94);
    let slot = this.spots.findIndex((s) => !s.active);
    if (slot < 0) slot = this.spots.findIndex((_, i) => i !== this.spotIndex);
    if (slot < 0) slot = 0;
    Object.assign(this.spots[slot], {
      x: pt.x,
      y: pt.y,
      strength: 1,
      angle: this.random() * Math.PI * 2,
      active: true,
    });
    if (ring) {
      this.emit(pt.x, pt.y, 0.65);
      this.rustleGrassAt(pt.x, pt.y, 0.28, 3.6);
    }
    if (this.state !== 'startle' && this.noticeIn < 0) {
      this.noticeIn = this.between(SCENT.notice);
    }
  }

  private fadeSpots(dt: number) {
    for (let i = 0; i < this.spots.length; i++) {
      const s = this.spots[i];
      if (!s.active) {
        s.strength = Math.max(0, s.strength - dt * 2.2);
        continue;
      }
      const rate = this.state === 'inspect' && this.spotIndex === i ? 0.55 : 0.045;
      s.strength = Math.max(0, s.strength - dt * rate);
      if (s.strength <= 0.05) s.active = false;
    }
  }

  private nearestSpot(): number {
    const head = this.spine[0];
    let best = -1;
    let bestD = Infinity;
    for (let i = 0; i < this.spots.length; i++) {
      const s = this.spots[i];
      if (!s.active) continue;
      const d = Math.hypot(s.x - head.x, s.y - head.y);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  // ---- Behaviour state machine -----------------------------------------------------

  private pickWanderGoal() {
    const centerAngle = Math.atan2(0.5 - this.neckY, this.aspect / 2 - this.neckX);
    const edgeDist = PICTURE.distance(this.neckX, this.neckY, this.aspect);
    const baseAngle = edgeDist > 0.38 ? centerAngle : this.course;
    for (let tries = 0; tries < 8; tries++) {
      const a = baseAngle + (this.random() - 0.5) * 1.15;
      const d = (0.38 + this.random() * 0.36) * this.length;
      const gx = clamp(this.neckX + Math.cos(a) * d, this.aspect * 0.22, this.aspect * 0.78);
      const gy = clamp(this.neckY + Math.sin(a) * d, 0.24, 0.76);
      if (PICTURE.distance(gx, gy, this.aspect) < ARENA * 0.84) {
        this.targetX = gx;
        this.targetY = gy;
        return;
      }
    }
    this.targetX = this.aspect * (0.36 + this.random() * 0.28);
    this.targetY = 0.36 + this.random() * 0.28;
  }

  private startCrawl() {
    this.state = 'crawl';
    this.time = 0;
    this.until = this.between(BOUT.crawl);
    this.crawlTargetBL = this.between(SPEED.crawl);
    this.probeTarget = 0;
    this.pickWanderGoal();
  }

  private startPause() {
    this.state = 'pause';
    this.time = 0;
    this.until = this.between(BOUT.pause);
    this.probeTarget = (this.random() - 0.5) * 2 * POSE.probeMax;
    this.triggerTongue();
  }

  private startInvestigate(index: number) {
    this.state = 'investigate';
    this.spotIndex = index;
    this.time = 0;
    this.until = 8;
    this.probeTarget = 0;
    this.triggerTongue();
  }

  private startInspect(index: number) {
    this.state = 'inspect';
    this.spotIndex = index;
    this.time = 0;
    this.until = this.between(SCENT.inspect);
    this.probeTarget = (this.random() - 0.5) * POSE.probeMax;
    this.triggerTongue();
  }

  private startle(tapX: number, tapY: number) {
    const head = this.spine[0];
    if (this.cooldown > 0) {
      this.speed = Math.max(this.speed, SPEED.investigate * this.length);
      this.triggerTongue();
      this.rustleGrassAt(head.x, head.y, 0.22, 2.2);
      return;
    }
    const away = Math.atan2(head.y - tapY, head.x - tapX);
    const diff = angleDelta(away, this.course);
    this.startleSign = diff >= 0 ? 1 : -1;
    this.startleTurn = this.between(STARTLE.turn);
    this.startleTurned = 0;
    this.state = 'startle';
    this.time = 0;
    this.until = STARTLE.burst;
    this.cooldown = STARTLE.cooldown;
    this.probeTarget = 0;
    this.spotIndex = -1;
    this.emit(head.x, head.y, 0.75);
    this.rustleGrassAt(head.x, head.y, 0.26, 4.2);
  }

  private decide(dt: number, quiet: boolean) {
    if (this.noticeIn >= 0) {
      this.noticeIn -= dt;
      if (this.noticeIn < 0 && this.state !== 'startle') {
        const next = this.nearestSpot();
        if (next >= 0) this.startInvestigate(next);
      }
    }

    switch (this.state) {
      case 'crawl': {
        if (Math.hypot(this.targetX - this.neckX, this.targetY - this.neckY) < this.length * 0.12) {
          this.pickWanderGoal();
        }
        if (this.time >= this.until) {
          this.startPause();
        }
        break;
      }
      case 'pause': {
        if (this.time > this.until * 0.5 && Math.abs(this.probeAngle - this.probeTarget) < 0.03) {
          this.probeTarget = -this.probeTarget * 0.7;
        }
        if (this.time >= this.until) {
          const next = this.nearestSpot();
          if (next >= 0) this.startInvestigate(next);
          else this.startCrawl();
        }
        break;
      }
      case 'investigate': {
        const spot = this.spots[this.spotIndex];
        if (!spot || !spot.active) {
          this.spotIndex = -1;
          this.startCrawl();
          break;
        }
        this.targetX = spot.x;
        this.targetY = spot.y;
        const dist = Math.hypot(spot.x - this.spine[0].x, spot.y - this.spine[0].y);
        if (dist <= SCENT.reach * this.length) {
          if (!quiet) {
            this.emit(spot.x, spot.y, 0.35);
            this.rustleGrassAt(spot.x, spot.y, 0.2, 2.0);
          }
          this.startInspect(this.spotIndex);
        } else if (this.time >= this.until) {
          spot.active = false;
          this.startPause();
        }
        break;
      }
      case 'inspect': {
        if (this.time >= this.until) {
          const spot = this.spots[this.spotIndex];
          if (spot) spot.active = false;
          this.spotIndex = -1;
          const next = this.nearestSpot();
          if (next >= 0) this.startInvestigate(next);
          else this.startCrawl();
        }
        break;
      }
      case 'startle': {
        if (this.time >= this.until) {
          this.startPause();
        }
        break;
      }
    }
  }

  // ---- Kinematics: path-following lateral undulation (spec L-26, L-27) -------------

  /** Advances `(neckX, neckY)` by `ds` world units along the distance-driven sinusoidal weave. */
  private advanceAlongWeave(ds: number) {
    if (ds <= 1e-7) return;
    const L = this.length;
    this.weavePhase += (ds / (WEAVE.wavelength * L)) * Math.PI * 2;
    const weave =
      WEAVE.amplitude * Math.sin(this.weavePhase) + WEAVE.secondary * Math.sin(this.weavePhase * 0.5 + 0.85);
    this.neckHeading = this.course + weave;
    this.neckX += Math.cos(this.neckHeading) * ds;
    this.neckY += Math.sin(this.neckHeading) * ds;
    recordTrail(this.trail, this.neckX, this.neckY);
  }

  private shiftAndScaleTrail(dx: number, dy: number, scale = 1) {
    const { x, y } = this.trail;
    for (let i = 0; i < x.length; i++) {
      x[i] = this.neckX + (x[i] + dx - this.neckX) * scale;
      y[i] = this.neckY + (y[i] + dy - this.neckY) * scale;
    }
    (this.trail as { spacing: number }).spacing *= scale;
  }

  /** Samples `spine[1..34]` strictly along `this.trail` and places `spine[0]` ahead by `1 BW`. */
  private syncSpineFromTrail() {
    const segLen = this.length / BL_IN_BW;
    this.spine[1].x = this.neckX;
    this.spine[1].y = this.neckY;
    for (let i = 2; i < this.spine.length; i++) {
      sampleTrail(this.trail, this.neckX, this.neckY, (i - 1) * segLen, this.spine[i]);
    }
    this.heading = this.neckHeading + this.probeAngle;
    this.spine[0].x = this.neckX + Math.cos(this.heading) * segLen;
    this.spine[0].y = this.neckY + Math.sin(this.heading) * segLen;
  }

  private slither(dt: number) {
    const L = this.length;

    // 1. Target speed by state: zero when paused/inspecting, surged crawl/investigate/burst when moving.
    let targetSpeed = 0;
    if (this.state === 'crawl') {
      const progress = clamp(this.time / Math.max(0.1, this.until), 0, 1);
      const surge = 0.48 + 0.98 * Math.pow(Math.sin(progress * Math.PI), 2.1);
      targetSpeed = this.crawlTargetBL * surge * L;
    } else if (this.state === 'investigate') {
      const spot = this.spots[this.spotIndex];
      const d = spot ? Math.hypot(spot.x - this.spine[0].x, spot.y - this.spine[0].y) / L : 1;
      targetSpeed = SPEED.investigate * L * clamp(d / 0.16, 0.35, 1);
    } else if (this.state === 'startle') {
      targetSpeed = SPEED.burst * L;
    }

    if (targetSpeed > this.speed) {
      const gain = this.state === 'startle' ? SPEED.accelGain * 2.4 : SPEED.accelGain;
      this.speed = approach(this.speed, targetSpeed, gain, dt);
    } else {
      // Terrestrial snakes stop quickly on dry ground without an aquatic glide.
      this.speed *= Math.exp(-dt / SPEED.stopTau);
      if (this.speed < L * 0.002) this.speed = 0;
    }

    // 2. Course steering (only while advancing; a paused snake does not slide its course).
    if (this.speed > L * 0.004) {
      if (this.state === 'startle') {
        const left = this.startleTurn - this.startleTurned;
        const stepTurn = Math.min(Math.max(0, left), STARTLE.turnRate * dt);
        this.startleTurned += stepTurn;
        this.course += this.startleSign * stepTurn;
      } else {
        let desired = Math.atan2(this.targetY - this.neckY, this.targetX - this.neckX);
        if (this.state === 'crawl') {
          const [p1, p2] = TURN.meanderPeriods;
          desired +=
            TURN.meanderAmp *
            (0.65 * Math.sin((this.clock * Math.PI * 2) / p1 + this.meanderPhase) +
              0.35 * Math.sin((this.clock * Math.PI * 2) / p2 + this.meanderPhase * 1.6));
        }
        const err = angleDelta(desired, this.course);
        const maxTurn = TURN.maxCourseRate * dt;
        this.course += clamp(err * TURN.gain * dt, -maxTurn, maxTurn);
      }

      // Arena boundary reflection: steer smoothly inward before the snout nears the picture edge (L-16).
      const lookX = this.neckX + Math.cos(this.course) * L * 0.2;
      const lookY = this.neckY + Math.sin(this.course) * L * 0.2;
      const edge = PICTURE.distance(lookX, lookY, this.aspect);
      if (edge > ARENA * 0.85) {
        const home = Math.atan2(0.5 - this.neckY, this.aspect / 2 - this.neckX);
        const w = smooth(clamp((edge - ARENA * 0.85) / 0.16, 0, 1));
        const maxWallTurn = TURN.maxCourseRate * (0.8 + 0.9 * w) * dt;
        this.course += clamp(angleDelta(home, this.course) * 2.2 * dt, -maxWallTurn, maxWallTurn);
      }
    }

    // 3. Advance the neck along the weave in small substeps and sample the body from the trail.
    const totalDist = this.speed * dt;
    if (totalDist > 0) {
      const maxStep = L * 0.003;
      const steps = Math.max(1, Math.ceil(totalDist / maxStep));
      const subDist = totalDist / steps;
      for (let s = 0; s < steps; s++) {
        this.advanceAlongWeave(subDist);
      }
      this.keepInside(false);
    }

    this.syncSpineFromTrail();
  }

  private keepInside(settle: boolean) {
    const pt = { x: this.neckX, y: this.neckY };
    contain(pt, this.aspect / 2, 0.5, this.region, ARENA);
    let dx = pt.x - this.neckX;
    let dy = pt.y - this.neckY;

    // Also ensure the posterior body and tail stay inside the picture (spec L-16).
    this.syncSpineFromTrail();
    for (let i = 0; i < this.spine.length; i += 3) {
      const sp = { x: this.spine[i].x + dx, y: this.spine[i].y + dy };
      contain(sp, this.aspect / 2, 0.5, this.region, 0.86);
      dx += sp.x - (this.spine[i].x + dx);
      dy += sp.y - (this.spine[i].y + dy);
    }

    if (dx === 0 && dy === 0) return;
    this.neckX += dx;
    this.neckY += dy;
    this.shiftAndScaleTrail(dx, dy, 1);
    if (settle) {
      for (const p of this.spine) {
        p.x += dx;
        p.y += dy;
      }
    }
  }

  // ---- 3D head lift, forked tongue flicks, and grass sway/parting ------------------

  private triggerTongue() {
    this.tongueTimer = 0.001;
    this.tongueDuration = this.between(TONGUE.duration);
    const interval = this.state === 'pause' || this.state === 'inspect' ? TONGUE.pauseInterval : TONGUE.crawlInterval;
    this.nextTongueIn = this.between(interval);
  }

  private updateTongue(dt: number) {
    if (this.tongueTimer > 0) {
      this.tongueTimer += dt;
      const p = this.tongueTimer / this.tongueDuration;
      if (p >= 1) {
        this.tongueTimer = 0;
        this.tongueExt = 0;
        this.tongueWiggle = 0;
      } else {
        const env = Math.sin(p * Math.PI);
        const osc = 0.82 + 0.18 * Math.sin(p * Math.PI * 2 * TONGUE.oscillations);
        this.tongueExt = clamp(env * osc * 1.15, 0, 1);
        this.tongueWiggle = 0.24 * Math.sin(p * Math.PI * 2 * TONGUE.oscillations);
      }
    } else {
      this.nextTongueIn -= dt;
      if (this.nextTongueIn <= 0) {
        this.triggerTongue();
      }
    }
  }

  private updatePoseAndTongue(dt: number) {
    const activeProbe = this.state === 'pause' || this.state === 'inspect' ? this.probeTarget : 0;
    this.probeAngle = approach(this.probeAngle, activeProbe, POSE.probeGain, dt);

    // 3D head/neck lift: rises when paused, inspecting a spot, or crossing a meadow stone rim (P-17).
    let targetLift: number = POSE.liftCrawl;
    if (this.state === 'inspect') targetLift = POSE.liftInspect;
    else if (this.state === 'pause') targetLift = POSE.liftPause;
    const headX = this.spine[0].x;
    const headY = this.spine[0].y;
    for (const st of MEADOW_STONES) {
      const dx = (headX - st.fx * this.aspect) / st.rx;
      const dy = (headY - st.y) / st.ry;
      const d = Math.hypot(dx, dy);
      if (d < 1.35) {
        targetLift = Math.max(targetLift, 0.62);
      }
    }
    this.headLift = approach(this.headLift, targetLift, 4.2, dt);

    this.updateTongue(dt);
    const segLen = this.length / BL_IN_BW;
    this.heading = this.neckHeading + this.probeAngle;
    this.spine[0].x = this.neckX + Math.cos(this.heading) * segLen;
    this.spine[0].y = this.neckY + Math.sin(this.heading) * segLen;
  }

  private updateGrass(dt: number) {
    const moving = this.speed > this.length * 0.01;
    for (const b of this.grass) {
      // Gentle meadow breeze sway + spring-damper recovery from snake or tap rustle.
      const wind = 0.042 * Math.sin(this.clock * 1.55 + b.phase) + 0.018 * Math.cos(this.clock * 2.7 + b.phase * 1.7);
      let targetSway = wind;

      // Physical parting when the snake's body brushes under/through the grass blade.
      const midX = b.x + Math.cos(b.baseAngle) * b.length * 0.52;
      const midY = b.y + Math.sin(b.baseAngle) * b.length * 0.52;
      const dist = snakeDistance(this.spine, this.length, midX, midY);
      if (dist < 0.032) {
        const push = clamp(1 - dist / 0.032, 0, 1);
        const dir = b.arch >= 0 ? 1 : -1;
        targetSway += dir * push * 0.28;
        if (moving && dt > 0) {
          b.swayVel += dir * push * 1.8 * dt;
        }
      }

      if (dt > 0) {
        const force = (targetSway - b.sway) * 26 - b.swayVel * 5.2;
        b.swayVel += force * dt;
        b.sway = clamp(b.sway + b.swayVel * dt, -0.55, 0.55);
      } else {
        b.sway = targetSway;
      }
    }
  }
}
