// A spine-driven swimmer (fish, tadpole, eel, sea snake): the head is
// steered, the body follows the path the head took (follow-the-leader), a
// travelling wave is laid over that path, and the chain solver keeps the
// spine its length. Two things bend the body, and they add:
//
// - the path itself: a turn the head made is a curve the body passes along;
// - a whole-body curvature (`bend`) for bends that aren't a path, such as
//   the C of a fast start (Domenici & Blake 1997) or a slow turn on the spot.
//
// The wave's phase is advanced by the caller's tail-beat frequency, not by
// distance: a fish's body wave runs backward faster than the fish moves
// forward (its slip, U / (f·λ), is below 1), and it can beat and then glide
// with its tail still. Lengths are in world units; shapes are in body
// lengths (BL).

import { createTrail, followChain, recordTrail, resetTrail, sampleTrail, type ChainPoint, type Trail } from './chain';
import { travellingWave, type WaveShape } from './wave';

export interface SwimShape extends WaveShape {
  /** Largest angle between neighbouring spine segments, radians. */
  maxBend: number;
}

export interface SwimBody {
  /** The steered head: where the body's path starts (the drawn snout is offset from it by the wave). */
  x: number;
  y: number;
  heading: number;
  /** Body length, world units. */
  length: number;
  /** Wave phase, cycles. */
  phase: number;
  /** Share of a full tail beat being swum (0 glide, 1 full amplitude). */
  beat: number;
  /** Whole-body curvature, 1/BL: positive bends toward the left of travel. */
  bend: number;
  /** Spine from snout (0) to tail tip, as drawn. */
  readonly spine: ChainPoint[];
  readonly lengths: number[];
  readonly trail: Trail;
}

const scratch: ChainPoint = { x: 0, y: 0 };
const ahead: ChainPoint = { x: 0, y: 0 };
const behind: ChainPoint = { x: 0, y: 0 };

/** A straight swimmer of `count` spine points, its head at (x, y), facing `heading`. */
export function createSwimBody(length: number, count: number, x: number, y: number, heading: number): SwimBody {
  const n = Math.max(3, Math.floor(count));
  const spine = Array.from({ length: n }, (_, i) => ({
    x: x - Math.cos(heading) * (i / (n - 1)) * length,
    y: y - Math.sin(heading) * (i / (n - 1)) * length,
  }));
  const lengths = Array.from({ length: n - 1 }, () => length / (n - 1));
  // Samples a 32nd of a body length apart: smooth enough for a tight turn.
  const trail = createTrail(length * 1.6, length / 32, x, y, heading);
  return { x, y, heading, length, phase: 0, beat: 0, bend: 0, spine, lengths, trail };
}

/** Puts the body straight at (x, y), facing `heading` (a resize, a reset). */
export function placeSwimBody(body: SwimBody, x: number, y: number, heading: number) {
  body.x = x;
  body.y = y;
  body.heading = heading;
  resetTrail(body.trail, x, y, heading);
  layOut(body, body.trail.spacing);
}

/** Scales the body (a resize changes the world's units): trail, spine and length. */
export function scaleSwimBody(body: SwimBody, length: number) {
  const k = length / body.length;
  if (!Number.isFinite(k) || k === 1) return;
  const { trail } = body;
  for (let i = 0; i < trail.x.length; i++) {
    trail.x[i] = body.x + (trail.x[i] - body.x) * k;
    trail.y[i] = body.y + (trail.y[i] - body.y) * k;
  }
  (trail as { spacing: number }).spacing *= k;
  body.length = length;
  for (let i = 0; i < body.lengths.length; i++) body.lengths[i] *= k;
  layOut(body, trail.spacing);
}

/** Moves the whole body by (dx, dy), trail and all (a resize that shifts the picture). */
export function moveSwimBody(body: SwimBody, dx: number, dy: number) {
  body.x += dx;
  body.y += dy;
  const { trail } = body;
  for (let i = 0; i < trail.x.length; i++) {
    trail.x[i] += dx;
    trail.y[i] += dy;
  }
  for (const point of body.spine) {
    point.x += dx;
    point.y += dy;
  }
}

