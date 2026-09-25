import { REED_BLADES, REED_HEADS, REED_SHADOW, WATER_CX, WATER_CY, reedBlades, shelfDepth } from './frog-bank';
import { bakeCaustics, trackBank } from './frog-bank-layer';
import { CAUSTIC_CELL, CAUSTIC_CELLS } from './frog-caustics';
import { TAU, seeded, smoothstep } from './frog-math';
import { FROG_LOOKS, FROG_PALETTES, FROG_TONGUE, SUN_GLOW, type FrogTheme } from './frog-theme';
import type { FrogRenderer, FrogRendererHooks } from './frog-webgl';
import { FORE_TOE, FROG_CAPSULES, HIND_TOE, type Frog, type FrogWorld, type Pad } from './frog-world';

// The no-WebGL version of the frog pond: the same world, rig, palette and
// composition as the shader, drawn as a simpler illustration with Canvas 2D
// paths and gradients rather than a per-pixel port. Loaded only when WebGL
// can't be used.

type RGB = readonly [number, number, number];
const to255 = (c: readonly number[]): RGB => [c[0] * 255, c[1] * 255, c[2] * 255];
/** Each frog's look (FROG_LOOKS), in 0 … 255. */
const LOOKS = FROG_LOOKS.map((look) => ({
  skin: to255(look.skin),
  mark: to255(look.mark),
  belly: to255(look.belly),
  iris: to255(look.iris),
  bars: look.bars,
}));
type Look = (typeof LOOKS)[number];
// Leg capsule radii (start, end) by part, as in legsSDF.
const LEG_RADII = [
  [0.125, 0.074],
  [0.078, 0.048],
  [0.05, 0.034],
  [0.05, 0.038],
  [0.038, 0.028],
] as const;
// Draws a shadow this far off-canvas so only its blurred copy shows.
const FAR = 20000;
/**
 * By day, how much the caustics brighten the bed on average (per unit of
 * caustic strength), where they fall. In the shader the moving web does that
 * with many fine, broken lines; here the bed is lit by this much when it's
 * baked, and the moving web on top stays faint.
 */
const CAUSTIC_MEAN = 0.34;
/**
 * The two copies of the caustic web: drift (x, y, in heights per second,
 * as in the shader), scale, turn and strength.
 */
const CAUSTIC_COPIES = [
  [0.011, 0.006, 1, 0, 0.8],
  [-0.008, 0.01, 0.71, 0.5, 0.55],
] as const;

const rgba = (c: RGB, alpha = 1, scale = 1) =>
  `rgba(${Math.round(Math.min(255, c[0] * scale))}, ${Math.round(Math.min(255, c[1] * scale))}, ${Math.round(Math.min(255, c[2] * scale))}, ${alpha})`;

/** Small, soft, horizontally streaked noise for the water surface. */
function makeWaterTexture() {
  const width = 96;
  const height = 48;
  const random = seeded(9127);
  const grid = Array.from({ length: 13 * 25 }, () => random());
  const at = (x: number, y: number) => grid[(y % 13) * 25 + (x % 25)];
  const texture = document.createElement('canvas');
  texture.width = width;
  texture.height = height;
  const ctx = texture.getContext('2d');
  if (!ctx) return null;
  const image = ctx.createImageData(width, height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const gx = (x / width) * 8;
      const gy = (y / height) * 12;
      const ix = Math.floor(gx);
      const iy = Math.floor(gy);
      const fx = gx - ix;
      const fy = gy - iy;
      const sx = fx * fx * (3 - 2 * fx);
      const sy = fy * fy * (3 - 2 * fy);
      const top = at(ix, iy) + (at(ix + 1, iy) - at(ix, iy)) * sx;
      const bottom = at(ix, iy + 1) + (at(ix + 1, iy + 1) - at(ix, iy + 1)) * sx;
      const v = top + (bottom - top) * sy;
      const o = (y * width + x) * 4;
      image.data[o] = 150 + v * 60;
      image.data[o + 1] = 140 + v * 50;
      image.data[o + 2] = 190 + v * 50;
      image.data[o + 3] = Math.round(v * v * 255);
    }
  }
  ctx.putImageData(image, 0, 0);
  return texture;
}

/** The caustic tile with its crisp cell edges softened: the tile over a blurred copy of itself. */
function softTile(tile: ImageBitmap | OffscreenCanvas | HTMLCanvasElement) {
  const soft = document.createElement('canvas');
  soft.width = tile.width;
  soft.height = tile.height;
  const g = soft.getContext('2d');
  if (!g) return soft;
  // Blurred across the tile's wrap too, so it still tiles seamlessly.
  g.filter = 'blur(0.7px)';
  for (const dx of [-1, 0, 1]) for (const dy of [-1, 0, 1]) g.drawImage(tile, dx * tile.width, dy * tile.height);
  g.filter = 'none';
  g.globalAlpha = 0.45;
  g.drawImage(tile, 0, 0);
  return soft;
}

/** Fixed dorsal markings per look, in frog-local body lengths. */
function makeMarkings() {
  const random = seeded(311);
  const spots = (count: number, x0: number, x1: number, ySpan: number, r0: number, r1: number) =>
    Array.from({ length: count }, () => ({
      x: x0 + random() * (x1 - x0),
      y: (random() * 2 - 1) * ySpan,
      rx: r0 + random() * (r1 - r0),
      ry: r0 + random() * (r1 - r0),
      a: random() * Math.PI,
    }));
  return [
    spots(11, -0.44, 0.14, 0.19, 0.028, 0.05),
    spots(16, -0.44, 0.3, 0.2, 0.008, 0.014),
    spots(3, -0.36, 0.05, 0.14, 0.03, 0.045),
  ];
}

