import { TAU } from 'critter-kit';
import {
  CAUSTIC_TILE,
  GRAIN_TILE,
  SHADE_SCALE,
  glslNoise,
  causticTileJob,
  makeDrift,
  makeGrainTile,
  type GrainTile,
  type SpriteAtlas,
} from './frog-caustics';
import { RIPPLE_ARCS, RIPPLE_SLOTS } from './frog-shaders';
import {
  FROG_LINES,
  FROG_LOOKS,
  FROG_PALETTE,
  FROG_SPOTS,
  FROG_TONGUE,
  HALO_GROW,
  LILY,
  LOOSE_PETALS,
  PAD_BAND,
  RIPPLE,
  SHADE_CLUSTERS,
  lighten,
  shadeCentre,
} from './frog-theme';
import {
  atlasBaker,
  canvasRatio,
  frogOrder,
  rippleArcs,
  type FrogRenderer,
  type FrogRendererHooks,
} from './frog-webgl';
import { FORE_TOE, FROG_CAPSULES, FROG_LIFT, HIND_TOE, type Frog, type FrogWorld, type Pad } from './frog-world';

// The no-WebGL version of the frog pond: the same world, rig, palette, shapes
// and order as the shader (frog-shaders.ts), drawn with Canvas 2D. What never
// changes shape (the pads, the shade's leaves) is painted once per size with
// its edges cut against the grain, then moved, turned and laid on each frame;
// the frogs are flat paths; the caustics are posterised each frame at a third
// of the resolution; and the grain and drift go over everything as
// soft-light, the same formula the shader uses. Loaded only when WebGL can't
// be used.

type RGB = readonly [number, number, number];
const css = (c: RGB) => `rgb(${Math.round(c[0] * 255)}, ${Math.round(c[1] * 255)}, ${Math.round(c[2] * 255)})`;
const P = FROG_PALETTE;
const COLOURS = {
  water: css(P.water),
  ripple: css(P.ripple),
  white: css(P.white),
  petalInner: css(P.petalInner),
  gold: css(P.gold),
  ink: css(P.ink),
  shadow: css(P.shadow),
  shadowDeep: css(P.shadowDeep),
  tongue: css(FROG_TONGUE),
};
const LOOKS = FROG_LOOKS.map((look) => ({
  skin: css(look.skin),
  mark: css(look.mark),
  accent: css(look.accent),
  iris: css(look.iris),
  highlight: css(lighten(look.skin, 0.24)),
  lid: css(lighten(look.skin, -0.15)),
  bars: look.bars,
}));
// Leg capsule radii (start, end) by part, as in legsSDF.
const LEG_RADII = [
  [0.125, 0.074],
  [0.078, 0.048],
  [0.05, 0.034],
  [0.05, 0.038],
  [0.038, 0.028],
] as const;
const SUN = P.sun;
const SUN_LENGTH = Math.hypot(SUN[0], SUN[1]);
/** Away from the key light: every band falls this way (down-left). */
const AWAY = [-SUN[0] / SUN_LENGTH, -SUN[1] / SUN_LENGTH] as const;
/** The caustics are posterised at one pixel in this many. */
const CAUSTIC_STEP = 3;
/** The warp is worked out on a grid this many caustic pixels apart, and blended between. */
const WARP_STEP = 8;

const canvasOf = (width: number, height: number) => {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(width));
  c.height = Math.max(1, Math.ceil(height));
  return c;
};

