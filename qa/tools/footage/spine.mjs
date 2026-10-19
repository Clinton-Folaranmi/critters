// Tracks a pale fish's spine in footage seen from above (a white koi on dark
// water). Per frame: pixels well above the water's median brightness and
// nearly grey are the body; the blob that continues the last frame's fish is
// kept (or the largest elongated one, to start or recover); its holes are
// filled, it is thinned to a skeleton, the longest path is taken, a hook into
// a fin is trimmed, the translucent tail is followed out from the body's end
// in dimmer pixels, the wider end is the head, and the midline is resampled
// to N points. Frames where the midline isn't fish-shaped are marked not ok.
//
//   node qa/tools/footage/spine.mjs <video> --out spine.json [--scale 640] [--points 17]
//
// Coordinates are pixels at the tracking scale. Check the result with
// spine-overlay.mjs before measuring: reflections, fins and a tail that fades
// into the water all fool it now and then. A tilted camera, and the fish's
// own roll and pitch, distort the shape it sees (docs/KOI_FOOTAGE_LOG.md).
import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { parseArgs, probe } from './lib.mjs';

const { positional, options } = parseArgs(process.argv.slice(2));
const [video] = positional;
if (!video || !options.out) {
  console.error('Usage: node qa/tools/footage/spine.mjs <video> --out spine.json [--scale 640] [--points 17]');
  process.exit(1);
}
const info = probe(video);
const W = Number(options.scale ?? 640);
const H = Math.round((W * info.height) / info.width);
const N = Number(options.points ?? 17);

const body = new Uint8Array(W * H);
const pale = new Uint8Array(W * H);
const label = new Int32Array(W * H);
const stack = new Int32Array(W * H);

/** Connected blobs of `body` (4-connected), with area, centre, elongation and box. */
function blobs() {
  label.fill(0);
  const found = [];
  let next = 1;
  for (let i = 0; i < W * H; i++) {
    if (!body[i] || label[i]) continue;
    let sp = 0;
    stack[sp++] = i;
    label[i] = next;
    let area = 0;
    let sx = 0;
    let sy = 0;
    let sxx = 0;
    let syy = 0;
    let sxy = 0;
    let x0 = W;
    let x1 = 0;
    let y0 = H;
    let y1 = 0;
    while (sp) {
      const p = stack[--sp];
      const x = p % W;
      const y = (p / W) | 0;
      area++;
      sx += x;
      sy += y;
      sxx += x * x;
      syy += y * y;
      sxy += x * y;
      x0 = Math.min(x0, x);
      x1 = Math.max(x1, x);
      y0 = Math.min(y0, y);
      y1 = Math.max(y1, y);
      for (const q of [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, p - W, p + W]) {
        if (q < 0 || q >= W * H || !body[q] || label[q]) continue;
        label[q] = next;
        stack[sp++] = q;
      }
    }
    const cx = sx / area;
    const cy = sy / area;
    const vxx = sxx / area - cx * cx;
    const vyy = syy / area - cy * cy;
    const vxy = sxy / area - cx * cy;
    const half = (vxx + vyy) / 2;
    const root = Math.sqrt(Math.max(0, half * half - (vxx * vyy - vxy * vxy)));
    found.push({
      id: next,
      area,
      cx,
      cy,
      elong: Math.sqrt((half + root) / Math.max(half - root, 1e-6)),
      box: [x0, y0, x1, y1],
    });
    next++;
  }
  return found;
}

/** Zhang-Suen thinning, in place. */
function thin(img, w, h) {
  const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : img[y * w + x]);
  const remove = [];
  for (let changed = true; changed;) {
    changed = false;
    for (const pass of [0, 1]) {
      remove.length = 0;
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          if (!img[y * w + x]) continue;
          const p = [
            at(x, y - 1),
            at(x + 1, y - 1),
            at(x + 1, y),
            at(x + 1, y + 1),
            at(x, y + 1),
            at(x - 1, y + 1),
            at(x - 1, y),
            at(x - 1, y - 1),
          ];
          const b = p.reduce((s, v) => s + v, 0);
          if (b < 2 || b > 6) continue;
          let a = 0;
          for (let k = 0; k < 8; k++) if (!p[k] && p[(k + 1) % 8]) a++;
          if (a !== 1) continue;
          if (pass === 0 ? p[0] * p[2] * p[4] || p[2] * p[4] * p[6] : p[0] * p[2] * p[6] || p[0] * p[4] * p[6])
            continue;
          remove.push(y * w + x);
        }
      for (const i of remove) img[i] = 0;
      if (remove.length) changed = true;
    }
  }
}