/**
 * Turns the whole body by `angle` (radians, positive to the left) about the
 * point `pivot` of the way back along it: the head swings one way and the
 * tail the other, as in the first stage of a fast start or a slow turn on
 * the spot with the fins. The heading turns with it.
 */
export function turnSwimBody(body: SwimBody, angle: number, pivot: number) {
  if (angle === 0) return;
  sampleTrail(body.trail, body.x, body.y, pivot * body.length, scratch);
  const px = scratch.x;
  const py = scratch.y;
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  const rotate = (x: number, y: number, out: ChainPoint) => {
    out.x = px + (x - px) * c - (y - py) * s;
    out.y = py + (x - px) * s + (y - py) * c;
    return out;
  };
  rotate(body.x, body.y, ahead);
  body.x = ahead.x;
  body.y = ahead.y;
  const { trail } = body;
  for (let i = 0; i < trail.x.length; i++) {
    rotate(trail.x[i], trail.y[i], ahead);
    trail.x[i] = ahead.x;
    trail.y[i] = ahead.y;
  }
  for (const point of body.spine) rotate(point.x, point.y, point);
  body.heading += angle;
}

/**
 * Lets the path behind the head ease toward a straight line along the
 * heading, by `amount` (0 nothing, 1 straight at once). A fish that slows or
 * stops straightens its body within a second or so; without this the last
 * curve it swam stays frozen in the body for as long as it is still.
 */
export function relaxSwimBody(body: SwimBody, amount: number) {
  if (amount <= 0) return;
  const k = Math.min(1, amount);
  const { trail } = body;
  const n = trail.x.length;
  const cx = Math.cos(body.heading);
  const cy = Math.sin(body.heading);
  let back = Math.hypot(trail.x[trail.newest] - body.x, trail.y[trail.newest] - body.y);
  for (let i = 0; i < n; i++) {
    const index = (trail.newest + i) % n;
    // Straighten most near the tail end of the body, where a held curve shows.
    trail.x[index] += (body.x - cx * back - trail.x[index]) * k;
    trail.y[index] += (body.y - cy * back - trail.y[index]) * k;
    back += trail.spacing;
  }
}

/**
 * Advances the swimmer by dt: moves the head `speed` (world units/s) along
 * `heading`, advances the wave at `frequency` (Hz), and lays the spine out
 * along the path with the wave (scaled by body.beat) and body.bend.
 * Allocates nothing.
 */
export function stepSwimBody(
  body: SwimBody,
  shape: SwimShape,
  dt: number,
  speed: number,
  heading: number,
  frequency: number,
) {
  const step = Math.max(0, dt);
  body.heading = heading;
  body.x += Math.cos(heading) * speed * step;
  body.y += Math.sin(heading) * speed * step;
  body.phase = (body.phase + frequency * step) % 1;
  recordTrail(body.trail, body.x, body.y);
  layOut(body, body.trail.spacing, shape);
}

function layOut(body: SwimBody, delta: number, shape?: SwimShape) {
  const { spine, trail, length } = body;
  const n = spine.length;
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    const back = u * length;
    sampleTrail(trail, body.x, body.y, back, scratch);
    // The path's direction here, from a little ahead and behind.
    sampleTrail(trail, body.x, body.y, Math.max(0, back - delta), ahead);
    sampleTrail(trail, body.x, body.y, back + delta, behind);
    let tx = ahead.x - behind.x;
    let ty = ahead.y - behind.y;
    const d = Math.hypot(tx, ty) || 1;
    tx /= d;
    ty /= d;
    // Left of travel; a positive offset is to the fish's left.
    let lateral = body.bend * u * u * 0.5 * length;
    if (shape) lateral += body.beat * travellingWave(u, body.phase, shape) * length;
    spine[i].x = scratch.x - ty * lateral;
    spine[i].y = scratch.y + tx * lateral;
  }
  // The body doesn't stretch: restore each segment's length, from the snout back.
  followChain(spine, body.lengths, shape?.maxBend ?? Math.PI);
}
