// Paints what both renderers draw with (spec A-6, A-7): the atlas (the koi's
// skin and fins in body coordinates, leaves, food, soft shadows) and the pond
// floor. Painted pixel by pixel, seeded, with no canvas filters, so every
// browser gets the same picture. WebGL2 uploads these as textures; Canvas 2D
// draws them directly.

import { makeCanvas } from '@critters/critter-kit';
import { ATLAS, BODY_END, halfWidth, type Region } from './koi-shape';
import { OUTLINE } from './koi-motion';
import { KOI_PALETTE as P } from './theme';

type Rgb = readonly [number, number, number];
type Canvas = OffscreenCanvas | HTMLCanvasElement;
type Context = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D;

// ---- Noise ---------------------------------------------------------------------

function hash(x: number, y: number, seed: number) {
  let h = Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(seed, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function noise(x: number, y: number, seed: number) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = hash(ix, iy, seed);
  const b = hash(ix + 1, iy, seed);
  const c = hash(ix, iy + 1, seed);
  const d = hash(ix + 1, iy + 1, seed);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
function fbm(x: number, y: number, seed: number, octaves = 4) {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += noise(x, y, seed + i * 17) * amp;
    norm += amp;
    amp *= 0.5;
    x *= 2.03;
    y *= 2.03;
  }
  return sum / norm;
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const mix = (a: Rgb, b: Rgb, t: number, out: number[]) => {
  out[0] = a[0] + (b[0] - a[0]) * t;
  out[1] = a[1] + (b[1] - a[1]) * t;
  out[2] = a[2] + (b[2] - a[2]) * t;
  return out;
};
const mixInto = (out: number[], b: Rgb, t: number) => {
  out[0] += (b[0] - out[0]) * t;
  out[1] += (b[1] - out[1]) * t;
  out[2] += (b[2] - out[2]) * t;
};

/** Paints a region pixel by pixel: `shade(px, py, rgb)` fills rgb (0–1) and returns alpha (0–1). */
function paint(ctx: Context, r: Region, shade: (px: number, py: number, rgb: number[]) => number) {
  const image = ctx.createImageData(r.w, r.h);
  const data = image.data;
  const rgb = [0, 0, 0];
  for (let py = 0; py < r.h; py++) {
    for (let px = 0; px < r.w; px++) {
      const a = clamp01(shade(px + 0.5, py + 0.5, rgb));
      const o = (py * r.w + px) * 4;
      // Colour under fully transparent pixels still matters for filtering: keep it.
      data[o] = clamp01(rgb[0]) * 255;
      data[o + 1] = clamp01(rgb[1]) * 255;
      data[o + 2] = clamp01(rgb[2]) * 255;
      data[o + 3] = a * 255;
    }
  }
  ctx.putImageData(image, r.x, r.y);
}

// ---- The koi -------------------------------------------------------------------

/**
 * Kohaku patches in body coordinates: u along (BL from the snout), y across
 * (BL, + left), radii. A design choice for this specimen, not a measurement.
 */
const PATCHES = [
  // Head: a cap behind the snout, between the eyes.
  [0.118, 0.004, 0.05, 0.07],
  // First step: a broad saddle over the shoulders, wrapping down the left flank.
  [0.235, 0.03, 0.06, 0.1],
  [0.305, 0.0, 0.055, 0.085],
  [0.35, -0.035, 0.04, 0.05],
  // Second step, set off to the right.
  [0.47, -0.035, 0.05, 0.08],
  [0.525, 0.005, 0.045, 0.06],
  // A last small mark before the tail.
  [0.655, 0.012, 0.028, 0.035],
] as const;

function paintSkin(ctx: Context) {
  const r = ATLAS.skin;
  const span = r.h - r.pad * 2;
  const pixelV = 2 / span;
  const eyeU = 0.072;
  const eyeY = 0.8 * halfWidth(eyeU);
  const red = [0, 0, 0];
  paint(ctx, r, (px, py, rgb) => {
    const u = ((px - 2) / (r.w - 4)) * BODY_END;
    const v = 1 - (2 * (py - r.pad)) / span;
    const hw = halfWidth(Math.max(u, 0.002));
    const y = v * hw;
    const av = Math.abs(v);
    const dome = Math.sqrt(Math.max(0, 1 - Math.min(1, av) ** 2));
    // White skin, shaded toward the flanks; a faint paint grain.
    mix(P.skinShade, P.skin, dome ** 0.85, rgb);
    const grain = 0.975 + 0.05 * noise(px * 0.35, py * 0.35, 3);
    // Red patches with crisp, slightly ragged painted edges.
    let field = 0;
    for (const [pu, pv, ru, rv] of PATCHES) field += Math.exp(-(((u - pu) / ru) ** 2 + ((y - pv) / rv) ** 2));
    field += (fbm(u * 13, y * 13, 11) - 0.5) * 0.75 + (noise(u * 70, y * 70, 12) - 0.5) * 0.12;
    const patch = smoothstep(0.52, 0.57, field) * smoothstep(0.045, 0.07, u);
    mix(P.redDeep, P.red, dome ** 0.7, red);
    const tone = 0.93 + 0.12 * fbm(u * 40, y * 40, 5);
    red[0] *= tone;
    red[1] *= tone;
    red[2] *= tone;
    rgb[0] += (red[0] - rgb[0]) * patch;
    rgb[1] += (red[1] - rgb[1]) * patch;
    rgb[2] += (red[2] - rgb[2]) * patch;
    // Snout: a little pink where the skin is thin.
    if (u < 0.09) mixInto(rgb, P.blush, 0.4 * (1 - u / 0.09) * (1 - patch));
    // Scales: a faint net over the body behind the head.
    if (u > 0.17 && u < 0.8) {
      const s = 0.026;
      const d1 = Math.abs(((u + y) / s) % 1);
      const d2 = Math.abs(((u - y + 10) / s) % 1);
      const line = 1 - smoothstep(0, 0.3, Math.min(d1, 1 - d1, d2, 1 - d2));
      const fade = smoothstep(0.17, 0.24, u) * (1 - smoothstep(0.72, 0.8, u));
      const k = 1 - (0.025 + 0.035 * patch) * line * fade * dome;
      rgb[0] *= k;
      rgb[1] *= k;
      rgb[2] *= k;
    }
    // The gill cover's edge, curving back toward the flanks.
    const gill = Math.abs(u - (0.165 + 0.04 * v * v));
    const crease = Math.exp(-((gill / 0.005) ** 2)) * smoothstep(0.15, 0.55, av);
    rgb[0] *= 1 - 0.12 * crease;
    rgb[1] *= 1 - 0.12 * crease;
    rgb[2] *= 1 - 0.12 * crease;
    // The dorsal fin, folded along the back: a thin pale line with a shaded side.
    if (u > 0.34 && u < 0.62) {
      const taper = Math.sin((Math.PI * (u - 0.34)) / 0.28);
      const ridge = Math.exp(-((y / 0.006) ** 2)) * taper;
      const side = Math.exp(-(((y + 0.009) / 0.006) ** 2)) * taper;
      mixInto(rgb, P.fin, 0.18 * ridge);
      rgb[0] *= 1 - 0.1 * side;
      rgb[1] *= 1 - 0.1 * side;
      rgb[2] *= 1 - 0.1 * side;
    }
    // A highlight along the back, a little to the left (the light is up and to the left).
    const sheen = Math.exp(-(((v - 0.22) / 0.3) ** 2)) * smoothstep(0.08, 0.2, u) * (1 - smoothstep(0.6, 0.8, u));
    mixInto(rgb, [1, 1, 0.97], 0.16 * sheen);
    // Eyes on the sides of the head, nostrils in front of them.
    for (const sign of [1, -1]) {
      const de = Math.hypot(u - eyeU, y - sign * eyeY);
      const eye = 1 - smoothstep(0.0065, 0.0085, de);
      const rim = 1 - smoothstep(0.0085, 0.013, de);
      rgb[0] *= 1 - 0.25 * rim;
      rgb[1] *= 1 - 0.25 * rim;
      rgb[2] *= 1 - 0.25 * rim;
      mixInto(rgb, P.eye, eye);
      const glint = 1 - smoothstep(0.0015, 0.0032, Math.hypot(u - eyeU + 0.0035, y - sign * eyeY - 0.002));
      mixInto(rgb, [0.95, 0.95, 0.9], 0.8 * glint * eye);
      const nostril = 1 - smoothstep(0.0025, 0.005, Math.hypot(u - 0.034, y - sign * 0.4 * halfWidth(0.034)));
      rgb[0] *= 1 - 0.35 * nostril;
      rgb[1] *= 1 - 0.4 * nostril;
      rgb[2] *= 1 - 0.4 * nostril;
    }
    rgb[0] *= grain;
    rgb[1] *= grain;
    rgb[2] *= grain;
    // Under water: the flanks and the tail sink into the pond, as the clip shows.
    mixInto(rgb, P.water, 0.06 + 0.22 * (1 - dome) ** 2 + 0.28 * smoothstep(0.45, BODY_END, u));
    // Soft outline: the mesh's edge is v = ±1.
    return clamp01((1 - av) / pixelV + 0.5);
  });
}

/** Tail fin: forked, translucent, rays along its length. */
function paintCaudal(ctx: Context) {
  const r = ATLAS.caudal;
  const span = r.h - r.pad * 2;
  const fork = OUTLINE.tailFork / (1 - 0.76);
  paint(ctx, r, (px, py, rgb) => {
    const a = px / r.w;
    const b = 1 - (2 * (py - r.pad)) / span;
    const ab = Math.abs(b);
    const trailing = 1 - fork * Math.pow(Math.max(0, 1 - ab), 1.3) - 0.05 * smoothstep(0.85, 1, ab);
    const insideA = (trailing - a) * r.w;
    const insideB = (1 - ab) * (span / 2);
    const edge = clamp01(Math.min(insideA, insideB) / 1.5 + 0.5);
    const ray = 1 - smoothstep(0, 0.55, Math.abs(((b * 7 + 7.5) % 1) - 0.5) * 2);
    mix(P.fin, P.water, 0.06 + 0.34 * a, rgb);
    mixInto(rgb, [1, 1, 0.97], 0.3 * ray);
    const alpha = (0.9 - 0.45 * a) * (0.75 + 0.25 * ray);
    // The trailing edge is thinnest: let more water through there.
    return edge * alpha * (1 - 0.3 * smoothstep(-0.12, 0, a - trailing));
  });
}

/** A paired fin: a rounded paddle, narrow at the root, rays fanning from it. */
function paintPaired(ctx: Context, r: Region) {
  const lengthPx = r.w - r.pad * 2;
  const span = r.h - r.pad * 2;
  paint(ctx, r, (px, py, rgb) => {
    const a = (px - r.pad) / lengthPx;
    const b = 1 - (2 * (py - r.pad)) / span;
    const ac = Math.min(Math.max(a, 0), 1);
    const half = (0.42 + 0.58 * smoothstep(0, 0.55, ac)) * Math.sqrt(Math.max(0, 1 - ((ac - 0.38) / 0.62) ** 2));
    const insideB = (half - Math.abs(b)) * (span / 2);
    const insideA = Math.min(a * lengthPx, (1 - a) * lengthPx + 6);
    const edge = clamp01(Math.min(insideB, insideA) / 1.5 + 0.5);
    const ray = 1 - smoothstep(0, 0.55, Math.abs((((b / Math.max(half, 0.05)) * 4.5 + 4.5) % 1) - 0.5) * 2);
    mix(P.fin, P.water, 0.04 + 0.22 * ac, rgb);
    mixInto(rgb, [1, 1, 0.97], 0.35 * ray);
    return edge * (0.88 - 0.36 * ac) * (0.72 + 0.28 * ray);
  });
}

function paintShadowBlob(ctx: Context) {
  const r = ATLAS.shadow;
  paint(ctx, r, (_px, py, rgb) => {
    const v = Math.abs(1 - (2 * py) / r.h);
    rgb[0] = P.shadow[0];
    rgb[1] = P.shadow[1];
    rgb[2] = P.shadow[2];
    return (0.5 + 0.5 * Math.cos(Math.PI * Math.min(1, v))) ** 1.4;
  });
}

/** Leaf coverage at local (x along, y across), both −1..1, and a leaf's half-width there. */
function leafHalf(x: number) {
  return 0.4 * Math.pow(Math.max(0, 1 - x * x), 0.8) * (1 + 0.18 * x);
}

function paintLeaf(ctx: Context, r: Region, dark: number, seed: number) {
  const inner = r.w - r.pad * 2;
  const pixel = 2 / inner;
  paint(ctx, r, (px, py, rgb) => {
    const x = (2 * (px - r.pad)) / inner - 1;
    const y = 1 - (2 * (py - r.pad)) / inner;
    const curl = 0.06 * x * x;
    const half = leafHalf(x);
    const across = y - curl;
    const inside = Math.min(half - Math.abs(across), 1 - Math.abs(x));
    // A short stalk at the base.
    const stalk = x < -0.9 && x > -1.08 && Math.abs(across) < 0.025 ? 1 : 0;
    const n = fbm(x * 3 + seed, y * 3, seed);
    mix(P.leaf, P.leafDark, clamp01(dark + (n - 0.5) * 0.9), rgb);
    // Midrib and side veins, a little lighter; the edge and one half darker.
    const rib = Math.exp(-((across / 0.025) ** 2));
    const vein = Math.exp(-(((((x * 0.5 - Math.abs(across) * 0.9) * 7) % 1) - 0.5) ** 2) / 0.012);
    mixInto(rgb, [0.86, 0.72, 0.45], 0.35 * rib + 0.12 * vein * (1 - rib));
    const k = (across < 0 ? 0.86 : 1) * (1 - 0.25 * smoothstep(0.7, 1, Math.abs(across) / Math.max(half, 0.01)));
    rgb[0] *= k;
    rgb[1] *= k;
    rgb[2] *= k;
    return Math.max(clamp01(inside / pixel + 0.5), stalk);
  });
}

/** A soft, dark copy of a sprite's silhouette for its shadow on the floor (box blur, three passes). */
function paintBlurredShadow(ctx: Context, from: Region, to: Region, radius: number) {
  const source = ctx.getImageData(from.x, from.y, from.w, from.h).data;
  const w = to.w;
  const h = to.h;
  let alpha = new Float32Array(w * h);
  // The silhouette, scaled to fit 80 % of the target so the blur has room.
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sx = Math.floor(((x - w * 0.1) / (w * 0.8)) * from.w);
      const sy = Math.floor(((y - h * 0.1) / (h * 0.8)) * from.h);
      if (sx >= 0 && sy >= 0 && sx < from.w && sy < from.h) alpha[y * w + x] = source[(sy * from.w + sx) * 4 + 3] / 255;
    }
  }
  const next = new Float32Array(w * h);
  for (let pass = 0; pass < 3; pass++) {
    let a = alpha;
    let b = next;
    for (let dir = 0; dir < 2; dir++) {
      for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
          let sum = 0;
          let count = 0;
          for (let k = -radius; k <= radius; k++) {
            const xx = dir === 0 ? x + k : x;
            const yy = dir === 0 ? y : y + k;
            if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
            sum += a[yy * w + xx];
            count++;
          }
          b[y * w + x] = sum / count;
        }
      }
      [a, b] = [b, a];
    }
    alpha = a;
  }
  paint(ctx, to, (px, py, rgb) => {
    rgb[0] = P.shadow[0];
    rgb[1] = P.shadow[1];
    rgb[2] = P.shadow[2];
    return alpha[Math.floor(py) * w + Math.floor(px)];
  });
}