export function createFrogCanvas(
  canvas: HTMLCanvasElement,
  world: FrogWorld,
  ripples: Float32Array,
  theme: FrogTheme = 'night',
  hooks: FrogRendererHooks = {},
): FrogRenderer {
  const context = canvas.getContext('2d');
  if (!context) throw new Error('2D canvas context creation failed.');
  const ctx = context;
  const palette = FROG_PALETTES[theme];
  const day = theme === 'day';
  const LIGHT = to255(palette.light);
  const SUN = palette.sun;
  const sunLength = Math.hypot(SUN[0], SUN[1]);
  // Shadows fall away from the key light: down and to the left.
  const away = [-SUN[0] / sunLength, -SUN[1] / sunLength] as const;
  const texture = makeWaterTexture();
  // By day, the caustic tile (made off the main thread, like the bank).
  let caustic: HTMLCanvasElement | null = null;
  let causticsReady = !day;
  if (day) {
    bakeCaustics(192).then(
      (tile) => {
        caustic = softTile(tile);
        causticsReady = true;
        hooks.onChange?.();
      },
      (error: unknown) => console.error('[frog-pond] Could not make the caustics.', error),
    );
  }
  const markings = makeMarkings();
  const crest = to255(palette.rippleCrest);
  const trough = to255(palette.rippleTrough);
  const flyGlow = to255(palette.flyGlow);
  const flyBody = to255(palette.flyBody);
  const glintRandom = seeded(77);
  const glints = Array.from({ length: day ? 70 : 46 }, () => ({
    u: 0.45 + glintRandom() * 0.6,
    v: 0.5 + glintRandom() * 0.55,
    phase: glintRandom() * TAU,
    rate: 0.6 + glintRandom() * 1.4,
    size: 0.5 + glintRandom(),
  }));
  let bedLayer: HTMLCanvasElement | null = null;
  let columnLayer: HTMLCanvasElement | null = null;
  // By day: the caustic web's strength by depth (a mask), and a layer to
  // build each frame's web in before it is masked and added.
  let causticMask: HTMLCanvasElement | null = null;
  let causticLayer: HTMLCanvasElement | null = null;
  // The bank, baked off the main thread (frog-bank-layer.ts).
  const bank = trackBank(theme, () => hooks.onChange?.());
  let ready = false;
  let clock = 0;
  let h = 1;
  let aspect = 1;
  const reedEnds = new Float32Array(REED_BLADES * 4);
  const reedShape = new Float32Array(REED_BLADES * 4);
  const reedBox = new Float32Array(4);

  const sx = (x: number) => x * h;
  const sy = (y: number) => (1 - y) * h;
  /** 0 at the bank … 1 in the middle, as pondDepth() in the shader (without its floor noise). */
  const depthAt = (x: number, y: number) => shelfDepth(x, y, aspect);

  // ---- Water ------------------------------------------------------------------
  /** The riverbed: silt, sandy patches toward the shallows, lit stones. */
  const paintBed = (width: number, height: number) => {
    const layer = document.createElement('canvas');
    layer.width = width;
    layer.height = height;
    const g = layer.getContext('2d');
    if (!g) return null;
    const mud = to255(palette.mud);
    const mudDark = to255(palette.mudDark);
    const sand = to255(palette.sand);
    const light = palette.bedLight;
    g.fillStyle = rgba(mudDark, 1, light);
    g.fillRect(0, 0, width, height);
    const bedRandom = seeded(4821);
    // Silt and sand in soft overlapping patches, the sand toward the bank.
    for (let i = 0; i < 70; i++) {
      const u = bedRandom() * aspect;
      const v = bedRandom();
      const shallow = 1 - depthAt(u, v);
      const radius = height * (0.05 + bedRandom() * 0.09);
      const sandy = bedRandom() < 0.25 + shallow * 0.5;
      const patch = g.createRadialGradient(sx(u), sy(v), 0, sx(u), sy(v), radius);
      patch.addColorStop(0, rgba(sandy ? sand : mud, sandy ? 0.3 + shallow * 0.3 : 0.45, light));
      patch.addColorStop(1, rgba(sandy ? sand : mud, 0, light));
      g.fillStyle = patch;
      g.fillRect(sx(u) - radius, sy(v) - radius, radius * 2, radius * 2);
    }
    // Stones: a few larger ones anywhere, pebbles gathering toward the
    // bank. Each is a dark bed around it, the stone, and its lit top.
    const dark = to255(palette.stoneDark);
    const pale = to255(palette.stoneLight);
    for (let i = 0; i < 420; i++) {
      const u = bedRandom() * aspect;
      const v = bedRandom();
      const shallow = 1 - depthAt(u, v);
      const pebble = bedRandom() < 0.78;
      if (bedRandom() > (pebble ? 0.18 + shallow * 0.75 : 0.35 + shallow * 0.3)) continue;
      const r = height * (pebble ? 0.004 + bedRandom() * 0.007 : 0.012 + bedRandom() * 0.016);
      const stretch = 0.6 + bedRandom() * 0.4;
      const angle = bedRandom() * TAU;
      const tone = bedRandom();
      const colour: RGB = [
        dark[0] + (pale[0] - dark[0]) * (0.3 + 0.65 * tone),
        dark[1] + (pale[1] - dark[1]) * (0.3 + 0.65 * tone),
        dark[2] + (pale[2] - dark[2]) * (0.3 + 0.65 * tone),
      ];
      g.save();
      g.translate(sx(u), sy(v));
      g.rotate(angle);
      g.fillStyle = rgba([0, 0, 0], 0.22);
      g.beginPath();
      g.ellipse(0, 0, r * 1.35, r * stretch * 1.35, 0, 0, TAU);
      g.fill();
      g.fillStyle = rgba(colour, 0.9, light * 0.66);
      g.beginPath();
      g.ellipse(0, 0, r, r * stretch, 0, 0, TAU);
      g.fill();
      g.restore();
      // The lit top, toward the key light.
      const top = g.createRadialGradient(
        sx(u) + SUN[0] * r * 0.35,
        sy(v) - SUN[1] * r * 0.35,
        0,
        sx(u),
        sy(v),
        r * 1.05,
      );
      top.addColorStop(0, rgba(colour, 0.55, light));
      top.addColorStop(1, rgba(colour, 0, light));
      g.fillStyle = top;
      g.beginPath();
      g.arc(sx(u), sy(v), r, 0, TAU);
      g.fill();
    }
    if (causticMask) {
      // The average light of the caustics, where they fall (see CAUSTIC_MEAN).
      const lit = document.createElement('canvas');
      lit.width = width;
      lit.height = height;
      const l = lit.getContext('2d');
      if (l) {
        l.drawImage(layer, 0, 0);
        l.globalCompositeOperation = 'destination-in';
        l.drawImage(causticMask, 0, 0);
        g.globalCompositeOperation = 'lighter';
        g.globalAlpha = Math.min(1, palette.caustics * CAUSTIC_MEAN);
        g.drawImage(lit, 0, 0);
        g.globalCompositeOperation = 'source-over';
        g.globalAlpha = 1;
      }
    }
    return layer;
  };

  /**
   * Everything between the bed and the air: the water column deepening in
   * colour toward the middle, the sky reflected, and the glow of the light.
   */
  const paintColumn = (width: number, height: number) => {
    const layer = document.createElement('canvas');
    layer.width = width;
    layer.height = height;
    const g = layer.getContext('2d');
    if (!g) return null;
    // Deep out in the open water, shelving toward the bank at the lower left.
    const cx = width * WATER_CX;
    const cy = sy(WATER_CY);
    const shallowAlpha = 1 - Math.exp(-0.22 * palette.turbidity);
    const deepAlpha = 1 - Math.exp(-1.72 * palette.turbidity);
    g.save();
    g.translate(cx, cy);
    g.scale(1.25, 1);
    const column = g.createRadialGradient(0, 0, 0, 0, 0, height * 0.72);
    column.addColorStop(0, rgba(to255(palette.waterDeep), deepAlpha));
    column.addColorStop(0.55, rgba(to255(palette.waterDeep), (deepAlpha + shallowAlpha) * 0.55));
    column.addColorStop(1, rgba(to255(palette.waterShallow), shallowAlpha));
    g.fillStyle = column;
    g.fillRect(-width, -height, width * 2, height * 2);
    g.restore();
    // The sky reflected in the surface.
    const sky = to255(palette.sky);
    const reflect = g.createLinearGradient(0, height, 0, 0);
    reflect.addColorStop(0, rgba(sky, palette.skyReflect * 0.7));
    reflect.addColorStop(1, rgba(sky, palette.skyReflect));
    g.fillStyle = reflect;
    g.fillRect(0, 0, width, height);
    // The light itself, reflected from beyond the top-right corner.
    g.save();
    g.translate(width * SUN_GLOW[0], (1 - SUN_GLOW[1]) * height);
    g.scale(1, 0.55);
    const glow = g.createRadialGradient(0, 0, 0, 0, 0, height * 0.9);
    glow.addColorStop(0, rgba(LIGHT, day ? 0.26 : 0.78));
    glow.addColorStop(0.45, rgba(LIGHT, day ? 0.1 : 0.28));
    glow.addColorStop(1, rgba(LIGHT, 0));
    g.fillStyle = glow;
    g.fillRect(-width, -height * 2, width * 2, height * 4);
    g.restore();
    return layer;
  };

  /**
   * How strongly the caustics show at each point: they fade over deeper
   * water (as in water() in the shader) and stop at the bank.
   */
  const paintCausticMask = (width: number, height: number) => {
    const scale = 4;
    const small = document.createElement('canvas');
    small.width = Math.ceil(width / scale);
    small.height = Math.ceil(height / scale);
    const g = small.getContext('2d');
    if (!g) return null;
    const image = g.createImageData(small.width, small.height);
    for (let j = 0; j < small.height; j++) {
      for (let i = 0; i < small.width; i++) {
        const x = ((i + 0.5) * scale) / height;
        const y = 1 - ((j + 0.5) * scale) / height;
        const depth = depthAt(x, y);
        const strength = (1 - depth * 0.35) * smoothstep(-0.005, 0.02, depth);
        image.data[(j * small.width + i) * 4 + 3] = Math.round(strength * 255);
      }
    }
    g.putImageData(image, 0, 0);
    const mask = document.createElement('canvas');
    mask.width = width;
    mask.height = height;
    const m = mask.getContext('2d');
    m?.drawImage(small, 0, 0, width, height);
    return mask;
  };

  /** Pads and swimming frogs shade the bed, further out over deep water. */
  const drawBedShadows = () => {
    ctx.save();
    ctx.shadowColor = `rgba(0, 0, 0, ${palette.shadow * (day ? 0.85 : 0.6)})`;
    ctx.fillStyle = '#000';
    world.pads.forEach((pad, index) => {
      const reach = 0.006 + depthAt(pad.x, pad.y) * palette.bedShadowReach;
      ctx.shadowBlur = h * (0.006 + depthAt(pad.x, pad.y) * 0.02);
      ctx.shadowOffsetX = FAR + away[0] * reach * h;
      ctx.shadowOffsetY = -away[1] * reach * h;
      ctx.save();
      ctx.translate(-FAR, 0);
      padPath(pad, index);
      ctx.fill();
      ctx.restore();
    });
    for (const frog of world.frogs) {
      if (frog.submerge < 0.02) continue;
      const reach = 0.006 + depthAt(frog.x, frog.y) * palette.bedShadowReach;
      ctx.shadowBlur = h * 0.012;
      ctx.shadowOffsetX = FAR + away[0] * reach * h;
      ctx.shadowOffsetY = -away[1] * reach * h;
      ctx.save();
      ctx.translate(sx(frog.x) - FAR, sy(frog.y));
      ctx.rotate(-frog.bodyHeading);
      ctx.beginPath();
      ctx.ellipse(0, 0, frog.size * h * 0.62, frog.size * h * 0.36, 0, 0, TAU);
      ctx.globalAlpha = 0.8;
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  };

  const drawWater = (time: number, width: number) => {
    if (bedLayer) ctx.drawImage(bedLayer, 0, 0);
    if (caustic && causticLayer && causticMask) {
      // Two copies of the caustic web sliding past each other, at the same
      // scales and speeds as the WebGL scene; the second turned a little, so
      // the two never line up into a regular net (the shader bends them
      // with the surface instead). Then faded with depth, as in water().
      const tile = h * CAUSTIC_CELL * CAUSTIC_CELLS;
      const g = causticLayer.getContext('2d');
      if (g) {
        g.globalCompositeOperation = 'source-over';
        g.clearRect(0, 0, width, h);
        for (const [vx, vy, scale, turn, alpha] of CAUSTIC_COPIES) {
          const size = tile * scale;
          const ox = (((time * vx * h) % size) + size) % size;
          const oy = (((time * vy * h) % size) + size) % size;
          g.save();
          g.globalAlpha = alpha;
          g.translate(width / 2, h / 2);
          g.rotate(turn);
          const reach = Math.hypot(width, h) / 2 + size;
          for (let x = -reach + ox; x < reach; x += size) {
            for (let y = -reach + oy; y < reach; y += size) g.drawImage(caustic, x, y, size, size);
          }
          g.restore();
        }
        g.globalCompositeOperation = 'destination-in';
        g.drawImage(causticMask, 0, 0);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = Math.min(1, palette.caustics * 0.2);
        ctx.drawImage(causticLayer, 0, 0);
        ctx.restore();
      }
    }
    drawBedShadows();
    if (columnLayer) ctx.drawImage(columnLayer, 0, 0);
    if (texture) {
      // Slow drifting streaks, a little brighter under the glow.
      const drift = (((time * 0.012 * h) % width) + width) % width;
      ctx.save();
      ctx.globalAlpha = day ? 0.06 : 0.09;
      ctx.globalCompositeOperation = 'screen';
      ctx.drawImage(texture, -drift, 0, width, h);
      ctx.drawImage(texture, width - drift, 0, width, h);
      ctx.restore();
    }
    for (const glint of glints) {
      const twinkle = Math.max(0, Math.sin(time * glint.rate + glint.phase)) ** (day ? 8 : 4);
      if (twinkle < 0.05) continue;
      const x = glint.u * aspect;
      const y = glint.v;
      const near = Math.exp(-(((x - aspect * SUN_GLOW[0]) * 1.05) ** 2 + ((y - SUN_GLOW[1]) * 1.9) ** 2) * 2.6);
      ctx.fillStyle = rgba(LIGHT, twinkle * (day ? 0.2 + near * 0.8 : 0.12 + near * 0.6));
      ctx.beginPath();
      ctx.ellipse(sx(x), sy(y), h * 0.006 * glint.size, h * 0.0016, -0.4, 0, TAU);
      ctx.fill();
    }
    for (let i = 0; i < ripples.length; i += 4) {
      const age = time - ripples[i + 2];
      if (ripples[i + 2] <= 0 || age < 0 || age > 3) continue;
      const fade = Math.exp(-age * 1.3) * ripples[i + 3];
      const radius = age * 0.17 * h;
      ctx.lineWidth = Math.max(1, h * 0.0022);
      ctx.strokeStyle = rgba(crest, fade * palette.rippleCrest[3]);
      ctx.beginPath();
      ctx.arc(sx(ripples[i]), sy(ripples[i + 1]), radius, 0, TAU);
      ctx.stroke();
      if (radius > h * 0.03) {
        ctx.strokeStyle = rgba(trough, fade * palette.rippleTrough[3]);
        ctx.beginPath();
        ctx.arc(sx(ripples[i]), sy(ripples[i + 1]), radius - h * 0.022, 0, TAU);
        ctx.stroke();
      }
    }
  };

  // ---- Pads -------------------------------------------------------------------
  const padPath = (pad: Pad, index: number, grow = 1) => {
    const bob = pad.bob * Math.sin(pad.bobPhase);
    const radius = pad.radius * (1 + bob * 0.03) * grow;
    const half = pad.notch / 2;
    const damageAt = index * 2.3 + 2;
    ctx.beginPath();
    ctx.moveTo(sx(pad.x), sy(pad.y));
    const steps = 56;
    for (let s = 0; s <= steps; s++) {
      const a = half + (s / steps) * (TAU - pad.notch);
      let r = radius * (1 + 0.016 * Math.sin(a * 5 + index * 1.7) + 0.008 * Math.sin(a * 13 + index * 4.1));
      if (pad.damage > 0) {
        const bite = Math.cos(a - damageAt);
        r *= 1 - pad.damage * 0.2 * Math.max(0, (bite - 0.985) / 0.015);
      }
      const wa = a + pad.angle;
      ctx.lineTo(sx(pad.x + Math.cos(wa) * r), sy(pad.y + Math.sin(wa) * r));
    }
    ctx.closePath();
  };

  const drawPad = (pad: Pad, index: number) => {
    const cx = sx(pad.x);
    const cy = sy(pad.y);
    const r = pad.radius * h;
    // A soft contact shadow on the water.
    ctx.save();
    ctx.shadowColor = `rgba(0, 0, 0, ${palette.padShadow})`;
    ctx.shadowBlur = h * 0.012;
    ctx.shadowOffsetX = FAR + away[0] * h * 0.0072;
    ctx.shadowOffsetY = -away[1] * h * 0.0072;
    ctx.translate(-FAR, 0);
    padPath(pad, index);
    ctx.fillStyle = '#000';
    ctx.fill();
    ctx.restore();

    padPath(pad, index);
    const leaf = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    const padA = to255(palette.padA);
    const padB = to255(palette.padB);
    leaf.addColorStop(0, rgba(padA, 1, 0.95));
    leaf.addColorStop(0.3, rgba(padA, 1, 1.12));
    leaf.addColorStop(1, rgba(padB, 1, 0.98));
    ctx.fillStyle = leaf;
    ctx.fill();
    ctx.save();
    ctx.clip();
    // Age yellows the rim inward; young pads keep a bronze edge.
    const aged = ctx.createRadialGradient(cx, cy, r * 0.45, cx, cy, r);
    aged.addColorStop(0, rgba(to255(palette.padAged), 0));
    aged.addColorStop(1, rgba(to255(palette.padAged), pad.age * 0.8));
    ctx.fillStyle = aged;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    // Veins.
    ctx.strokeStyle = day ? 'rgba(20, 45, 12, .3)' : 'rgba(8, 20, 8, .28)';
    ctx.lineWidth = Math.max(0.8, h * 0.0012);
    ctx.beginPath();
    for (let v = 0; v < 13; v++) {
      const a = pad.angle + pad.notch / 2 + ((v + 0.5) / 13) * (TAU - pad.notch);
      ctx.moveTo(cx + Math.cos(a) * r * 0.1, cy - Math.sin(a) * r * 0.1);
      ctx.lineTo(cx + Math.cos(a) * r * 0.86, cy - Math.sin(a) * r * 0.86);
    }
    ctx.stroke();
    // A frog's weight, and the dimple left by a tap or landing.
    const c = Math.cos(pad.angle);
    const s = Math.sin(pad.angle);
    const dip = (lx: number, ly: number, amount: number, reach: number, alpha: number) => {
      if (amount < 0.02) return;
      const px = cx + (lx * c - ly * s) * h;
      const py = cy - (lx * s + ly * c) * h;
      const shade = ctx.createRadialGradient(px, py, 0, px, py, r * reach);
      shade.addColorStop(0, `rgba(0, 0, 0, ${amount * alpha})`);
      shade.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = shade;
      ctx.fillRect(px - r, py - r, r * 2, r * 2);
    };
    dip(pad.loadX, pad.loadY, pad.load, 0.6, 0.2);
    dip(pad.pressX, pad.pressY, pad.press, 0.36, 0.38);
    // Sheen on the sunward side.
    const sheen = ctx.createLinearGradient(cx - SUN[0] * r, cy + SUN[1] * r, cx + SUN[0] * r, cy - SUN[1] * r);
    sheen.addColorStop(0.55, rgba(LIGHT, 0));
    sheen.addColorStop(1, rgba(LIGHT, day ? 0.12 : 0.16));
    ctx.fillStyle = sheen;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.restore();
    // Upturned rim.
    padPath(pad, index);
    ctx.lineWidth = Math.max(1, h * 0.0026);
    ctx.strokeStyle = pad.age < 0.3 ? rgba(to255(palette.padYoung), 0.55, 1.8) : 'rgba(150, 175, 105, .3)';
    ctx.stroke();
    if (pad.press > 0.05) {
      const px = cx + (pad.pressX * c - pad.pressY * s) * h;
      const py = cy - (pad.pressX * s + pad.pressY * c) * h;
      ctx.strokeStyle = rgba(LIGHT, pad.press * 0.25);
      ctx.beginPath();
      ctx.arc(px, py, r * (0.28 + (1 - pad.press) * 0.25), 0, TAU);
      ctx.stroke();
    }
  };

  // ---- Frogs ------------------------------------------------------------------
  const capsule = (ax: number, ay: number, bx: number, by: number, ra: number, rb: number) => {
    const dx = bx - ax;
    const dy = by - ay;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    ctx.moveTo(ax + nx * ra, ay + ny * ra);
    ctx.lineTo(bx + nx * rb, by + ny * rb);
    ctx.lineTo(bx - nx * rb, by - ny * rb);
    ctx.lineTo(ax - nx * ra, ay - ny * ra);
    ctx.closePath();
    ctx.moveTo(ax + ra, ay);
    ctx.arc(ax, ay, ra, 0, TAU);
    ctx.moveTo(bx + rb, by);
    ctx.arc(bx, by, rb, 0, TAU);
  };

  // The body is a union of ellipses (as in bodySDF). For clean outlines it
  // is traced as one polygon: from a point inside the torso, each ray's
  // furthest crossing of any of the ellipses.
  const outline = new Float32Array(72 * 2);
  const bodyPath = (frog: Frog) => {
    const x = -frog.lean;
    const sac = frog.throat;
    const shapes: Array<readonly [number, number, number, number]> = [
      [x - 0.1, 0, 0.4, 0.265],
      [x - 0.3, 0, 0.19, 0.235],
      [x + 0.24, 0, 0.24, 0.222],
      [x + 0.41, 0, 0.1, 0.12],
    ];
    for (const side of [1, -1]) {
      shapes.push([x + 0.27, 0.155 * side, 0.078, 0.078]);
      const r = 0.02 + sac * (side > 0 ? 1.06 : 0.94) * 0.075;
      shapes.push([x + 0.17, (0.2 + sac * 0.06) * side, r, r]);
    }
    const count = outline.length / 2;
    for (let i = 0; i < count; i++) {
      const a = (i / count) * TAU;
      const c = Math.cos(a);
      const s = Math.sin(a);
      let reach = 0;
      for (const [ex, ey, rx, ry] of shapes) {
        // |(t·dir − centre) / radii| = 1, far root.
        const ox = x - ex;
        const A = (c * c) / (rx * rx) + (s * s) / (ry * ry);
        const B = 2 * ((c * ox) / (rx * rx) + (s * -ey) / (ry * ry));
        const C = (ox * ox) / (rx * rx) + (ey * ey) / (ry * ry) - 1;
        const disc = B * B - 4 * A * C;
        if (disc >= 0) reach = Math.max(reach, (-B + Math.sqrt(disc)) / (2 * A));
      }
      outline[i * 2] = x + c * reach;
      outline[i * 2 + 1] = s * reach;
    }
    ctx.beginPath();
    ctx.moveTo(outline[0], outline[1]);
    for (let i = 1; i < count; i++) ctx.lineTo(outline[i * 2], outline[i * 2 + 1]);
    ctx.closePath();
  };

  /** Frog-local transform: snout along +x, left along +y, body lengths. */
  const frogTransform = (frog: Frog, lift: number) => {
    const scale = frog.size * h * (1 + frog.z * lift);
    ctx.translate(sx(frog.x), sy(frog.y));
    ctx.rotate(-frog.bodyHeading);
    ctx.scale(scale * frog.bodyStretch, -scale / frog.bodyStretch);
  };

  const legPoints = (index: number, k: number) => {
    const o = (index * FROG_CAPSULES + k) * 4;
    const c = world.capsules;
    return [c[o], c[o + 1], c[o + 2], c[o + 3]] as const;
  };

  const drawShadow = (frog: Frog, index: number) => {
    const height = frog.z;
    const strength = palette.shadow * (1 - Math.min(1, height / 0.3) * 0.45);
    // Cast away from the key light, which is up and to the right.
    const reach = (0.0094 + height * 0.336) * h;
    ctx.save();
    ctx.shadowColor = `rgba(0, 0, 0, ${strength})`;
    ctx.shadowBlur = frog.size * h * (0.06 + height * 1.2);
    ctx.shadowOffsetX = FAR + away[0] * reach;
    ctx.shadowOffsetY = -away[1] * reach;
    ctx.translate(-FAR, 0);
    // Ground-sized: the shadow never takes the frog's lift.
    frogTransform(frog, 0);
    ctx.fillStyle = '#000';
    bodyPath(frog);
    for (let k = 0; k < FROG_CAPSULES; k++) {
      const [ax, ay, bx, by] = legPoints(index, k);
      const part = k % 5;
      capsule(ax, ay, bx, by, LEG_RADII[part][0], LEG_RADII[part][1]);
      if (part === 2) {
        ctx.moveTo(bx + 0.12, by);
        ctx.arc(bx + (bx - ax) * 0.4, by + (by - ay) * 0.4, 0.12, 0, TAU);
      }
    }
    ctx.fill();
    ctx.restore();
  };

  const drawFoot = (
    ax: number,
    ay: number,
    bx: number,
    by: number,
    hind: boolean,
    web: number,
    look: Look,
    dim: number,
  ) => {
    const len = Math.hypot(bx - ax, by - ay) || 1;
    const dx = (bx - ax) / len;
    const dy = (by - ay) / len;
    const base = Math.atan2(dy, dx);
    const toes = hind ? 5 : 4;
    const spread = hind ? 0.18 + 0.38 * web : 0.62;
    const reach = hind ? HIND_TOE : FORE_TOE;
    const toeR = hind ? 0.018 : 0.013;
    const tips: Array<readonly [number, number, number]> = [];
    for (let i = 0; i < toes; i++) {
      const k = (i / (toes - 1)) * 2 - 1;
      const a = base + k * spread;
      const l = reach * (0.72 + 0.28 * Math.sin((k * 0.8 + 1) * 1.35));
      tips.push([a, bx + Math.cos(a) * l, by + Math.sin(a) * l]);
    }
    if (hind && web > 0.05) {
      // Webbing between the toes, scalloped, letting the water through.
      ctx.beginPath();
      ctx.moveTo(bx, by);
      for (let i = 0; i < toes; i++) {
        const edge = reach * (0.72 + 0.16 * web);
        const [a] = tips[i];
        ctx.lineTo(bx + Math.cos(a) * edge, by + Math.sin(a) * edge);
        if (i < toes - 1) {
          const mid = (a + tips[i + 1][0]) / 2;
          ctx.lineTo(bx + Math.cos(mid) * edge * 0.78, by + Math.sin(mid) * edge * 0.78);
        }
      }
      ctx.closePath();
      ctx.fillStyle = rgba(look.skin, 0.7, 0.95 * dim);
      ctx.fill();
    }
    ctx.strokeStyle = rgba(look.skin, 1, 0.72 * dim);
    ctx.lineWidth = toeR * 2.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (const [, tx, ty] of tips) {
      ctx.moveTo(bx, by);
      ctx.lineTo(tx, ty);
    }
    ctx.stroke();
    ctx.fillStyle = rgba(look.belly, 1, 0.62 * dim);
    ctx.beginPath();
    for (const [, tx, ty] of tips) {
      ctx.moveTo(tx + toeR * 1.3, ty);
      ctx.arc(tx, ty, toeR * 1.3, 0, TAU);
    }
    ctx.fill();
  };

  const drawFrog = (frog: Frog, index: number) => {
    const look = LOOKS[frog.palette % LOOKS.length];
    // Submerged frogs go dim and blue-dark, as if seen through water.
    const dim = 1 - frog.submerge * 0.45;
    ctx.save();
    ctx.globalAlpha = 1 - frog.submerge * 0.4;
    frogTransform(frog, 0.35);
    ctx.lineCap = 'round';

    // Legs, beneath the body: dark edge, then the limb, then cross-bars.
    for (const pass of [0, 1]) {
      ctx.beginPath();
      for (let k = 0; k < FROG_CAPSULES; k++) {
        const part = k % 5;
        const [ax, ay, bx, by] = legPoints(index, k);
        const grow = pass === 0 ? 1 : 0.78;
        capsule(ax, ay, bx, by, LEG_RADII[part][0] * grow, LEG_RADII[part][1] * grow);
      }
      ctx.fillStyle = rgba(look.skin, 1, (pass === 0 ? 0.5 : 0.84) * dim);
      ctx.fill();
    }
    ctx.strokeStyle = rgba(look.mark, look.bars);
    ctx.lineWidth = 0.035;
    ctx.beginPath();
    for (let k = 0; k < FROG_CAPSULES; k++) {
      const part = k % 5;
      if (part > 1) continue;
      const [ax, ay, bx, by] = legPoints(index, k);
      const len = Math.hypot(bx - ax, by - ay) || 1;
      const nx = -(by - ay) / len;
      const ny = (bx - ax) / len;
      for (const t of part === 0 ? [0.3, 0.62] : [0.25, 0.5, 0.75]) {
        const r = (LEG_RADII[part][0] + (LEG_RADII[part][1] - LEG_RADII[part][0]) * t) * 0.8;
        const px = ax + (bx - ax) * t;
        const py = ay + (by - ay) * t;
        ctx.moveTo(px + nx * r, py + ny * r);
        ctx.lineTo(px - nx * r, py - ny * r);
      }
    }
    ctx.stroke();
    for (let k = 0; k < FROG_CAPSULES; k++) {
      const part = k % 5;
      if (part !== 2 && part !== 4) continue;
      const [ax, ay, bx, by] = legPoints(index, k);
      drawFoot(ax, ay, bx, by, part === 2, k < 5 ? frog.webL : frog.webR, look, dim);
    }

    // Body: a dark rim where it turns under, then the skin.
    bodyPath(frog);
    ctx.strokeStyle = rgba(look.skin, 1, 0.3 * dim);
    ctx.lineWidth = 0.035;
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.fillStyle = rgba(look.skin, 1, dim);
    ctx.fill();
    ctx.save();
    ctx.clip();
    const x0 = -frog.lean;
    ctx.translate(x0, 0);
    const [blotches, speckles, spots] = markings;
    ctx.fillStyle = rgba(look.mark, 0.85);
    ctx.beginPath();
    const addSpots = (list: typeof blotches) => {
      for (const spot of list) {
        ctx.moveTo(spot.x + spot.rx, spot.y);
        ctx.ellipse(spot.x, spot.y, spot.rx, spot.ry, spot.a, 0, TAU);
      }
    };
    if (frog.palette === 0) addSpots(blotches);
    else if (frog.palette === 1) addSpots(speckles);
    else addSpots(spots);
    ctx.fill();
    ctx.lineCap = 'round';
    if (frog.palette === 0) {
      ctx.strokeStyle = rgba(look.belly, 0.18);
      ctx.lineWidth = 0.014;
      ctx.stroke();
    } else if (frog.palette === 1) {
      // Pale mid-back stripe and a dark mask through each eye.
      ctx.strokeStyle = rgba(look.belly, 0.5);
      ctx.lineWidth = 0.035;
      ctx.beginPath();
      ctx.moveTo(-0.46, 0);
      ctx.lineTo(0.42, 0);
      ctx.stroke();
      ctx.strokeStyle = rgba(look.mark, 0.75);
      ctx.lineWidth = 0.05;
      ctx.beginPath();
      for (const side of [1, -1]) {
        ctx.moveTo(0.08, (0.16 - 0.19 * 0.35) * side);
        ctx.lineTo(0.44, (0.16 + 0.17 * 0.35) * side);
      }
      ctx.stroke();
    } else {
      // Gold ridges down each side of the back.
      ctx.strokeStyle = rgba(look.belly, 0.5);
      ctx.lineWidth = 0.032;
      ctx.beginPath();
      for (const side of [1, -1]) {
        ctx.moveTo(-0.42, (0.15 + 0.42 * 0.07) * side);
        ctx.quadraticCurveTo(-0.1, (0.15 + 0.007) * side, 0.24, (0.15 - 0.24 * 0.07) * side);
      }
      ctx.stroke();
    }
    ctx.translate(-x0, 0);
    // Rounded back: darker toward the edges, the pale belly showing along
    // the flanks, and a soft wet sheen down the spine toward the light.
    const dome = ctx.createRadialGradient(x0 - 0.02, 0, 0.05, x0 - 0.02, 0, 0.52);
    dome.addColorStop(0, 'rgba(255, 255, 240, .07)');
    dome.addColorStop(0.62, 'rgba(0, 0, 0, 0)');
    dome.addColorStop(1, 'rgba(0, 0, 0, .42)');
    ctx.fillStyle = dome;
    ctx.fillRect(-1, -1, 2, 2);
    // The pale belly glows in from the edge: the shadow of a frame around
    // the body, falling inside it.
    ctx.save();
    ctx.shadowColor = rgba(look.belly, 0.4, 0.62 * dim);
    ctx.shadowBlur = frog.size * h * 0.045;
    ctx.beginPath();
    ctx.rect(-2, -2, 4, 4);
    ctx.moveTo(outline[0], outline[1]);
    for (let i = outline.length / 2 - 1; i >= 1; i--) ctx.lineTo(outline[i * 2], outline[i * 2 + 1]);
    ctx.closePath();
    ctx.fillStyle = '#000';
    ctx.fill();
    ctx.restore();
    // The sheen follows the world light, which turns with the frog.
    const c = Math.cos(-frog.bodyHeading);
    const s = Math.sin(-frog.bodyHeading);
    const lx = SUN[0] * c - SUN[1] * s;
    const ly = SUN[0] * s + SUN[1] * c;
    ctx.save();
    ctx.translate(x0 - 0.06 + lx * 0.07, ly * 0.07);
    ctx.scale(1, 0.24);
    const sheen = ctx.createRadialGradient(0, 0, 0, 0, 0, 0.26);
    sheen.addColorStop(0, 'rgba(255, 245, 215, .2)');
    sheen.addColorStop(1, 'rgba(255, 245, 215, 0)');
    ctx.fillStyle = sheen;
    ctx.fillRect(-0.3, -0.3, 0.6, 0.6);
    ctx.restore();
    ctx.restore();

    // Throat sacs pale as they swell.
    if (frog.throat > 0.2) {
      ctx.fillStyle = rgba(look.belly, (frog.throat - 0.2) * 0.8, 0.95);
      ctx.beginPath();
      for (const side of [1, -1]) {
        const r = 0.02 + frog.throat * (side > 0 ? 1.06 : 0.94) * 0.075;
        const y = (0.2 + frog.throat * 0.06) * side;
        ctx.moveTo(x0 + 0.17 + r, y);
        ctx.arc(x0 + 0.17, y, r * 0.9, 0, TAU);
      }
      ctx.fill();
    }

    // Eyes: iris, horizontal pupil turned toward what the frog watches,
    // a catch-light, and lids for blinking.
    const closed = Math.max(frog.blink > 0.5 ? 1 : 0, frog.startle * 0.35);
    for (const side of [1, -1]) {
      const ex = x0 + 0.27;
      const ey = 0.155 * side;
      ctx.fillStyle = rgba(look.skin, 1, 0.45 * dim);
      ctx.beginPath();
      ctx.arc(ex, ey, 0.078, 0, TAU);
      ctx.fill();
      if (closed >= 1) {
        ctx.fillStyle = rgba(look.skin, 1, 0.8 * dim);
        ctx.beginPath();
        ctx.arc(ex, ey, 0.062, 0, TAU);
        ctx.fill();
        continue;
      }
      const iris = ctx.createRadialGradient(ex, ey, 0, ex, ey, 0.062);
      iris.addColorStop(0, rgba(look.iris, 1, dim));
      iris.addColorStop(1, rgba(look.iris, 1, 0.7 * dim));
      ctx.fillStyle = iris;
      ctx.beginPath();
      ctx.arc(ex, ey, 0.062, 0, TAU);
      ctx.fill();
      const px = ex + (Math.cos(frog.look) - 1) * 0.016;
      const py = ey + Math.sin(frog.look) * 0.016;
      ctx.fillStyle = '#080806';
      ctx.beginPath();
      ctx.ellipse(px, py, 0.046, 0.024 * (1 - closed * 0.6), 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = 'rgba(255, 250, 235, .65)';
      ctx.beginPath();
      ctx.arc(ex + lx * 0.03, ey + ly * 0.03, 0.013, 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    if (frog.tongue > 0) {
      const mx = frog.x + Math.cos(frog.heading) * frog.size * 0.46;
      const my = frog.y + Math.sin(frog.heading) * frog.size * 0.46;
      ctx.strokeStyle = rgba(to255(FROG_TONGUE));
      ctx.lineWidth = frog.size * h * 0.05;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(sx(mx), sy(my));
      ctx.lineTo(sx(mx + (frog.tongueX - mx) * frog.tongue), sy(my + (frog.tongueY - my) * frog.tongue));
      ctx.stroke();
    }
  };

  const drawWake = (frog: Frog) => {
    if (frog.speed < 0.004) return;
    const strength = Math.min(frog.speed * 7, 1);
    ctx.save();
    ctx.translate(sx(frog.x), sy(frog.y));
    ctx.rotate(-frog.bodyHeading);
    const s = frog.size * h;
    ctx.strokeStyle = rgba(LIGHT, (day ? 0.24 : 0.16) * strength);
    ctx.lineWidth = Math.max(1, h * 0.002);
    ctx.beginPath();
    for (const side of [1, -1]) {
      ctx.moveTo(-0.35 * s, 0.2 * side * s);
      ctx.quadraticCurveTo(-1.2 * s, 0.6 * side * s, -2.2 * s, 1.05 * side * s);
    }
    ctx.stroke();
    ctx.restore();
  };

  // ---- Fireflies and reeds -------------------------------------------------------
  const drawFlies = (reflections: boolean) => {
    if (day) {
      drawMidges(reflections);
      return;
    }
    for (const fly of world.flies) {
      if (fly.respawn > 0 || fly.glow <= 0.01) continue;
      const x = sx(fly.x);
      const y = sy(reflections ? fly.y - fly.height : fly.y);
      const r = h * (reflections ? 0.022 : 0.03);
      glow(x, y, r, reflections ? fly.glow * 0.25 : fly.glow * 0.5, reflections ? 0 : fly.glow);
    }
    for (const mote of world.motes) {
      const shine = world.moteGlow(mote);
      if (shine <= 0.01) continue;
      const x = sx(mote.x);
      const y = sy(reflections ? mote.y - mote.height : mote.y);
      glow(x, y, h * (reflections ? 0.022 : 0.03), shine * (reflections ? 0.25 : 0.5), reflections ? 0 : shine);
    }
  };
  /** A firefly: a soft halo, and (unless it's a reflection) a bright core. */
  const glow = (x: number, y: number, r: number, halo: number, core: number) => {
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
    gradient.addColorStop(0, rgba(flyGlow, halo, 0.95));
    gradient.addColorStop(1, rgba(flyGlow, 0, 0.95));
    ctx.fillStyle = gradient;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    if (core > 0) {
      ctx.fillStyle = rgba(flyGlow, Math.min(1, core * 1.3), 1.1);
      ctx.beginPath();
      ctx.arc(x, y, Math.max(1, h * 0.0028), 0, TAU);
      ctx.fill();
    }
  };

  /** By day the flies are midges: a speck, flickering wings, a shadow below. */
  const drawMidges = (shadows: boolean) => {
    const count = world.flies.length + world.motes.length;
    for (let i = 0; i < count; i++) {
      const fly = i < world.flies.length ? world.flies[i] : null;
      const mote = fly ? null : world.motes[i - world.flies.length];
      const seen = fly ? (fly.respawn > 0 ? 0 : fly.fade) : world.moteGlow(mote!);
      if (seen < 0.05) continue;
      const { x: fx, y: fy, height } = fly ?? mote!;
      if (shadows) {
        // Cast away from the light, like everything else (as in the shader).
        const x = sx(fx + away[0] * height * 0.6);
        const y = sy(fy + away[1] * height * 0.6);
        const r = h * 0.006;
        const shade = ctx.createRadialGradient(x, y, 0, x, y, r);
        shade.addColorStop(0, `rgba(0, 0, 0, ${0.2 * seen})`);
        shade.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = shade;
        ctx.fillRect(x - r, y - r, r * 2, r * 2);
        continue;
      }
      const x = sx(fx);
      const y = sy(fy);
      const beat = 0.5 + 0.5 * Math.sin(clock * 60 + i * 1.7);
      ctx.fillStyle = rgba(flyGlow, (0.3 + beat * 0.2) * seen);
      ctx.beginPath();
      ctx.ellipse(x - h * 0.0032, y - h * 0.0008, h * 0.0026, h * 0.0014, 0, 0, TAU);
      ctx.ellipse(x + h * 0.0032, y - h * 0.0008, h * 0.0026, h * 0.0014, 0, 0, TAU);
      ctx.fill();
      ctx.fillStyle = rgba(flyBody, 0.9 * seen);
      ctx.beginPath();
      ctx.arc(x, y, Math.max(1, h * 0.0017), 0, TAU);
      ctx.fill();
    }
  };

  // The reeds: the blades reedBlades() lays out (as reeds() in the shader).
  const bladePath = (k: number, dx = 0, dy = 0) => {
    const rootX = reedEnds[k * 4];
    const rootY = reedEnds[k * 4 + 1];
    const ax = reedEnds[k * 4 + 2] - rootX;
    const ay = reedEnds[k * 4 + 3] - rootY;
    const len = Math.hypot(ax, ay) || 1;
    const nx = -ay / len;
    const ny = ax / len;
    const steps = 14;
    ctx.beginPath();
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i <= steps; i++) {
        const t = (pass ? steps - i : i) / steps;
        const bow = Math.sin(t * Math.PI) * reedShape[k * 4 + 1];
        const breadth = (reedShape[k * 4] * (1 - t * 0.88) + 0.0005) * (pass ? -1 : 1);
        const x = sx(rootX + ax * t + nx * (bow + breadth) + dx);
        const y = sy(rootY + ay * t + ny * (bow + breadth) + dy);
        if (!pass && !i) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
    }
    ctx.closePath();
  };
  const drawReeds = (time: number) => {
    reedBlades(aspect, time, reedEnds, reedShape, reedBox);
    // Shadows first, falling away from the light.
    ctx.fillStyle = `rgba(0, 0, 0, ${palette.shadow * 0.45})`;
    for (let k = 0; k < REED_BLADES; k++) {
      bladePath(k, away[0] * REED_SHADOW, away[1] * REED_SHADOW);
      ctx.fill();
    }
    const near = to255(palette.reedNear);
    const far = to255(palette.reedFar);
    const edge = to255(palette.reedEdge);
    for (let k = 0; k < REED_BLADES; k++) {
      const tone = reedShape[k * 4 + 2];
      const colour: RGB = [
        near[0] + (far[0] - near[0]) * tone,
        near[1] + (far[1] - near[1]) * tone,
        near[2] + (far[2] - near[2]) * tone,
      ];
      bladePath(k);
      ctx.fillStyle = rgba(colour, 0.97);
      ctx.fill();
      // The sunward edge catches warm light toward the tip.
      const rootX = reedEnds[k * 4];
      const rootY = reedEnds[k * 4 + 1];
      const ax = reedEnds[k * 4 + 2] - rootX;
      const ay = reedEnds[k * 4 + 3] - rootY;
      const len = Math.hypot(ax, ay) || 1;
      ctx.strokeStyle = rgba(edge, 0.25 + tone * 0.4, 0.64);
      ctx.lineWidth = Math.max(0.8, h * 0.0012);
      ctx.beginPath();
      for (let i = 4; i <= 14; i++) {
        const t = i / 14;
        const bow = Math.sin(t * Math.PI) * reedShape[k * 4 + 1] - (reedShape[k * 4] * (1 - t * 0.88) + 0.0005);
        const x = sx(rootX + ax * t - (ay / len) * bow);
        const y = sy(rootY + ay * t + (ax / len) * bow);
        if (i === 4) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
    // A seed head on one stem in each clump, four fifths of the way up.
    const head = to255(palette.reedHead);
    const rim = to255(palette.reedHeadRim);
    for (const [k, halfWidth, halfLength] of REED_HEADS) {
      const rootX = reedEnds[k * 4];
      const rootY = reedEnds[k * 4 + 1];
      const tipX = reedEnds[k * 4 + 2];
      const tipY = reedEnds[k * 4 + 3];
      ctx.save();
      ctx.translate(sx(rootX + (tipX - rootX) * 0.8), sy(rootY + (tipY - rootY) * 0.8));
      ctx.rotate(Math.atan2(tipX - rootX, tipY - rootY));
      ctx.fillStyle = rgba(head);
      ctx.beginPath();
      ctx.ellipse(0, 0, halfWidth * h, halfLength * h, 0, 0, TAU);
      ctx.fill();
      ctx.strokeStyle = rgba([head[0] + rim[0], head[1] + rim[1], head[2] + rim[2]], 0.8);
      ctx.lineWidth = Math.max(1, h * 0.0015);
      ctx.stroke();
      ctx.restore();
    }
  };

  const drawVignette = (width: number) => {
    ctx.save();
    ctx.translate(width / 2, h / 2);
    ctx.scale((aspect * 0.68) / 0.78, 1);
    const r = h * 0.78;
    // The shader's smoothstep(.95, .3, r), in stops.
    const vignette = ctx.createRadialGradient(0, 0, r * 0.3, 0, 0, r * 0.95);
    for (let i = 0; i <= 6; i++) {
      const t = i / 6;
      vignette.addColorStop(t, `rgba(0, 0, 0, ${(1 - palette.vignette) * smoothstep(0, 1, t)})`);
    }
    ctx.fillStyle = vignette;
    ctx.fillRect(-r * 2, -r * 2, r * 4, r * 4);
    ctx.restore();
  };

  const renderer: FrogRenderer = {
    get ready() {
      return ready;
    },
    get bank() {
      return bank.bank;
    },
    draw(time) {
      clock = time;
      const { width, height } = canvas;
      bank.fit(width, height);
      const baked = bank.bank;
      if (!baked || !causticsReady) return;
      h = height;
      aspect = width / Math.max(1, height);
      if (!bedLayer || bedLayer.width !== width || bedLayer.height !== height) {
        if (caustic) {
          causticMask = paintCausticMask(width, height);
          causticLayer = document.createElement('canvas');
          causticLayer.width = width;
          causticLayer.height = height;
        }
        bedLayer = paintBed(width, height);
        columnLayer = paintColumn(width, height);
      }
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      drawWater(time, width);
      drawFlies(true);
      world.frogs.forEach((frog, i) => {
        if (frog.submerge < 0.02) return;
        drawWake(frog);
        drawFrog(frog, i);
        // Water over a swimming frog.
        ctx.save();
        frogTransform(frog, 0);
        ctx.globalAlpha = frog.submerge * 0.35;
        bodyPath(frog);
        ctx.fillStyle = rgba(to255(palette.waterDeep), 1, day ? 1 : 0.9);
        ctx.fill();
        ctx.restore();
      });
      world.pads.forEach(drawPad);
      // The bank over the water's edge (and over a swimmer close to it).
      // While the canvas is being resized the last bank is stretched to fit.
      ctx.drawImage(baked.image, 0, 0, width, height);
      // Frogs on pads or in the air come after the bank: a leap near the
      // shore passes over the grass.
      world.frogs.forEach((frog, i) => {
        if (frog.submerge >= 0.02) return;
        drawShadow(frog, i);
        drawFrog(frog, i);
      });
      drawFlies(false);
      drawReeds(time);
      drawVignette(width);
      ready = true;
    },
    dispose() {
      bank.dispose();
      bedLayer = null;
      columnLayer = null;
      causticMask = null;
      causticLayer = null;
    },
  };
  return renderer;
}
