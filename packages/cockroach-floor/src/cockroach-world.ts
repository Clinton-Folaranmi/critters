// One cockroach (Nauphoeta cinerea) on a plain floor, seen from above, and
// the crumbs that give it a reason to move. Units are canvas-height; y points
// up; x runs from 0 to the canvas aspect ratio. Pure: no DOM, seeded, steps in
// Node (spec A-1, A-3).
//
// It walks the measured alternating tripod (cockroach-motion.ts): the kit's
// gait clock, advanced by the distance the body travels, says which feet are
// down; a planted foot is pinned to the floor and the leg is solved to reach
// it every frame (C-1); a lifted foot is carried on a step arc to where it
// will land (C-3). Behaviour is a state machine — rest, walk, turn, feed,
// flee — and nothing moves without a motive (P-2): food, a threat, or a search
// for food after a long rest.

import {
  advanceGait,
  angleDelta,
  approach,
  capsuleDistance,
  clamp,
  contain,
  createGaitState,
  createPictureEdge,
  dutyAt,
  isStance,
  limbEnd,
  poseChain,
  seeded,
  smooth,
  solvePin,
  stepArc,
  strideLengthAt,
  swingProgress,
  type GaitState,
} from '@critters/critter-kit';
import {
  ANTENNA,
  BEHAVIOUR,
  FOLLOW,
  FOOTHOLD,
  GAIT,
  LEGS,
  REACH,
  REFLEX,
  SPEED,
  STRIDE_YAW,
  TIP_OUT,
  TURN,
} from './cockroach-motion';
import { ANTENNA_RADIUS, LEG_RADII, bodyDistance } from './cockroach-shape';

export type RoachState = 'rest' | 'walk' | 'turn' | 'feed' | 'flee';
export type TapResult = 'roach' | 'roach-startle' | 'floor' | 'outside';

/** Legs in the order the capsule buffer stores them. */
export const LEG_NAMES = ['L1', 'L2', 'L3', 'R1', 'R2', 'R3'] as const;
export type LegName = (typeof LEG_NAMES)[number];
/** Capsules drawn per leg (femur, tibia, tarsus) and per antenna. */
export const LEG_SEGMENTS = 3;
export const ANTENNA_SEGMENTS = ANTENNA.segments;
/** Every capsule: 6 legs × 3, then 2 antennae × 8. */
export const CAPSULES = LEG_NAMES.length * LEG_SEGMENTS + 2 * ANTENNA_SEGMENTS;
export const MAX_CRUMBS = 4;

/** The picture: a soft squarish oval; the cockroach keeps inside 0.82 of it. */
export const PICTURE = createPictureEdge({ inset: [0.04, 0.04], power: 4, softness: 18 });
const ARENA = 0.82;

export interface Foot {
  /** Planted: the foot's place on the floor (world units). Swinging: where it is now. */
  x: number;
  y: number;
  planted: boolean;
  /** Bumped at every touch-down, so a check can tell one planted stretch from the next. */
  stance: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  /** A reflex step under way (C-5): its progress 0 … 1, or −1. */
  reflex: number;
}

export interface Crumb {
  x: number;
  y: number;
  /** 1 fresh … 0 eaten; 0 also means the slot is free. */
  left: number;
}

export interface Roach {
  x: number;
  y: number;
  heading: number;
  /** Heading plus the small once-per-stride yaw; what is drawn. */
  bodyHeading: number;
  /** How fast the heading is turning, rad/s (eased: TURN.accel). */
  turnRate: number;
  /** BL/s, eased toward the behaviour's wish. */
  speed: number;
  /** One body length, world units. */
  size: number;
  state: RoachState;
  /** The moving state a turn on the spot returns to. */
  resume: RoachState;
  time: number;
  /** How long the current state lasts (rest, feed, flee). */
  until: number;
  targetX: number;
  targetY: number;
  /** The crumb being walked to or eaten, or -1. */
  crumb: number;
  gait: GaitState;
  feet: Foot[];
  /** Seconds since it last ate or searched; past BEHAVIOUR.searchAfter it searches. */
  hungry: number;
  searchAt: number;
  startle: number;
  cooldown: number;
  /** Antenna sweep phase and the slow drift of where they point. */
  antennaPhase: number;
  antennaAim: number;
}

