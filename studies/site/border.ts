// The owner's border (social/approved-settings.json, passed in at build time
// as BORDER), with the maths of social/edge-mask.js generalised from a square
// to a w × h rectangle, as the approved site board does (reports/site-board,
// rectMask): every size that was a fraction of the square's side is taken from
// the short side (unit = min(w, h), k = unit / 512, the square tool's own
// resolution), so the corners, the ragged edge and the grain look the same as
// on the posts. No value is re-tuned here.
//
// scripts/build.mjs draws it once per picture aspect (desktop 1.48, phone
// 0.91) into assets/masks/*.png, set as a CSS mask on .picture (site.css), so
// the still shows as soon as it has loaded; shell.ts only sets the focus ring
// from the same settings.

export interface BorderSettings {
  radius: number;
  fade: number;
  strength: number;
  roughness: number;
  grain: number;
}
declare const BORDER: BorderSettings;
export const SETTINGS: BorderSettings = BORDER;

/** The mask tool's resolution: sizes are fractions of this (social/edge-mask.js). */
export const TOOL = 512;

/**
 * The border for a w × h picture (social/edge-mask.js, made rectangular), as
 * alpha pixels that `fill(y0, y1)` computes a band of rows at a time.
 */
function borderRows(w: number, h: number, settings: BorderSettings = BORDER) {
  const clamp = (value: number) => Math.max(0, Math.min(1, value));
  const smooth = (value: number) => {
    const t = clamp(value);
    return t * t * (3 - 2 * t);
  };
  const mix = (a: number, b: number, t: number) => a + (b - a) * t;
  const hash = (x: number, y: number) => {
    let n = Math.imul(x, 374761393) + Math.imul(y, 668265263);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  };
  const noise = (x: number, y: number) => {
    const ix = Math.floor(x);
    const iy = Math.floor(y);
    const tx = smooth(x - ix);
    const ty = smooth(y - iy);
    return mix(mix(hash(ix, iy), hash(ix + 1, iy), tx), mix(hash(ix, iy + 1), hash(ix + 1, iy + 1), tx), ty);
  };
  const unit = Math.min(w, h);
  const k = unit / TOOL;
  const radius = (settings.radius / 100) * unit;
  const width = (settings.fade / 100) * unit;
  const strength = settings.strength / 100;
  const roughness = settings.roughness / 100;
  const grain = settings.grain / 100;
  /** How far in the edge starts, and the most the roughening moves it (|noise − 0.5| ≤ 0.5). */
  const inset = (8 + roughness * 25) * k;
  const reach = roughness * 25 * k;
  const alpha = new Uint8ClampedArray(w * h);
  const hx = w / 2;
  const hy = h / 2;
  const fill = (y0: number, y1: number) => {
    for (let y = y0; y < y1; y++)
      for (let x = 0; x < w; x++) {
        const qx = Math.abs(x + 0.5 - hx) - (hx - radius);
        const qy = Math.abs(y + 0.5 - hy) - (hy - radius);
        const ox = Math.max(qx, 0);
        const oy = Math.max(qy, 0);
        const signed = Math.sqrt(ox * ox + oy * oy) + Math.min(Math.max(qx, qy), 0) - radius;
        // The roughening moves the edge by at most `reach`: well inside the fade
        // the alpha is exactly 1, well outside it 0, so skip the noise there.
        if (-signed - reach - inset >= width) {
          alpha[y * w + x] = 255;
          continue;
        }
        if (-signed + reach - inset < 0) continue;
        const uneven = roughness
          ? roughness *
            50 *
            k *
            (0.7 * (noise(x / (46 * k), y / (46 * k)) - 0.5) + 0.3 * (noise(x / (17 * k), y / (17 * k)) - 0.5))
          : 0;
        const distance = -signed + uneven - inset;
        const fade = width > 0 ? smooth(distance / width) : Number(distance >= 0);
        let a = distance < 0 ? 0 : Math.pow(fade, 0.2 + 2.3 * strength);
        if (distance >= 0 && width > 0 && grain) {
          const speckle = 0.7 * hash(Math.floor(x / 2), Math.floor(y / 2)) + 0.3 * hash(x, y);
          a *= 1 + grain * 1.2 * (speckle - 0.5) * (1 - fade);
        }
        alpha[y * w + x] = Math.round(255 * clamp(a));
      }
  };
  return { alpha, fill };
}

/** Alpha pixels of the border for a w × h picture, all at once. */
export function borderMask(w: number, h: number, settings: BorderSettings = BORDER) {
  const { alpha, fill } = borderRows(w, h, settings);
  fill(0, h);
  return alpha;
}
