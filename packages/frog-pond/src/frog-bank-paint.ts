import { bottomBank, leftBank, shoreDistance } from './frog-bank';
import { makeCausticTile } from './frog-caustics';
import { TAU, itemSeed, makeCanvas, seeded, smoothstep as smooth } from './frog-math';
import { FROG_PALETTES, type FrogTheme } from './frog-theme';

// The bank along the bottom and left of the pond (frog-bank.ts), painted
// once per canvas size and drawn over the water by both renderers (the
// WebGL renderer uploads it as a texture, the Canvas renderer draws it
// directly), so they show the same bank. Runs in a worker where it can
// (frog-bank-worker.ts), so painting never holds up the page.
//
// From the water: silt stirred up in the shallows; dark wet earth, pebbles
// and moss at the waterline; the slope rising into earth and grass, lit where
// it faces the light (the bank faces up and right, toward it); tufts of grass,
// some leaning out over the water, their shadows falling back onto the bank.
// The layer is transparent over open water. The page fades its outer edge
// into the paper.
//
// Every stone, tuft and leaf is placed along the shore (so none go missing)
// and draws its own random numbers, so a resize moves the bank's details a
// little rather than re-rolling them.

type RGB = readonly [number, number, number];
type PaintCanvas = OffscreenCanvas | HTMLCanvasElement;
// Both kinds of 2D context have everything used here.
type Ctx = OffscreenCanvasRenderingContext2D;

/** The bank's coverage, a quarter of the layer's size each way: alpha 0 … 255 per cell. */
export interface BankMask {
  data: Uint8Array;
  width: number;
  height: number;
}
const MASK_SCALE = 4;

const context = (canvas: PaintCanvas, options?: CanvasRenderingContext2DSettings) =>
  canvas.getContext('2d', options) as Ctx | null;

// Value noise on an integer lattice, smooth-interpolated.
function lattice(ix: number, iy: number) {
  let n = Math.imul(ix, 374761393) + Math.imul(iy, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}
function noise(x: number, y: number) {
  const ix = Math.floor(x);
  const iy = Math.floor(y);
  const fx = x - ix;
  const fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx);
  const sy = fy * fy * (3 - 2 * fy);
  const a = lattice(ix, iy);
  const b = lattice(ix + 1, iy);
  const c = lattice(ix, iy + 1);
  const d = lattice(ix + 1, iy + 1);
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy;
}
function fbm(x: number, y: number) {
  let sum = 0;
  let amp = 0.5;
  for (let i = 0; i < 4; i++) {
    sum += noise(x, y) * amp;
    x = x * 2.03 + 17.1;
    y = y * 2.03 + 9.7;
    amp *= 0.5;
  }
  return sum / 0.9375;
}
const mix = (a: RGB, b: RGB, t: number): RGB => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];
const css = (c: RGB, alpha = 1, scale = 1) =>
  `rgba(${Math.round(Math.min(1, c[0] * scale) * 255)}, ${Math.round(Math.min(1, c[1] * scale) * 255)}, ${Math.round(Math.min(1, c[2] * scale) * 255)}, ${alpha})`;

// Item sets, each with its own seeds.
const PEBBLES = 1;
const STONES = 2;
const TUFTS = 3;
const LEAVES = 4;
const FLOWERS = 5;

/**
 * A point `distance` up the bank from the waterline (negative: out in the
 * shallows), at share `along` of one bank: the bottom bank if `bottom`, else
 * the left one. Null where that stretch of bank isn't in the picture, or
 * where the point belongs to the other bank (in the corner where they meet).
 */
function onBank(bottom: boolean, along: number, distance: number, aspect: number) {
  let x: number;
  let y: number;
  if (bottom) {
    x = along * aspect;
    const waterline = bottomBank(along);
    if (waterline - distance < -0.01) return null;
    y = waterline - distance;
    if (x - leftBank(y) * aspect < -distance) return null;
  } else {
    y = along;
    const waterline = leftBank(along) * aspect;
    if (waterline - distance < -0.01) return null;
    x = waterline - distance;
    if (y - bottomBank(x / aspect) < -distance) return null;
  }
  // Settle it exactly `distance` from the water, across the rounded corner
  // too: a couple of steps along the shore's gradient.
  for (let i = 0; i < 2; i++) {
    const e = 0.002;
    const gx = (shoreDistance(x + e, y, aspect) - shoreDistance(x - e, y, aspect)) / (2 * e);
    const gy = (shoreDistance(x, y + e, aspect) - shoreDistance(x, y - e, aspect)) / (2 * e);
    const g2 = gx * gx + gy * gy || 1;
    const off = -distance - shoreDistance(x, y, aspect);
    x += (gx * off) / g2;
    y += (gy * off) / g2;
  }
  if (x < -0.02 || y < -0.02 || x > aspect + 0.02 || y > 1.02) return null;
  return [x, y] as const;
}