const scratch: [number, number] = [0, 0];

export class CockroachWorld {
  aspect: number;
  readonly roach: Roach;
  readonly crumbs: Crumb[];
  /** Capsules in the roach's own frame (BL): x0, y0, x1, y1 each; legs then antennae. */
  readonly capsules = new Float32Array(CAPSULES * 4);
  private readonly random: () => number;
  private readonly region = (x: number, y: number, margin: number) => PICTURE.distance(x, y, this.aspect) / margin;

  constructor(aspect: number, seed = 5) {
    this.aspect = aspect;
    this.random = seeded(seed);
    const size = 0.19;
    this.roach = {
      x: aspect * 0.3,
      y: 0.42,
      heading: 0.25,
      bodyHeading: 0.25,
      turnRate: 0,
      speed: 0,
      size,
      state: 'rest',
      resume: 'walk',
      time: 0,
      until: 1.2,
      targetX: 0,
      targetY: 0,
      crumb: -1,
      gait: createGaitState(0.13),
      feet: LEG_NAMES.map(() => ({
        x: 0,
        y: 0,
        planted: true,
        stance: 0,
        fromX: 0,
        fromY: 0,
        toX: 0,
        toY: 0,
        reflex: -1,
      })),
      hungry: 0,
      searchAt: this.between(BEHAVIOUR.searchAfter),
      startle: 0,
      cooldown: 0,
      antennaPhase: 0,
      antennaAim: 0,
    };
    this.crumbs = Array.from({ length: MAX_CRUMBS }, () => ({ x: 0, y: 0, left: 0 }));
    // Food across the floor: the first motive.
    this.dropCrumb(aspect * 0.72, 0.6);
    this.plantAll();
    this.pose();
  }

  private between([a, b]: readonly [number, number]) {
    return a + (b - a) * this.random();
  }

  /** Each foot planted at its touch-down place, as if it had just stopped walking. */
  private plantAll() {
    const r = this.roach;
    LEG_NAMES.forEach((name, k) => {
      const [fx, fy] = this.footholdLocal(name, 0);
      const [wx, wy] = this.toWorld(fx, fy);
      Object.assign(r.feet[k], { x: wx, y: wy, planted: true, stance: r.feet[k].stance + 1 });
    });
  }

  /** A leg's touch-down place in the body frame, BL, shifted forward by `ahead`. */
  private footholdLocal(name: LegName, ahead: number) {
    const side = name[0] === 'L' ? 1 : -1;
    const [fx, fy] = FOOTHOLD[name[1] as '1' | '2' | '3'];
    // Standing still, the stance centres on the foothold rather than starting there.
    scratch[0] = fx + ahead;
    scratch[1] = (fy + TIP_OUT) * side;
    return scratch;
  }

  /** A point in the roach's frame (BL, x toward the head) in world units. */
  private toWorld(lx: number, ly: number, heading = this.roach.heading) {
    const r = this.roach;
    const c = Math.cos(heading);
    const s = Math.sin(heading);
    return [r.x + (lx * c - ly * s) * r.size, r.y + (lx * s + ly * c) * r.size] as const;
  }

  // ---- Input --------------------------------------------------------------------

  private dropCrumb(x: number, y: number) {
    let slot = this.crumbs.findIndex((c) => c.left <= 0);
    if (slot < 0) {
      // Full: the crumb it isn't eating goes first.
      slot = this.crumbs.findIndex((_, i) => i !== this.roach.crumb);
    }
    Object.assign(this.crumbs[slot], { x, y, left: 1 });
    return slot;
  }

