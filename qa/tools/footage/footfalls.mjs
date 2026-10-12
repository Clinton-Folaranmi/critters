// Finds planted feet in top-view footage of a walking animal.
//
//   node qa/tools/footage/footfalls.mjs <video> --track track.csv [--out footfalls.json]
//     [--floor 290]      ignore rows above this (a mirror view, the wall)
//     [--dark 90]        a pixel darker than this can be a foot
//     [--min-run 5]      ... and is planted if it stays dark this many frames in a row
//     [--busy 50]        pixels dark in more frames than this are background, not feet
//     [--margin 1.08]    scale of the body outline that is masked out
//     [--reach 170]      half-width (px) of the window around the track used to fit the body
//     [--min-pixels 15]  smaller footfalls are dropped as specks
// Also writes <out>-body.csv (frame,x,y,a,b,angle), the fitted body path, for sheet.mjs --follow.
//
// Method. The body stays dark for many frames too, so it is masked: each
// frame, the dark pixels near the tracked centre are fitted with the ellipse
// of the same second moments (the body dominates them), scaled by --margin.
// Outside it, a pixel that is dark for --min-run consecutive frames (after a
// one-pixel widening, so a thin tarsus that jitters by a pixel stays one run)
// is a planted foot. Runs that touch in space and overlap in time form one
// footfall: touch-down = its first frame, lift-off = its last. Insects often
// put a foot into the footprint the foot ahead just left, which joins two
// stances into one patch; a footfall is therefore split where its planted
// area drops below a third of its median for a frame, or its centre jumps
// by more than 4 px. Every footfall carries its per-frame area and centre so
// a split can be checked, and footfalls must still be checked by eye
// (sheet.mjs --boxes) and assigned to legs by a person or agent, in a stances
// file read by gait.mjs.
import { readFileSync, writeFileSync } from 'node:fs';
import { grayFrames, parseArgs, probe, writeJson } from './lib.mjs';

const { positional, options } = parseArgs(process.argv.slice(2));
const [video] = positional;
if (!video || !options.track) {
  console.error('Usage: node qa/tools/footage/footfalls.mjs <video> --track track.csv [options]');
  process.exit(1);
}
const info = probe(video);
const W = info.width;
const H = info.height;
const FLOOR = Number(options.floor ?? 0);
const DARK = Number(options.dark ?? 90);
const MIN_RUN = Number(options['min-run'] ?? 5);
const BUSY = Number(options.busy ?? 50);
const MARGIN = Number(options.margin ?? 1.08);
const REACH = Number(options.reach ?? 170);
const MIN_PIXELS = Number(options['min-pixels'] ?? 15);

const rows = readFileSync(options.track, 'utf8')
  .trim()
  .split('\n')
  .slice(1)
  .map((l) => l.split(',').map(Number));
/** The tracked centre, smoothed over ±4 frames (marker pixels flicker). */
const centre = rows.map((_, i) => {
  let sx = 0;
  let sy = 0;
  let k = 0;
  for (let j = Math.max(0, i - 4); j <= Math.min(rows.length - 1, i + 4); j++) {
    if (!Number.isFinite(rows[j][1])) continue;
    sx += rows[j][1];
    sy += rows[j][2];
    k++;
  }
  return [sx / k, sy / k];
});

// Dark masks, raw (for the body fit) and widened by one pixel (for runs).
const raw = [];
const wide = [];
for await (const frame of grayFrames(video, info)) {
  const bits = new Uint8Array(W * H);
  for (let i = FLOOR * W; i < W * H; i++) bits[i] = frame[i] < DARK ? 1 : 0;
  const grown = new Uint8Array(W * H);
  for (let y = Math.max(1, FLOOR); y < H - 1; y++)
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      grown[i] =
        bits[i] |
        bits[i - 1] |
        bits[i + 1] |
        bits[i - W] |
        bits[i + W] |
        bits[i - W - 1] |
        bits[i - W + 1] |
        bits[i + W - 1] |
        bits[i + W + 1];
    }
  raw.push(bits);
  wide.push(grown);
}
const N = raw.length;