export function paintBank(width: number, height: number, theme: FrogTheme) {
  const layer = makeCanvas(width, height);
  const g = context(layer);
  if (!g) return layer;
  const p = FROG_PALETTES[theme];
  const day = theme === 'day';
  const h = height;
  const aspect = width / height;
  const sunLength = Math.hypot(p.sun[0], p.sun[1]);
  const sun = [p.sun[0] / sunLength, p.sun[1] / sunLength] as const;
  // Canvas pixels (y down) for world units (y up), and the way shadows fall.
  const X = (x: number) => x * h;
  const Y = (y: number) => (1 - y) * h;
  const awayX = -sun[0];
  const awayY = sun[1];
  const shore = (x: number, y: number) => shoreDistance(x, y, aspect);

  // ---- Ground: earth, grass and moss, lit by its slope ------------------------
  // Painted per pixel at half resolution (it is soft anyway) and scaled up.
  // Also the silt in the shallows just off the bank.
  const step = 2;
  const gw = Math.ceil(width / step);
  const gh = Math.ceil(height / step);
  const ground = makeCanvas(gw, gh);
  const gg = context(ground);
  if (gg) {
    const heights = new Float32Array(gw * gh);
    const dists = new Float32Array(gw * gh);
    for (let j = 0; j < gh; j++) {
      for (let i = 0; i < gw; i++) {
        const x = ((i + 0.5) * step) / h;
        const y = 1 - ((j + 0.5) * step) / h;
        const d = shore(x, y);
        dists[j * gw + i] = d;
        // The bank rises from the water, with lumps and hollows.
        heights[j * gw + i] = smooth(0.005, -0.07, d) * 0.9 + fbm(x * 11, y * 11) * 0.35;
      }
    }
    const image = gg.createImageData(gw, gh);
    const light: [number, number, number] = [sun[0] * 0.9, sun[1] * 0.9, 0.55];
    const lightLength = Math.hypot(...light);
    const texel = step / h;
    const edge = texel * 0.9;
    for (let j = 0; j < gh; j++) {
      for (let i = 0; i < gw; i++) {
        const k = j * gw + i;
        const d = dists[k];
        if (d > 0.05) continue;
        const x = ((i + 0.5) * step) / h;
        const y = 1 - ((j + 0.5) * step) / h;
        const dist = -d;
        // Slope toward the light (y up in the world, rows go down).
        const dhx = (heights[j * gw + Math.min(gw - 1, i + 1)] - heights[j * gw + Math.max(0, i - 1)]) / (2 * texel);
        const dhy = (heights[Math.max(0, j - 1) * gw + i] - heights[Math.min(gh - 1, j + 1) * gw + i]) / (2 * texel);
        const nx = -dhx * 0.035;
        const ny = -dhy * 0.035;
        const lit = Math.max(0, (nx * light[0] + ny * light[1] + light[2]) / (Math.hypot(nx, ny, 1) * lightLength));
        const n1 = fbm(x * 7 + 3.1, y * 7);
        const n2 = fbm(x * 30 + 5.3, y * 30 + 1.7);
        const n3 = fbm(x * 3.2 + 11, y * 3.2 + 4);
        // The wet strip is wider in some places (a muddy landing) than others.
        const wet = Math.exp(-Math.max(0, dist) / (0.005 + 0.02 * n3 * n3));
        let c = mix(p.soil, p.soilDry, smooth(0.35, 0.8, n1 + dist * 2.5));
        c = mix(c, p.soilDamp, wet * 0.92);
        const grassy = smooth(0.42, 0.72, n3 * 0.75 + n2 * 0.3 + smooth(0.012, 0.09, dist) * 0.6) * (1 - wet);
        c = mix(c, mix(p.grassDark, p.grassLight, smooth(0.25, 0.8, n2)), grassy * 0.9);
        const mossy = smooth(0.5, 0.72, n2 * 0.6 + n1 * 0.5) * smooth(0.0, 0.01, dist) * wet;
        c = mix(c, p.moss, mossy * 0.75);
        // Crumbs of earth and bits of grass: fine grain, stronger on bare soil.
        // (Fixed to the world, not the pixel grid, so it holds still on resize.)
        const crumb = lattice(Math.floor(x * 600), Math.floor(y * 600) + 7919) - 0.5;
        const shade = (0.55 + 0.6 * lit) * (1 + crumb * (0.45 - 0.25 * grassy));
        // Slopes that face the light catch it: warm at night, bright by day.
        const rim = Math.max(0, lit - 0.62) * (day ? 0.25 : 0.9);
        const landColour: RGB = [
          c[0] * shade + p.light[0] * rim * 0.22,
          c[1] * shade + p.light[1] * rim * 0.22,
          c[2] * shade + p.light[2] * rim * 0.22,
        ];
        // Soft coverage at the waterline; off it, silt clouding the shallows.
        const land = smooth(edge, -edge, d);
        const silt = (1 - land) * (day ? 0.42 : 0.5) * Math.exp(-Math.max(0, d) / (0.008 + 0.012 * n3));
        const siltColour = mix(p.soilDamp, p.soil, 0.35 * n1);
        const alpha = land + silt;
        const o = k * 4;
        image.data[o] = Math.min(255, ((landColour[0] * land + siltColour[0] * silt) / alpha) * 255);
        image.data[o + 1] = Math.min(255, ((landColour[1] * land + siltColour[1] * silt) / alpha) * 255);
        image.data[o + 2] = Math.min(255, ((landColour[2] * land + siltColour[2] * silt) / alpha) * 255);
        image.data[o + 3] = Math.round(Math.min(1, alpha) * 255);
      }
    }
    gg.putImageData(image, 0, 0);
    g.imageSmoothingEnabled = true;
    g.drawImage(ground, 0, 0, gw * step, gh * step);
  }

  /**
   * Item `index` of a set: a spot between `min` and `max` up the bank (the
   * bottom bank is chosen in proportion to its length), and the generator
   * that item draws everything else from. Null if it falls outside the
   * picture.
   */
  const bottomShare = aspect / (aspect + 1);
  const place = (set: number, index: number, min: number, max: number) => {
    const random = seeded(itemSeed(set, index));
    const bottom = random() < bottomShare;
    const along = random() * (bottom ? 0.85 : 0.9);
    const distance = min + random() * (max - min);
    const at = onBank(bottom, along, distance, aspect);
    return at ? { x: at[0], y: at[1], dist: distance, random } : null;
  };
  // The stretch of each bank's waterline that is in the picture (where the
  // other bank doesn't take over), as [from, to] along it, so the pebbles
  // at the water's edge are all placed on it.
  const span = (bottom: boolean) => {
    let from = -1;
    let to = -1;
    for (let i = 0; i <= 200; i++) {
      if (!onBank(bottom, i / 200, 0, aspect)) continue;
      if (from < 0) from = i / 200;
      to = i / 200;
    }
    return [Math.max(0, from), Math.max(0, to)] as const;
  };
  const spans = [span(true), span(false)] as const;
  const shoreLength = (spans[0][1] - spans[0][0]) * aspect + (spans[1][1] - spans[1][0]);
  const alongShore = (set: number, index: number, min: number, max: number) => {
    const random = seeded(itemSeed(set, index));
    const bottom = random() < ((spans[0][1] - spans[0][0]) * aspect) / shoreLength;
    const [from, to] = spans[bottom ? 0 : 1];
    const distance = min + random() * (max - min);
    const at = onBank(bottom, from + random() * (to - from), distance, aspect);
    return at ? { x: at[0], y: at[1], dist: distance, random } : null;
  };
  const stone = (x: number, y: number, r: number, wetness: number, random: () => number) => {
    const stretch = 0.6 + random() * 0.35;
    const angle = random() * Math.PI;
    const tone = random();
    const base = mix(p.stoneDark, p.stoneLight, 0.25 + 0.7 * tone);
    g.save();
    g.translate(X(x), Y(y));
    g.fillStyle = `rgba(0, 0, 0, ${day ? 0.28 : 0.4})`;
    g.beginPath();
    g.ellipse(awayX * r * 0.45, awayY * r * 0.45, r * 1.08, r * stretch * 1.08, angle, 0, TAU);
    g.fill();
    g.fillStyle = css(base, 1, 1 - 0.35 * wetness);
    g.beginPath();
    g.ellipse(0, 0, r, r * stretch, angle, 0, TAU);
    g.fill();
    const top = g.createRadialGradient(sun[0] * r * 0.4, -sun[1] * r * 0.4, 0, 0, 0, r);
    top.addColorStop(0, css(base, day ? 0.7 : 0.45, 1.35));
    top.addColorStop(1, css(base, 0));
    g.fillStyle = top;
    g.fill();
    if (wetness > 0.5) {
      // A wet stone's glint, toward the light.
      g.fillStyle = css(p.light, day ? 0.5 : 0.25);
      g.beginPath();
      g.ellipse(sun[0] * r * 0.35, -sun[1] * r * 0.35, r * 0.18, r * 0.1, angle, 0, TAU);
      g.fill();
    }
    g.restore();
  };

  // ---- Pebbles along the waterline, a few stones up the bank -----------------
  // About 128 per unit of picture width along the waterline.
  for (let i = 0; i < 128 * aspect; i++) {
    const at = alongShore(PEBBLES, i, -0.004, 0.016);
    if (!at) continue;
    const big = at.random() < 0.1;
    const r = h * (big ? 0.008 + at.random() * 0.007 : 0.0025 + at.random() * at.random() * 0.006);
    stone(at.x, at.y, r, at.dist < 0.006 ? 1 : 0, at.random);
  }
  for (let i = 0; i < 14 * aspect; i++) {
    const at = place(STONES, i, 0.03, 0.2);
    if (at) stone(at.x, at.y, h * (0.004 + at.random() * 0.008), 0, at.random);
  }

  // ---- Grass ------------------------------------------------------------------
  interface Blade {
    x: number;
    y: number;
    angle: number;
    length: number;
    width: number;
    bend: number;
    tone: number;
  }
  const blades: Blade[] = [];
  for (let t = 0; t < 380 * aspect; t++) {
    const at = place(TUFTS, t, 0.004, 0.3);
    if (!at) continue;
    const { x, y, dist, random } = at;
    // Denser up the bank, with bare patches; sparse right at the water.
    const cover = smooth(0.004, 0.045, dist) * (0.3 + 0.7 * smooth(0.35, 0.65, fbm(x * 3.2 + 11, y * 3.2 + 4)));
    if (random() > cover) continue;
    // Toward the water: up the slope of the shore distance.
    const e = 0.003;
    const toWater = Math.atan2(shore(x, y + e) - shore(x, y - e), shore(x + e, y) - shore(x - e, y));
    const edge = dist < 0.03;
    // Now and then a clump of sedge: longer, finer, all leaning one way.
    const sedge = !edge && random() < 0.12;
    const count = sedge ? 10 + Math.floor(random() * 8) : 5 + Math.floor(random() * 8);
    const lean = edge ? toWater + (random() - 0.5) * 0.9 : random() * TAU;
    for (let b = 0; b < count; b++) {
      blades.push({
        x: x + (random() - 0.5) * 0.004,
        y: y + (random() - 0.5) * 0.004,
        angle: lean + (random() - 0.5) * (edge ? 1.3 : sedge ? 0.9 : 2.2),
        length: edge ? 0.03 + random() * 0.035 : sedge ? 0.035 + random() * 0.03 : 0.014 + random() * 0.026,
        width: sedge ? 0.0011 + random() * 0.0008 : 0.0016 + random() * 0.0014,
        bend: (random() - 0.5) * 0.5,
        tone: random(),
      });
    }
  }
  const bladePath = (blade: Blade, dx = 0, dy = 0) => {
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
  // Shadows first, all falling away from the light.
  g.fillStyle = `rgba(0, 0, 0, ${day ? 0.22 : 0.35})`;
  for (const blade of blades) {
    bladePath(blade, awayX * h * 0.006, awayY * h * 0.006);
    g.fill();
  }
  for (const blade of blades) {
    // Blades facing the light are brighter; the tips catch it most.
    const facing = 0.5 + 0.5 * (Math.cos(blade.angle) * sun[0] + Math.sin(blade.angle) * sun[1]);
    const base = mix(p.grassDark, p.grassLight, blade.tone * 0.7);
    const tip = mix(base, mix(p.grassLight, p.light, day ? 0.2 : 0.35), 0.35 + 0.55 * facing);
    const bx = X(blade.x);
    const by = Y(blade.y);
    const gradient = g.createLinearGradient(
      bx,
      by,
      bx + Math.cos(blade.angle) * blade.length * h,
      by - Math.sin(blade.angle) * blade.length * h,
    );
    gradient.addColorStop(0, css(base, 1, 0.75));
    gradient.addColorStop(1, css(tip, 1, day ? 1 : 0.9 + facing * 0.5));
    g.fillStyle = gradient;
    bladePath(blade);
    g.fill();
  }

  // Fallen leaves on the earth.
  for (let i = 0; i < 24 * aspect; i++) {
    const at = place(LEAVES, i, 0.006, 0.25);
    if (!at) continue;
    const { random } = at;
    const r = h * (0.005 + random() * 0.005);
    const tone = mix(p.padAged, p.soilDry, random() * 0.6);
    g.save();
    g.translate(X(at.x), Y(at.y));
    g.rotate(random() * TAU);
    g.fillStyle = `rgba(0, 0, 0, ${day ? 0.18 : 0.3})`;
    g.beginPath();
    g.ellipse(awayX * r * 0.3, awayY * r * 0.3, r, r * 0.45, 0, 0, TAU);
    g.fill();
    g.fillStyle = css(tone, 0.95, day ? 1 : 0.8);
    g.beginPath();
    g.ellipse(0, 0, r, r * 0.45, 0, 0, TAU);
    g.fill();
    g.strokeStyle = css(tone, 0.6, 0.6);
    g.lineWidth = Math.max(1, h * 0.0008);
    g.beginPath();
    g.moveTo(-r, 0);
    g.lineTo(r * 1.3, 0);
    g.stroke();
    g.restore();
  }

  // A few small flowers in the grass (by day).
  if (p.flowers.length) {
    for (let i = 0; i < 40 * aspect; i++) {
      const at = place(FLOWERS, i, 0.03, 0.3);
      if (!at || at.random() > 0.7) continue;
      const r = h * (0.0022 + at.random() * 0.0016);
      g.fillStyle = css(p.flowers[at.random() < 0.7 ? 0 : p.flowers.length - 1], 0.95);
      g.beginPath();
      g.arc(X(at.x), Y(at.y), r, 0, TAU);
      g.fill();
    }
  }
  return layer;
}

/** The layer's coverage at a quarter of its size, for hit tests (see BankMask). */
export function bankMask(layer: PaintCanvas): BankMask {
  const width = Math.max(1, Math.ceil(layer.width / MASK_SCALE));
  const height = Math.max(1, Math.ceil(layer.height / MASK_SCALE));
  const small = makeCanvas(width, height);
  const g = context(small, { willReadFrequently: true });
  const data = new Uint8Array(width * height);
  if (!g) return { data, width, height };
  g.drawImage(layer, 0, 0, width, height);
  const pixels = g.getImageData(0, 0, width, height).data;
  for (let i = 0; i < data.length; i++) data[i] = pixels[i * 4 + 3];
  return { data, width, height };
}

/** What the painter can be asked for: the bank for a size and light, or the caustic tile (frog-caustics.ts). */
export type PaintRequest =
  | { kind: 'bank'; width: number; height: number; theme: FrogTheme }
  | { kind: 'caustics'; size: number };

/**
 * Answers paint requests posted to this worker (see frog-bank-layer.ts):
 * hands back the finished picture, and for the bank its coverage mask.
 */
export function serveBankRequests() {
  const scope = self as unknown as {
    onmessage: ((event: MessageEvent<PaintRequest & { id: number }>) => void) | null;
    postMessage(message: unknown, transfer?: Transferable[]): void;
  };
  scope.onmessage = ({ data }) => {
    try {
      if (data.kind === 'caustics') {
        const bitmap = (makeCausticTile(data.size) as OffscreenCanvas).transferToImageBitmap();
        scope.postMessage({ id: data.id, bitmap }, [bitmap]);
        return;
      }
      const layer = paintBank(data.width, data.height, data.theme) as OffscreenCanvas;
      const mask = bankMask(layer);
      const bitmap = layer.transferToImageBitmap();
      scope.postMessage({ id: data.id, bitmap, mask }, [bitmap, mask.data.buffer]);
    } catch (error) {
      scope.postMessage({ id: data.id, error: String(error) });
    }
  };
}
