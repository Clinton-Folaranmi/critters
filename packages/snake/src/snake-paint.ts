// Paints what both renderers draw with (spec A-6, A-7): the shared 1024×1024
// atlas (the grass snake's keeled olive skin, wet dorsal specular sheen,
// yellow-and-black Natrix collar, head shields, golden-ringed eyes, forked
// black tongue, overhanging sedge/grass stems, fallen leaves, scent mark and
// soft shadows) and the sunlit meadow bank floor.
//
// The floor uses the same heightfield slope-shading and botanical turf-painting
// approach as frog-bank-paint.ts: a 3D heightfield of warm earth and mossy
// slopes around a sun-warmed earthen basking path, hundreds of natural pebbles
// and weathered stones along the path edge, ~1,600 fine quadratic-Bezier grass
// blades with cast shadows and sunlit tip gradients, and tiny meadow wildflowers.

import { TAU, itemSeed, makeCanvas, seeded } from '@critters/critter-kit';
import { OUTLINE } from './snake-motion';
import { ATLAS, halfWidth, skinSToU, type Region } from './snake-shape';
import { SNAKE_PALETTE as P } from './theme';

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
const mixRgb = (a: Rgb, b: Rgb, t: number): Rgb => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
const mixInto = (out: number[], b: Rgb, t: number) => {
  out[0] += (b[0] - out[0]) * t;
  out[1] += (b[1] - out[1]) * t;
  out[2] += (b[2] - out[2]) * t;
};
const css = (c: Rgb, alpha = 1, scale = 1) =>
  `rgba(${Math.round(Math.min(1, c[0] * scale) * 255)}, ${Math.round(Math.min(1, c[1] * scale) * 255)}, ${Math.round(Math.min(1, c[2] * scale) * 255)}, ${alpha})`;

function paint(ctx: Context, r: Region, shade: (px: number, py: number, rgb: number[]) => number) {
  const image = ctx.createImageData(r.w, r.h);
  const data = image.data;
  const rgb = [0, 0, 0];
  for (let py = 0; py < r.h; py++) {
    for (let px = 0; px < r.w; px++) {
      const a = clamp01(shade(px + 0.5, py + 0.5, rgb));
      const o = (py * r.w + px) * 4;
      data[o] = clamp01(rgb[0]) * 255;
      data[o + 1] = clamp01(rgb[1]) * 255;
      data[o + 2] = clamp01(rgb[2]) * 255;
      data[o + 3] = a * 255;
    }
  }
  ctx.putImageData(image, r.x, r.y);
}

// ---- The grass snake -----------------------------------------------------------

