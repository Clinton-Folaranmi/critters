import { makeCanvas, seeded } from 'critter-kit';
import { FROG_GRAIN } from './frog-theme';

// The baked tiles both renderers share: the caustic web, the grain, and the
// slow drift in the water's colour. Each is painted once (the grain and drift
// once per size) and reused every frame.

/** Cells across the tile; one cell is 1/6.5 of the pond's height. */
export const CAUSTIC_CELLS = 7;
export const CAUSTIC_CELL = 1 / 6.5;
/** The caustic tile's size in world units. */
export const CAUSTIC_TILE = CAUSTIC_CELL * CAUSTIC_CELLS;

/**
 * A tileable caustic pattern (white, with the brightness in alpha): the thin
 * bright edges between neighbouring cells. Both renderers slide two copies
 * past each other at different scales, bent by a slow warp, and posterise the
 * mix into two flat tones (see caustics() in frog-shaders.ts). Painted a
 * slice at a time: work(ms) paints for about that long and says whether it's done.
 */
export function causticTileJob(size: number) {
  const random = seeded(5147);
  const cells = CAUSTIC_CELLS;
  const points = Array.from({ length: cells * cells }, () => [random(), random()] as const);
  const tile = makeCanvas(size, size);
  const ctx = tile.getContext('2d') as OffscreenCanvasRenderingContext2D | null;
  const image = ctx?.createImageData(size, size) ?? null;
  let y = 0;
  return {
    tile,
    work(budget: number) {
      if (!ctx || !image) return true;
      if (y >= size) return true;
      const end = performance.now() + budget;
      for (; y < size; y++) {
        for (let x = 0; x < size; x++) {
          const gx = (x / size) * cells;
          const gy = (y / size) * cells;
          const ix = Math.floor(gx);
          const iy = Math.floor(gy);
          // Squared distances to the nearest two cell points.
          let d1 = 81;
          let d2 = 81;
          for (let oy = -1; oy <= 1; oy++) {
            for (let ox = -1; ox <= 1; ox++) {
              const [px, py] = points[((iy + oy + cells) % cells) * cells + ((ix + ox + cells) % cells)];
              const dx = ix + ox + 0.15 + px * 0.7 - gx;
              const dy = iy + oy + 0.15 + py * 0.7 - gy;
              const d = dx * dx + dy * dy;
              if (d < d1) {
                d2 = d1;
                d1 = d;
              } else if (d < d2) {
                d2 = d;
              }
            }
          }
          const v = Math.exp(-(Math.sqrt(d2) - Math.sqrt(d1)) * 9);
          const o = (y * size + x) * 4;
          image.data[o] = 255;
          image.data[o + 1] = 250;
          image.data[o + 2] = 215;
          image.data[o + 3] = Math.round(v * 255);
        }
        if ((y & 7) === 7 && y < size - 1 && performance.now() > end) {
          y++;
          return false;
        }
      }
      ctx.putImageData(image, 0, 0);
      return true;
    },
  };
}

// ---- Noise shared with the shader ----------------------------------------------

/** The shader's hash (frog-shaders.ts), in JS. */
export function glslHash(x: number, y: number) {
  // Every step rounded to float32, as the shader computes it, so the two
  // agree however far the coordinates run (they grow with scene time).
  // Measured against the GPU: identical on lattice points 0 … 64.
  const f = Math.fround;
  const fract = (v: number) => f(v - Math.floor(v));
  const k = f(0.1031);
  const add = f(33.33);
  let a = fract(f(f(x) * k));
  let b = fract(f(f(y) * k));
  let c = a;
  // dot() as the GPU fuses it (multiply-adds rounded once; a float32
  // product is exact in a double, so this matches bit for bit).
  const d = f(c * f(a + add) + f(b * f(c + add) + f(a * f(b + add))));
  a = f(a + d);
  b = f(b + d);
  c = f(c + d);
  return fract(f(f(a + b) * c));
}
/** The shader's gradient noise (noise() in frog-shaders.ts), in JS with float32 steps: about 0 … 1. */
export function glslNoise(x: number, y: number) {
  const f = Math.fround;
  const px = f(x);
  const py = f(y);
  const ix = Math.floor(px);
  const iy = Math.floor(py);
  const fx = f(px - ix);
  const fy = f(py - iy);
  const smooth = (t: number) => f(f(f(t * t) * t) * f(f(t * f(f(t * 6) - 15)) + 10));
  const ux = smooth(fx);
  const uy = smooth(fy);
  const g = (cx: number, cy: number, dx: number, dy: number) => {
    const a = f(glslHash(cx, cy) * f(6.28318));
    return f(f(f(Math.cos(a)) * dx) + f(f(Math.sin(a)) * dy));
  };
  const a = g(ix, iy, fx, fy);
  const b = g(ix + 1, iy, f(fx - 1), fy);
  const c = g(ix, iy + 1, fx, f(fy - 1));
  const d = g(ix + 1, iy + 1, f(fx - 1), f(fy - 1));
  const top = f(a + f(f(b - a) * ux));
  const bottom = f(c + f(f(d - c) * ux));
  return f(f(f(top + f(f(bottom - top) * uy)) * f(0.7)) + 0.5);
}

