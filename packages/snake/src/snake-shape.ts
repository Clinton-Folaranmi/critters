// The grass snake's drawn geometry, written once (spec A-7): the outline from
// the motion sheet, the centreline through the spine, the forked tongue, the
// overhanging meadow grass blades, and the triangle mesh both renderers draw.
// Every visible element is a textured triangle on one atlas (snake-paint.ts),
// so WebGL2 and Canvas 2D draw the exact same shapes with the same pixels.
//
// A vertex is five floats: x, y (world), s, t (atlas, 0–1), alpha.

import type { ChainPoint } from 'critter-kit';
import { OUTLINE } from './snake-motion';
import type { GrassBlade, SnakeWorld } from './snake-world';

export const STRIDE = 5;

/** Subtle grass-rustle / sunlit dust shimmer rings when a visitor taps the bank. */
export const RING = { speed: 0.095, life: 1.75, width: 0.005 } as const;

/** Atlas layout, pixels. Gaps keep mipmaps from bleeding between regions. */
export const ATLAS = {
  size: 1024,
  /** Body skin: u from 0 (snout) to 1 (tail tip) along x, v from +1 (left) to −1 (right) down y. */
  skin: { x: 0, y: 0, w: 1024, h: 320, pad: 36 },
  /** Forked tongue: u from 0 (mouth) to 1 (tine tips) along x. */
  tongue: { x: 0, y: 336, w: 256, h: 128, pad: 16 },
  /** Soft shadow profile across y, constant along x. */
  shadow: { x: 272, y: 336, w: 64, h: 128, pad: 0 },
  leafA: { x: 352, y: 336, w: 128, h: 128, pad: 8 },
  leafB: { x: 496, y: 336, w: 128, h: 128, pad: 8 },
  leafShadow: { x: 640, y: 336, w: 128, h: 128, pad: 0 },
  scent: { x: 784, y: 336, w: 64, h: 64, pad: 6 },
  /** Overhanging meadow grass blades (u = 0 rooted base to u = 1 pointed tip) and their cast shadow. */
  grassA: { x: 0, y: 480, w: 384, h: 96, pad: 12 },
  grassB: { x: 400, y: 480, w: 384, h: 96, pad: 12 },
  grassShadow: { x: 800, y: 480, w: 192, h: 96, pad: 8 },
} as const;

export interface Region {
  x: number;
  y: number;
  w: number;
  h: number;
  pad: number;
}

// ---- Outline -------------------------------------------------------------------

const widthU = OUTLINE.halfWidth.map(([u]) => u);
const widthW = OUTLINE.halfWidth.map(([, w]) => w);
const SNOUT = 0.013;
const HEAD_COLLAR_U = 0.082;
const HEAD_COLLAR_S = 0.28;

/**
 * Non-linear atlas mapping along the snake's length: the head and yellow-black
 * Natrix collar (u <= 0.082) occupy the first 28% (286 px) of the 1024-px skin
 * strip so head shields, eyes and collar markings stay crisp at close range.
 */
export function uToSkinS(u: number): number {
  const c = Math.min(Math.max(u, 0), 1);
  if (c <= HEAD_COLLAR_U) return (c / HEAD_COLLAR_U) * HEAD_COLLAR_S;
  return HEAD_COLLAR_S + ((c - HEAD_COLLAR_U) / (1 - HEAD_COLLAR_U)) * (1 - HEAD_COLLAR_S);
}

export function skinSToU(s: number): number {
  const c = Math.min(Math.max(s, 0), 1);
  if (c <= HEAD_COLLAR_S) return (c / HEAD_COLLAR_S) * HEAD_COLLAR_U;
  return HEAD_COLLAR_U + ((c - HEAD_COLLAR_S) / (1 - HEAD_COLLAR_S)) * (1 - HEAD_COLLAR_U);
}