function paintPellet(ctx: Context) {
  const r = ATLAS.pellet;
  const inner = r.w - r.pad * 2;
  paint(ctx, r, (px, py, rgb) => {
    const x = (2 * (px - r.pad)) / inner - 1;
    const y = 1 - (2 * (py - r.pad)) / inner;
    const d = Math.hypot(x, y);
    const shade = clamp01(0.55 + 0.45 * (-x * 0.6 + y * 0.8) * Math.sqrt(Math.max(0, 1 - d * d)));
    mix(P.pelletDark, P.pellet, shade, rgb);
    mixInto(rgb, [0.95, 0.88, 0.7], 0.6 * (1 - smoothstep(0.05, 0.3, Math.hypot(x + 0.35, y - 0.4))));
    const k = 0.92 + 0.12 * noise(px * 0.8, py * 0.8, 9);
    rgb[0] *= k;
    rgb[1] *= k;
    rgb[2] *= k;
    return clamp01((0.86 - d) * inner * 0.5 + 0.5);
  });
}

let atlas: Canvas | null = null;

/** The shared atlas (painted once per page). */
export function koiAtlas(): Canvas {
  if (atlas) return atlas;
  const canvas = makeCanvas(ATLAS.size, ATLAS.size);
  const ctx = canvas.getContext('2d') as Context;
  paintSkin(ctx);
  paintCaudal(ctx);
  paintPaired(ctx, ATLAS.pectoral);
  paintPaired(ctx, ATLAS.pelvic);
  paintShadowBlob(ctx);
  paintLeaf(ctx, ATLAS.leafA, 0.25, 1);
  paintLeaf(ctx, ATLAS.leafB, 0.6, 2);
  paintBlurredShadow(ctx, ATLAS.leafA, ATLAS.leafShadow, 5);
  paintPellet(ctx);
  paintBlurredShadow(ctx, ATLAS.pellet, ATLAS.pelletShadow, 3);
  atlas = canvas;
  return canvas;
}

