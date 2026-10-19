// Measures a swimming spine the same way whether it was tracked from footage
// (spine.mjs) or recorded from a model, so the two can be compared:
// how bent the body is, how far its middle swings, its tail beats and how
// much of the time it beats rather than glides, and how fast it turns.
//
//   node qa/tools/footage/spine-measure.mjs <spine.json> [--out measures.json]
//
// The input is { fps, frames: [{ f, ok, len, spine: [[x, y], …] }] } with
// the head first. Body length is the longest midline within half a second
// (a tracked tail is often cut short), and everything stops at 60 % of it.
// Frames whose head jumped to the other end are dropped; single-frame
// outliers are replaced by the median of their neighbours (Hampel filter).
//
// What survives a tilted camera: timing (beat rate, share beating). Bends,
// swings and turn rates are distorted by the view (docs/KOI_FOOTAGE_LOG.md).
import { readFileSync, writeFileSync } from 'node:fs';
import { parseArgs } from './lib.mjs';

const { positional, options } = parseArgs(process.argv.slice(2));
const [file] = positional;
if (!file) {
  console.error('Usage: node qa/tools/footage/spine-measure.mjs <spine.json> [--out measures.json]');
  process.exit(1);
}
const data = JSON.parse(readFileSync(file, 'utf8'));
const fps = data.fps;
const byFrame = new Map(data.frames.filter((r) => r.ok).map((r) => [r.f, r]));
const last = Math.max(...data.frames.map((r) => r.f));

const halfSecond = Math.round(fps * 0.5);
const bodyLength = (f) => {
  let longest = 0;
  for (let k = f - halfSecond; k <= f + halfSecond; k++)
    if (byFrame.has(k)) longest = Math.max(longest, byFrame.get(k).len);
  return longest;
};
/** The point `s` along a spine (arc length), by linear interpolation between its evenly spaced points. */
const at = (r, s) => {
  const p = r.spine;
  const x = Math.min(s / (r.len / (p.length - 1)), p.length - 1.0001);
  const i = Math.floor(x);
  const t = x - i;
  return [p[i][0] + (p[i + 1][0] - p[i][0]) * t, p[i][1] + (p[i + 1][1] - p[i][1]) * t];
};

const series = [];
for (let f = 0; f <= last; f++) {
  const r = byFrame.get(f);
  const L = r ? bodyLength(f) : 0;
  if (!r || r.len < 0.6 * L) {
    series.push(null);
    continue;
  }
  const head = at(r, 0);
  const neck = at(r, 0.15 * L);
  let fx = head[0] - neck[0];
  let fy = head[1] - neck[1];
  const fd = Math.hypot(fx, fy);
  fx /= fd;
  fy /= fd;
  const a = at(r, 0.4 * L);
  const b = at(r, 0.6 * L);
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const lateral = (u) => {
    const p = at(r, u * L);
    return (fx * (p[1] - head[1]) - fy * (p[0] - head[0])) / L;
  };
  series.push({
    f,
    t: f / fps,
    // The segment from 40 to 60 % of the body, its angle from straight back.
    bend: Math.atan2(-(fx * dy - fy * dx), -(fx * dx + fy * dy)),
    lat60: lateral(0.6),
    heading: Math.atan2(fy, fx),
  });
}

// Head and tail swapped since the last frame: drop the frame.
for (let f = 1; f <= last; f++) {
  const a = byFrame.get(f - 1);
  const b = byFrame.get(f);
  if (!a || !b || !series[f]) continue;
  const toHead = Math.hypot(a.spine[0][0] - b.spine[0][0], a.spine[0][1] - b.spine[0][1]);
  const toTail = Math.hypot(a.spine[0][0] - b.spine.at(-1)[0], a.spine[0][1] - b.spine.at(-1)[1]);
  if (toTail < toHead) series[f] = null;
}
// Hampel filter over 7 frames.
let replaced = 0;
for (const [key, floor] of [
  ['bend', 0.12],
  ['lat60', 0.02],
]) {
  const v = series.map((s) => (s ? s[key] : null));
  for (let i = 0; i < v.length; i++) {
    if (v[i] === null) continue;
    const near = [];
    for (let k = i - 3; k <= i + 3; k++) if (v[k] !== null && v[k] !== undefined) near.push(v[k]);
    if (near.length < 4) continue;
    near.sort((x, y) => x - y);
    const median = near[near.length >> 1];
    const mad = near.map((x) => Math.abs(x - median)).sort((x, y) => x - y)[near.length >> 1];
    if (Math.abs(v[i] - median) > Math.max(3 * 1.4826 * mad, floor)) {
      series[i][key] = median;
      if (key === 'bend') replaced++;
    }
  }
}