function paintSkin(ctx: Context) {
  const r = ATLAS.skin;
  const span = r.h - r.pad * 2;
  const pixelV = 2 / span;
  const eyeU = 0.0175;
  const eyeV = 0.71;
  const C = OUTLINE.collar;

  paint(ctx, r, (px, py, rgb) => {
    const sNorm = clamp01((px - 2) / (r.w - 4));
    const u = skinSToU(sNorm);
    const v = 1 - (2 * (py - r.pad)) / span;
    const av = Math.abs(v);
    const hw = halfWidth(Math.max(u, 0.002));
    const dome = Math.sqrt(Math.max(0, 1 - Math.min(1, av) ** 2));
    const snoutCap = u < 0.0038 ? Math.sqrt(Math.max(0, 1 - (1 - u / 0.0038) ** 2)) : 1;

    // 1. Rich 3D cylindrical cross-section shading:
    mix(P.oliveDark, P.olive, dome ** 0.72, rgb);
    const sunSide = clamp01(0.5 + 0.55 * v);
    mixInto(rgb, P.oliveDark, (1 - sunSide) * 0.28);
    const ridge = Math.exp(-(((v - 0.2) / 0.34) ** 2)) * smoothstep(0.02, 0.075, u);
    mixInto(rgb, P.oliveLight, 0.56 * ridge);

    // Warm cream-green ventral scutes glimpsed at the outer flank rim.
    const bellyRim = smoothstep(0.78, 0.95, av) * smoothstep(0.055, 0.11, u) * (1 - smoothstep(0.82, 0.94, u));
    mixInto(rgb, P.belly, 0.48 * bellyRim);

    // 2. Alternating dark charcoal lateral bars along the flanks + subtle dorsal-lateral spots.
    if (u > 0.074 && u < 0.89) {
      const barFreq = 34;
      const sidePhase = v > 0 ? 0 : 0.5;
      const barWave = Math.sin((u * barFreq + sidePhase) * Math.PI * 2);
      const barMask =
        smoothstep(0.46, 0.8, barWave) *
        smoothstep(0.3, 0.52, av) *
        (1 - smoothstep(0.83, 0.95, av)) *
        (1 - smoothstep(0.75, 0.89, u));
      mixInto(rgb, P.collarBlack, 0.68 * barMask);

      const spotWave = Math.sin((u * barFreq * 1.02 + sidePhase + 0.5) * Math.PI * 2);
      const spotMask =
        smoothstep(0.62, 0.88, spotWave) * Math.exp(-(((av - 0.2) / 0.09) ** 2)) * (1 - smoothstep(0.72, 0.88, u));
      mixInto(rgb, P.collarBlack, 0.42 * spotMask);
    }

    // 3. Overlapping keeled dorsal scales (u > 0.066).
    let scaleGlint = 0.5;
    if (u > 0.066 && u < 0.96) {
      const su = u * 96;
      const sv = v * 8.5;
      const row = Math.floor(sv + 20);
      const cellU = (su + (row & 1) * 0.5) % 1;
      const cellV = ((sv + 20) % 1) - 0.5;
      const rimDist = Math.abs(cellU - 0.5) * 1.12 + Math.abs(cellV) * 1.32;
      const scaleEdge = smoothstep(0.4, 0.55, rimDist);
      const keel =
        Math.exp(-((cellV / 0.12) ** 2)) * smoothstep(0.14, 0.42, cellU) * (1 - smoothstep(0.58, 0.86, cellU));
      const fade = smoothstep(0.066, 0.086, u) * (1 - smoothstep(0.88, 0.96, u));
      const scaleMod = 1 - 0.22 * scaleEdge * fade + 0.14 * keel * fade * dome;
      rgb[0] *= scaleMod;
      rgb[1] *= scaleMod;
      rgb[2] *= scaleMod;
      scaleGlint = (1 - scaleEdge * 0.7) * (0.65 + 0.55 * keel);
    }

    // 4. The signature Natrix natrix collar: luminous lunar-yellow crescents + velvet jet-black posterior bar.
    if (u > 0.032 && u < 0.078) {
      const curve = 0.004 * (1 - av);
      const scallop = 0.0008 * Math.sin(av * 28);
      const uCol = u - curve + scallop;
      const dorsalGap = smoothstep(0.07, 0.19, av);

      const yellowAlong =
        smoothstep(C.yellowStart - 0.0022, C.yellowStart + 0.0022, uCol) *
        (1 - smoothstep(C.yellowEnd - 0.0022, C.yellowEnd + 0.002, uCol));
      const yellowPatch = yellowAlong * dorsalGap * smoothstep(0.98, 0.8, av);
      if (yellowPatch > 0) {
        const yTone = 0.9 + 0.16 * dome + 0.06 * sunSide;
        mixInto(
          rgb,
          [P.collarYellow[0] * yTone, P.collarYellow[1] * yTone, P.collarYellow[2] * yTone],
          yellowPatch * 0.96,
        );
      }

      const blackEnd = C.blackEnd - 0.0055 * (1 - av);
      const blackAlong =
        smoothstep(C.blackStart - 0.002, C.blackStart + 0.002, uCol) *
        (1 - smoothstep(blackEnd - 0.0025, blackEnd + 0.002, uCol));
      const blackPatch = blackAlong * smoothstep(0.05, 0.16, av);
      if (blackPatch > 0) {
        mixInto(rgb, P.collarBlack, blackPatch * 0.95);
      }
    }

    // 5. Head shields, supraocular brow ridges, labial bars, nostrils and golden-ringed eyes (u < 0.044).
    if (u < 0.044) {
      const headShare = 1 - smoothstep(0.035, 0.044, u);
      mixInto(rgb, [0.35, 0.42, 0.21], 0.38 * headShare);
      const crownLit = Math.exp(-(((v - 0.14) / 0.38) ** 2)) * smoothstep(0.005, 0.028, u);
      mixInto(rgb, P.oliveLight, 0.28 * crownLit * headShare);

      const midSeam = Math.exp(-((v / 0.038) ** 2)) * smoothstep(0.018, 0.022, u) * (1 - smoothstep(0.033, 0.038, u));
      const browSeam =
        Math.exp(-(((av - 0.44) / 0.042) ** 2)) * smoothstep(0.01, 0.015, u) * (1 - smoothstep(0.029, 0.034, u));
      const seam = 1 - 0.24 * (midSeam + browSeam) * headShare;
      rgb[0] *= seam;
      rgb[1] *= seam;
      rgb[2] *= seam;

      if (av > 0.74 && u < 0.036) {
        const labial = smoothstep(0.74, 0.92, av) * (1 - smoothstep(0.029, 0.036, u));
        mixInto(rgb, P.collarYellow, 0.54 * labial);
        const suture = Math.exp(-((((u * 250) % 1) - 0.5) ** 2) / 0.016) * labial;
        mixInto(rgb, P.collarBlack, 0.74 * suture);
      }

      for (const sign of [1, -1]) {
        const ey = sign * eyeV * hw;
        const y = v * hw;
        const de = Math.hypot(u - eyeU, (y - ey) * 1.12);
        const outerRim = 1 - smoothstep(0.0052, 0.0063, de);
        const iris = 1 - smoothstep(0.004, 0.005, de);
        const pupil = 1 - smoothstep(0.0023, 0.0031, de);
        if (outerRim > 0) {
          mixInto(rgb, P.collarBlack, 0.82 * outerRim);
          mixInto(rgb, P.eyeGold, 0.94 * iris);
          mixInto(rgb, P.eyeDark, 0.97 * pupil);
          const glint = 1 - smoothstep(0.0008, 0.0016, Math.hypot(u - eyeU + 0.0012, y - ey - 0.001));
          mixInto(rgb, [1, 0.99, 0.92], 0.95 * glint * iris);
        }
        const dn = Math.hypot(u - 0.0068, y - sign * 0.52 * halfWidth(0.0068));
        const nostril = 1 - smoothstep(0.0011, 0.002, dn);
        rgb[0] *= 1 - 0.58 * nostril;
        rgb[1] *= 1 - 0.58 * nostril;
        rgb[2] *= 1 - 0.58 * nostril;
      }
    }

    // 6. Crisp glossy specular ribbon along the sunlit dorsal ridge.
    const broadSheen =
      Math.exp(-(((v - 0.22) / 0.19) ** 2)) * smoothstep(0.008, 0.05, u) * (1 - smoothstep(0.84, 0.97, u));
    const tightHighlight =
      Math.exp(-(((v - 0.24) / 0.085) ** 2)) * smoothstep(0.015, 0.06, u) * (1 - smoothstep(0.8, 0.95, u)) * scaleGlint;
    mixInto(rgb, P.sun, 0.18 * broadSheen + 0.24 * tightHighlight);

    const grain = 0.97 + 0.06 * noise(px * 0.5, py * 0.5, 7);
    rgb[0] *= grain;
    rgb[1] *= grain;
    rgb[2] *= grain;

    return clamp01((snoutCap - av) / pixelV + 0.5);
  });
}

