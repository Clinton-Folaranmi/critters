// The koi's drawn geometry, written once (spec A-7): the outline from the
// motion sheet, the centreline through the spine, and the triangle mesh
// both renderers draw. Every visible thing is a textured triangle on one
// atlas (koi-paint.ts), so WebGL2 and Canvas 2D draw the same shapes with
// the same pixels; they differ only in the water's moving light.
//
// A vertex is five floats: x, y (world), s, t (atlas, 0–1), alpha.

import type { ChainPoint } from '@critters/critter-kit';
import { OUTLINE, POSE } from './koi-motion';
import type { KoiWorld } from './koi-world';

export const STRIDE = 5;

/** Ripples on the surface: how fast a ring spreads (world units/s), how long it lasts (s), its width. */
export const RIPPLE = { speed: 0.12, life: 2.4, width: 0.0065 } as const;

/** Atlas layout, pixels. Gaps keep mipmaps from bleeding between regions. */
export const ATLAS = {
  size: 1024,
  /** Body skin: u from 0 to BODY_END along x, v from +1 (left) to −1 (right) down y, between the pads. */
  skin: { x: 0, y: 0, w: 1024, h: 320, pad: 48 },
  caudal: { x: 0, y: 336, w: 512, h: 240, pad: 20 },
  pectoral: { x: 528, y: 336, w: 232, h: 120, pad: 10 },
  pelvic: { x: 776, y: 336, w: 232, h: 120, pad: 10 },
  /** A soft blob for the fish's shadow: alpha across y, constant along x. */
  shadow: { x: 528, y: 472, w: 48, h: 128, pad: 0 },
  leafA: { x: 592, y: 472, w: 128, h: 128, pad: 8 },
  leafB: { x: 736, y: 472, w: 128, h: 128, pad: 8 },
  leafShadow: { x: 592, y: 616, w: 128, h: 128, pad: 0 },
  pellet: { x: 880, y: 472, w: 48, h: 48, pad: 4 },
  pelletShadow: { x: 944, y: 472, w: 48, h: 48, pad: 0 },
} as const;
/** A rectangle of the atlas, pixels, with the transparent margin kept inside it. */
export interface Region {
  x: number;
  y: number;
  w: number;
  h: number;
  pad: number;
}

/** The skin covers the body to here; the tail fin's mesh starts a little before. */
export const BODY_END = 0.84;
const TAIL_START = 0.76;

// ---- Outline -------------------------------------------------------------------

const widthU = OUTLINE.halfWidth.map(([u]) => u);
const widthW = OUTLINE.halfWidth.map(([, w]) => w);
const NOSE = 0.08;

/** Half-width of the body at u, BL: a rounded snout, then a smooth curve through the sheet's points. */
export function halfWidth(u: number) {
  if (u <= 0) return 0;
  const noseW = widthW[widthU.indexOf(NOSE)];
  if (u < NOSE) {
    const t = 1 - u / NOSE;
    return noseW * Math.sqrt(1 - t * t);
  }
  const last = widthU.length - 1;
  if (u >= widthU[last]) return widthW[last];
  let i = widthU.indexOf(NOSE);
  while (i < last - 1 && u > widthU[i + 1]) i++;
  // Catmull-Rom through the points (non-uniform spacing; slopes from neighbours).
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
  return (
    (2 * t3 - 3 * t2 + 1) * widthW[i] +
    (t3 - 2 * t2 + t) * h * slope(i) +
    (-2 * t3 + 3 * t2) * widthW[i + 1] +
    (t3 - t2) * h * slope(i + 1)
  );
}

/** Half-span of the tail fin at a (0 where its mesh starts, 1 at the tips), BL. */
export function tailSpan(a: number) {
  return 0.024 + (OUTLINE.tailSpan - 0.024) * Math.pow(Math.max(0, a), 1.25);
}

// ---- Centreline ------------------------------------------------------------------

/** A point on the centreline with its forward tangent (toward the snout) and left normal. */
export interface Frame {
  x: number;
  y: number;
  /** Unit tangent pointing toward the head. */
  tx: number;
  ty: number;
}