// Runs of at least 1.5 s of consecutive measured frames.
const runs = [];
let run = [];
for (const s of series) {
  if (s) run.push(s);
  else {
    if (run.length) runs.push(run);
    run = [];
  }
}
if (run.length) runs.push(run);
const usable = runs.filter((r) => r.length >= fps * 1.5);

const periods = [];
const swings = [];
const beating = new Set();
const turnRates = [];
const bends = [];
const lateralSwings = [];
let measured = 0;
for (const r of usable) {
  measured += r.length;
  // The bend with its slow part (a turn) taken out, lightly smoothed: what's left is beats.
  const half = Math.round(fps * 0.75);
  const fast = r.map((s, i) => {
    let sum = 0;
    let n = 0;
    for (let k = Math.max(0, i - half); k <= Math.min(r.length - 1, i + half); k++) {
      sum += r[k].bend;
      n++;
    }
    return s.bend - sum / n;
  });
  const smooth = fast.map((_, i) => (fast[Math.max(0, i - 1)] + fast[i] + fast[Math.min(fast.length - 1, i + 1)]) / 3);
  // Alternating peaks above 0.05 rad.
  const peaks = [];
  for (let i = 1; i < smooth.length - 1; i++) {
    const v = smooth[i];
    if (Math.abs(v) < 0.05) continue;
    const isPeak =
      (v > 0 && v > smooth[i - 1] && v >= smooth[i + 1]) || (v < 0 && v < smooth[i - 1] && v <= smooth[i + 1]);
    if (!isPeak) continue;
    if (peaks.length && Math.sign(smooth[peaks.at(-1)]) === Math.sign(v)) {
      if (Math.abs(v) > Math.abs(smooth[peaks.at(-1)])) peaks[peaks.length - 1] = i;
    } else peaks.push(i);
  }
  for (let k = 2; k < peaks.length; k++) {
    const period = (peaks[k] - peaks[k - 2]) / fps;
    if (period >= 2.5) continue;
    periods.push(period);
    swings.push(Math.abs(smooth[peaks[k]] - smooth[peaks[k - 1]]) / 2);
    for (let i = peaks[k - 2]; i <= peaks[k]; i++) beating.add(r[i].f);
  }
  for (let i = 0; i < r.length; i++) {
    bends.push(Math.abs(r[i].bend));
    if (i >= 2 && i < r.length - 2) {
      const d = r[i + 2].heading - r[i - 2].heading;
      turnRates.push(Math.abs(Math.atan2(Math.sin(d), Math.cos(d))) / (4 / fps));
    }
  }
  const second = Math.round(fps);
  for (let i = 0; i + second <= r.length; i += second) {
    const v = r.slice(i, i + second).map((s) => s.lat60);
    lateralSwings.push(Math.max(...v) - Math.min(...v));
  }
}
const quantile = (values, q) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))] : NaN;
};
const round = (v) => +v.toFixed(3);
const jitter = (() => {
  const r = [];
  for (let i = 1; i < series.length - 1; i++)
    if (series[i - 1] && series[i] && series[i + 1])
      r.push(series[i].bend - (series[i - 1].bend + series[i + 1].bend) / 2);
  return Math.sqrt(r.reduce((a, b) => a + b * b, 0) / Math.max(1, r.length));
})();
const summary = {
  seconds: round(measured / fps),
  outliersReplaced: replaced,
  bendNoise: round(jitter),
  beatHz: {
    median: round(1 / quantile(periods, 0.5)),
    p25: round(1 / quantile(periods, 0.75)),
    p75: round(1 / quantile(periods, 0.25)),
    beats: periods.length,
  },
  shareBeating: round(beating.size / Math.max(1, measured)),
  bendSwingPerBeat: round(quantile(swings, 0.5)),
  bend: { median: round(quantile(bends, 0.5)), p90: round(quantile(bends, 0.9)) },
  turnRate: { median: round(quantile(turnRates, 0.5)), p90: round(quantile(turnRates, 0.9)) },
  swingAt60PerSecond: { median: round(quantile(lateralSwings, 0.5)), p90: round(quantile(lateralSwings, 0.9)) },
};
if (options.out) writeFileSync(options.out, JSON.stringify({ summary, series }));
console.log(JSON.stringify(summary, null, 1));