  /**
   * A tap. On the cockroach (its legs and antennae count, B-2): it runs from
   * the tap, unless it is already running or has just been startled, when it
   * only flinches (H-3). On the floor inside the picture: a crumb drops there.
   */
  tap(x: number, y: number, tolerance = 0.012): TapResult {
    if (PICTURE.distance(x, y, this.aspect) > 1) return 'outside';
    const r = this.roach;
    if (this.roachDistance(x, y) <= tolerance) {
      if (r.state === 'flee' || r.cooldown > 0) {
        r.startle = 1;
        return 'roach-startle';
      }
      this.flee(x, y);
      return 'roach';
    }
    this.dropCrumb(x, y);
    return 'floor';
  }

  /** The keyboard's central action: a crumb in the middle of the floor. */
  disturbCentre(): TapResult {
    this.dropCrumb(this.aspect / 2, 0.5);
    return 'floor';
  }

  private flee(fromX: number, fromY: number) {
    const r = this.roach;
    let away = Math.atan2(r.y - fromY, r.x - fromX);
    if (!Number.isFinite(away) || (r.x === fromX && r.y === fromY)) away = r.heading;
    // Run for the arena's open side if straight away would hit the edge.
    const reach = 2.5 * r.size;
    for (let k = 0; k < 8; k++) {
      const a = away + (k % 2 ? 1 : -1) * Math.ceil(k / 2) * 0.45;
      const tx = r.x + Math.cos(a) * reach;
      const ty = r.y + Math.sin(a) * reach;
      if (this.region(tx, ty, ARENA) <= 1) {
        away = a;
        break;
      }
    }
    this.setTarget(r.x + Math.cos(away) * reach, r.y + Math.sin(away) * reach);
    r.crumb = -1;
    r.state = 'flee';
    r.time = 0;
    r.until = this.between(BEHAVIOUR.flee);
    r.startle = 1;
    r.cooldown = BEHAVIOUR.tapCooldown;
    // An escape turns first, then runs.
    if (Math.abs(angleDelta(away, r.heading)) > TURN.straightAhead) this.pivot();
  }

  /** Turns on the spot (stepping), then carries on in the current moving state. */
  private pivot() {
    const r = this.roach;
    if (r.state === 'turn') return;
    r.resume = r.state;
    r.state = 'turn';
  }

  private setTarget(x: number, y: number) {
    const point = { x, y };
    contain(point, this.aspect / 2, 0.5, this.region, ARENA * 0.92);
    this.roach.targetX = point.x;
    this.roach.targetY = point.y;
  }

  resize(aspect: number, settle = false) {
    if (aspect === this.aspect) return;
    const scale = aspect / this.aspect;
    this.aspect = aspect;
    const r = this.roach;
    r.x *= scale;
    r.targetX *= scale;
    for (const c of this.crumbs) c.x *= scale;
    const point = { x: r.x, y: r.y };
    contain(point, aspect / 2, 0.5, this.region, ARENA);
    const dx = point.x - r.x;
    const dy = point.y - r.y;
    r.x = point.x;
    r.y = point.y;
    // The feet go with the body: a resize moves the picture, not the animal's stance.
    for (const f of r.feet) {
      f.x = f.x * scale + dx;
      f.y += dy;
      f.fromX = f.fromX * scale + dx;
      f.toX = f.toX * scale + dx;
    }
    if (settle) this.plantAll();
    this.pose();
  }

  // ---- Behaviour ------------------------------------------------------------------

