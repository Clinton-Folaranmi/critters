// The site shell's script, shared by every animal page (studies/site/): it
// draws the owner's approved border on the picture.
//
// The border is the one the owner chose for the social posts on 2026-10-28
// (social/approved-settings.json, passed in at build time as BORDER), with
// the maths of social/edge-mask.js generalised from a square to a w × h
// rectangle, as the approved site board does (reports/site-board, rectMask):
// every size that was a fraction of the square's side is taken from the short
// side (unit = min(w, h), k = unit / 512, the square tool's own resolution),
// so the corners, the ragged edge and the grain look the same as on the posts.
// No value is re-tuned here.
//
// The mask is drawn with a short side of 512 (k = 1, the posts' resolution)
// for the picture's aspect, set as a CSS mask on .picture, and redrawn when
// the aspect changes (on a window resize, debounced). The scene inside is not masked by
// its own edge (the frog pond mounts with ownEdge: false; the other four are
// full bleed). The keyboard-focus ring is drawn by the page (site.css) along
// the same rounded rectangle, from --ring-inset and --ring-radius set here.

interface BorderSettings {
  radius: number;
  fade: number;
  strength: number;
  roughness: number;
  grain: number;
}
declare const BORDER: BorderSettings;

/** The mask tool's resolution: sizes are fractions of this (social/edge-mask.js). */
const TOOL = 512;

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

/** A main-thread slice, ms: the mask is drawn in bands so loading never stalls the page. */
const SLICE = 8;
const nextTask = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

/** The border for this aspect as an image URL (alpha only), drawn with a short side of 512. */
async function maskUrl(aspect: number) {
  const w = aspect >= 1 ? Math.round(TOOL * aspect) : TOOL;
  const h = aspect >= 1 ? TOOL : Math.round(TOOL / aspect);
  const { alpha, fill } = borderRows(w, h);
  for (let y = 0; y < h;) {
    const started = performance.now();
    while (y < h && performance.now() - started < SLICE) {
      fill(y, Math.min(h, y + 8));
      y += 8;
    }
    if (y < h) await nextTask();
  }
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const context = canvas.getContext('2d');
  if (!context) return null;
  const image = context.createImageData(w, h);
  for (let i = 0; i < alpha.length; i++) image.data[i * 4 + 3] = alpha[i];
  context.putImageData(image, 0, 0);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  return blob ? URL.createObjectURL(blob) : null;
}

function startShell() {
  const stage = document.querySelector<HTMLElement>('.stage');
  const picture = document.querySelector<HTMLElement>('.picture');
  if (!stage || !picture) return;
  const masks = new Map<number, Promise<string | null>>();
  let wanted = 0;
  const fit = async () => {
    const { clientWidth: width, clientHeight: height } = picture;
    if (!width || !height) return;
    const aspect = Math.round((width / height) * 100) / 100;
    if (aspect !== wanted) {
      wanted = aspect;
      if (!masks.has(aspect)) masks.set(aspect, maskUrl(aspect));
      const url = await masks.get(aspect);
      // Resized to another aspect while this one was drawing: that one wins.
      if (aspect !== wanted) return;
      if (url) {
        picture.style.setProperty('-webkit-mask-image', `url(${url})`);
        picture.style.setProperty('mask-image', `url(${url})`);
      }
    }
    // The focus ring: the border's rounded rectangle, halfway through its fade.
    const scale = Math.min(width, height) / TOOL;
    const inset = (8 + (BORDER.roughness / 100) * 25 + ((BORDER.fade / 100) * TOOL) / 2) * scale;
    const radius = Math.max(0, (BORDER.radius / 100) * TOOL * scale - inset);
    stage.style.setProperty('--ring-inset', `${inset.toFixed(1)}px`);
    stage.style.setProperty('--ring-radius', `${radius.toFixed(1)}px`);
    picture.dataset.border = '';
  };
  void fit();
  // The picture's size follows the window's (its aspect is set in site.css), so
  // a window resize is enough; no observer of the page's own.
  let timer = 0;
  window.addEventListener('resize', () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(() => void fit(), 120);
  });
}

startShell();
