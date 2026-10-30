// The pencil sketch the page shows while a scene loads (the owner's pick,
// 2026-10-30: "pencil sketch with all the delights"; the prototype is
// reports/site-board/loading/). Drawn by a worker on an OffscreenCanvas
// (worker.ts), so it keeps moving while the main thread is busy painting the
// scene's ground.
//
// The strokes are traced from the still at build time (scripts/trace-
// sketches.mjs → studies/site/sketches/*.json). Here they're smoothed,
// resampled and given a hand: tremor, small overshoots and a faint doubled
// construction line on the longest. They're laid down a few points a frame
// with a graphite texture (paper tooth in the stroke's alpha), longest
// first. Then a watercolour wash: the still shown through a moving threshold
// on a noise field (blooms, fbm, per-pixel granulation), with pigment pooling
// darker at the wet edge. The picture's CSS mask (the owner's border) is on
// the element, so nothing here draws the border.

export interface SketchFile {
  /** The size the strokes were traced at (CSS px of a reference picture). */
  w: number;
  h: number;
  /** How the still fills the picture: 'cover' (background-size: cover) or 'stretch' (100% 100%). */
  fit: 'cover' | 'stretch';
  /** Each: [strength × 100, x0, y0, dx1, dy1, …], integer trace px, deltas after the first point. */
  strokes: number[][];
}

interface Stroke {
  pts: Float32Array;
  len: number;
  strength: number;
  ghost: boolean;
  a: number;
  d: number;
}