// The body outline per frame: the ellipse with the second moments of the dark
// pixels in a window, fitted twice per frame, the second time with the window
// centred on the first fit; the first frame starts from the track, later ones
// from the previous frame's fit, so the window follows the body itself.
function fitBody(bits, cx, cy) {
  let sx = 0;
  let sy = 0;
  let k = 0;
  const points = [];
  for (let y = Math.max(FLOOR, Math.round(cy - 70)); y < Math.min(H, Math.round(cy + 70)); y++)
    for (let x = Math.max(0, Math.round(cx - REACH)); x < Math.min(W, Math.round(cx + REACH)); x++)
      if (bits[y * W + x]) {
        points.push(x, y);
        sx += x;
        sy += y;
        k++;
      }
  const mx = sx / k;
  const my = sy / k;
  let xx = 0;
  let yy = 0;
  let xy = 0;
  for (let i = 0; i < points.length; i += 2) {
    const dx = points[i] - mx;
    const dy = points[i + 1] - my;
    xx += dx * dx;
    yy += dy * dy;
    xy += dx * dy;
  }
  xx /= k;
  yy /= k;
  xy /= k;
  const half = (xx + yy) / 2;
  const root = Math.sqrt(Math.max(0, half * half - (xx * yy - xy * xy)));
  return {
    x: +mx.toFixed(1),
    y: +my.toFixed(1),
    a: +(2 * Math.sqrt(half + root) * MARGIN).toFixed(1),
    b: +(2 * Math.sqrt(Math.max(0, half - root)) * MARGIN).toFixed(1),
    angle: +(0.5 * Math.atan2(2 * xy, xx - yy)).toFixed(4),
  };
}
const body = [];
for (let n = 0; n < N; n++) {
  const [sx, sy] = n === 0 ? centre[0] : [body[n - 1].x, body[n - 1].y];
  const first = fitBody(raw[n], sx, sy);
  body.push(fitBody(raw[n], first.x, first.y));
}
const inBody = (n, x, y) => {
  const e = body[n];
  const c = Math.cos(e.angle);
  const s = Math.sin(e.angle);
  const dx = x - e.x;
  const dy = y - e.y;
  const u = dx * c + dy * s;
  const v = -dx * s + dy * c;
  return (u / e.a) ** 2 + (v / e.b) ** 2 <= 1;
};

// Per-pixel planted runs outside the body.
const runs = [];
for (let i = FLOOR * W; i < W * H; i++) {
  let busy = 0;
  for (let n = 0; n < N; n++) busy += wide[n][i];
  if (busy > BUSY || busy < MIN_RUN) continue;
  const x = i % W;
  const y = Math.floor(i / W);
  let start = -1;
  for (let n = 0; n <= N; n++) {
    const on = n < N && wide[n][i] && !inBody(n, x, y);
    if (on && start < 0) start = n;
    if (!on && start >= 0) {
      if (n - start >= MIN_RUN) runs.push({ i, a: start, b: n - 1 });
      start = -1;
    }
  }
}

// Join runs that touch in space and overlap in time.
const parent = runs.map((_, k) => k);
const find = (k) => (parent[k] === k ? k : (parent[k] = find(parent[k])));
const byPixel = new Map();
runs.forEach((r, k) => {
  if (!byPixel.has(r.i)) byPixel.set(r.i, []);
  byPixel.get(r.i).push(k);
});
runs.forEach((r, k) => {
  for (let oy = -1; oy <= 1; oy++)
    for (let ox = -1; ox <= 1; ox++) {
      const list = byPixel.get(r.i + oy * W + ox);
      if (list) for (const j of list) if (j !== k && runs[j].a <= r.b && runs[j].b >= r.a) parent[find(j)] = find(k);
    }
});
const groups = new Map();
runs.forEach((r, k) => {
  const g = find(k);
  if (!groups.has(g)) groups.set(g, []);
  groups.get(g).push(r);
});

