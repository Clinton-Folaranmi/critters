// Measures a grass snake's spine the same way whether it was tracked from
// footage (snake-spine.mjs) or recorded from a model (record-snake.mjs), so
// the two can be compared side by side (spec P-18, L-26):
// - forward speed in body widths/s (BW/s) and body lengths/s (BL/s, 1 BL = 34 BW),
//   overall and while advancing
// - share of time advancing vs paused/probing
// - anterior body bend at 4 BW and 7.5 BW behind the snout (radians)
// - head turn rate (rad/s)
// - sideways slip of trunk points perpendicular to the spine tangent (BW/s and
//   BL/frame at 60 fps, testing spec L-26).
//
//   node qa/tools/footage/snake-measure.mjs <snake.json> [--from 0] [--to 9999] [--out measures.json]
import { readFileSync } from 'node:fs';
import { parseArgs, writeJson } from './lib.mjs';

const { positional, options } = parseArgs(process.argv.slice(2));
const [file] = positional;
if (!file) {
  console.error('Usage: node qa/tools/footage/snake-measure.mjs <snake.json> [--from 0] [--to 9999]');
  process.exit(1);
}
const data = JSON.parse(readFileSync(file, 'utf8'));
const fps = data.fps;
const from = Number(options.from ?? 0);
const to = Number(options.to ?? Infinity);
const BL_IN_BW = 34; // Natrix natrix length-to-midbody-width ratio (~34 BW per BL)
const MOVING_THRESHOLD_BW = 0.85; // BW/s above which the snake is advancing rather than paused

const rawFrames = data.frames.filter((r) => r.f >= from && r.f <= to);
const byFrame = new Map(rawFrames.filter((r) => r.ok && r.spine?.length >= 16).map((r) => [r.f, r]));

const angleDiff = (a, b) => Math.atan2(Math.sin(a - b), Math.cos(a - b));
const quantile = (values, q) => {
  const s = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  return s.length ? s[Math.min(s.length - 1, Math.floor(q * s.length))] : NaN;
};
const round = (v, d = 3) => (Number.isFinite(v) ? +v.toFixed(d) : null);

// Smooth median body width over a 1-second window so single-frame mask breath doesn't jitter speed.
const halfSec = Math.round(fps * 0.5);
function smoothBW(f) {
  const vals = [];
  for (let k = f - halfSec; k <= f + halfSec; k++) {
    const r = byFrame.get(k);
    if (r) vals.push(r.bw);
  }
  vals.sort((a, b) => a - b);
  return vals[vals.length >> 1] || 20;
}

/** Ground-frame position of spine point `j` at frame `f`. */
function groundPoint(r, j) {
  const [x, y] = r.spine[j];
  const [cx, cy] = r.cam ?? [0, 0];
  return [x + cx, y + cy];
}

/** Tangent direction (unit vector pointing toward the head) at spine index `j`. */
function tangentAt(r, j) {
  const a = r.spine[Math.max(0, j - 2)];
  const b = r.spine[Math.min(r.spine.length - 1, j + 2)];
  const tx = a[0] - b[0];
  const ty = a[1] - b[1];
  const d = Math.hypot(tx, ty) || 1;
  return [tx / d, ty / d];
}

const span = Math.max(2, Math.round(fps * 0.13)); // ~4 frames at 30 fps
const series = [];

for (const r of rawFrames) {
  if (!byFrame.has(r.f)) continue;
  const f = r.f;
  const bw = smoothBW(f);
  const [hx, hy] = tangentAt(r, 2);
  const [m1x, m1y] = tangentAt(r, 8); // 4 BW behind snout
  const [m2x, m2y] = tangentAt(r, Math.min(r.spine.length - 3, 15)); // 7.5 BW behind snout
  const bend4 = Math.abs(Math.atan2(hx * m1y - hy * m1x, hx * m1x + hy * m1y));
  const bend75 = Math.abs(Math.atan2(hx * m2y - hy * m2x, hx * m2x + hy * m2y));

  const prev = byFrame.get(f - span);
  const next = byFrame.get(f + span);
  let speedBW = null;
  let turnRate = null;
  let slipBW = null;

  if (prev && next) {
    const dt = (2 * span) / fps;
    // Neck point (j = 2, at the collar) in ground coordinates.
    const p0 = groundPoint(prev, 2);
    const p1 = groundPoint(next, 2);
    const vx = (p1[0] - p0[0]) / dt;
    const vy = (p1[1] - p0[1]) / dt;
    const forward = (vx * hx + vy * hy) / bw;
    speedBW = Math.max(0, forward);

    turnRate = Math.abs(angleDiff(next.heading, prev.heading)) / dt;

    // Lateral slip along the trunk (j = 6, 9, 12 -> 3, 4.5, 6 BW back).
    const slips = [];
    for (const j of [6, 9, 12]) {
      if (j >= r.spine.length - 2 || j >= prev.spine.length || j >= next.spine.length) continue;
      const q0 = groundPoint(prev, j);
      const q1 = groundPoint(next, j);
      const tvx = (q1[0] - q0[0]) / dt;
      const tvy = (q1[1] - q0[1]) / dt;
      const [tx, ty] = tangentAt(r, j);
      const perp = Math.abs(-ty * tvx + tx * tvy) / bw;
      slips.push(perp);
    }
    if (slips.length) {
      slips.sort((a, b) => a - b);
      slipBW = slips[slips.length >> 1];
    }
  }

  series.push({ f, t: f / fps, bw, bend4, bend75, speedBW, turnRate, slipBW });
}