const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));
const ease = (t: number) => 0.5 - 0.5 * Math.cos(Math.PI * clamp(t));
const hash = (x: number, y: number) => {
  let n = Math.imul(x, 374761393) + Math.imul(y, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
};
const smooth = (t: number) => t * t * (3 - 2 * t);
const noise = (x: number, y: number) => {
  const ix = Math.floor(x),
    iy = Math.floor(y);
  const tx = smooth(x - ix),
    ty = smooth(y - iy);
  const a = hash(ix, iy) + (hash(ix + 1, iy) - hash(ix, iy)) * tx;
  const b = hash(ix, iy + 1) + (hash(ix + 1, iy + 1) - hash(ix, iy + 1)) * tx;
  return a + (b - a) * ty;
};
const fbm = (x: number, y: number) =>
  0.55 * noise(x, y) + 0.3 * noise(x * 2.03 + 17.1, y * 2.03 + 5.3) + 0.15 * noise(x * 4.1 + 3.7, y * 4.1 + 29.9);

type Ctx = OffscreenCanvasRenderingContext2D;
const canvas2d = (w: number, h: number) => {
  const c = new OffscreenCanvas(Math.max(1, w), Math.max(1, h));
  return { c, g: c.getContext('2d') as Ctx };
};

/** The paper's colour under the sketch: the page's, part-way down its gradient (site.css). */
export const PAPER = [238, 236, 226];
const GRAPHITE = [54, 56, 52];

/** The timeline, in seconds at natural speed. */
export const TIMELINE = { L: 2.1, lines: [0, 1.3], wash: [0.95, 2.1] } as const;

/** Draws the still into w × h as the page does (cover, or stretched). */
export function drawStill(g: Ctx, img: ImageBitmap, w: number, h: number, fit: SketchFile['fit']) {
  if (fit === 'stretch') {
    g.drawImage(img, 0, 0, w, h);
    return;
  }
  const s = Math.max(w / img.width, h / img.height);
  const dw = img.width * s,
    dh = img.height * s;
  g.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
}

function chaikin(p: number[]) {
  const n = p.length / 2;
  if (n < 3) return p;
  const out = [p[0], p[1]];
  for (let i = 0; i < n - 1; i++) {
    const x0 = p[i * 2],
      y0 = p[i * 2 + 1],
      x1 = p[i * 2 + 2],
      y1 = p[i * 2 + 3];
    out.push(0.75 * x0 + 0.25 * x1, 0.75 * y0 + 0.25 * y1, 0.25 * x0 + 0.75 * x1, 0.25 * y0 + 0.75 * y1);
  }
  out.push(p[n * 2 - 2], p[n * 2 - 1]);
  return out;
}

function resample(p: number[], step: number) {
  const out = [p[0], p[1]];
  let carry = 0;
  for (let i = 0; i < p.length / 2 - 1; i++) {
    const x0 = p[i * 2],
      y0 = p[i * 2 + 1],
      x1 = p[i * 2 + 2],
      y1 = p[i * 2 + 3];
    const L = Math.hypot(x1 - x0, y1 - y0);
    let t = step - carry;
    while (t <= L) {
      out.push(x0 + ((x1 - x0) * t) / L, y0 + ((y1 - y0) * t) / L);
      t += step;
    }
    carry = L - (t - step);
  }
  out.push(p[p.length - 2], p[p.length - 1]);
  return out;
}

/** The traced strokes at this picture's size, with a hand, scheduled on the line phase's 0–1. */
export function strokesFor(file: SketchFile, w: number, h: number, seed: number): Stroke[] {
  const sx = w / file.w,
    sy = h / file.h;
  const base: { pts: number[]; len: number; strength: number }[] = [];
  for (const s of file.strokes) {
    const raw: number[] = [];
    let x = s[1],
      y = s[2];
    raw.push(x * sx, y * sy);
    for (let i = 3; i < s.length; i += 2) {
      x += s[i];
      y += s[i + 1];
      raw.push(x * sx, y * sy);
    }
    const pts = resample(chaikin(chaikin(raw)), 2);
    base.push({ pts, len: (pts.length / 2 - 1) * 2, strength: s[0] / 100 });
  }
  const longCut = [...base].sort((a, b) => b.len - a.len)[Math.floor(base.length * 0.12)]?.len ?? Infinity;
  const out: Stroke[] = [];
  base.forEach((s, idx) => {
    const p = s.pts;
    const m = p.length / 2;
    const over = s.len > 40 ? 2 + 4 * hash(idx, seed) : 0;
    const pts: number[] = [];
    for (let i = over ? -1 : 0; i <= (over ? m : m - 1); i++) {
      const k = clamp(i, 0, m - 1);
      let x = p[k * 2],
        y = p[k * 2 + 1];
      if (i < 0 || i >= m) {
        // Overshoot: one point past the end, along the tangent.
        const k2 = i < 0 ? Math.min(1, m - 1) : Math.max(0, m - 2);
        const dx = x - p[k2 * 2],
          dy = y - p[k2 * 2 + 1];
        const L = Math.hypot(dx, dy) || 1;
        x += (dx / L) * over;
        y += (dy / L) * over;
      }
      // Hand tremor, low frequency, along the normal.
      const a = Math.max(0, Math.min(m - 2, k));
      const tx = p[a * 2 + 2] - p[a * 2],
        ty = p[a * 2 + 3] - p[a * 2 + 1];
      const tl = Math.hypot(tx, ty) || 1;
      const wob = (noise((i * 2) / 16 + idx * 7.3, seed) - 0.5) * 1.1;
      pts.push(x - (ty / tl) * wob, y + (tx / tl) * wob);
    }
    out.push({ pts: new Float32Array(pts), len: s.len, strength: s.strength, ghost: false, a: 0, d: 0 });
    if (s.len >= longCut && s.len > 60) {
      // A faint doubled construction line on the longest strokes.
      const g: number[] = [];
      for (let i = 0; i < pts.length / 2; i++) {
        const off = (noise(i / 22 + idx * 3.1, seed + 9) - 0.5) * 2.6;
        g.push(pts[i * 2] + off, pts[i * 2 + 1] - off * 0.6);
      }
      out.push({ pts: new Float32Array(g), len: s.len, strength: s.strength, ghost: true, a: 0, d: 0 });
    }
  });
  // Long shapes blocked in first, the detail last in a flurry; ghosts just after their stroke.
  const real = out.filter((s) => !s.ghost);
  const total = real.reduce((t, s) => t + s.len, 0) || 1;
  const maxLen = Math.max(1, ...real.map((s) => s.len));
  let cum = 0,
    lastStart = 0;
  for (const s of out) {
    if (s.ghost) {
      s.a = Math.min(0.92, lastStart + 0.06);
      s.d = 0.08;
      continue;
    }
    s.a = 0.8 * Math.pow(cum / total, 0.9);
    s.d = Math.min(0.2, 0.025 + 0.17 * Math.sqrt(s.len / maxLen));
    lastStart = s.a;
    cum += s.len;
  }
  return out;
}

/** The graphite: pencil colour with paper tooth in its alpha, a 128 px tile. */
function graphite(g: Ctx) {
  const P = 128;
  const { c, g: t } = canvas2d(P, P);
  const img = t.createImageData(P, P);
  const pn = (x: number, y: number, period: number) => {
    const ix = Math.floor(x),
      iy = Math.floor(y);
    const sx = smooth(x - ix),
      sy = smooth(y - iy);
    const h = (a: number, b: number) => hash(((a % period) + period) % period, ((b % period) + period) % period);
    return (
      (h(ix, iy) * (1 - sx) + h(ix + 1, iy) * sx) * (1 - sy) + (h(ix, iy + 1) * (1 - sx) + h(ix + 1, iy + 1) * sx) * sy
    );
  };
  for (let y = 0; y < P; y++)
    for (let x = 0; x < P; x++) {
      const tooth = 0.6 * pn(x / 2, y / 2, 64) + 0.4 * pn(x / (128 / 24), y / (128 / 24), 24);
      const fine = hash(x + 911, y + 37);
      const a = clamp(0.25 + 1.1 * (tooth - 0.35) + 0.35 * (fine - 0.5), 0.05, 1);
      const i = (y * P + x) * 4;
      img.data[i] = GRAPHITE[0];
      img.data[i + 1] = GRAPHITE[1];
      img.data[i + 2] = GRAPHITE[2];
      img.data[i + 3] = Math.round(255 * a);
    }
  t.putImageData(img, 0, 0);
  return g.createPattern(c, 'repeat');
}

/** The wash's reveal order at w × h (0 first, 1 last): five blooms, fbm, granulation. */
function washField(w: number, h: number, seed: number) {
  const f = new Float32Array(w * h);
  const blooms = [
    [0.5, 0.48],
    [0.18 + 0.2 * hash(seed, 1), 0.25 + 0.2 * hash(seed, 2)],
    [0.62 + 0.2 * hash(seed, 3), 0.62 + 0.25 * hash(seed, 4)],
    [0.75 + 0.15 * hash(seed, 5), 0.18 + 0.2 * hash(seed, 6)],
    [0.12 + 0.2 * hash(seed, 7), 0.72 + 0.2 * hash(seed, 8)],
  ];
  const diag = Math.hypot(w, h);
  const big = Math.min(w, h) / 6,
    small = Math.min(w, h) / 30;
  let lo = Infinity,
    hi = -Infinity;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      let d = Infinity;
      for (const [bx, by] of blooms) d = Math.min(d, (Math.hypot(x - bx * w, y - by * h) / diag) * 2.2);
      const v =
        0.58 * d +
        0.27 * fbm(x / big + seed, y / big) +
        0.1 * noise(x / small, y / small + seed) +
        0.025 * hash(x, y + seed);
      f[y * w + x] = v;
      if (v < lo) lo = v;
      if (v > hi) hi = v;
    }
  for (let i = 0; i < f.length; i++) f[i] = (f[i] - lo) / (hi - lo);
  return f;
}