/** Area and centre of a footfall on each frame it is planted. */
function profile(list) {
  const a = Math.min(...list.map((r) => r.a));
  const b = Math.max(...list.map((r) => r.b));
  const frames = [];
  for (let n = a; n <= b; n++) {
    let sx = 0;
    let sy = 0;
    let k = 0;
    for (const r of list)
      if (r.a <= n && n <= r.b) {
        sx += r.i % W;
        sy += Math.floor(r.i / W);
        k++;
      }
    frames.push({ n, area: k, x: k ? sx / k : NaN, y: k ? sy / k : NaN });
  }
  return frames;
}

/** Splits a profile where its area collapses or its centre jumps (one foot leaving, the next arriving). */
function split(frames) {
  const areas = frames
    .map((f) => f.area)
    .filter((v) => v > 0)
    .sort((p, q) => p - q);
  const median = areas[Math.floor(areas.length / 2)] ?? 0;
  const pieces = [[]];
  for (let k = 0; k < frames.length; k++) {
    const f = frames[k];
    const prev = frames[k - 1];
    const collapse = f.area < median / 3;
    const jump = prev && prev.area && f.area && Math.hypot(f.x - prev.x, f.y - prev.y) > 4;
    if (collapse || jump) {
      if (pieces.at(-1).length) pieces.push([]);
      if (collapse) continue;
    }
    pieces.at(-1).push(f);
  }
  return pieces.filter((p) => p.length >= MIN_RUN);
}

const footfalls = [];
for (const list of groups.values()) {
  for (const piece of split(profile(list))) {
    const pixels = piece.reduce((s, f) => s + f.area, 0) / piece.length;
    if (pixels < MIN_PIXELS) continue;
    const x = piece.reduce((s, f) => s + f.x * f.area, 0) / piece.reduce((s, f) => s + f.area, 0);
    const y = piece.reduce((s, f) => s + f.y * f.area, 0) / piece.reduce((s, f) => s + f.area, 0);
    const td = piece[0].n;
    const e = body[td];
    const c = Math.cos(e.angle);
    const s = Math.sin(e.angle);
    footfalls.push({
      td,
      lo: piece.at(-1).n,
      x: +x.toFixed(1),
      y: +y.toFixed(1),
      // Position at touch-down along the body's long axis and across it, from the body centre.
      along: +((x - e.x) * c + (y - e.y) * s).toFixed(1),
      across: +(-(x - e.x) * s + (y - e.y) * c).toFixed(1),
      pixels: Math.round(pixels),
      area: piece.map((f) => f.area),
    });
  }
}
footfalls.sort((p, q) => p.td - q.td || p.x - q.x);
footfalls.forEach((f, id) => Object.assign(f, { id }));
const out = options.out ?? 'footfalls.json';
writeFileSync(
  out.replace(/\.json$/, '') + '-body.csv',
  `frame,x,y,a,b,angle\n${body.map((e, n) => [n, e.x, e.y, e.a, e.b, e.angle].join(',')).join('\n')}\n`,
);
writeJson(out, {
  video,
  params: {
    floor: FLOOR,
    dark: DARK,
    minRun: MIN_RUN,
    busy: BUSY,
    margin: MARGIN,
    reach: REACH,
    minPixels: MIN_PIXELS,
  },
  body,
  footfalls: footfalls.map(({ id, ...rest }) => ({ id, ...rest })),
});
console.log(' id  TD  LO  len      x      y  along across pixels');
for (const f of footfalls)
  console.log(
    [f.id, f.td, f.lo, f.lo - f.td + 1, f.x, f.y, f.along, f.across, f.pixels]
      .map((v) => String(v).padStart(6))
      .join(''),
  );
console.log(`${out}: ${footfalls.length} footfalls`);