/** Breadth-first over the skeleton from `start`: the farthest pixel and the path back. */
function farthest(skeleton, w, h, start) {
  const seen = new Int32Array(w * h).fill(-1);
  const previous = new Int32Array(w * h).fill(-1);
  const queue = [start];
  seen[start] = 0;
  let last = start;
  for (let qi = 0; qi < queue.length; qi++) {
    const p = queue[qi];
    last = p;
    const x = p % w;
    const y = (p / w) | 0;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx;
        const ny = y + dy;
        if ((!dx && !dy) || nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const q = ny * w + nx;
        if (!skeleton[q] || seen[q] >= 0) continue;
        seen[q] = seen[p] + 1;
        previous[q] = p;
        queue.push(q);
      }
  }
  return { last, previous };
}

const arcLengths = (points) => {
  const s = [0];
  for (let i = 1; i < points.length; i++)
    s.push(s[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
  return s;
};

/** The midline of one frame, or a reason it has none. */
function track(rgb, state) {
  // The body: well above the water's median brightness, and nearly grey.
  const hist = new Uint32Array(256);
  for (let i = 0; i < W * H; i++) hist[Math.min(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2])]++;
  let median = 0;
  for (let v = 0, sum = 0; v < 256; v++) {
    sum += hist[v];
    if (sum >= (W * H) / 2) {
      median = v;
      break;
    }
  }
  const threshold = Math.min(200, median + 60);
  for (let i = 0; i < W * H; i++) {
    const lo = Math.min(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]);
    const spread = Math.max(rgb[i * 3], rgb[i * 3 + 1], rgb[i * 3 + 2]) - lo;
    body[i] = lo >= threshold && spread < 70 ? 1 : 0;
    // The tail is translucent: dimmer, still pale pixels, followed out from the body's end.
    pale[i] = lo >= threshold - 38 && spread < 75 ? 1 : 0;
  }
  const found = blobs().filter((b) => b.area > 250);
  let chosen = null;
  if (state.blob) {
    let best = Infinity;
    for (const b of found) {
      const d = Math.hypot(b.cx - state.blob.cx, b.cy - state.blob.cy);
      const ratio = b.area / state.blob.area;
      if (d < 60 && ratio > 0.5 && ratio < 2 && d < best) {
        best = d;
        chosen = b;
      }
    }
  }
  if (!chosen) {
    chosen = found.filter((b) => b.elong > 2.2 && b.area > 800).sort((a, b) => b.area - a.area)[0] ?? null;
    state.head = null;
  }
  state.blob = chosen;
  if (!chosen) return { why: 'no fish' };

  // The blob alone, holes filled (patterns, a leaf on its back).
  const [x0, y0, x1, y1] = chosen.box;
  const w = x1 - x0 + 3;
  const h = y1 - y0 + 3;
  const img = new Uint8Array(w * h);
  for (let y = y0; y <= y1; y++)
    for (let x = x0; x <= x1; x++) if (label[y * W + x] === chosen.id) img[(y - y0 + 1) * w + (x - x0 + 1)] = 1;
  const outside = new Uint8Array(w * h);
  const queue = [0];
  outside[0] = 1;
  for (let qi = 0; qi < queue.length; qi++) {
    const p = queue[qi];
    const x = p % w;
    const y = (p / w) | 0;
    for (const [nx, ny] of [
      [x - 1, y],
      [x + 1, y],
      [x, y - 1],
      [x, y + 1],
    ]) {
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      const n = ny * w + nx;
      if (outside[n] || img[n]) continue;
      outside[n] = 1;
      queue.push(n);
    }
  }
  for (let i = 0; i < w * h; i++) if (!outside[i]) img[i] = 1;
  // Distance to the background (chamfer), for widths along the midline.
  const dist = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) dist[i] = img[i] ? 1e9 : 0;
  for (let y = 1; y < h - 1; y++)
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      dist[i] = Math.min(dist[i], dist[i - 1] + 1, dist[i - w] + 1, dist[i - w - 1] + 1.414, dist[i - w + 1] + 1.414);
    }
  for (let y = h - 2; y > 0; y--)
    for (let x = w - 2; x > 0; x--) {
      const i = y * w + x;
      dist[i] = Math.min(dist[i], dist[i + 1] + 1, dist[i + w] + 1, dist[i + w + 1] + 1.414, dist[i + w - 1] + 1.414);
    }

  thin(img, w, h);
  const start = img.findIndex((v) => v);
  if (start < 0) return { why: 'no skeleton' };
  const a = farthest(img, w, h, start).last;
  const { last: b, previous } = farthest(img, w, h, a);
  const path = [];
  for (let p = b; p >= 0; p = previous[p]) path.push([p % w, (p / w) | 0]);
  if (path.length < 20) return { why: 'too short' };
  // Trim a hook at either end (a branch into a fin): cut back while the end turns sharply.
  const turnAt = (i, d) => {
    const [ax, ay] = path[i];
    const [bx, by] = path[i + d];
    const [cx, cy] = path[i + 2 * d];
    const t = Math.atan2(cy - by, cx - bx) - Math.atan2(by - ay, bx - ax);
    return Math.abs(Math.atan2(Math.sin(t), Math.cos(t)));
  };
  const step = Math.max(3, Math.round(path.length / 25));
  while (path.length > 40 && turnAt(0, step) > 0.7) path.splice(0, step);
  while (path.length > 40 && turnAt(path.length - 1, -step) > 0.7) path.splice(path.length - step, step);
  const length = arcLengths(path).at(-1);
  const chord = Math.hypot(path[0][0] - path.at(-1)[0], path[0][1] - path.at(-1)[1]);
  // A fish's midline is nearly straight end to end; a reflection's isn't.
  if (length / Math.max(chord, 1) > 1.45 || length > W * 0.75) {
    state.blob = null;
    return { why: 'not fish-shaped' };
  }

  // The head is the wider end; keep it where it was when the widths are close.
  const widthAt = (share) => {
    const [x, y] = path[Math.round(share * (path.length - 1))];
    return dist[y * w + x];
  };
  const endA = widthAt(0.2) + widthAt(0.3);
  const endB = widthAt(0.8) + widthAt(0.7);
  const toFrame = ([x, y]) => [x - 1 + x0, y - 1 + y0];
  let midline = (endA >= endB ? path : path.slice().reverse()).map(toFrame);
  if (state.head && Math.abs(endA - endB) < 0.15 * (endA + endB)) {
    const toHead = Math.hypot(midline[0][0] - state.head[0], midline[0][1] - state.head[1]);
    const toTail = Math.hypot(midline.at(-1)[0] - state.head[0], midline.at(-1)[1] - state.head[1]);
    if (toTail < toHead) midline = midline.reverse();
  }

  // Follow the translucent tail out from the body's end, re-centring on each cross-section.
  const m = Math.max(3, Math.round(midline.length * 0.12));
  let [px, py] = midline.at(-1);
  let dx = px - midline.at(-1 - m)[0];
  let dy = py - midline.at(-1 - m)[1];
  let d = Math.hypot(dx, dy) || 1;
  dx /= d;
  dy /= d;
  for (let went = 0; went < length * 0.4;) {
    const nx = px + dx * 1.5;
    const ny = py + dy * 1.5;
    let sx = 0;
    let sy = 0;
    let c = 0;
    for (let o = -10; o <= 10; o++) {
      const qx = Math.round(nx - dy * o);
      const qy = Math.round(ny + dx * o);
      if (qx < 0 || qy < 0 || qx >= W || qy >= H || !pale[qy * W + qx]) continue;
      sx += qx;
      sy += qy;
      c++;
    }
    if (c < 2) break;
    let ndx = sx / c - px;
    let ndy = sy / c - py;
    const nd = Math.hypot(ndx, ndy) || 1;
    ndx /= nd;
    ndy /= nd;
    // Don't turn sharply onto something else.
    if (ndx * dx + ndy * dy < 0.8) break;
    dx = 0.7 * dx + 0.3 * ndx;
    dy = 0.7 * dy + 0.3 * ndy;
    d = Math.hypot(dx, dy);
    dx /= d;
    dy /= d;
    went += Math.hypot(sx / c - px, sy / c - py);
    px = sx / c;
    py = sy / c;
    midline.push([px, py]);
  }

  const s = arcLengths(midline);
  const total = s.at(-1);
  const spine = [];
  for (let j = 0, k = 0; j < N; j++) {
    const target = (j / (N - 1)) * total;
    while (k < s.length - 2 && s[k + 1] < target) k++;
    const t = (target - s[k]) / Math.max(1e-9, s[k + 1] - s[k]);
    spine.push([
      +(midline[k][0] + (midline[k + 1][0] - midline[k][0]) * t).toFixed(2),
      +(midline[k][1] + (midline[k + 1][1] - midline[k][1]) * t).toFixed(2),
    ]);
  }
  state.head = spine[0];
  let widest = 0;
  for (const [x, y] of path) widest = Math.max(widest, dist[y * w + x]);
  return {
    len: +total.toFixed(1),
    body: +length.toFixed(1),
    width: +(widest * 2).toFixed(1),
    area: chosen.area,
    spine,
  };
}

const ff = spawn('ffmpeg', [
  '-v',
  'error',
  '-i',
  video,
  '-vf',
  `scale=${W}:${H}`,
  '-f',
  'rawvideo',
  '-pix_fmt',
  'rgb24',
  '-',
]);
const size = W * H * 3;
const state = { blob: null, head: null };
const frames = [];
let buffer = Buffer.alloc(0);
for await (const chunk of ff.stdout) {
  buffer = Buffer.concat([buffer, chunk]);
  while (buffer.length >= size) {
    const result = track(buffer.subarray(0, size), state);
    buffer = buffer.subarray(size);
    frames.push({ f: frames.length, ok: !result.why, ...result });
  }
}
writeFileSync(options.out, JSON.stringify({ video, fps: info.fps, width: W, height: H, points: N, frames }));
console.log(`${options.out}: ${frames.length} frames, ${frames.filter((r) => r.ok).length} with a midline`);