/** Draws the sketch on `canvas` (W × H device px for a w × h CSS px picture). */
export class Sketch {
  private g: Ctx;
  private lines: Ctx;
  private lineCanvas: OffscreenCanvas;
  private paper: OffscreenCanvas;
  private colour: OffscreenCanvas | null = null;
  private pool: OffscreenCanvas | null = null;
  private field: Float32Array | null = null;
  private mask: Ctx;
  private maskImg: ImageData;
  private ring: Ctx;
  private ringImg: ImageData;
  private tmp: Ctx;
  private pattern: CanvasPattern | null;
  private drawn: Int32Array;
  private lastU = 0;
  readonly W: number;
  readonly H: number;

  constructor(
    canvas: OffscreenCanvas,
    readonly w: number,
    readonly h: number,
    readonly dpr: number,
    private strokes: Stroke[],
    private seed: number,
  ) {
    this.W = Math.round(w * dpr);
    this.H = Math.round(h * dpr);
    canvas.width = this.W;
    canvas.height = this.H;
    this.g = canvas.getContext('2d') as Ctx;
    const lines = canvas2d(this.W, this.H);
    this.lineCanvas = lines.c;
    this.lines = lines.g;
    this.lines.lineCap = 'round';
    this.lines.lineJoin = 'round';
    this.pattern = graphite(this.lines);
    this.paper = this.makePaper();
    this.mask = canvas2d(w, h).g;
    this.maskImg = this.mask.createImageData(w, h);
    this.ring = canvas2d(w, h).g;
    this.ringImg = this.ring.createImageData(w, h);
    this.tmp = canvas2d(this.W, this.H).g;
    this.drawn = new Int32Array(strokes.length);
  }