  step(deltaSeconds: number) {
    const dt = Math.min(deltaSeconds, 0.05);
    if (dt <= 0) return;
    const r = this.roach;
    r.time += dt;
    r.hungry += dt;
    r.cooldown = Math.max(0, r.cooldown - dt);
    r.startle = approach(r.startle, 0, 6, dt);
    r.antennaPhase += (dt / ANTENNA.sweepPeriod) * Math.PI * 2;
    this.decide();

    // Speed eases toward what the state wants; heading turns toward the target.
    const wantSpeed = r.state === 'flee' ? SPEED.run : r.state === 'walk' ? SPEED.walk : 0;
    const off = angleDelta(Math.atan2(r.targetY - r.y, r.targetX - r.x), r.heading);
    let moving = r.state === 'walk' || r.state === 'flee';
    // Walking to a target well behind: turn on the spot first, stepping (L-6), rather than
    // walking a wide loop.
    if (r.state === 'walk' && Math.abs(off) > Math.PI / 2 && r.speed < SPEED.walk * 0.6) this.pivot();
    const pivoting = r.state === 'turn';
    // The turn rate eases toward what the state allows, slowing as the heading nears the target
    // (and never passing it within a frame, which would swing it back and forth).
    const most = pivoting ? (r.resume === 'flee' ? TURN.escapeRate : TURN.pivotRate) : TURN.curvature * r.speed;
    const want = Math.sign(off) * Math.min(most, Math.sqrt(2 * TURN.accel * Math.abs(off)), Math.abs(off) / dt);
    r.turnRate += clamp(want - r.turnRate, -TURN.accel * dt, TURN.accel * dt);
    let stepped = 0;
    if (pivoting) {
      const turn = r.turnRate * dt;
      r.heading += turn;
      // The feet step round while it pivots: stepping distance is the arc a foot travels.
      stepped = Math.abs(turn) * TURN.stepPerRadian;
      r.speed = approach(r.speed, 0, SPEED.accelerate, dt);
      // Done once lined up and nearly still, so the walk or run starts without a jerk.
      if (Math.abs(off - turn) < TURN.aligned && Math.abs(r.turnRate) < 1) {
        r.state = r.resume;
        moving = true;
      }
    } else {
      r.speed = approach(r.speed, moving ? wantSpeed : 0, SPEED.accelerate, dt);
      if (!moving && r.speed < 0.05) r.speed = 0;
    }
    const wish = r.speed * dt; // BL
    const fromX = r.x;
    const fromY = r.y;
    r.x += Math.cos(r.heading) * wish * r.size;
    r.y += Math.sin(r.heading) * wish * r.size;
    contain(r, this.aspect / 2, 0.5, this.region, ARENA);
    // The distance it really went, once the floor's edge has had its say.
    const distance = Math.hypot(r.x - fromX, r.y - fromY) / r.size;
    if (!pivoting) {
      if (distance < wish * 0.5 || wish === 0) {
        // Stopped, or bumped the edge of the floor: the turn runs down at its own pace (no
        // spin), and a bump stops it there; if it was going somewhere it turns on the spot.
        r.heading += r.turnRate * dt;
        if (wish > 0) {
          r.speed = 0;
          if (moving && Math.abs(off) > TURN.aligned) this.pivot();
        }
      } else {
        // Heading changes only with distance travelled, along a curve (P-4 on the ground too),
        // coasting to a stop included.
        const limit = TURN.curvature * distance;
        const turn = clamp(r.turnRate * dt, -limit, limit);
        r.heading += turn;
        r.turnRate = turn / dt;
      }
    }
    r.heading = angleDelta(r.heading, 0);

    this.walkFeet(distance + stepped, r.speed, dt);
    this.eat(dt);
    r.bodyHeading = r.heading + STRIDE_YAW * Math.sin(r.gait.phase * Math.PI * 2) * smooth(r.speed / SPEED.walk);
    // Antennae point ahead while moving, sweep at rest, and lower toward food while eating.
    const aim = r.state === 'feed' ? 0 : r.state === 'rest' ? 0.12 * Math.sin(r.antennaPhase * 0.37) : 0;
    r.antennaAim = approach(r.antennaAim, aim, 3, dt);
    this.pose();
  }