/** The centreline at u (0 snout, 1 tail tip), Catmull-Rom through the spine, into `out`. */
export function centreAt(spine: readonly ChainPoint[], u: number, out: Frame) {
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
  // Derivative along the spine (toward the tail), then flipped to point forward.
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

/** Distance from (x, y) to the drawn koi (body and tail fin), world units; negative inside. */
export function koiDistance(spine: readonly ChainPoint[], length: number, x: number, y: number) {
  let best = Infinity;
  for (let k = 0; k <= 40; k++) {
    const u = k / 40;
    centreAt(spine, u, frame);
    const half =
      (u < BODY_END
        ? halfWidth(u)
        : Math.max(halfWidth(BODY_END), tailSpan((u - TAIL_START) / (1 - TAIL_START)) * 0.8)) * length;
    best = Math.min(best, Math.hypot(x - frame.x, y - frame.y) - half);
  }
  return best;
}

// ---- Mesh ------------------------------------------------------------------------

const frame: Frame = { x: 0, y: 0, tx: 1, ty: 0 };
/** Scratch for the body's five columns: previous x, current x, current y, previous y. */
const column = new Float64Array(20);
/** The body's columns across its width (v: +1 left edge, −1 right edge) and where each samples the skin. */
const ACROSS = [1, 0.5, 0, -0.5, -1] as const;
const skinT = new Float64Array(ACROSS.length);
/** The head foreshortens back to here when it lifts. */
const HEAD = 0.3;
const BODY_SAMPLES = 34;
const TAIL_ROWS = 8;
const TAIL_COLS = 4;
const FIN_ROWS = 3;

/** Draw ranges in the mesh, in vertices: each layer is drawn in this order. */
export interface MeshRanges {
  /** The fish's shadow on the floor (one strip). */
  fishShadow: number;
  /** Then the leaves' and pellets' shadows. */
  shadows: number;
  /** The koi's fins (tail, pelvic, pectoral), under the body. */
  fins: number;
  /** The koi's body. */
  koi: number;
  /** On the surface: pellets, then leaves. */
  surface: number;
}

/** Room for every vertex the mesh can hold. */
export const MESH_FLOATS =
  STRIDE *
  6 *
  (BODY_SAMPLES * 5 + // shadow strip, and the body in four columns
    TAIL_ROWS * TAIL_COLS +
    4 * FIN_ROWS * 2 + // two pectorals and two pelvics, two columns each
    2 * 12 + // leaves and their shadows
    2 * 9); // pellets and their shadows

/**
 * Writes the scene's triangles into `out` and returns where each layer ends
 * (cumulative vertex counts). Allocates nothing.
 */
export function buildMesh(world: KoiWorld, out: Float32Array): MeshRanges {
  let o = 0;
  const { size } = ATLAS;
  const vertex = (x: number, y: number, s: number, t: number, a: number) => {
    out[o++] = x;
    out[o++] = y;
    out[o++] = s / size;
    out[o++] = t / size;
    out[o++] = a;
  };
  // A quad from four corners (p00 p10 p01 p11), as two triangles.
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
  /** A sprite (leaf, pellet) centred at (x, y), `w` × `h` world units, turned by `angle`. */
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

  const koi = world.koi;
  const { spine, length: L } = koi;
  const shadow = world.shadowOffset();
  let fishShadow = 0;

  // ---- Shadows on the floor ----
  {
    const r = ATLAS.shadow;
    let px = 0,
      py = 0,
      pw = 0,
      pnx = 0,
      pny = 0;
    for (let k = 0; k < BODY_SAMPLES; k++) {
      const u = k / (BODY_SAMPLES - 1);
      centreAt(spine, u, frame);
      const w =
        (u < BODY_END ? Math.max(halfWidth(u), 0.03) : tailSpan((u - TAIL_START) / (1 - TAIL_START)) * 0.75) *
          L *
          1.45 +
        L * 0.03;
      const x = frame.x + shadow.x;
      const y = frame.y + shadow.y;
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
    fishShadow = o / STRIDE;
    const s = world.surfaceShadow;
    for (const leaf of world.leaves) {
      sprite(ATLAS.leafShadow, leaf.x + s.x, leaf.y + s.y, leaf.size * 1.25, leaf.size * 1.25, leaf.angle, 0.45);
    }
    for (const pellet of world.pellets) {
      if (pellet.left <= 0) continue;
      const d = world.pelletSize * 1.6;
      sprite(ATLAS.pelletShadow, pellet.x + s.x, pellet.y + s.y, d, d, 0, 0.35 * pellet.left);
    }
  }
  const shadows = o / STRIDE;

  // ---- The koi: tail fin, pelvic and pectoral fins (under the body), then the body ----
  {
    const r = ATLAS.caudal;
    const inner = r.h - r.pad * 2;
    for (let i = 0; i < TAIL_ROWS; i++) {
      const a0 = i / TAIL_ROWS;
      const a1 = (i + 1) / TAIL_ROWS;
      centreAt(spine, TAIL_START + a0 * (1 - TAIL_START), frame);
      const x0 = frame.x,
        y0 = frame.y,
        n0x = -frame.ty,
        n0y = frame.tx,
        w0 = tailSpan(a0) * L;
      centreAt(spine, TAIL_START + a1 * (1 - TAIL_START), frame);
      const x1 = frame.x,
        y1 = frame.y,
        n1x = -frame.ty,
        n1y = frame.tx,
        w1 = tailSpan(a1) * L;
      const s0 = r.x + a0 * r.w;
      const s1 = r.x + a1 * r.w;
      for (let j = 0; j < TAIL_COLS; j++) {
        const b0 = 1 - (2 * j) / TAIL_COLS;
        const b1 = 1 - (2 * (j + 1)) / TAIL_COLS;
        const t0 = r.y + r.pad + ((1 - b0) / 2) * inner;
        const t1 = r.y + r.pad + ((1 - b1) / 2) * inner;
        quad(
          x0 + n0x * w0 * b0,
          y0 + n0y * w0 * b0,
          s0,
          t0,
          x1 + n1x * w1 * b0,
          y1 + n1y * w1 * b0,
          s1,
          t0,
          x0 + n0x * w0 * b1,
          y0 + n0y * w0 * b1,
          s0,
          t1,
          x1 + n1x * w1 * b1,
          y1 + n1y * w1 * b1,
          s1,
          t1,
          1,
        );
      }
    }
  }
  const fin = (r: Region, at: number, side: number, angle: number, finLength: number, finWidth: number) => {
    centreAt(spine, at, frame);
    const nx = -frame.ty;
    const ny = frame.tx;
    const rootX = frame.x + nx * side * halfWidth(at) * 0.75 * L;
    const rootY = frame.y + ny * side * halfWidth(at) * 0.75 * L;
    // Along the fin: back and out at `angle` from the body's axis.
    const dx = -frame.tx * Math.cos(angle) + nx * side * Math.sin(angle);
    const dy = -frame.ty * Math.cos(angle) + ny * side * Math.sin(angle);
    // Across it: its leading edge faces forward.
    const cx = -dy * side;
    const cy = dx * side;
    const inner = r.h - r.pad * 2;
    for (let i = 0; i < FIN_ROWS; i++) {
      const a0 = i / FIN_ROWS;
      const a1 = (i + 1) / FIN_ROWS;
      const l0 = a0 * finLength * L;
      const l1 = a1 * finLength * L;
      const s0 = r.x + r.pad + a0 * (r.w - r.pad * 2);
      const s1 = r.x + r.pad + a1 * (r.w - r.pad * 2);
      for (let j = 0; j < 2; j++) {
        const b0 = 1 - j;
        const b1 = -j;
        const w = finWidth * L;
        const t0 = r.y + r.pad + ((1 - b0) / 2) * inner;
        const t1 = r.y + r.pad + ((1 - b1) / 2) * inner;
        quad(
          rootX + dx * l0 + cx * w * b0,
          rootY + dy * l0 + cy * w * b0,
          s0,
          t0,
          rootX + dx * l1 + cx * w * b0,
          rootY + dy * l1 + cy * w * b0,
          s1,
          t0,
          rootX + dx * l0 + cx * w * b1,
          rootY + dy * l0 + cy * w * b1,
          s0,
          t1,
          rootX + dx * l1 + cx * w * b1,
          rootY + dy * l1 + cy * w * b1,
          s1,
          t1,
          1,
        );
      }
    }
  };
  const P = OUTLINE.pectoral;
  const V = OUTLINE.pelvic;
  for (const side of [1, -1] as const) {
    const k = side === 1 ? 0 : 1;
    fin(ATLAS.pelvic, V.at, side, world.pelvicAngle[k], V.length, V.width);
    fin(ATLAS.pectoral, P.at, side, world.pectoralAngle[k], P.length, P.width);
  }
  const fins = o / STRIDE;
  {
    // The body: columns across its width, so the skin can slide across the
    // outline when the fish banks (its back moves toward the inside of the
    // turn and the outer flank shows), and the head foreshortens as it lifts.
    const r = ATLAS.skin;
    const top = r.y + r.pad;
    const span = r.h - r.pad * 2;
    const roll = world.roll;
    const slide = 0.6 * Math.sin(roll);
    const widen = Math.cos(roll) + 0.5 * POSE.depth * Math.abs(Math.sin(roll));
    const lift = Math.cos(world.pitch);
    const across = ACROSS;
    // Where each column samples the skin: v' = v − slide·(1 − v²) keeps the edges, moves the middle.
    for (let j = 0; j < across.length; j++)
      skinT[j] = top + ((1 - (across[j] - slide * (1 - across[j] ** 2))) / 2) * span;
    let ps = 0;
    for (let k = 0; k < BODY_SAMPLES; k++) {
      // Closer together at the snout, where the outline curves fastest.
      const u = BODY_END * Math.pow(k / (BODY_SAMPLES - 1), 1.35);
      const shown = u < HEAD ? HEAD - (HEAD - u) * lift : u;
      centreAt(spine, shown, frame);
      const w = halfWidth(u) * L * widen;
      const nx = -frame.ty;
      const ny = frame.tx;
      const s = r.x + 2 + (u / BODY_END) * (r.w - 4);
      for (let j = 0; j < across.length; j++) {
        const x = frame.x + nx * w * across[j];
        const y = frame.y + ny * w * across[j];
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
  const koiEnd = o / STRIDE;

  // ---- On the surface: pellets, then leaves ----
  for (const pellet of world.pellets) {
    if (pellet.left <= 0) continue;
    const d = world.pelletSize * (0.55 + 0.45 * pellet.left);
    sprite(ATLAS.pellet, pellet.x, pellet.y, d, d, pellet.spin, Math.min(1, pellet.left * 3));
  }
  for (const leaf of world.leaves) {
    sprite(leaf.kind ? ATLAS.leafB : ATLAS.leafA, leaf.x, leaf.y, leaf.size, leaf.size, leaf.angle, 1);
  }
  return { fishShadow, shadows, fins, koi: koiEnd, surface: o / STRIDE };
}