function paintTongue(ctx: Context) {
  const r = ATLAS.tongue;
  const lenPx = r.w - r.pad * 2;
  const span = r.h - r.pad * 2;
  const forkAt = OUTLINE.tongue.forkAt;
  paint(ctx, r, (px, py, rgb) => {
    const a = (px - r.pad) / lenPx;
    const b = 1 - (2 * (py - r.pad)) / span;
    if (a < 0 || a > 1) return 0;
    const ab = Math.abs(b);
    mix(P.tongueBase, P.tongue, smoothstep(0, 0.45, a), rgb);
    if (a < forkAt) {
      const half = 0.19 * (1 - 0.15 * a);
      return clamp01(((half - ab) * span) / 2 + 0.5);
    }
    const t = (a - forkAt) / (1 - forkAt);
    const center = 0.12 + 0.62 * Math.pow(t, 1.15);
    const half = 0.15 * (1 - 0.72 * t);
    const tipFade = 1 - smoothstep(0.88, 1.0, t);
    return clamp01(((half - Math.abs(ab - center)) * span) / 2 + 0.5) * tipFade;
  });
}

function paintShadowBlob(ctx: Context) {
  const r = ATLAS.shadow;
  paint(ctx, r, (_px, py, rgb) => {
    const v = Math.abs(1 - (2 * py) / r.h);
    rgb[0] = P.shadow[0];
    rgb[1] = P.shadow[1];
    rgb[2] = P.shadow[2];
    const penumbra = (0.5 + 0.5 * Math.cos(Math.PI * Math.min(1, v))) ** 1.3;
    const core = Math.exp(-((v / 0.38) ** 2));
    return clamp01(0.68 * penumbra + 0.32 * core);
  });
}

function leafHalf(x: number) {
  return 0.34 * Math.pow(Math.max(0, 1 - x * x), 0.78) * (1 + 0.15 * x);
}