  /** Picks what to do next when the current state ends or something better appears. */
  private decide() {
    const r = this.roach;
    if (r.state === 'flee') {
      if (r.time >= r.until || this.arrived(0.2)) this.rest();
      return;
    }
    if (r.state === 'feed') {
      if (r.time >= r.until || this.crumbs[r.crumb]?.left <= 0) {
        if (r.crumb >= 0) this.crumbs[r.crumb].left = 0;
        r.crumb = -1;
        r.hungry = 0;
        this.rest();
      }
      return;
    }
    if (r.state === 'walk' || r.state === 'turn') {
      if (r.crumb >= 0) {
        if (this.crumbs[r.crumb].left <= 0) r.crumb = -1;
        else if (this.headOn(this.crumbs[r.crumb])) {
          r.state = 'feed';
          r.time = 0;
          r.until = this.between(BEHAVIOUR.feed);
          return;
        }
      }
      if (r.crumb < 0 && this.arrived(0.25)) this.rest();
      return;
    }
    // Resting: food wins when the rest is over; a long rest without food starts a search.
    if (r.time < r.until) return;
    const food = this.nearestCrumb();
    if (food >= 0) {
      r.crumb = food;
      this.walkTo(this.crumbs[food].x, this.crumbs[food].y);
    } else if (r.hungry >= r.searchAt) {
      r.hungry = 0;
      r.searchAt = this.between(BEHAVIOUR.searchAfter);
      const a = this.random() * Math.PI * 2;
      const reach = (1.5 + this.random() * 2.5) * r.size;
      this.walkTo(r.x + Math.cos(a) * reach, r.y + Math.sin(a) * reach);
    }
  }

  private walkTo(x: number, y: number) {
    this.setTarget(x, y);
    const r = this.roach;
    r.state = 'walk';
    r.time = 0;
    r.until = 1;
  }

  private rest() {
    const r = this.roach;
    r.state = 'rest';
    r.time = 0;
    r.until = this.between(BEHAVIOUR.rest);
  }

  private arrived(within: number) {
    const r = this.roach;
    return Math.hypot(r.targetX - r.x, r.targetY - r.y) < within * r.size;
  }

  /** The head (0.45 BL ahead of the centre) is over the crumb. */
  private headOn(c: Crumb) {
    const r = this.roach;
    const hx = r.x + Math.cos(r.heading) * 0.45 * r.size;
    const hy = r.y + Math.sin(r.heading) * 0.45 * r.size;
    return Math.hypot(c.x - hx, c.y - hy) < 0.1 * r.size;
  }