// ---- Grain and drift -------------------------------------------------------------

/** The board's integer hash (painter-r2.js), 0 … 1. */
const intHash = (x: number, y: number, s: number) => {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};
/** Value noise on a lattice that repeats every `period` cells. */
const periodicNoise = (x: number, y: number, period: number, s: number) => {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const w = (v: number) => ((v % period) + period) % period;
  const a = intHash(w(ix), w(iy), s);
  const b = intHash(w(ix + 1), w(iy), s);
  const c = intHash(w(ix), w(iy + 1), s);
  const d = intHash(w(ix + 1), w(iy + 1), s);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
};

/** The grain tile's size in device pixels. */
export const GRAIN_TILE = 256;

export interface GrainTile {
  /** Device pixels per CSS pixel it was made for. */
  ratio: number;
  /** The grain, 0 … 1, row by row from the top: edges are cut against it. */
  grain: Float32Array;
  /**
   * RGBA: R the grain, G the soft-light value the grain lays over the
   * picture (fleck included), as bytes. The Canvas renderer draws the G
   * channel as grey; the shader reads both.
   */
  pixels: Uint8ClampedArray;
}

/**
 * The fine grain over everything, in device pixels so it stays as fine on a
 * dense screen (paper tooth, a slower clump, and a per-pixel hash, as on the
 * board), tileable.
 */
export function makeGrainTile(ratio: number): GrainTile {
  const size = GRAIN_TILE;
  const cell = Math.max(0.5, FROG_GRAIN.cell * ratio);
  const fine = Math.max(1, Math.round(size / cell));
  const clump = Math.max(1, Math.round(size / (cell * 3.2)));
  const grain = new Float32Array(size * size);
  const pixels = new Uint8ClampedArray(size * size * 4);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = y * size + x;
      const g =
        0.5 * periodicNoise((x / size) * fine, (y / size) * fine, fine, 1) +
        0.3 * periodicNoise((x / size) * clump, (y / size) * clump, clump, 2) +
        0.2 * intHash(x, y, 3);
      grain[i] = g;
      const fleck = intHash(i, 0, 31) > 1 - FROG_GRAIN.fleckShare ? FROG_GRAIN.fleck : 0;
      pixels[i * 4] = Math.round(g * 255);
      pixels[i * 4 + 1] = Math.round((0.5 + (g - 0.5) * FROG_GRAIN.paper + fleck) * 255);
      pixels[i * 4 + 2] = 0;
      pixels[i * 4 + 3] = 255;
    }
  }
  return { ratio, grain, pixels };
}

/** Rows of the drift map per unit of world height. */
export const DRIFT_RESOLUTION = 48;

/**
 * The slow mottle in every colour (world space, so it stays put as the canvas
 * resizes), as grey soft-light values, for the given aspect: width × height
 * pixels covering the whole picture, sampled bilinearly by both renderers.
 */