  /** The paper: a 192 px tile of the page's colour with grain (hash noise tiles cleanly), filled over the canvas. */
  private makePaper() {
    const { W, H } = this;
    const T = 192;
    const tile = canvas2d(T, T);
    const img = tile.g.createImageData(T, T);
    for (let y = 0; y < T; y++)
      for (let x = 0; x < T; x++) {
        const i = (y * T + x) * 4;
        const v = (hash(x, y + 7) - 0.5) * 5 + (hash(x >> 1, (y >> 1) + 91) - 0.5) * 4;
        img.data[i] = PAPER[0] + v;
        img.data[i + 1] = PAPER[1] + v;
        img.data[i + 2] = PAPER[2] + v * 0.9;
        img.data[i + 3] = 255;
      }
    tile.g.putImageData(img, 0, 0);
    const { c, g } = canvas2d(W, H);
    g.fillStyle = g.createPattern(tile.c, 'repeat') ?? `rgb(${PAPER.join(',')})`;
    g.fillRect(0, 0, W, H);
    return c;
  }

  /** The still has arrived: the colour for the wash, and its darker pooling. */
  setStill(img: ImageBitmap, fit: SketchFile['fit']) {
    const { W, H } = this;
    const colour = canvas2d(W, H);
    drawStill(colour.g, img, W, H, fit);
    const pool = canvas2d(W, H);
    pool.g.drawImage(colour.c, 0, 0);
    pool.g.globalCompositeOperation = 'multiply';
    pool.g.fillStyle = 'rgba(92, 70, 52, 0.55)';
    pool.g.fillRect(0, 0, W, H);
    this.colour = colour.c;
    this.pool = pool.c;
    this.field = washField(this.w, this.h, this.seed);
  }

  get hasStill() {
    return this.colour != null;
  }

  /** Lays the strokes down up to line-phase progress u; returns where the pencil is (CSS px), or null. */
  private drawStrokes(u: number): [number, number] | null {
    if (u < this.lastU) {
      this.drawn.fill(0);
      this.lines.clearRect(0, 0, this.W, this.H);
    }
    this.lastU = u;
    const g = this.lines;
    const dpr = this.dpr;
    if (this.pattern) g.strokeStyle = this.pattern;
    let tip: [number, number] | null = null,
      tipStart = -1;
    this.strokes.forEach((s, i) => {
      if (u < s.a) return;
      const m = s.pts.length / 2;
      if (m < 2) return;
      const f = ease((u - s.a) / s.d);
      const target = Math.max(1, Math.ceil(f * (m - 1)));
      if (f < 1 && s.a > tipStart && !s.ghost) {
        tipStart = s.a;
        tip = [s.pts[target * 2], s.pts[target * 2 + 1]];
      }
      const from = this.drawn[i];
      if (target <= from) return;
      // Pressure: tapered at both ends, heavier on strong edges.
      const press = 0.45 + 0.55 * Math.sin(Math.PI * clamp((from + target) / 2 / (m - 1)));
      g.globalAlpha = s.ghost ? 0.22 : 0.5 + 0.45 * s.strength;
      g.lineWidth = dpr * (s.ghost ? 0.8 : 0.75 + 0.75 * s.strength) * press;
      g.beginPath();
      g.moveTo(s.pts[from * 2] * dpr, s.pts[from * 2 + 1] * dpr);
      for (let k = from + 1; k <= target; k++) g.lineTo(s.pts[k * 2] * dpr, s.pts[k * 2 + 1] * dpr);
      g.stroke();
      this.drawn[i] = target;
    });
    g.globalAlpha = 1;
    return tip;
  }

