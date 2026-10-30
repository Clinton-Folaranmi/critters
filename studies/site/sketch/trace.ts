// Traces a still into the sketch's pencil strokes. Run at build time in the
// headless browser by scripts/trace-sketches.mjs (it needs a canvas to decode
// the image); the result is committed as studies/site/sketches/*.json.
//
// The still, drawn as the picture shows it, is blurred, run through a colour
// Sobel, thinned by non-maximum suppression and kept by hysteresis. If that
// gives too little line (a soft meadow), the thresholds drop until it doesn't.
// The edges are traced into 8-connected chains and simplified. Then the
// doubles go: both sides of a thin dark band (a brick's shadow, a bramble
// stem) give two parallel lines a few px apart, and a pencil would draw one,
// so a stroke's points within DEDUPE px of a stronger stroke are dropped and
// it's split there (only beside a line running the same way, so crossing
// and neighbouring shapes keep theirs). Strokes are kept in drawing order (long, strong first).
import type { SketchFile } from './render';

const clamp = (v: number, a = 0, b = 1) => Math.max(a, Math.min(b, v));

function boxBlur(src: Float32Array, w: number, h: number, r: number) {
  const tmp = new Float32Array(src.length);
  const out = new Float32Array(src.length);
  const span = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    const row = y * w;
    let acc = 0;
    for (let x = -r; x <= r; x++) acc += src[row + clamp(x, 0, w - 1)];
    for (let x = 0; x < w; x++) {
      tmp[row + x] = acc / span;
      acc += src[row + Math.min(w - 1, x + r + 1)] - src[row + Math.max(0, x - r)];
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += tmp[clamp(y, 0, h - 1) * w + x];
    for (let y = 0; y < h; y++) {
      out[y * w + x] = acc / span;
      acc += tmp[Math.min(h - 1, y + r + 1) * w + x] - tmp[Math.max(0, y - r) * w + x];
    }
  }
  return out;
}

function rdp(pts: number[], eps: number) {
  const n = pts.length / 2;
  if (n < 3) return pts;
  const keep = new Uint8Array(n);
  keep[0] = keep[n - 1] = 1;
  const stack: [number, number][] = [[0, n - 1]];
  while (stack.length) {
    const [a, b] = stack.pop() as [number, number];
    const ax = pts[a * 2],
      ay = pts[a * 2 + 1],
      bx = pts[b * 2],
      by = pts[b * 2 + 1];
    const L = Math.hypot(bx - ax, by - ay) || 1;
    let worst = -1,
      wd = 0;
    for (let i = a + 1; i < b; i++) {
      const d = Math.abs((bx - ax) * (ay - pts[i * 2 + 1]) - (ax - pts[i * 2]) * (by - ay)) / L;
      if (d > wd) {
        wd = d;
        worst = i;
      }
    }
    if (wd > eps) {
      keep[worst] = 1;
      stack.push([a, worst], [worst, b]);
    }
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) if (keep[i]) out.push(pts[i * 2], pts[i * 2 + 1]);
  return out;
}

const NB = [
  [1, 0],
  [1, 1],
  [0, 1],
  [-1, 1],
  [-1, 0],
  [-1, -1],
  [0, -1],
  [1, -1],
];

export interface TraceOptions {
  /** Strokes kept at most. */
  maxStrokes?: number;
  /** The least total line, as a multiple of the picture's w + h. */
  minInk?: number;
  /** Parallel strokes closer than this (px) are drawn once. */
  dedupe?: number;
}