export function makeDrift(aspect: number) {
  const height = DRIFT_RESOLUTION;
  const width = Math.max(2, Math.round(DRIFT_RESOLUTION * aspect));
  const pixels = new Uint8ClampedArray(width * height * 4);
  // Value noise without a period (only its slow octaves are used).
  const noise = (x: number, y: number, s: number) => periodicNoise(x, y, 1 << 20, s);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      // World units from the top-left, as the board measured them.
      const wx = ((x + 0.5) / width) * aspect;
      const wy = (y + 0.5) / height;
      const drift = 0.65 * noise(wx * 3.2, wy * 3.2, 4) + 0.35 * noise(wx * 9, wy * 9, 5);
      const v = Math.round((0.5 + (drift - 0.5) * FROG_GRAIN.drift) * 255);
      const o = (y * width + x) * 4;
      pixels[o] = v;
      pixels[o + 1] = v;
      pixels[o + 2] = v;
      pixels[o + 3] = 255;
    }
  }
  return { width, height, pixels };
}

// ---- The sprite atlas: pads and shade, painted once per size --------------------------

/** The board's cut: coverage of a shape at signed distance d (world units), its edge softened and cut against the grain. */
export function cutEdge(d: number, sigma: number, grain: number, rough: number, band: number) {
  const x = Math.min(1, Math.max(0, (d + 2 * sigma) / (4 * sigma)));
  const a = 1 - x * x * (3 - 2 * x);
  const t = 0.5 + (grain - 0.5) * rough;
  const e = Math.min(1, Math.max(0, (a - t + band) / (2 * band)));
  return e * e * (3 - 2 * e);
}

/** A pad as the atlas needs it (frog-world.ts Pad). */
interface PadShape {
  radius: number;
  notch: number;
  damage: number;
  age: number;
}

/**
 * Signed distance to a pad's outline (world units), pad-local with the notch
 * round angle 0, grown by `grow`: a slightly wavy disc with a notch to the
 * centre and, on damaged pads, a small bite (the board's padPath).
 */
export function padDistance(pad: PadShape, index: number, x: number, y: number, grow = 1) {
  const r = Math.hypot(x, y);
  let a = Math.atan2(y, x);
  if (a < 0) a += Math.PI * 2;
  let edge = pad.radius * grow * (1 + 0.016 * Math.sin(a * 5 + index * 1.7) + 0.008 * Math.sin(a * 13 + index * 4.1));
  if (pad.damage > 0) {
    const bite = Math.cos(a - (index * 2.3 + 2));
    edge *= 1 - pad.damage * 0.2 * Math.max(0, (bite - 0.985) / 0.015);
  }
  const half = pad.notch / 2;
  const from = Math.min(a, Math.PI * 2 - a);
  const wedge = from < half ? -r * Math.sin(half - from) : r * Math.sin(Math.min(from - half, 1.5));
  return Math.max(r - edge, -wedge);
}