  private washMasks(t: number) {
    const field = this.field as Float32Array;
    const a = this.maskImg.data,
      r = this.ringImg.data;
    const soft = 0.03,
      band = 0.035;
    const tt = t * (1 + soft + band);
    for (let i = 0, n = field.length; i < n; i++) {
      const d = tt - field[i];
      a[i * 4 + 3] = d <= 0 ? 0 : d >= soft ? 255 : (255 * d) / soft;
      r[i * 4 + 3] = d <= 0 || d >= band + soft ? 0 : 150 * (1 - Math.abs(d - soft) / (band + soft));
    }
    this.mask.putImageData(this.maskImg, 0, 0);
    this.ring.putImageData(this.ringImg, 0, 0);
  }

  /** The frame at virtual time v (s); `tip` draws the pencil's point on the newest line. */
  render(v: number, tip: boolean) {
    const { g, W, H } = this;
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    g.drawImage(this.paper, 0, 0);
    const pencil = this.drawStrokes(clamp((v - TIMELINE.lines[0]) / (TIMELINE.lines[1] - TIMELINE.lines[0])));
    const wash = this.colour ? clamp((v - TIMELINE.wash[0]) / (TIMELINE.wash[1] - TIMELINE.wash[0])) : 0;
    if (wash > 0 && this.colour && this.pool) {
      this.washMasks(ease(wash) * 0.15 + wash * 0.85);
      const t = this.tmp;
      for (const [layer, mask] of [
        [this.colour, this.mask],
        [this.pool, this.ring],
      ] as const) {
        t.globalCompositeOperation = 'source-over';
        t.clearRect(0, 0, W, H);
        t.drawImage(layer, 0, 0);
        t.globalCompositeOperation = 'destination-in';
        t.drawImage(mask.canvas, 0, 0, W, H);
        g.drawImage(t.canvas, 0, 0);
      }
    }
    g.globalAlpha = 1 - 0.45 * ease(wash);
    g.globalCompositeOperation = 'multiply';
    g.drawImage(this.lineCanvas, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    if (tip && pencil) {
      // The pencil's point, with a soft shadow.
      const [x, y] = pencil;
      const d = this.dpr;
      g.fillStyle = 'rgba(31, 42, 30, 0.18)';
      g.beginPath();
      g.ellipse((x + 3) * d, (y + 4) * d, 4.5 * d, 3 * d, 0.5, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = 'rgb(46, 48, 44)';
      g.beginPath();
      g.arc(x * d, y * d, 2.1 * d, 0, Math.PI * 2);
      g.fill();
    }
  }
}

/**
 * The clock: virtual time runs at 1× until the scene is ready, then fast-
 * forwards so the rest plays in at most CATCH_UP s, but never ends before
 * MIN s. If the scene is late, the last 15% eases towards the end without
 * reaching it, and completes once the scene is ready. Until the still has
 * arrived, the wash waits at its start (unless the scene is ready first).
 */
export const MIN = 0.6;
export const CATCH_UP = 0.35;
export class Clock {
  v = 0;
  real = 0;
  ready: number | null = null;
  private rate = 1;

  markReady() {
    if (this.ready != null) return;
    this.ready = this.real;
    const left = TIMELINE.L - this.v;
    const until = Math.max(MIN - this.real, Math.min(CATCH_UP, left));
    this.rate = until > 0 ? left / until : Infinity;
  }

  step(dt: number, hasStill: boolean) {
    this.real += dt;
    const L = TIMELINE.L;
    if (this.ready == null) {
      const hold = L * 0.85;
      if (this.v < hold) this.v = Math.min(this.v + dt, hold);
      else this.v += (L - 0.001 - this.v) * (1 - Math.exp(-dt / 1.2));
    } else this.v += dt * this.rate;
    if (!hasStill && this.ready == null) this.v = Math.min(this.v, TIMELINE.wash[0]);
    this.v = Math.min(this.v, L);
    return this.v;
  }

  get done() {
    return this.ready != null && this.v >= TIMELINE.L;
  }
}