function paintLeaf(ctx: Context, r: Region, dark: number, seed: number) {
  const inner = r.w - r.pad * 2;
  const pixel = 2 / inner;
  paint(ctx, r, (px, py, rgb) => {
    const x = (2 * (px - r.pad)) / inner - 1;
    const y = 1 - (2 * (py - r.pad)) / inner;
    const curl = 0.05 * x * x;
    const half = leafHalf(x);
    const across = y - curl;
    const inside = Math.min(half - Math.abs(across), 1 - Math.abs(x));
    const stalk = x < -0.9 && x > -1.08 && Math.abs(across) < 0.022 ? 1 : 0;
    const n = fbm(x * 3 + seed, y * 3, seed);
    mix(P.leaf, P.leafDark, clamp01(dark + (n - 0.5) * 0.85), rgb);
    const rib = Math.exp(-((across / 0.022) ** 2));
    mixInto(rgb, P.sun, 0.25 * rib);
    const k = (across < 0 ? 0.88 : 1) * (1 - 0.22 * smoothstep(0.7, 1, Math.abs(across) / Math.max(half, 0.01)));
    rgb[0] *= k;
    rgb[1] *= k;
    rgb[2] *= k;
    return Math.max(clamp01(inside / pixel + 0.5), stalk);
  });
}