/** Distance from (x, y) to the segment a–b. */
const segment = (x: number, y: number, ax: number, ay: number, bx: number, by: number) => {
  const dx = bx - ax;
  const dy = by - ay;
  const h = Math.min(1, Math.max(0, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(x - ax - dx * h, y - ay - dy * h);
};

/** Where one sprite sits in the atlas: its top-left corner, and its half size, in atlas pixels. */
export interface AtlasSprite {
  x: number;
  y: number;
  half: number;
}
export interface SpriteAtlas {
  canvas: HTMLCanvasElement;
  /** Each pad's leaf (premultiplied-free RGBA, alpha the leaf) and its flat band (alpha the band). */
  leaves: AtlasSprite[];
  bands: AtlasSprite[];
  /** Each shade cluster, at SHADE_SCALE of the canvas's resolution. */
  shade: AtlasSprite[];
  /** The canvas height (pixels per world unit) it was painted for. */
  h: number;
}
/** An atlas being painted: work(ms) paints for about that long and says whether it's done. */
export interface AtlasJob {
  atlas: SpriteAtlas;
  work(budget: number): boolean;
}
/** The shade's sprites are painted at this share of the canvas's resolution (they're soft). */
export const SHADE_SCALE = 0.25;

type RGB = readonly [number, number, number];
interface AtlasStyle {
  leaf: RGB;
  vein: RGB;
  aged: RGB;
  band: RGB;
  shade: RGB;
  edges: {
    pad: { soft: number; rough: number };
    padShadow: { soft: number; rough: number };
    vein: { soft: number; rough: number; band: number; alpha: number };
    shade: { soft: number; rough: number };
    band: number;
  };
  /** Shade clusters: their leaves (x, y, turn, half length, half width) and reach. */
  clusters: readonly { reach: number; leaves: readonly (readonly number[])[] }[];
}

/**
 * Paints every pad's leaf and band, and the shade's leafy clusters, into one
 * canvas: both renderers lay these same pixels on (the WebGL one as a
 * texture), so the pads and shade match exactly. Edges are cut against the
 * grain in each sprite's own pixels, so the cut moves with the pad.
 */
export function paintAtlas(
  pads: readonly PadShape[],
  h: number,
  ratio: number,
  grain: GrainTile,
  style: AtlasStyle,
): AtlasJob {
  const E = style.edges;
  const pixel = 1 / h;
  const sigma = (soft: number) => Math.max(soft * ratio, 0.35) * pixel;
  const gap = 2;
  // Sizes first, then a simple shelf packing.
  const padHalf = pads.map((pad) => Math.ceil(pad.radius * h * 1.06 + 4 * ratio + 3));
  const shadeHalf = style.clusters.map((c) => Math.ceil((c.reach + 0.03) * h * SHADE_SCALE));
  const items = [
    ...padHalf.map((half, i) => ({ kind: 'leaf' as const, i, half })),
    ...padHalf.map((half, i) => ({ kind: 'band' as const, i, half })),
    ...shadeHalf.map((half, i) => ({ kind: 'shade' as const, i, half })),
  ];
  const order = items.map((_, i) => i).sort((a, b) => items[b].half - items[a].half);
  const width = Math.min(
    4096,
    Math.max(512, Math.ceil(Math.sqrt(items.reduce((n, it) => n + (it.half * 2 + gap) ** 2, 0)) * 1.15)),
  );
  const placed: AtlasSprite[] = items.map(() => ({ x: 0, y: 0, half: 0 }));
  let x = 0;
  let y = 0;
  let row = 0;
  for (const k of order) {
    const size = items[k].half * 2;
    if (x + size > width) {
      x = 0;
      y += row + gap;
      row = 0;
    }
    placed[k] = { x, y, half: items[k].half };
    x += size + gap;
    row = Math.max(row, size);
  }
  const height = y + row;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = Math.max(1, height);
  const ctx = canvas.getContext('2d');
  const result: SpriteAtlas = { canvas, leaves: [], bands: [], shade: [], h };
  if (!ctx) return { atlas: result, work: () => true };
  const image = ctx.createImageData(width, Math.max(1, height));
  const out = image.data;
  const g = grain.grain;
  const grainAt = (px: number, py: number) => g[((py & (GRAIN_TILE - 1)) << 8) | (px & (GRAIN_TILE - 1))];
  const put = (o: number, c: readonly number[], alpha: number) => {
    out[o] = Math.round(c[0] * 255);
    out[o + 1] = Math.round(c[1] * 255);
    out[o + 2] = Math.round(c[2] * 255);
    out[o + 3] = Math.round(alpha * 255);
  };
  // Each shade leaf as (x, y, cos, sin of its turn, the lens's arc radius, half width).
  const leafShapes = style.clusters.map((c) =>
    c.leaves.map(([x, y, turn, a, b]) => [x, y, Math.cos(turn), Math.sin(turn), (a * a + b * b) / (2 * b), b] as const),
  );
  /** Paints one row of sprite k. */
  const paintRow = (k: number, py: number) => {
    const item = items[k];
    const at = placed[k];
    const size = at.half * 2;
    if (item.kind === 'shade') {
      const leaves = leafShapes[item.i];
      const unit = 1 / (h * SHADE_SCALE); // world units per sprite pixel
      const s = Math.max(E.shade.soft * ratio, 0.35) * pixel;
      for (let px = 0; px < size; px++) {
        const wx = (px + 0.5 - at.half) * unit;
        const wy = -(py + 0.5 - at.half) * unit;
        let d = 1e5;
        for (let l = 0; l < leaves.length; l += 1) {
          const [lx, ly, c, sn, r, b] = leaves[l];
          const qx = (wx - lx) * c + (wy - ly) * sn;
          const qy = Math.abs(-(wx - lx) * sn + (wy - ly) * c) + r - b;
          d = Math.min(d, Math.sqrt(qx * qx + qy * qy) - r);
        }
        const cover = cutEdge(d, s, grainAt(px, py), E.shade.rough, E.band);
        put(((at.y + py) * width + at.x + px) * 4, style.shade, cover);
      }
      return;
    }
    const pad = pads[item.i];
    const index = item.i;
    if (item.kind === 'band') {
      const far = pad.radius * 1.025 + 2 * sigma(E.padShadow.soft);
      for (let px = 0; px < size; px++) {
        const bx = (px + 0.5 - at.half) * pixel;
        const by = -(py + 0.5 - at.half) * pixel;
        // Well outside the leaf's widest point: nothing to paint.
        if (bx * bx + by * by > far * far) {
          put(((at.y + py) * width + at.x + px) * 4, style.band, 0);
          continue;
        }
        const d = padDistance(pad, index, bx, by);
        const cover = cutEdge(d, sigma(E.padShadow.soft), grainAt(px, py), E.padShadow.rough, E.band);
        put(((at.y + py) * width + at.x + px) * 4, style.band, cover);
      }
      return;
    }
    const half = pad.notch / 2;
    const step = (Math.PI * 2 - pad.notch - 0.5) / 8;
    const veinHalf = Math.max(ratio * pixel, 0.0022) / 2;
    const aged = pad.age > 0.4 ? Math.min(0.6, pad.age * 0.75) : 0;
    const far = pad.radius * 1.025 + 2 * sigma(E.pad.soft);
    for (let px = 0; px < size; px++) {
      const lx = (px + 0.5 - at.half) * pixel;
      const ly = -(py + 0.5 - at.half) * pixel;
      if (lx * lx + ly * ly > far * far) {
        put(((at.y + py) * width + at.x + px) * 4, style.leaf, 0);
        continue;
      }
      const d = padDistance(pad, index, lx, ly);
      const gr = grainAt(px, py);
      const leaf = cutEdge(d, sigma(E.pad.soft), gr, E.pad.rough, E.band);
      if (leaf <= 0) {
        put(((at.y + py) * width + at.x + px) * 4, style.leaf, 0);
        continue;
      }
      colour[0] = style.leaf[0];
      colour[1] = style.leaf[1];
      colour[2] = style.leaf[2];
      if (aged > 0) {
        const rim = Math.max(d, -padDistance(pad, index, lx, ly, 0.9));
        const kr = cutEdge(rim, sigma(1.6), gr, 0.8, E.band) * aged;
        for (let c = 0; c < 3; c++) colour[c] += (style.aged[c] - colour[c]) * kr;
      }
      // Veins: nine faint radial strokes from the stem, clear of the notch.
      let a = Math.atan2(ly, lx);
      if (a < 0) a += Math.PI * 2;
      const v = Math.min(8, Math.max(0, Math.floor((a - half - 0.25) / step + 0.5)));
      const va = half + 0.25 + v * step;
      const cx = Math.cos(va) * pad.radius;
      const cy = Math.sin(va) * pad.radius;
      const vein = segment(lx, ly, cx * 0.12, cy * 0.12, cx * 0.78, cy * 0.78) - veinHalf;
      const kv = cutEdge(vein, sigma(E.vein.soft), gr, E.vein.rough, E.vein.band) * E.vein.alpha;
      for (let c = 0; c < 3; c++) colour[c] += (style.vein[c] - colour[c]) * kv;
      put(((at.y + py) * width + at.x + px) * 4, colour, leaf);
    }
  };
  const colour = [0, 0, 0];
  items.forEach((item, k) => {
    if (item.kind === 'shade') result.shade[item.i] = placed[k];
    else if (item.kind === 'band') result.bands[item.i] = placed[k];
    else result.leaves[item.i] = placed[k];
  });
  // Painted a few rows at a time, so no one task is long (spec F-13).
  let k = 0;
  let py = 0;
  return {
    atlas: result,
    work(budget: number) {
      if (k >= items.length) return true;
      const end = performance.now() + budget;
      while (k < items.length) {
        paintRow(k, py);
        py += 1;
        if (py >= placed[k].half * 2) {
          k += 1;
          py = 0;
        }
        if ((py & 7) === 0 && performance.now() > end) break;
      }
      if (k < items.length) return false;
      ctx.putImageData(image, 0, 0);
      return true;
    },
  };
}