  private nearestCrumb() {
    const r = this.roach;
    let best = -1;
    let bestD = Infinity;
    this.crumbs.forEach((c, i) => {
      if (c.left <= 0) return;
      const d = Math.hypot(c.x - r.x, c.y - r.y);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best;
  }

  private eat(dt: number) {
    const r = this.roach;
    if (r.state === 'walk' && r.crumb >= 0) {
      // Aim the body so the head arrives on the crumb.
      const c = this.crumbs[r.crumb];
      const a = Math.atan2(c.y - r.y, c.x - r.x);
      r.targetX = c.x - Math.cos(a) * 0.4 * r.size;
      r.targetY = c.y - Math.sin(a) * 0.4 * r.size;
    }
    if (r.state === 'feed' && r.crumb >= 0) {
      const c = this.crumbs[r.crumb];
      c.left = Math.max(0, c.left - dt / r.until);
      if (c.left <= 0) {
        r.crumb = -1;
        r.hungry = 0;
        this.rest();
      }
    }
  }

  // ---- Feet -------------------------------------------------------------------------

  /**
   * Advances the gait clock by the distance the feet travel and moves each
   * foot: a planted foot stays put; at lift-off it aims at its touch-down
   * place (a middle foot at the footprint its front neighbour is leaving);
   * during swing it follows a step arc; at touch-down it is pinned.
   */
  private walkFeet(distance: number, speed: number, dt: number) {
    const r = this.roach;
    advanceGait(r.gait, GAIT, distance, speed);
    const duty = dutyAt(GAIT, speed);
    const travel = (1 - duty) * strideLengthAt(GAIT, speed) * smooth(speed / SPEED.walk);
    LEG_NAMES.forEach((name, k) => {
      const foot = r.feet[k];
      if (foot.reflex >= 0) {
        foot.reflex = Math.min(1, foot.reflex + dt / REFLEX.time);
        const w = smooth(foot.reflex);
        stepArc(
          foot.fromX,
          foot.fromY,
          foot.toX,
          foot.toY,
          w,
          r.x,
          r.y,
          0.05 * r.size * Math.sin(Math.PI * w),
          scratch,
        );
        foot.x = scratch[0];
        foot.y = scratch[1];
        if (foot.reflex >= 1) {
          foot.reflex = -1;
          foot.planted = true;
          foot.stance++;
        }
        return;
      }
      if (foot.planted && this.overreached(name, foot)) {
        // C-5: carried out of reach (or under the body), the foot steps home now.
        this.startReflex(name, k, foot, travel * 0.5);
        return;
      }
      if (distance === 0) {
        // Standing still: a foot still in the air is set down where it was going.
        if (!foot.planted) {
          foot.x = approach(foot.x, foot.toX, 25, dt);
          foot.y = approach(foot.y, foot.toY, 25, dt);
          if (Math.hypot(foot.toX - foot.x, foot.toY - foot.y) < 0.005 * r.size) {
            foot.planted = true;
            foot.stance++;
          }
        }
        return;
      }
      const stance = isStance(r.gait, GAIT, name);
      if (stance) {
        if (!foot.planted) {
          foot.x = foot.toX;
          foot.y = foot.toY;
          foot.planted = true;
          foot.stance++;
          // Landed out of reach (the body turned under the swing): step again at once (C-5).
          if (this.overreached(name, foot)) this.startReflex(name, k, foot, travel * 0.5);
        }
        return;
      }
      if (foot.planted) {
        foot.planted = false;
        foot.fromX = foot.x;
        foot.fromY = foot.y;
        this.aim(name, k, travel);
      }
      const w = smooth(Math.max(0, swingProgress(r.gait, GAIT, name)));
      // Re-aim through the swing, so a turn mid-stride still lands the foot beside the body.
      if (w < 0.7) this.aim(name, k, travel * (1 - w));
      stepArc(foot.fromX, foot.fromY, foot.toX, foot.toY, w, r.x, r.y, 0.05 * r.size * Math.sin(Math.PI * w), scratch);
      foot.x = scratch[0];
      foot.y = scratch[1];
    });
  }

  private startReflex(name: LegName, k: number, foot: Foot, ahead: number) {
    foot.planted = false;
    foot.reflex = 0;
    foot.fromX = foot.x;
    foot.fromY = foot.y;
    this.aim(name, k, ahead);
  }

  /** Whether a planted foot is out of its leg's reach (C-5), or has crossed under the body. */
  private overreached(name: LegName, foot: Foot) {
    const r = this.roach;
    const side = name[0] === 'L' ? 1 : -1;
    const spec = LEGS[name[1] as '1' | '2' | '3'];
    const c = Math.cos(r.heading);
    const s = Math.sin(r.heading);
    const dx = (foot.x - r.x) / r.size;
    const dy = (foot.y - r.y) / r.size;
    const lx = dx * c + dy * s;
    const ly = -dx * s + dy * c;
    if (ly * side < 0.05) return true;
    const [t, aim] = solvePin(spec, side, 0, 0, lx, ly, REACH[0], REACH[1]);
    const [ex, ey] = limbEnd(spec, side, t, clamp(aim, -REFLEX.aim, REFLEX.aim), 0);
    return Math.hypot(ex - lx, ey - ly) > REFLEX.miss;
  }

  private aim(name: LegName, k: number, ahead: number) {
    const r = this.roach;
    const foot = r.feet[k];
    if (name[1] === '2') {
      // Follow the leader: the front foot on this side is planted now and lifts as this one lands.
      const front = r.feet[LEG_NAMES.indexOf(`${name[0]}1` as LegName)];
      if (front.planted) {
        const side = name[0] === 'L' ? 1 : -1;
        const c = Math.cos(r.heading);
        const s = Math.sin(r.heading);
        const fx = front.x - (FOLLOW.behind * c - FOLLOW.out * side * -s) * r.size;
        const fy = front.y - (FOLLOW.behind * s - FOLLOW.out * side * c) * r.size;
        const [lx, ly] = this.footholdLocal(name, ahead);
        const [wx, wy] = this.toWorld(lx, ly);
        if (Math.hypot(fx - wx, fy - wy) < FOLLOW.within * r.size) {
          foot.toX = fx;
          foot.toY = fy;
          return;
        }
      }
    }
    const [lx, ly] = this.footholdLocal(name, ahead);
    const [wx, wy] = this.toWorld(lx, ly);
    foot.toX = wx;
    foot.toY = wy;
  }

  /** Solves every leg to reach its foot and writes the capsules, then the antennae. */
  private pose() {
    const r = this.roach;
    const c = Math.cos(-r.bodyHeading);
    const s = Math.sin(-r.bodyHeading);
    let o = 0;
    LEG_NAMES.forEach((name, k) => {
      const side = name[0] === 'L' ? 1 : -1;
      const spec = LEGS[name[1] as '1' | '2' | '3'];
      const foot = r.feet[k];
      const dx = (foot.x - r.x) / r.size;
      const dy = (foot.y - r.y) / r.size;
      const tx = dx * c - dy * s;
      const ty = dx * s + dy * c;
      const [t, aim] = solvePin(spec, side, 0, 0, tx, ty, REACH[0], REACH[1]);
      o = poseChain(spec, side, t, clamp(aim, -REFLEX.aim, REFLEX.aim), 0, this.capsules, o);
    });
    // Antennae: chains from the head, each segment bending a little further out.
    for (const side of [1, -1]) {
      let x = 0.47;
      let y = 0.04 * side;
      const sweep = r.state === 'rest' ? ANTENNA.sweep * Math.sin(r.antennaPhase + (side > 0 ? 0 : 1.7)) : 0;
      let a = side * (0.42 + r.antennaAim) + sweep + (r.state === 'feed' ? -side * 0.25 : 0);
      const length = ANTENNA.length / ANTENNA.segments;
      for (let j = 0; j < ANTENNA.segments; j++) {
        const nx = x + Math.cos(a) * length;
        const ny = y + Math.sin(a) * length;
        this.capsules[o] = x;
        this.capsules[o + 1] = y;
        this.capsules[o + 2] = nx;
        this.capsules[o + 3] = ny;
        o += 4;
        x = nx;
        y = ny;
        a += side * 0.06 * (r.state === 'flee' ? -1 : 1);
      }
    }
  }

  // ---- Shape ------------------------------------------------------------------------

  /**
   * Signed distance (world units, negative inside) from a point to what is
   * drawn of the cockroach: the body, the legs and the antennae.
   */
  roachDistance(x: number, y: number) {
    const r = this.roach;
    const c = Math.cos(-r.bodyHeading);
    const s = Math.sin(-r.bodyHeading);
    const dx = (x - r.x) / r.size;
    const dy = (y - r.y) / r.size;
    const qx = dx * c - dy * s;
    const qy = dx * s + dy * c;
    let d = bodyDistance(qx, qy);
    for (let k = 0; k < CAPSULES; k++) {
      const o = k * 4;
      const radius = k < LEG_NAMES.length * LEG_SEGMENTS ? LEG_RADII[k % LEG_SEGMENTS] : ANTENNA_RADIUS;
      d = Math.min(
        d,
        capsuleDistance(
          qx,
          qy,
          this.capsules[o],
          this.capsules[o + 1],
          this.capsules[o + 2],
          this.capsules[o + 3],
          radius,
        ),
      );
    }
    return d * r.size;
  }

  /** Every broken rule the world can detect (A-11). */
  check(): string[] {
    const issues: string[] = [];
    const r = this.roach;
    if (!Number.isFinite(r.x + r.y + r.heading + r.speed)) issues.push('the cockroach has a non-finite pose');
    if (this.region(r.x, r.y, ARENA) > 1.001) issues.push('the cockroach is outside the floor');
    for (let i = 0; i < this.capsules.length; i++)
      if (!Number.isFinite(this.capsules[i])) {
        issues.push('a leg or antenna has a non-finite capsule');
        break;
      }
    if (r.crumb >= 0 && this.crumbs[r.crumb].left <= 0 && r.state === 'feed')
      issues.push('feeding on a crumb that is gone');
    return issues;
  }
}