// ---- The pond floor ----------------------------------------------------------------

/** Pale stones lying in the silt: world x as a share of the width, y, radius (design). */
const STONES = [
  [0.14, 0.22, 0.05],
  [0.2, 0.3, 0.035],
  [0.83, 0.74, 0.06],
  [0.9, 0.66, 0.035],
  [0.62, 0.12, 0.04],
] as const;

const FLOOR_HEIGHT = 320;
const floors = new Map<number, Canvas>();

/** The pond floor as seen through the water, for this aspect (cached by aspect to 0.02). */
export function koiFloor(aspect: number): Canvas {
  const key = Math.round(aspect * 50) / 50;
  const cached = floors.get(key);
  if (cached) return cached;
  const h = FLOOR_HEIGHT;
  const w = Math.max(1, Math.round(h * key));
  const canvas = makeCanvas(w, h);
  const ctx = canvas.getContext('2d') as Context;
  const region = { x: 0, y: 0, w, h, pad: 0 };
  paint(ctx, region, (px, py, rgb) => {
    const x = px / h;
    const y = 1 - py / h;
    // Deeper toward the edges of the picture.
    const dx = (x - key / 2) / (key / 2);
    const dy = (y - 0.5) / 0.5;
    const edge = Math.min(1, Math.hypot(dx * 0.9, dy));
    mix(P.deep, P.water, 0.85 - 0.6 * edge * edge, rgb);
    // Silt blotches and fine sediment.
    const silt = fbm(x * 3.1 + 2, y * 3.1, 21);
    mixInto(rgb, P.silt, 0.55 * smoothstep(0.42, 0.72, silt));
    const fine = fbm(x * 16, y * 16, 33, 3);
    const k = 0.94 + 0.12 * fine;
    rgb[0] *= k;
    rgb[1] *= k;
    rgb[2] *= k;
    // A few pale stones, half buried, very soft (the water is murky).
    for (const [sx, sy, sr] of STONES) {
      const d = Math.hypot((x - sx * key) / 1.25, y - sy) / sr;
      const stone = 1 - smoothstep(0.55, 1.05, d + (fbm(x * 30, y * 30, 7, 2) - 0.5) * 0.4);
      mixInto(rgb, P.sheen, 0.07 * stone);
    }
    // The sky, faint on the surface toward the top left.
    const sky = smoothstep(0.35, 1.2, y - (x * 0.35) / key + 0.2 * fbm(x * 2, y * 2, 41));
    mixInto(rgb, P.sheen, 0.12 * sky);
    return 1;
  });
  floors.set(key, canvas);
  return canvas;
}