/** Half-width of the snake at u (0 snout, 1 tail tip), in BL. */
export function halfWidth(u: number): number {
  if (u <= 0) return widthW[1] * 0.28;
  const snoutW = widthW[1];
  if (u < SNOUT) {
    const t = 1 - u / SNOUT;
    return snoutW * (0.28 + 0.72 * Math.sqrt(Math.max(0, 1 - t * t)));
  }
  const last = widthU.length - 1;
  if (u >= widthU[last]) return widthW[last];
  let i = 1;
  while (i < last - 1 && u > widthU[i + 1]) i++;
  const u0 = widthU[i];
  const u1 = widthU[i + 1];
  const h = u1 - u0;
  const slope = (k: number) => {
    const a = Math.max(0, k - 1);
    const b = Math.min(last, k + 1);
    return (widthW[b] - widthW[a]) / (widthU[b] - widthU[a]);
  };
  const t = (u - u0) / h;
  const t2 = t * t;
  const t3 = t2 * t;
  return Math.max(
    0.0006,
    (2 * t3 - 3 * t2 + 1) * widthW[i] +
      (t3 - 2 * t2 + t) * h * slope(i) +
      (-2 * t3 + 3 * t2) * widthW[i + 1] +
      (t3 - t2) * h * slope(i + 1),
  );
}

// ---- Centreline ------------------------------------------------------------------

export interface Frame {
  x: number;
  y: number;
  /** Unit tangent pointing toward the snout. */
  tx: number;
  ty: number;
}