export function createFrogCanvas(
  canvas: HTMLCanvasElement,
  world: FrogWorld,
  ripples: Float32Array,
  hooks: FrogRendererHooks = {},
): FrogRenderer {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('2D canvas context creation failed.');
  const ctx = context;

  // ---- Baked once ----------------------------------------------------------------
  // The caustic tile, painted a slice at a time; its brightness is read once it's done.
  const causticJob = causticTileJob(256);
  let causticReady = false;
  const causticAlpha = new Float32Array(256 * 256);
  const readCaustics = () => {
    causticReady = causticJob.work(6);
    if (!causticReady) return;
    const g = (causticJob.tile as HTMLCanvasElement | OffscreenCanvas).getContext('2d') as
      | CanvasRenderingContext2D
      | OffscreenCanvasRenderingContext2D
      | null;
    const data = g?.getImageData(0, 0, 256, 256).data;
    if (data) for (let i = 0; i < 256 * 256; i++) causticAlpha[i] = data[i * 4 + 3] / 255;
  };
  const sampleCaustic = (u: number, v: number) => {
    const x = (u - Math.floor(u)) * 256 - 0.5;
    const y = (v - Math.floor(v)) * 256 - 0.5;
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const i0 = x0 & 255;
    const i1 = (x0 + 1) & 255;
    const j0 = (y0 & 255) * 256;
    const j1 = ((y0 + 1) & 255) * 256;
    const a = causticAlpha[j0 + i0];
    const b = causticAlpha[j0 + i1];
    const c = causticAlpha[j1 + i0];
    const d = causticAlpha[j1 + i1];
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  };
  const causticTones = [
    [Math.round(P.causticLow[0] * 255), Math.round(P.causticLow[1] * 255), Math.round(P.causticLow[2] * 255)],
    [Math.round(P.causticHigh[0] * 255), Math.round(P.causticHigh[1] * 255), Math.round(P.causticHigh[2] * 255)],
  ];

  // ---- Baked per size --------------------------------------------------------------
  let h = 1;
  let width = 0;
  let height = 0;
  let ratio = 1;
  let aspect = 1;
  let grain: GrainTile | null = null;
  let paper: CanvasPattern | null = null;
  let drift: HTMLCanvasElement | null = null;
  let driftAspect = 0;
  let causticCanvas: HTMLCanvasElement | null = null;
  let causticImage: ImageData | null = null;
  let warp = new Float32Array(0);
  let warpColumns = 0;
  /** The pads and the shade, painted once per size (paintAtlas, shared with the WebGL renderer). */
  const baker = atlasBaker(world, () => hooks.onChange?.());
  let atlas: SpriteAtlas | null = null;
  let ready = false;

  const sx = (x: number) => x * h;
  const sy = (y: number) => (1 - y) * h;

  /** The grain at a device pixel of the picture. */
  const grainAt = (x: number, y: number) =>
    grain ? grain.grain[(((y | 0) & (GRAIN_TILE - 1)) * GRAIN_TILE) | ((x | 0) & (GRAIN_TILE - 1))] : 0.5;

  const fit = () => {
    const w = canvas.width;
    const hh = canvas.height;
    const r = canvasRatio(canvas);
    const sizeChanged = w !== width || hh !== height;
    width = w;
    height = hh;
    h = hh;
    aspect = w / Math.max(1, hh);
    if (!grain || grain.ratio !== r || !paper) {
      ratio = r;
      grain = makeGrainTile(r);
      const tile = canvasOf(GRAIN_TILE, GRAIN_TILE);
      const g = tile.getContext('2d');
      if (g) {
        const image = g.createImageData(GRAIN_TILE, GRAIN_TILE);
        for (let i = 0; i < GRAIN_TILE * GRAIN_TILE; i++) {
          const v = grain.pixels[i * 4 + 1];
          image.data[i * 4] = v;
          image.data[i * 4 + 1] = v;
          image.data[i * 4 + 2] = v;
          image.data[i * 4 + 3] = 255;
        }
        g.putImageData(image, 0, 0);
      }
      paper = ctx.createPattern(tile, 'repeat');
    }
    const rounded = Math.round(aspect * 100) / 100;
    if (rounded !== driftAspect) {
      driftAspect = rounded;
      const map = makeDrift(rounded);
      drift = canvasOf(map.width, map.height);
      const g = drift.getContext('2d');
      if (g) {
        const image = g.createImageData(map.width, map.height);
        image.data.set(map.pixels);
        g.putImageData(image, 0, 0);
      }
    }
    if (sizeChanged || !causticCanvas) {
      causticCanvas = canvasOf(w / CAUSTIC_STEP, hh / CAUSTIC_STEP);
      causticImage = causticCanvas.getContext('2d')?.createImageData(causticCanvas.width, causticCanvas.height) ?? null;
      warpColumns = Math.ceil(causticCanvas.width / WARP_STEP) + 2;
      warp = new Float32Array(warpColumns * (Math.ceil(causticCanvas.height / WARP_STEP) + 2) * 2);
    }
    if (grain) baker.fit(hh, ratio, grain);
    atlas = baker.atlas;
  };

  // ---- Water ------------------------------------------------------------------------
  /** The caustic field posterised into two tones (caustics() in the shader), at a third of the size. */
  const drawCaustics = (time: number) => {
    if (!causticCanvas || !causticImage) return;
    const cw = causticCanvas.width;
    const ch = causticCanvas.height;
    const unit = CAUSTIC_STEP / h; // world units per caustic pixel
    // The warp, on a coarse grid.
    const rows = Math.ceil(ch / WARP_STEP) + 2;
    for (let j = 0; j < rows; j++) {
      for (let i = 0; i < warpColumns; i++) {
        const px = (i * WARP_STEP + 0.5) * unit;
        const py = 1 - (j * WARP_STEP + 0.5) * unit;
        const o = (j * warpColumns + i) * 2;
        warp[o] = glslNoise(px * 2.3 + time * 0.07, py * 2.3 + time * 0.07) - 0.5;
        warp[o + 1] = glslNoise(px * 2.3 + 17 - time * 0.06, py * 2.3 + 17 - time * 0.06) - 0.5;
      }
    }
    const d = causticImage.data;
    const [low, high] = causticTones;
    const steps = P.causticSteps;
    const jitter = P.causticJitter;
    const tile = CAUSTIC_TILE;
    const ax = (time * 0.011) / tile;
    const ay = (time * 0.006) / tile;
    const bx = (time * -0.008) / (tile * 0.71);
    const by = (time * 0.01) / (tile * 0.71);
    for (let y = 0; y < ch; y++) {
      const gy = y / WARP_STEP;
      const j = gy | 0;
      const fy = gy - j;
      const wy = 1 - (y + 0.5) * unit;
      for (let x = 0; x < cw; x++) {
        const gx = x / WARP_STEP;
        const i = gx | 0;
        const fx = gx - i;
        const o00 = (j * warpColumns + i) * 2;
        const o01 = o00 + warpColumns * 2;
        const wxw =
          (warp[o00] * (1 - fx) + warp[o00 + 2] * fx) * (1 - fy) + (warp[o01] * (1 - fx) + warp[o01 + 2] * fx) * fy;
        const wyw =
          (warp[o00 + 1] * (1 - fx) + warp[o00 + 3] * fx) * (1 - fy) +
          (warp[o01 + 1] * (1 - fx) + warp[o01 + 3] * fx) * fy;
        const wx = (x + 0.5) * unit;
        const qx = (wx + wxw * 0.18) / tile;
        const qy = (wy + wyw * 0.18) / tile;
        // Texture v runs down the tile from its top row; world y runs up.
        const a = sampleCaustic(qx - ax, qy - ay);
        const b = sampleCaustic(qx / 0.71 - bx, qy / 0.71 - by);
        const v = a * 0.45 + b * 0.3 + a * b * 1.1 + (grainAt(x * CAUSTIC_STEP, y * CAUSTIC_STEP) - 0.5) * jitter;
        const o = (y * cw + x) * 4;
        const tone = v > steps[1] ? high : v > steps[0] ? low : null;
        if (tone) {
          d[o] = tone[0];
          d[o + 1] = tone[1];
          d[o + 2] = tone[2];
          d[o + 3] = 255;
        } else d[o + 3] = 0;
      }
    }
    causticCanvas.getContext('2d')?.putImageData(causticImage, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(causticCanvas, 0, 0, cw * CAUSTIC_STEP, ch * CAUSTIC_STEP);
  };

  const arcs = new Float32Array(RIPPLE_SLOTS * RIPPLE_ARCS * 2);
  const drawRipples = (time: number) => {
    ctx.strokeStyle = COLOURS.ripple;
    ctx.lineCap = 'round';
    ctx.lineWidth = Math.max(1.4 * ratio, 0.0032 * h);
    for (let i = 0; i < RIPPLE_SLOTS; i++) {
      const start = ripples[i * 4 + 2];
      const age = time - start;
      if (start <= 0 || age < 0 || age >= RIPPLE.life) continue;
      const x = ripples[i * 4];
      const y = ripples[i * 4 + 1];
      rippleArcs(x, y, arcs, i * RIPPLE_ARCS * 2);
      const r0 = RIPPLE.start + age * RIPPLE.speed;
      ctx.globalAlpha = 0.9 * (1 - age / RIPPLE.life) * Math.min(1, ripples[i * 4 + 3] * 2);
      ctx.beginPath();
      for (let ring = 0; ring < 2; ring++) {
        const r = r0 - ring * RIPPLE.gap;
        if (r <= 0.012) continue;
        for (let k = 0; k < 3; k++) {
          const o = i * RIPPLE_ARCS * 2 + (ring * 3 + k) * 2;
          const a0 = arcs[o];
          const len = arcs[o + 1];
          ctx.moveTo(sx(x + Math.cos(a0) * r), sy(y + Math.sin(a0) * r));
          ctx.arc(sx(x), sy(y), r * h, -a0, -(a0 + len), true);
        }
      }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  };

  // ---- Pads, the lily, petals, midges -----------------------------------------------
  const placePad = (pad: Pad, dx: number, dy: number) => {
    // A sprite painted for another height (while a new one paints) is scaled to fit.
    const bob = (1 + pad.bob * Math.sin(pad.bobPhase) * 0.03) * (atlas ? h / atlas.h : 1);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.translate(sx(pad.x + dx), sy(pad.y + dy));
    ctx.rotate(-pad.angle);
    ctx.scale(bob, bob);
  };
  const drawPads = () => {
    if (!atlas) return;
    const image = atlas.canvas;
    ctx.globalCompositeOperation = 'multiply';
    for (let i = 0; i < world.pads.length; i++) {
      const at = atlas.bands[i];
      placePad(world.pads[i], AWAY[0] * PAD_BAND, AWAY[1] * PAD_BAND);
      ctx.drawImage(image, at.x, at.y, at.half * 2, at.half * 2, -at.half, -at.half, at.half * 2, at.half * 2);
    }
    ctx.globalCompositeOperation = 'source-over';
    for (let i = 0; i < world.pads.length; i++) {
      const pad = world.pads[i];
      const at = atlas.leaves[i];
      placePad(pad, 0, 0);
      ctx.drawImage(image, at.x, at.y, at.half * 2, at.half * 2, -at.half, -at.half, at.half * 2, at.half * 2);
      // A tap or a landing leaves a pale ring that closes as it fades.
      if (pad.press > 0.05) {
        ctx.strokeStyle = COLOURS.ripple;
        ctx.globalAlpha = pad.press * 0.5;
        const k = atlas.h; // the transform already scales sprites to the canvas
        ctx.lineWidth = 0.0032 * k;
        ctx.beginPath();
        ctx.arc(pad.pressX * k, -pad.pressY * k, pad.radius * k * (0.28 + (1 - pad.press) * 0.25), 0, TAU);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  };

  const petalRing = (cx: number, cy: number, size: number, turn: number, ring: boolean) => {
    const r = size * (ring ? 0.62 : 1);
    ctx.beginPath();
    for (let k = 0; k < LILY.petals; k++) {
      const a = turn + (k / LILY.petals) * TAU + (ring ? Math.PI / LILY.petals : 0);
      const px = sx(cx + Math.cos(a) * r * 0.55);
      const py = sy(cy + Math.sin(a) * r * 0.55);
      ctx.moveTo(px + Math.cos(-a) * r * 0.55 * h, py + Math.sin(-a) * r * 0.55 * h);
      ctx.ellipse(px, py, r * 0.55 * h, r * 0.24 * h, -a, 0, TAU);
    }
    ctx.fill();
  };
  const drawLily = () => {
    const pad = world.pads[LILY.pad];
    if (pad) {
      const cx = pad.x + LILY.dx;
      const cy = pad.y + LILY.dy;
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = COLOURS.shadowDeep;
      petalRing(cx + AWAY[0] * 0.008, cy + AWAY[1] * 0.008, LILY.size, LILY.turn, false);
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = COLOURS.white;
      petalRing(cx, cy, LILY.size, LILY.turn, false);
      ctx.fillStyle = COLOURS.petalInner;
      petalRing(cx, cy, LILY.size, LILY.turn, true);
      ctx.fillStyle = COLOURS.gold;
      ctx.beginPath();
      ctx.arc(sx(cx), sy(cy), LILY.size * 0.16 * h, 0, TAU);
      ctx.fill();
    }
    for (let i = 0; i < LOOSE_PETALS.length; i++) {
      const [u, v, a] = LOOSE_PETALS[i];
      const x = u * aspect;
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = COLOURS.shadow;
      ctx.beginPath();
      ctx.ellipse(sx(x + AWAY[0] * 0.004), sy(v + AWAY[1] * 0.004), 0.011 * h, 0.0048 * h, -a, 0, TAU);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = COLOURS.white;
      ctx.beginPath();
      ctx.ellipse(sx(x), sy(v), 0.011 * h, 0.0048 * h, -a, 0, TAU);
      ctx.fill();
    }
  };

  const drawMidges = () => {
    for (let i = 0; i < world.flies.length; i++) {
      const fly = world.flies[i];
      const seen = fly.respawn > 0 ? 0 : fly.fade;
      if (seen < 0.05) continue;
      const lift = 0.01 + fly.height * 0.05;
      ctx.globalAlpha = seen;
      ctx.globalCompositeOperation = 'multiply';
      ctx.fillStyle = COLOURS.shadow;
      ctx.beginPath();
      ctx.arc(sx(fly.x + AWAY[0] * lift), sy(fly.y + AWAY[1] * lift), 1.4 * ratio, 0, TAU);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 0.8 * seen;
      ctx.fillStyle = COLOURS.ink;
      ctx.beginPath();
      ctx.arc(sx(fly.x), sy(fly.y), 1.3 * ratio, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  };

  // ---- Frogs ------------------------------------------------------------------------
  const capsule = (ax: number, ay: number, bx: number, by: number, ra: number, rb: number) => {
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    // Wound the same way as the arcs below, so with the nonzero rule
    // overlapping parts add up instead of cancelling into dark outlines.
    ctx.moveTo(ax - nx * ra, ay - ny * ra);
    ctx.lineTo(bx - nx * rb, by - ny * rb);
    ctx.lineTo(bx + nx * rb, by + ny * rb);
    ctx.lineTo(ax + nx * ra, ay + ny * ra);
    ctx.closePath();
    ctx.moveTo(ax + ra, ay);
    ctx.arc(ax, ay, ra, 0, TAU);
    ctx.moveTo(bx + rb, by);
    ctx.arc(bx, by, rb, 0, TAU);
  };
  const ellipsePath = (x: number, y: number, rx: number, ry: number, turn: number) => {
    ctx.moveTo(x + Math.cos(turn) * rx, y + Math.sin(turn) * rx);
    ctx.ellipse(x, y, rx, ry, turn, 0, TAU);
  };
  /** Frog-local transform: snout along +x, left along +y, body lengths. */
  const frogTransform = (frog: Frog, lift: number, dx = 0, dy = 0) => {
    const scale = frog.size * h * (1 + frog.z * lift);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.translate(sx(frog.x + dx), sy(frog.y + dy));
    ctx.rotate(-frog.bodyHeading);
    ctx.scale(scale * frog.bodyStretch, -scale / frog.bodyStretch);
  };
  const bodyPath = (frog: Frog) => {
    const x = -frog.lean;
    const sac = frog.throat;
    ellipsePath(x - 0.1, 0, 0.4, 0.265, 0);
    ellipsePath(x - 0.3, 0, 0.19, 0.235, 0);
    ellipsePath(x + 0.24, 0, 0.24, 0.222, 0);
    ellipsePath(x + 0.41, 0, 0.1, 0.12, 0);
    for (let side = -1; side <= 1; side += 2) {
      ellipsePath(x + 0.27, 0.155 * side, 0.078, 0.078, 0);
      const r = 0.02 + sac * (side > 0 ? 1.06 : 0.94) * 0.075;
      ellipsePath(x + 0.17, (0.2 + sac * 0.06) * side, r, r, 0);
    }
  };
  const caps = (index: number, k: number, j: number) => world.capsules[(index * FROG_CAPSULES + k) * 4 + j];
  const footPath = (ax: number, ay: number, bx: number, by: number, hind: boolean, web: number) => {
    const base = Math.atan2(by - ay, bx - ax);
    const toes = hind ? 5 : 4;
    const spread = hind ? 0.18 + 0.38 * web : 0.62;
    const reach = hind ? HIND_TOE : FORE_TOE;
    const toeR = hind ? 0.02 : 0.016;
    for (let i = 0; i < toes; i++) {
      const k = (i / (toes - 1)) * 2 - 1;
      const a = base + k * spread;
      const l = reach * (0.72 + 0.28 * Math.sin((k * 0.8 + 1) * 1.35));
      capsule(bx, by, bx + Math.cos(a) * l, by + Math.sin(a) * l, toeR, toeR * 1.25);
    }
    if (hind && web > 0.05) {
      const edge = reach * (0.7 + 0.16 * web);
      ctx.moveTo(bx, by);
      for (let i = 0; i < toes; i++) {
        const a = base + ((i / (toes - 1)) * 2 - 1) * spread;
        ctx.lineTo(bx + Math.cos(a) * edge, by + Math.sin(a) * edge);
        if (i < toes - 1) {
          const mid = a + spread / (toes - 1);
          ctx.lineTo(bx + Math.cos(mid) * edge * 0.8, by + Math.sin(mid) * edge * 0.8);
        }
      }
      ctx.closePath();
    }
  };
  const legsPath = (frog: Frog, index: number) => {
    for (let k = 0; k < FROG_CAPSULES; k++) {
      const part = k % 5;
      const ax = caps(index, k, 0);
      const ay = caps(index, k, 1);
      const bx = caps(index, k, 2);
      const by = caps(index, k, 3);
      capsule(ax, ay, bx, by, LEG_RADII[part][0], LEG_RADII[part][1]);
      if (part === 2 || part === 4) footPath(ax, ay, bx, by, part === 2, k < 5 ? frog.webL : frog.webR);
    }
  };
  /** The legs for a shadow, as the shader's shadowLegs: capsules, and each foot as a disc. */
  const shadowLegsPath = (index: number) => {
    for (let k = 0; k < FROG_CAPSULES; k++) {
      const part = k % 5;
      const ax = caps(index, k, 0);
      const ay = caps(index, k, 1);
      const bx = caps(index, k, 2);
      const by = caps(index, k, 3);
      capsule(ax, ay, bx, by, LEG_RADII[part][0], LEG_RADII[part][1]);
      if (part === 2 || part === 4) {
        const len = part === 2 ? HIND_TOE : FORE_TOE;
        const l = Math.hypot(bx - ax, by - ay) || 1;
        const cx = bx + ((bx - ax) / l) * len * 0.45;
        const cy = by + ((by - ay) / l) * len * 0.45;
        ctx.moveTo(cx + len * 0.5, cy);
        ctx.arc(cx, cy, len * 0.5, 0, TAU);
      }
    }
  };
  const segmentPath = (line: readonly number[], x0: number) => {
    ctx.moveTo(x0 + line[0], line[1]);
    ctx.lineTo(x0 + line[2], line[3]);
  };

  const drawFrog = (frog: Frog, index: number) => {
    const look = LOOKS[frog.palette % LOOKS.length];
    const swimming = frog.submerge >= 0.02;
    ctx.lineCap = 'round';
    // The flat shadow band: ground-sized, away from the light; further, softer
    // and fainter in the air.
    if (!swimming) {
      const reach = 0.007 + frog.z * 0.3;
      frogTransform(frog, 0, AWAY[0] * reach, AWAY[1] * reach);
      ctx.globalCompositeOperation = 'multiply';
      ctx.globalAlpha = 1 - Math.min(0.4, frog.z);
      ctx.fillStyle = frog.z > 0.02 ? COLOURS.shadow : COLOURS.shadowDeep;
      if (frog.z > 0.02) ctx.filter = `blur(${(frog.z * 6 * ratio).toFixed(1)}px)`;
      ctx.beginPath();
      bodyPath(frog);
      shadowLegsPath(index);
      ctx.fill();
      ctx.filter = 'none';
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalAlpha = swimming ? 1 - frog.submerge * 0.4 : 1;
    frogTransform(frog, FROG_LIFT);
    ctx.fillStyle = look.skin;
    ctx.beginPath();
    legsPath(frog, index);
    ctx.fill();
    // The body's own band falls on the legs beside it.
    const self = 0.0075 * (1 + frog.z * 0.35);
    ctx.save();
    ctx.clip();
    frogTransform(frog, FROG_LIFT, AWAY[0] * self, AWAY[1] * self);
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = COLOURS.shadow;
    ctx.beginPath();
    bodyPath(frog);
    ctx.fill();
    ctx.restore();
    frogTransform(frog, FROG_LIFT);
    // Leg bars, as flat dark shapes across thighs and shins.
    const alpha = ctx.globalAlpha;
    ctx.globalAlpha = alpha * look.bars;
    ctx.fillStyle = look.mark;
    ctx.beginPath();
    for (let k = 0; k < FROG_CAPSULES; k++) {
      const part = k % 5;
      if (part > 1) continue;
      const ax = caps(index, k, 0);
      const ay = caps(index, k, 1);
      const bx = caps(index, k, 2);
      const by = caps(index, k, 3);
      const turn = Math.atan2(by - ay, bx - ax);
      for (let j = 0; j < (part === 0 ? 2 : 3); j++) {
        const t = part === 0 ? (j === 0 ? 0.32 : 0.64) : j === 0 ? 0.28 : j === 1 ? 0.55 : 0.8;
        const r = (LEG_RADII[part][0] + (LEG_RADII[part][1] - LEG_RADII[part][0]) * t) * 0.82;
        ellipsePath(ax + (bx - ax) * t, ay + (by - ay) * t, 0.024, r, turn);
      }
    }
    ctx.fill();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = look.skin;
    ctx.beginPath();
    bodyPath(frog);
    ctx.fill();
    // Markings, before the lean.
    const x0 = -frog.lean;
    const spots = FROG_SPOTS[frog.palette % FROG_SPOTS.length];
    const lines = FROG_LINES[frog.palette % FROG_LINES.length];
    ctx.strokeStyle = look.accent;
    for (const line of lines) {
      if (line[5] < 0.5) continue;
      ctx.lineWidth = line[4];
      ctx.beginPath();
      segmentPath(line, x0);
      ctx.stroke();
    }
    if (frog.palette === 0) {
      ctx.fillStyle = look.accent;
      ctx.beginPath();
      for (const s of spots) ellipsePath(x0 + s.x, s.y, s.rx + HALO_GROW, s.r + HALO_GROW, s.a);
      ctx.fill();
    }
    ctx.strokeStyle = look.mark;
    for (const line of lines) {
      if (line[5] > 0.5) continue;
      ctx.lineWidth = line[4];
      ctx.beginPath();
      segmentPath(line, x0);
      ctx.stroke();
    }
    ctx.fillStyle = look.mark;
    ctx.beginPath();
    for (const s of spots) ellipsePath(x0 + s.x, s.y, s.rx, s.r, s.a);
    ctx.fill();
    // One highlight down the back, toward the light (which turns with the frog).
    const c = Math.cos(-frog.bodyHeading);
    const s = Math.sin(-frog.bodyHeading);
    const lx = SUN[0] * c - SUN[1] * s;
    const ly = SUN[0] * s + SUN[1] * c;
    ctx.globalAlpha = alpha * 0.9;
    ctx.fillStyle = look.highlight;
    ctx.beginPath();
    ellipsePath(x0 - 0.04 + lx * 0.06, ly * 0.07, 0.26, 0.06, 0);
    ctx.fill();
    ctx.globalAlpha = alpha;
    // Eyes: iris, a dark bar pupil, one catch-light; a lid to blink.
    for (let side = -1; side <= 1; side += 2) {
      const ex = x0 + 0.27;
      const ey = 0.155 * side;
      if (frog.blink > 0.5) {
        ctx.fillStyle = look.lid;
        ctx.beginPath();
        ctx.arc(ex, ey, 0.06, 0, TAU);
        ctx.fill();
        continue;
      }
      ctx.fillStyle = look.iris;
      ctx.beginPath();
      ctx.arc(ex, ey, 0.06, 0, TAU);
      ctx.fill();
      ctx.fillStyle = COLOURS.ink;
      ctx.beginPath();
      ellipsePath(ex + (Math.cos(frog.look) - 1) * 0.014, ey + Math.sin(frog.look) * 0.014, 0.046, 0.022, 0);
      ctx.fill();
      ctx.globalAlpha = alpha * 0.9;
      ctx.fillStyle = COLOURS.white;
      ctx.beginPath();
      ctx.arc(ex + lx * 0.028, ey + ly * 0.028, 0.013, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = alpha;
    }
    // Tongue, out to the midge it is catching.
    if (frog.tongue > 0) {
      const scale = frog.size * (1 + frog.z * FROG_LIFT);
      const tx = frog.tongueX - frog.x;
      const ty = frog.tongueY - frog.y;
      const tc = Math.cos(-frog.bodyHeading);
      const ts = Math.sin(-frog.bodyHeading);
      const qx = (tx * tc - ty * ts) / scale / frog.bodyStretch;
      const qy = ((tx * ts + ty * tc) / scale) * frog.bodyStretch;
      const mx = 0.46 + x0;
      const endX = mx + (qx - mx) * frog.tongue;
      const endY = qy * frog.tongue;
      ctx.fillStyle = COLOURS.tongue;
      ctx.beginPath();
      capsule(mx, 0, endX, endY, 0.028, 0.022);
      ctx.moveTo(endX + 0.045, endY);
      ctx.arc(endX, endY, 0.045, 0, TAU);
      ctx.fill();
    }
    // A swimmer is seen through the water.
    if (swimming) {
      ctx.globalAlpha = frog.submerge * 0.45 * (1 - frog.submerge * 0.4);
      ctx.fillStyle = COLOURS.water;
      ctx.beginPath();
      bodyPath(frog);
      legsPath(frog, index);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  };

  const drawWake = (frog: Frog) => {
    if (frog.speed < 0.004) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.translate(sx(frog.x), sy(frog.y));
    ctx.rotate(-frog.bodyHeading);
    const s = frog.size * h;
    const strength = Math.min(frog.speed * 7, 1) * 0.6;

    ctx.strokeStyle = COLOURS.ripple;
    ctx.lineWidth = 0.0026 * h;
    ctx.lineCap = 'round';
    ctx.globalAlpha = strength;
    ctx.beginPath();
    ctx.moveTo(-0.6 * s, 0.33 * s);
    ctx.lineTo(-2.2 * s, 1.05 * s);
    ctx.moveTo(-0.6 * s, -0.33 * s);
    ctx.lineTo(-2.2 * s, -1.05 * s);
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  };

  // ---- Shade, grain ------------------------------------------------------------------
  const centre = new Float32Array(2);
  const drawShade = (time: number) => {
    if (!atlas) return;
    ctx.globalCompositeOperation = 'multiply';
    ctx.imageSmoothingEnabled = true;
    for (let i = 0; i < SHADE_CLUSTERS.length; i++) {
      const at = atlas.shade[i];
      shadeCentre(SHADE_CLUSTERS[i], aspect, time, centre, 0);
      const reach = SHADE_CLUSTERS[i].reach + 0.03;
      if (centre[0] < -reach || centre[0] > aspect + reach || centre[1] < -reach || centre[1] > 1 + reach) continue;
      const size = at.half * 2;
      const shown = (size / SHADE_SCALE) * (h / atlas.h);
      ctx.drawImage(
        atlas.canvas,
        at.x,
        at.y,
        size,
        size,
        sx(centre[0]) - shown / 2,
        sy(centre[1]) - shown / 2,
        shown,
        shown,
      );
    }
    ctx.globalCompositeOperation = 'source-over';
  };

  const drawGrain = () => {
    ctx.globalCompositeOperation = 'soft-light';
    if (paper) {
      ctx.fillStyle = paper;
      ctx.fillRect(0, 0, width, height);
    }
    if (drift) {
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(drift, 0, 0, width, height);
    }
    ctx.globalCompositeOperation = 'source-over';
  };

  const order = new Int32Array(3);
  const renderer: FrogRenderer = {
    get ready() {
      return ready;
    },
    draw(time) {
      if (!causticReady) readCaustics();
      fit();
      if (!atlas || !causticReady) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = COLOURS.water;
      ctx.fillRect(0, 0, width, height);
      drawCaustics(time);
      drawRipples(time);
      const count = frogOrder(world, order);
      for (let n = 0; n < count; n++) {
        const frog = world.frogs[order[n]];
        if (frog.submerge < 0.02) continue;
        drawWake(frog);
        drawFrog(frog, order[n]);
      }
      drawPads();
      drawLily();
      drawMidges();
      for (let n = 0; n < count; n++) {
        const frog = world.frogs[order[n]];
        if (frog.submerge >= 0.02) continue;
        drawFrog(frog, order[n]);
      }
      drawShade(time);
      drawGrain();
      ready = true;
    },
    dispose() {
      baker.dispose();
      atlas = null;
      causticCanvas = null;
      causticImage = null;
      drift = null;
      paper = null;
    },
  };
  return renderer;
}