// Smooth speed over 5 samples to separate advancing bouts from pauses.
for (let i = 0; i < series.length; i++) {
  const near = [];
  for (let k = Math.max(0, i - 2); k <= Math.min(series.length - 1, i + 2); k++) {
    if (series[k].speedBW !== null) near.push(series[k].speedBW);
  }
  near.sort((a, b) => a - b);
  series[i].smoothSpeedBW = near.length ? near[near.length >> 1] : null;
}

const withSpeed = series.filter((s) => s.smoothSpeedBW !== null);
const moving = withSpeed.filter((s) => s.smoothSpeedBW >= MOVING_THRESHOLD_BW);

// Measure widths against headings to check camera tilt (spec P-17).
const byQuadrant = { horiz: [], vert: [] };
for (const r of rawFrames) {
  if (!r.ok) continue;
  const c = Math.abs(Math.cos(r.heading));
  if (c > 0.7) byQuadrant.horiz.push(r.bw);
  else if (c < 0.7) byQuadrant.vert.push(r.bw);
}

const summary = {
  framesTracked: series.length,
  secondsTracked: round(series.length / fps, 2),
  bodyWidthPx: {
    median: round(
      quantile(
        series.map((s) => s.bw),
        0.5,
      ),
      1,
    ),
    horizMedian: round(quantile(byQuadrant.horiz, 0.5), 1),
    vertMedian: round(quantile(byQuadrant.vert, 0.5), 1),
  },
  shareMoving: round(moving.length / Math.max(1, withSpeed.length), 3),
  speedMovingBW: {
    median: round(
      quantile(
        moving.map((s) => s.smoothSpeedBW),
        0.5,
      ),
      2,
    ),
    p90: round(
      quantile(
        moving.map((s) => s.smoothSpeedBW),
        0.9,
      ),
      2,
    ),
  },
  speedMovingBL: {
    median: round(
      quantile(
        moving.map((s) => s.smoothSpeedBW / BL_IN_BW),
        0.5,
      ),
      3,
    ),
    p90: round(
      quantile(
        moving.map((s) => s.smoothSpeedBW / BL_IN_BW),
        0.9,
      ),
      3,
    ),
  },
  speedAllBL: {
    median: round(
      quantile(
        withSpeed.map((s) => s.smoothSpeedBW / BL_IN_BW),
        0.5,
      ),
      3,
    ),
    p90: round(
      quantile(
        withSpeed.map((s) => s.smoothSpeedBW / BL_IN_BW),
        0.9,
      ),
      3,
    ),
  },
  bendAt4BW: {
    median: round(
      quantile(
        series.map((s) => s.bend4),
        0.5,
      ),
      3,
    ),
    p90: round(
      quantile(
        series.map((s) => s.bend4),
        0.9,
      ),
      3,
    ),
  },
  bendAt75BW: {
    median: round(
      quantile(
        series.map((s) => s.bend75),
        0.5,
      ),
      3,
    ),
    p90: round(
      quantile(
        series.map((s) => s.bend75),
        0.9,
      ),
      3,
    ),
  },
  turnRateMoving: {
    median: round(
      quantile(
        moving.map((s) => s.turnRate),
        0.5,
      ),
      3,
    ),
    p90: round(
      quantile(
        moving.map((s) => s.turnRate),
        0.9,
      ),
      3,
    ),
  },
  lateralSlipMoving: {
    medianBWPerSec: round(
      quantile(
        moving.map((s) => s.slipBW),
        0.5,
      ),
      2,
    ),
    BLPerFrame60: round(
      quantile(
        moving.map((s) => s.slipBW / BL_IN_BW / 60),
        0.5,
      ),
      4,
    ),
  },
};

if (options.out) writeJson(options.out, { summary, series });
console.log(JSON.stringify(summary, null, 2));