/** Strokes for an RGBA image of w × h (the picture's size). */
export function trace(rgba: Uint8ClampedArray, w: number, h: number, fit: SketchFile['fit'], opts: TraceOptions = {}) {
  const { maxStrokes = 520, minInk = 5, dedupe = 8 } = opts;
  const n = w * h;
  const r = Math.max(1, Math.round(Math.min(w, h) / 260));
  const chans = [0, 1, 2].map((c) => {
    const a = new Float32Array(n);
    for (let i = 0; i < n; i++) a[i] = rgba[i * 4 + c] / 255;
    return boxBlur(boxBlur(a, w, h, r), w, h, r);
  });
  const mag = new Float32Array(n);
  const dir = new Uint8Array(n);
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      let best = 0,
        bx = 0,
        by = 0;
      for (const p of chans) {
        const gx = p[i - w + 1] + 2 * p[i + 1] + p[i + w + 1] - p[i - w - 1] - 2 * p[i - 1] - p[i + w - 1];
        const gy = p[i + w - 1] + 2 * p[i + w] + p[i + w + 1] - p[i - w - 1] - 2 * p[i - w] - p[i - w + 1];
        const m = gx * gx + gy * gy;
        if (m > best) {
          best = m;
          bx = gx;
          by = gy;
        }
      }
      mag[i] = Math.sqrt(best);
      const a = ((Math.atan2(by, bx) * 180) / Math.PI + 180) % 180;
      dir[i] = a < 22.5 || a >= 157.5 ? 0 : a < 67.5 ? 1 : a < 112.5 ? 2 : 3;
    }
  const offs = [
    [1, 0],
    [1, 1],
    [0, 1],
    [-1, 1],
  ];
  const thin = new Float32Array(n);
  const kept: number[] = [];
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const m = mag[i];
      if (m < 0.02) continue;
      const [dx, dy] = offs[dir[i]];
      if (m >= mag[i + dy * w + dx] && m > mag[i - dy * w - dx]) {
        thin[i] = m;
        kept.push(m);
      }
    }
  kept.sort((a, b) => a - b);
  const pct = (q: number) => kept[Math.floor(q * (kept.length - 1))] ?? 1;

  let high = Math.max(0.16, pct(0.8));
  let strokes: { pts: number[]; len: number; strength: number }[] = [];
  for (let attempt = 0; attempt < 3; attempt++) {
    strokes = chainsAt(thin, mag, w, h, high, dedupe);
    const ink = strokes.reduce((s, k) => s + k.len, 0);
    if (ink >= minInk * (w + h)) break;
    high *= 0.72;
  }
  strokes.sort((a, b) => b.len * (0.5 + b.strength) - a.len * (0.5 + a.strength));
  strokes = strokes.slice(0, maxStrokes);
  const file: SketchFile = {
    w,
    h,
    fit,
    strokes: strokes.map((s) => {
      const out = [Math.round(s.strength * 100), Math.round(s.pts[0]), Math.round(s.pts[1])];
      let px = out[1],
        py = out[2];
      for (let i = 2; i < s.pts.length; i += 2) {
        const x = Math.round(s.pts[i]),
          y = Math.round(s.pts[i + 1]);
        if (x === px && y === py) continue;
        out.push(x - px, y - py);
        px = x;
        py = y;
      }
      return out;
    }),
  };
  return file;
}