/** The centreline at u (0 snout, 1 tail tip), Catmull-Rom through the spine, into `out`. */
export function centreAt(spine: readonly ChainPoint[], u: number, out: Frame): Frame {
  const n = spine.length - 1;
  const f = Math.min(Math.max(u, 0), 1) * n;
  const i = Math.min(n - 1, Math.floor(f));
  const t = f - i;
  const p0 = spine[Math.max(0, i - 1)];
  const p1 = spine[i];
  const p2 = spine[i + 1];
  const p3 = spine[Math.min(n, i + 2)];
  const t2 = t * t;
  const t3 = t2 * t;
  out.x =
    0.5 *
    (2 * p1.x +
      (-p0.x + p2.x) * t +
      (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
      (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3);
  out.y =
    0.5 *
    (2 * p1.y +
      (-p0.y + p2.y) * t +
      (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
      (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3);
  let dx =
    0.5 *
    (-p0.x + p2.x + 2 * (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t + 3 * (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t2);
  let dy =
    0.5 *
    (-p0.y + p2.y + 2 * (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t + 3 * (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t2);
  const d = Math.hypot(dx, dy) || 1;
  dx /= d;
  dy /= d;
  out.tx = -dx;
  out.ty = -dy;
  return out;
}

const hitFrame: Frame = { x: 0, y: 0, tx: 1, ty: 0 };

/** Distance from (x, y) to the drawn snake body, world units; negative inside. */
export function snakeDistance(spine: readonly ChainPoint[], length: number, x: number, y: number): number {
  let best = Infinity;
  for (let k = 0; k <= 56; k++) {
    const u = k / 56;
    centreAt(spine, u, hitFrame);
    const half = halfWidth(u) * length;
    best = Math.min(best, Math.hypot(x - hitFrame.x, y - hitFrame.y) - half);
  }
  return best;
}

// ---- Mesh ------------------------------------------------------------------------

const frame: Frame = { x: 0, y: 0, tx: 1, ty: 0 };
const column = new Float64Array(20);
const ACROSS = [1, 0.5, 0, -0.5, -1] as const;
const skinT = new Float64Array(ACROSS.length);
const BODY_SAMPLES = 76;
const TONGUE_SAMPLES = 6;
const GRASS_SEGMENTS = 6;

export interface MeshRanges {
  /** The snake's cast shadow on the soil and stones. */
  snakeShadow: number;
  /** Leaf shadows and warm scent/rustle markers on the ground. */
  shadows: number;
  /** Fallen dry leaves resting on the soil beneath the snake. */
  surface: number;
  /** The forked tongue, emerging from beneath the snout. */
  tongue: number;
  /** The snake's coiled body and head. */
  snake: number;
  /** Soft shadows cast by overhanging grass blades onto the snake and ground. */
  canopyShadow: number;
  /** Overhanging meadow grass blades arching over the snake. */
  canopy: number;
}

export const MESH_FLOATS = STRIDE * 6 * 1020;

/**
 * Writes the scene's triangles into `out` and returns where each layer ends
 * (cumulative vertex counts). Allocates nothing.
 */
export function buildMesh(world: SnakeWorld, out: Float32Array): MeshRanges {
  let o = 0;
  const { size } = ATLAS;
  const vertex = (x: number, y: number, s: number, t: number, a: number) => {
    out[o++] = x;
    out[o++] = y;
    out[o++] = s / size;
    out[o++] = t / size;
    out[o++] = a;
  };
  const quad = (
    x00: number,
    y00: number,
    s00: number,
    t00: number,
    x10: number,
    y10: number,
    s10: number,
    t10: number,
    x01: number,
    y01: number,
    s01: number,
    t01: number,
    x11: number,
    y11: number,
    s11: number,
    t11: number,
    a0: number,
    a1 = a0,
  ) => {
    vertex(x00, y00, s00, t00, a0);
    vertex(x10, y10, s10, t10, a1);
    vertex(x01, y01, s01, t01, a0);
    vertex(x10, y10, s10, t10, a1);
    vertex(x11, y11, s11, t11, a1);
    vertex(x01, y01, s01, t01, a0);
  };
  const sprite = (r: Region, x: number, y: number, w: number, h: number, angle: number, a: number) => {
    const c = Math.cos(angle);
    const s = Math.sin(angle);
    const ux = (c * w) / 2;
    const uy = (s * w) / 2;
    const vx = (-s * h) / 2;
    const vy = (c * h) / 2;
    quad(
      x - ux - vx,
      y - uy - vy,
      r.x,
      r.y + r.h,
      x + ux - vx,
      y + uy - vy,
      r.x + r.w,
      r.y + r.h,
      x - ux + vx,
      y - uy + vy,
      r.x,
      r.y,
      x + ux + vx,
      y + uy + vy,
      r.x + r.w,
      r.y,
      a,
    );
  };

  /** Emits a curved 4-segment ribbon for a grass blade (or its offset shadow). */
  const drawBladeRibbon = (b: GrassBlade, r: Region, ox: number, oy: number, widthScale: number, alpha: number) => {
    const sStart = r.x + r.pad;
    const sSpan = r.w - r.pad * 2;
    const tTop = r.y + r.pad;
    const tBot = r.y + r.h - r.pad;
    const segLen = b.length / GRASS_SEGMENTS;
    const halfW = b.width * widthScale * 0.5;
    let cx = b.x + ox;
    let cy = b.y + oy;
    let ang = b.baseAngle + b.sway * 0.35;
    let px = cx;
    let py = cy;
    let pnx = -Math.sin(ang);
    let pny = Math.cos(ang);
    for (let k = 1; k <= GRASS_SEGMENTS; k++) {
      const u0 = (k - 1) / GRASS_SEGMENTS;
      const u1 = k / GRASS_SEGMENTS;
      ang = b.baseAngle + (b.arch + b.sway) * Math.pow(u1, 1.25);
      const dx = Math.cos(ang);
      const dy = Math.sin(ang);
      cx += dx * segLen;
      cy += dy * segLen;
      const nx = -dy;
      const ny = dx;
      const s0 = sStart + u0 * sSpan;
      const s1 = sStart + u1 * sSpan;
      quad(
        px + pnx * halfW,
        py + pny * halfW,
        s0,
        tTop,
        cx + nx * halfW,
        cy + ny * halfW,
        s1,
        tTop,
        px - pnx * halfW,
        py - pny * halfW,
        s0,
        tBot,
        cx - nx * halfW,
        cy - ny * halfW,
        s1,
        tBot,
        alpha,
      );
      px = cx;
      py = cy;
      pnx = nx;
      pny = ny;
    }
  };

  const { spine, length: L } = world;
  const baseShadow = world.shadowOffset();

  // ---- 1. Snake shadow on the ground (wider & further down-left under lifted head/neck, P-17) ----
  {
    const r = ATLAS.shadow;
    let px = 0,
      py = 0,
      pw = 0,
      pnx = 0,
      pny = 0;
    for (let k = 0; k < BODY_SAMPLES; k++) {
      const t = k / (BODY_SAMPLES - 1);
      const u = t < 0.25 ? (t / 0.25) * 0.12 : 0.12 + ((t - 0.25) / 0.75) * 0.88;
      centreAt(spine, u, frame);
      const liftShare = u < 0.22 ? world.headLift * Math.pow(1 - u / 0.22, 1.4) : 0;
      const sx = baseShadow.x * (1 + 1.85 * liftShare);
      const sy = baseShadow.y * (1 + 1.85 * liftShare);
      const w = halfWidth(u) * L * (1.42 + 0.36 * liftShare) + L * 0.004;
      const x = frame.x + sx;
      const y = frame.y + sy;
      const nx = -frame.ty;
      const ny = frame.tx;
      if (k > 0) {
        const s0 = r.x + ((k - 1) / (BODY_SAMPLES - 1)) * r.w;
        const s1 = r.x + (k / (BODY_SAMPLES - 1)) * r.w;
        quad(
          px + pnx * pw,
          py + pny * pw,
          s0,
          r.y,
          x + nx * w,
          y + ny * w,
          s1,
          r.y,
          px - pnx * pw,
          py - pny * pw,
          s0,
          r.y + r.h,
          x - nx * w,
          y - ny * w,
          s1,
          r.y + r.h,
          world.shadowAlpha,
        );
      }
      px = x;
      py = y;
      pw = w;
      pnx = nx;
      pny = ny;
    }
  }
  const snakeShadow = o / STRIDE;

  // ---- 2. Leaf shadows and warm scent/rustle spots on the ground ----
  for (const spot of world.spots) {
    if (spot.strength <= 0.01) continue;
    const d = 0.026 * (0.7 + 0.3 * spot.strength);
    sprite(ATLAS.scent, spot.x, spot.y, d, d, spot.angle, 0.58 * spot.strength);
  }
  for (const leaf of world.leaves) {
    sprite(
      ATLAS.leafShadow,
      leaf.x + baseShadow.x * 0.85,
      leaf.y + baseShadow.y * 0.85,
      leaf.size * 1.18,
      leaf.size * 1.18,
      leaf.angle,
      0.48,
    );
  }
  const shadows = o / STRIDE;

  // ---- 3. Fallen leaves resting on the soil beneath the snake ----
  for (const leaf of world.leaves) {
    sprite(leaf.kind ? ATLAS.leafB : ATLAS.leafA, leaf.x, leaf.y, leaf.size, leaf.size, leaf.angle, 1);
  }
  const surface = o / STRIDE;

  // ---- 4. Forked tongue (drawn just before the head so it emerges from under the snout) ----
  if (world.tongueExt > 0.02) {
    const r = ATLAS.tongue;
    centreAt(spine, 0, frame);
    const reach = OUTLINE.tongue.length * L * world.tongueExt;
    const halfSpan = OUTLINE.tongue.forkSpread * L * (0.65 + 0.35 * world.tongueExt);
    const rootX = frame.x - frame.tx * L * 0.003;
    const rootY = frame.y - frame.ty * L * 0.003;
    let px = rootX,
      py = rootY,
      pnx = -frame.ty,
      pny = frame.tx;
    for (let k = 1; k <= TONGUE_SAMPLES; k++) {
      const a0 = (k - 1) / TONGUE_SAMPLES;
      const a1 = k / TONGUE_SAMPLES;
      const wag = world.tongueWiggle * a1 * a1;
      const dirX = frame.tx * Math.cos(wag) - frame.ty * Math.sin(wag);
      const dirY = frame.ty * Math.cos(wag) + frame.tx * Math.sin(wag);
      const x = rootX + dirX * reach * a1;
      const y = rootY + dirY * reach * a1;
      const nx = -dirY;
      const ny = dirX;
      const s0 = r.x + r.pad + a0 * (r.w - r.pad * 2);
      const s1 = r.x + r.pad + a1 * (r.w - r.pad * 2);
      const t0 = r.y + r.pad;
      const t1 = r.y + r.h - r.pad;
      quad(
        px + pnx * halfSpan,
        py + pny * halfSpan,
        s0,
        t0,
        x + nx * halfSpan,
        y + ny * halfSpan,
        s1,
        t0,
        px - pnx * halfSpan,
        py - pny * halfSpan,
        s0,
        t1,
        x - nx * halfSpan,
        y - ny * halfSpan,
        s1,
        t1,
        Math.min(1, world.tongueExt * 2.5),
      );
      px = x;
      py = y;
      pnx = nx;
      pny = ny;
    }
  }
  const tongue = o / STRIDE;

  // ---- 5. Snake body and head (4 columns across width for smooth S-curves and collar) ----
  {
    const r = ATLAS.skin;
    const top = r.y + r.pad;
    const span = r.h - r.pad * 2;
    const across = ACROSS;
    for (let j = 0; j < across.length; j++) {
      skinT[j] = top + ((1 - across[j]) / 2) * span;
    }
    let ps = 0;
    for (let k = 0; k < BODY_SAMPLES; k++) {
      const t = k / (BODY_SAMPLES - 1);
      const u = t < 0.35 ? (t / 0.35) * HEAD_COLLAR_U : HEAD_COLLAR_U + ((t - 0.35) / 0.65) * (1 - HEAD_COLLAR_U);
      centreAt(spine, u, frame);
      const liftShare = u < 0.22 ? world.headLift * Math.pow(1 - u / 0.22, 1.4) : 0;
      const w = halfWidth(u) * L * (1 + 0.06 * liftShare);
      const cx = frame.x - baseShadow.x * 0.35 * liftShare;
      const cy = frame.y - baseShadow.y * 0.35 * liftShare;
      const nx = -frame.ty;
      const ny = frame.tx;
      const s = r.x + 2 + uToSkinS(u) * (r.w - 4);
      for (let j = 0; j < across.length; j++) {
        const x = cx + nx * w * across[j];
        const y = cy + ny * w * across[j];
        if (k > 0 && j > 0) {
          quad(
            column[j - 1],
            column[j - 1 + across.length * 3],
            ps,
            skinT[j - 1],
            column[j - 1 + across.length],
            column[j - 1 + across.length * 2],
            s,
            skinT[j - 1],
            column[j],
            column[j + across.length * 3],
            ps,
            skinT[j],
            x,
            y,
            s,
            skinT[j],
            1,
          );
        }
        column[j + across.length] = x;
        column[j + across.length * 2] = y;
      }
      for (let j = 0; j < across.length; j++) {
        column[j] = column[j + across.length];
        column[j + across.length * 3] = column[j + across.length * 2];
      }
      ps = s;
    }
  }
  const snake = o / STRIDE;

  // ---- 6. Overhanging grass blade shadows (cast onto both ground and snake!) ----
  for (const blade of world.grass) {
    drawBladeRibbon(blade, ATLAS.grassShadow, baseShadow.x * 1.15, baseShadow.y * 1.15, 1.35, 0.42);
  }
  const canopyShadow = o / STRIDE;

  // ---- 7. Overhanging meadow grass blades (foreground canopy crossing over the snake) ----
  for (const blade of world.grass) {
    drawBladeRibbon(blade, blade.kind ? ATLAS.grassB : ATLAS.grassA, 0, 0, 1.0, 0.96);
  }
  const canopy = o / STRIDE;

  return { snakeShadow, shadows, surface, tongue, snake, canopyShadow, canopy };
}