function paintBlurredShadow(ctx: Context, from: Region, to: Region, radius: number) {
  const source = ctx.getImageData(from.x, from.y, from.w, from.h).data;
  const w = to.w;
  const h = to.h;
  let alpha = new Float32Array(w * h);
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

function paintScent(ctx: Context) {
  const r = ATLAS.scent;
  const inner = r.w - r.pad * 2;
  paint(ctx, r, (px, py, rgb) => {
    const x = (2 * (px - r.pad)) / inner - 1;
    const y = 1 - (2 * (py - r.pad)) / inner;
    const d = Math.hypot(x, y);
    mix(P.scent, P.sun, clamp01(1 - d), rgb);
    const ring = Math.exp(-(((d - 0.58) / 0.15) ** 2));
    const core = Math.exp(-((d / 0.25) ** 2));
    return clamp01(0.45 * core + 0.55 * ring) * (1 - smoothstep(0.82, 1.0, d));
  });
}

/**
 * Paints a slender overhanging sedge/grass stem (u = 0 rooted base to u = 1 fine tip).
 * Sized and shaded to match the 1,600 quadratic-Bezier turf blades painted on the bank
 * so the interactive foreground stems blend seamlessly into the meadow border.
 */
function paintGrassBlade(ctx: Context, r: Region, warmTone: number, seed: number) {
  const lenPx = r.w - r.pad * 2;
  const span = r.h - r.pad * 2;
  const pixelV = 2 / span;
  paint(ctx, r, (px, py, rgb) => {
    const u = (px - r.pad) / lenPx;
    const v = 1 - (2 * (py - r.pad)) / span;
    if (u < -0.02 || u > 1.02) return 0;
    const uc = clamp01(u);
    const av = Math.abs(v);
    // Slender sedge/fescue taper from root to fine point.
    const half = (0.48 + 0.18 * Math.sin(Math.min(1, uc / 0.4) * Math.PI * 0.5)) * Math.pow(Math.max(0, 1 - uc), 0.78);

    mix(P.grassDark, P.grass, smoothstep(0.0, 0.42, uc), rgb);
    mixInto(rgb, P.grassLight, smoothstep(0.25, 0.95, uc) * (0.68 + 0.22 * warmTone));
    if (warmTone > 0.3) {
      mixInto(rgb, P.leaf, warmTone * 0.22 * smoothstep(0.55, 0.98, uc));
    }

    const fold = v > 0 ? 1 + 0.12 * (v / Math.max(half, 0.08)) : 1 - 0.15 * (-v / Math.max(half, 0.08));
    rgb[0] *= fold;
    rgb[1] *= fold;
    rgb[2] *= fold;

    const midrib = Math.exp(-((v / 0.09) ** 2)) * (1 - smoothstep(0.75, 0.98, uc));
    const veins = 0.5 + 0.5 * Math.sin((v / Math.max(half, 0.12)) * 18 + noise(uc * 8, v * 4, seed) * 1.2);
    mixInto(rgb, P.sun, 0.22 * midrib + 0.06 * veins * smoothstep(0.15, 0.7, uc));

    const rootCap = u < 0 ? 1 + u / 0.02 : 1;
    const tipCap = u > 1 ? 1 - (u - 1) / 0.02 : 1;
    return clamp01((half - av) / pixelV + 0.5) * clamp01(rootCap) * clamp01(tipCap);
  });
}

function paintGrassShadow(ctx: Context) {
  const r = ATLAS.grassShadow;
  const lenPx = r.w - r.pad * 2;
  const span = r.h - r.pad * 2;
  paint(ctx, r, (px, py, rgb) => {
    const u = clamp01((px - r.pad) / lenPx);
    const av = Math.abs(1 - (2 * (py - r.pad)) / span);
    rgb[0] = P.shadow[0];
    rgb[1] = P.shadow[1];
    rgb[2] = P.shadow[2];
    const half = (0.5 + 0.2 * Math.sin(Math.min(1, u / 0.4) * Math.PI * 0.5)) * Math.pow(Math.max(0, 1 - u), 0.72);
    const across = Math.max(0, 1 - av / Math.max(half, 0.04));
    const ends = smoothstep(0, 0.08, u) * (1 - smoothstep(0.88, 1.0, u));
    return across ** 1.4 * ends;
  });
}

let atlas: Canvas | null = null;

/** The shared 1024×1024 atlas (painted once per page). */
export function snakeAtlas(): Canvas {
  if (atlas) return atlas;
  const canvas = makeCanvas(ATLAS.size, ATLAS.size);
  const ctx = canvas.getContext('2d') as Context;
  paintSkin(ctx);
  paintTongue(ctx);
  paintShadowBlob(ctx);
  paintLeaf(ctx, ATLAS.leafA, 0.22, 11);
  paintLeaf(ctx, ATLAS.leafB, 0.56, 23);
  paintBlurredShadow(ctx, ATLAS.leafA, ATLAS.leafShadow, 5);
  paintScent(ctx);
  paintGrassBlade(ctx, ATLAS.grassA, 0.0, 31);
  paintGrassBlade(ctx, ATLAS.grassB, 0.65, 47);
  paintGrassShadow(ctx);
  atlas = canvas;
  return canvas;
}

// ---- Sunlit meadow bank & earthen basking path floor ---------------------------

export interface MeadowStone {
  /** Fraction of picture width (x = fx * aspect). */
  fx: number;
  /** World y (0 bottom, 1 top). */
  y: number;
  /** Half-axes in world units. */
  rx: number;
  ry: number;
  /** Orientation in radians. */
  angle: number;
  seed: number;
}

/**
 * Anchor stones nestled along the edge of the earthen basking hollow.
 * Sized naturally (rx ≈ 0.024–0.036) so they read as real meadow cobbles
 * rather than oversized boulders, while giving the snake physical push-points.
 */
export const MEADOW_STONES: readonly MeadowStone[] = [
  { fx: 0.27, y: 0.63, rx: 0.034, ry: 0.023, angle: 0.26, seed: 13 },
  { fx: 0.46, y: 0.31, rx: 0.038, ry: 0.025, angle: -0.22, seed: 29 },
  { fx: 0.67, y: 0.64, rx: 0.031, ry: 0.021, angle: 0.38, seed: 43 },
  { fx: 0.2, y: 0.33, rx: 0.028, ry: 0.019, angle: -0.34, seed: 61 },
  { fx: 0.77, y: 0.36, rx: 0.03, ry: 0.02, angle: 0.18, seed: 79 },
];

/**
 * Signed distance from the sun-warmed earthen meadow trail / basking clearing
 * (< 0 on the open earthen trail and mossy clearing, 0 at the irregular turf edge,
 * > 0 up the surrounding grassy banks in the upper-left and lower-right).
 */
export function meadowBankDistance(x: number, y: number, aspect: number): number {
  const nx = x / aspect - 0.5;
  const ny = y - 0.5;
  // Winding diagonal meadow trail from bottom-left toward top-right, widened in the middle
  // and broken up by multi-scale organic fbm so it never reads as a geometric oval pit.
  const trailY = 0.05 * Math.sin(nx * 5.2 + 0.4) + 0.14 * nx;
  const across = Math.abs(ny - trailY);
  const along = Math.abs(nx) * 0.48;
  const coarse = (fbm(x * 2.8 + 1.3, y * 2.8 + 2.7, 19, 4) - 0.5) * 0.19;
  const fine = (fbm(x * 7.5 + 4.1, y * 7.5 - 1.9, 37, 3) - 0.5) * 0.07;
  return across + along * along * 0.55 - 0.22 + coarse + fine;
}

const FLOOR_HEIGHT = 640;
const floors = new Map<number, Canvas>();

/**
 * Paints the sunlit meadow bank and earthen basking hollow for this aspect,
 * using frog-bank-paint.ts's 3D heightfield slope shading, world-space soil
 * crumbs, natural pebble clusters, and ~1,600 quadratic-Bezier grass blades.
 */
export function snakeFloor(aspect: number): Canvas {
  const key = Math.round(aspect * 50) / 50;
  const cached = floors.get(key);
  if (cached) return cached;
  const h = FLOOR_HEIGHT;
  const w = Math.max(1, Math.round(h * key));
  const canvas = makeCanvas(w, h);
  const g = canvas.getContext('2d') as Context;

  const sun: readonly [number, number] = [0.54, 0.84];
  const awayX = -sun[0];
  const awayY = sun[1];
  const X = (x: number) => x * h;
  const Y = (y: number) => (1 - y) * h;

  // ---- 1. 3D Heightfield ground: warm earth, damp bank rim, moss & turf slope ----
  const heights = new Float32Array(w * h);
  const dists = new Float32Array(w * h);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const x = (i + 0.5) / h;
      const y = 1 - (j + 0.5) / h;
      const d = meadowBankDistance(x, y, key);
      dists[j * w + i] = d;
      // The grassy bank rises gently around the central earthen basking hollow, with lumps and hollows.
      heights[j * w + i] = smoothstep(-0.04, 0.09, d) * 0.85 + fbm(x * 10.5, y * 10.5, 31, 4) * 0.36;
    }
  }

  const image = g.createImageData(w, h);
  const light: [number, number, number] = [sun[0] * 0.9, sun[1] * 0.9, 0.58];
  const lightLength = Math.hypot(...light);
  const texel = 1 / h;

  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const k = j * w + i;
      const d = dists[k];
      const x = (i + 0.5) / h;
      const y = 1 - (j + 0.5) / h;

      // Finite-difference surface slope normal toward the upper-right sun.
      const dhx = (heights[j * w + Math.min(w - 1, i + 1)] - heights[j * w + Math.max(0, i - 1)]) / (2 * texel);
      const dhy = (heights[Math.max(0, j - 1) * w + i] - heights[Math.min(h - 1, j + 1) * w + i]) / (2 * texel);
      const nx = -dhx * 0.036;
      const ny = -dhy * 0.036;
      const lit = Math.max(0, (nx * light[0] + ny * light[1] + light[2]) / (Math.hypot(nx, ny, 1) * lightLength));

      const n1 = fbm(x * 6.8 + 3.1, y * 6.8, 43, 4);
      const n2 = fbm(x * 28 + 5.3, y * 28 + 1.7, 67, 3);
      const n3 = fbm(x * 3.4 + 11, y * 3.4 + 4, 89, 4);

      // Patchy damp earth in the low hollows near stones and bank edges (no continuous dark ring).
      const hollowShade = Math.exp(-((d / (0.032 + 0.025 * n3)) ** 2)) * smoothstep(0.38, 0.72, n1 * 0.7 + n3 * 0.3);
      let c = mixRgb(P.soil, P.soilLight, smoothstep(0.28, 0.78, n1 * 0.75 + n3 * 0.25));
      c = mixRgb(c, P.soilDark, hollowShade * 0.48);

      // Up the surrounding banks and in patchy mossy cushions across the clearing:
      const grassy = smoothstep(-0.04, 0.08, d + (n3 - 0.5) * 0.08) * (0.4 + 0.6 * smoothstep(0.25, 0.75, n3));
      const turfCol = mixRgb(P.grassDark, P.grass, smoothstep(0.22, 0.8, n2));
      c = mixRgb(c, turfCol, grassy * 0.88);

      // Soft moss patches creeping into the edges of the earthen trail too.
      const mossy = smoothstep(0.44, 0.72, n2 * 0.55 + n1 * 0.45) * smoothstep(-0.09, 0.04, d);
      c = mixRgb(c, P.moss, mossy * 0.62);

      // World-space crumbs of earth and bits of dry litter (stronger on bare soil, like frog-bank-paint.ts).
      const crumb = hash(Math.floor(x * 580), Math.floor(y * 580), 7919) - 0.5;
      const shade = (0.56 + 0.58 * lit) * (1 + crumb * (0.42 - 0.24 * grassy));
      const rimSun = Math.max(0, lit - 0.62) * 0.24;

      // Subtle outer woodland vignette around the picture perimeter.
      const vx = (x - key / 2) / (key / 2);
      const vy = (y - 0.5) / 0.5;
      const vig = 1 - 0.22 * Math.min(1, Math.hypot(vx * 0.9, vy)) ** 2;

      const o = k * 4;
      image.data[o] = clamp01((c[0] * shade + P.sun[0] * rimSun * 0.2) * vig) * 255;
      image.data[o + 1] = clamp01((c[1] * shade + P.sun[1] * rimSun * 0.2) * vig) * 255;
      image.data[o + 2] = clamp01((c[2] * shade + P.sun[2] * rimSun * 0.2) * vig) * 255;
      image.data[o + 3] = 255;
    }
  }
  g.putImageData(image, 0, 0);

  // ---- 2. Natural stones and pebbles nestled along the path rim and bank ----
  const drawStone = (
    x: number,
    y: number,
    rxPx: number,
    ryPx: number,
    angle: number,
    tone: number,
    glintShare: number,
  ) => {
    const base = mixRgb(P.stoneDark, P.stoneLight, 0.22 + 0.68 * tone);
    const rMax = Math.max(rxPx, ryPx);
    g.save();
    g.translate(X(x), Y(y));
    // Soft cast shadow falling down-left away from the upper-right sun.
    g.fillStyle = 'rgba(12, 10, 8, 0.34)';
    g.beginPath();
    g.ellipse(awayX * rMax * 0.42, awayY * rMax * 0.42, rxPx * 1.08, ryPx * 1.08, angle, 0, TAU);
    g.fill();
    // Stone body.
    g.fillStyle = css(base, 1, 0.92);
    g.beginPath();
    g.ellipse(0, 0, rxPx, ryPx, angle, 0, TAU);
    g.fill();
    // 3D sunlit top dome toward upper-right sun.
    const top = g.createRadialGradient(sun[0] * rMax * 0.38, -sun[1] * rMax * 0.38, 0, 0, 0, rMax);
    top.addColorStop(0, css(base, 0.72, 1.32));
    top.addColorStop(1, css(base, 0));
    g.fillStyle = top;
    g.fill();
    if (glintShare > 0.5) {
      g.fillStyle = css(P.sun, 0.28);
      g.beginPath();
      g.ellipse(sun[0] * rMax * 0.32, -sun[1] * rMax * 0.32, rxPx * 0.22, ryPx * 0.14, angle, 0, TAU);
      g.fill();
    }
    g.restore();
  };

  // Anchor stones along the basking hollow margin + their companion pebbles:
  for (let idx = 0; idx < MEADOW_STONES.length; idx++) {
    const st = MEADOW_STONES[idx];
    const rand = seeded(itemSeed(10, idx));
    drawStone(st.fx * key, st.y, st.rx * h, st.ry * h, st.angle, 0.45 + 0.35 * rand(), 0.7);
    // Cluster 5–7 small companion pebbles and grit right around each anchor stone's base.
    const count = 5 + Math.floor(rand() * 3);
    for (let p = 0; p < count; p++) {
      const a = rand() * TAU;
      const dist = (0.95 + rand() * 0.85) * Math.max(st.rx, st.ry);
      const px = st.fx * key + Math.cos(a) * dist * 1.1;
      const py = st.y + Math.sin(a) * dist * 0.85;
      const pr = h * (0.0028 + rand() * rand() * 0.0075);
      const stretch = 0.62 + rand() * 0.34;
      drawStone(px, py, pr, pr * stretch, rand() * Math.PI, rand(), rand() * 0.6);
    }
  }

  // Scattered fine pebbles and earth crumbs along the rim of the earthen hollow.
  for (let i = 0; i < Math.round(95 * key); i++) {
    const rand = seeded(itemSeed(1, i));
    const x = (0.06 + rand() * 0.88) * key;
    const y = 0.06 + rand() * 0.88;
    const d = meadowBankDistance(x, y, key);
    if (d < -0.05 || d > 0.08) continue;
    const big = rand() < 0.12;
    const r = h * (big ? 0.0065 + rand() * 0.0055 : 0.0022 + rand() * rand() * 0.0048);
    const stretch = 0.6 + rand() * 0.35;
    drawStone(x, y, r, r * stretch, rand() * Math.PI, rand(), big ? 0.6 : 0);
  }

  // ---- 3. Fine quadratic-Bezier meadow grass turf around the bank (frog-bank-paint style) ----
  interface TurfBlade {
    x: number;
    y: number;
    angle: number;
    length: number;
    width: number;
    bend: number;
    tone: number;
  }
  const blades: TurfBlade[] = [];
  for (let t = 0; t < Math.round(420 * key); t++) {
    const rand = seeded(itemSeed(3, t));
    const x = (0.03 + rand() * 0.94) * key;
    const y = 0.03 + rand() * 0.94;
    const d = meadowBankDistance(x, y, key);
    // Keep the main slither trail open (d < -0.015); grow lush, patchy meadow turf up the banks.
    if (d < -0.015) continue;
    const cover =
      smoothstep(-0.015, 0.055, d) * (0.35 + 0.65 * smoothstep(0.28, 0.68, fbm(x * 3.4 + 11, y * 3.4 + 4, 53)));
    if (rand() > cover) continue;

    // Gradient pointing inward toward the open basking hollow so rim grass leans over the path edge.
    const e = 0.004;
    const toHollow = Math.atan2(
      meadowBankDistance(x, y - e, key) - meadowBankDistance(x, y + e, key),
      meadowBankDistance(x - e, y, key) - meadowBankDistance(x + e, y, key),
    );
    const onRim = d < 0.028;
    const sedge = !onRim && rand() < 0.15;
    const count = sedge ? 9 + Math.floor(rand() * 7) : 5 + Math.floor(rand() * 7);
    const lean = onRim ? toHollow + (rand() - 0.5) * 0.85 : rand() * TAU;

    for (let b = 0; b < count; b++) {
      blades.push({
        x: x + (rand() - 0.5) * 0.005,
        y: y + (rand() - 0.5) * 0.005,
        angle: lean + (rand() - 0.5) * (onRim ? 1.25 : sedge ? 0.85 : 2.1),
        length: onRim ? 0.026 + rand() * 0.032 : sedge ? 0.032 + rand() * 0.028 : 0.015 + rand() * 0.024,
        width: sedge ? 0.0012 + rand() * 0.0008 : 0.0015 + rand() * 0.0013,
        bend: (rand() - 0.5) * 0.52,
        tone: rand(),
      });
    }
  }

  const bladePath = (blade: TurfBlade, dx = 0, dy = 0) => {
    const { x, y, angle, length, width, bend } = blade;
    const bx = X(x) + dx;
    const by = Y(y) + dy;
    const tipX = bx + Math.cos(angle) * length * h;
    const tipY = by - Math.sin(angle) * length * h;
    const side = angle + Math.PI / 2;
    const ox = Math.cos(side) * width * h;
    const oy = -Math.sin(side) * width * h;
    const midX = (bx + tipX) / 2 + Math.cos(side) * bend * length * h * 0.5;
    const midY = (by + tipY) / 2 - Math.sin(side) * bend * length * h * 0.5;
    g.beginPath();
    g.moveTo(bx + ox, by + oy);
    g.quadraticCurveTo(midX + ox * 0.5, midY + oy * 0.5, tipX, tipY);
    g.quadraticCurveTo(midX - ox * 0.5, midY - oy * 0.5, bx - ox, by - oy);
    g.closePath();
  };

  // All grass shadows first, falling down-left away from the sun.
  g.fillStyle = 'rgba(8, 10, 6, 0.24)';
  for (const blade of blades) {
    bladePath(blade, awayX * h * 0.0055, awayY * h * 0.0055);
    g.fill();
  }
  // Then the sunlit grass blades.
  for (const blade of blades) {
    const facing = 0.5 + 0.5 * (Math.cos(blade.angle) * sun[0] + Math.sin(blade.angle) * sun[1]);
    const base = mixRgb(P.grassDark, P.grass, blade.tone * 0.75);
    const tip = mixRgb(base, mixRgb(P.grassLight, P.sun, 0.22), 0.35 + 0.55 * facing);
    const bx = X(blade.x);
    const by = Y(blade.y);
    const gradient = g.createLinearGradient(
      bx,
      by,
      bx + Math.cos(blade.angle) * blade.length * h,
      by - Math.sin(blade.angle) * blade.length * h,
    );
    gradient.addColorStop(0, css(base, 1, 0.78));
    gradient.addColorStop(1, css(tip, 1, 1.0));
    g.fillStyle = gradient;
    bladePath(blade);
    g.fill();
  }

  // ---- 4. Small fallen leaves and tiny meadow wildflowers in the grass ----
  for (let i = 0; i < Math.round(18 * key); i++) {
    const rand = seeded(itemSeed(4, i));
    const x = (0.08 + rand() * 0.84) * key;
    const y = 0.08 + rand() * 0.84;
    const d = meadowBankDistance(x, y, key);
    if (d < -0.03) continue;
    const r = h * (0.0045 + rand() * 0.0045);
    const tone = mixRgb(P.leaf, P.soilLight, rand() * 0.5);
    g.save();
    g.translate(X(x), Y(y));
    g.rotate(rand() * TAU);
    g.fillStyle = 'rgba(0, 0, 0, 0.2)';
    g.beginPath();
    g.ellipse(awayX * r * 0.3, awayY * r * 0.3, r, r * 0.44, 0, 0, TAU);
    g.fill();
    g.fillStyle = css(tone, 0.94);
    g.beginPath();
    g.ellipse(0, 0, r, r * 0.44, 0, 0, TAU);
    g.fill();
    g.strokeStyle = css(tone, 0.55, 0.62);
    g.lineWidth = Math.max(1, h * 0.0008);
    g.beginPath();
    g.moveTo(-r, 0);
    g.lineTo(r * 1.25, 0);
    g.stroke();
    g.restore();
  }

  const flowerCols: readonly Rgb[] = [
    [0.96, 0.85, 0.3],
    [0.98, 0.96, 0.9],
  ];
  for (let i = 0; i < Math.round(32 * key); i++) {
    const rand = seeded(itemSeed(5, i));
    const x = (0.06 + rand() * 0.88) * key;
    const y = 0.06 + rand() * 0.88;
    const d = meadowBankDistance(x, y, key);
    if (d < 0.025 || rand() > 0.68) continue;
    const r = h * (0.002 + rand() * 0.0015);
    g.fillStyle = css(flowerCols[rand() < 0.65 ? 0 : 1], 0.92);
    g.beginPath();
    g.arc(X(x), Y(y), r, 0, TAU);
    g.fill();
  }

  floors.set(key, canvas);
  return canvas;
}