function chainsAt(thin: Float32Array, mag: Float32Array, w: number, h: number, high: number, dedupe: number) {
  const n = w * h;
  const low = high * 0.5;
  const edge = new Uint8Array(n);
  const stack: number[] = [];
  for (let i = 0; i < n; i++)
    if (thin[i] >= high) {
      edge[i] = 1;
      stack.push(i);
    }
  while (stack.length) {
    const i = stack.pop() as number;
    const x = i % w,
      y = (i / w) | 0;
    for (const [dx, dy] of NB) {
      const xx = x + dx,
        yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
      const j = yy * w + xx;
      if (!edge[j] && thin[j] >= low) {
        edge[j] = 1;
        stack.push(j);
      }
    }
  }
  const seen = new Uint8Array(n);
  const degree = (i: number) => {
    const x = i % w,
      y = (i / w) | 0;
    let d = 0;
    for (const [dx, dy] of NB) {
      const xx = x + dx,
        yy = y + dy;
      if (xx >= 0 && yy >= 0 && xx < w && yy < h && edge[yy * w + xx]) d++;
    }
    return d;
  };
  const walk = (start: number) => {
    const pts = [start % w, (start / w) | 0];
    seen[start] = 1;
    let cur = start,
      last = -1;
    for (;;) {
      const x = cur % w,
        y = (cur / w) | 0;
      let pick = -1,
        pickD = -1,
        score = 99;
      for (let d = 0; d < 8; d++) {
        const xx = x + NB[d][0],
          yy = y + NB[d][1];
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const j = yy * w + xx;
        if (!edge[j] || seen[j]) continue;
        const turn = last < 0 ? 0 : Math.min((d - last + 8) % 8, (last - d + 8) % 8);
        if (turn < score) {
          score = turn;
          pick = j;
          pickD = d;
        }
      }
      if (pick < 0 || score > 2) break;
      seen[pick] = 1;
      pts.push(pick % w, (pick / w) | 0);
      cur = pick;
      last = pickD;
    }
    return pts;
  };
  const chains: number[][] = [];
  for (let i = 0; i < n; i++) if (edge[i] && !seen[i] && degree(i) === 1) chains.push(walk(i));
  for (let i = 0; i < n; i++) if (edge[i] && !seen[i]) chains.push(walk(i));

  // Strongest first, then drop what lies along a stroke already kept.
  const scored = chains
    .filter((c) => c.length >= 2 * 9)
    .map((c) => {
      let s = 0;
      for (let k = 0; k < c.length; k += 2) s += mag[c[k + 1] * w + c[k]];
      return { raw: c, strength: clamp(s / (c.length / 2) / (high * 2.2), 0.25, 1) };
    })
    .sort((a, b) => b.raw.length * (0.5 + b.strength) - a.raw.length * (0.5 + a.strength));
  // What's been drawn, by the direction it runs (0–180° in 12 steps, +1): a
  // point is a double only beside a line running the same way (±30°).
  const taken = new Uint8Array(n);
  const angleAt = (c: number[], k: number) => {
    const a = Math.max(0, k - 6),
      b = Math.min(c.length - 2, k + 6);
    const ang = Math.atan2(c[b + 1] - c[a + 1], c[b] - c[a]);
    return Math.floor((((ang % Math.PI) + Math.PI) % Math.PI) / (Math.PI / 12)) % 12;
  };
  const near = (q: number, p: number) => {
    if (!q) return false;
    const d = Math.abs(q - 1 - p);
    return Math.min(d, 12 - d) <= 2;
  };
  const stamp = (x: number, y: number, ang: number) => {
    for (let dy = -dedupe; dy <= dedupe; dy++)
      for (let dx = -dedupe; dx <= dedupe; dx++) {
        if (dx * dx + dy * dy > dedupe * dedupe) continue;
        const xx = x + dx,
          yy = y + dy;
        if (xx >= 0 && yy >= 0 && xx < w && yy < h && !taken[yy * w + xx]) taken[yy * w + xx] = ang + 1;
      }
  };
  const out: { pts: number[]; len: number; strength: number }[] = [];
  for (const { raw, strength } of scored) {
    const runs: number[][] = [];
    let run: number[] = [];
    for (let k = 0; k < raw.length; k += 2) {
      if (near(taken[raw[k + 1] * w + raw[k]], angleAt(raw, k))) {
        if (run.length) runs.push(run);
        run = [];
      } else run.push(raw[k], raw[k + 1]);
    }
    if (run.length) runs.push(run);
    for (const r of runs) {
      if (r.length < 2 * 10) continue;
      for (let k = 0; k < r.length; k += 2) stamp(r[k], r[k + 1], angleAt(r, k));
      const pts = rdp(r, 1.1);
      let len = 0;
      for (let k = 2; k < pts.length; k += 2) len += Math.hypot(pts[k] - pts[k - 2], pts[k + 1] - pts[k - 1]);
      // Short weak bits are the paper grain, not shapes.
      if (len >= 12 && (len >= 24 || strength >= 0.5) && (len >= 40 || strength >= 0.35))
        out.push({ pts, len, strength });
    }
  }
  return out;
}
