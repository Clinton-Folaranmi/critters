// Tracks a grass snake (Natrix natrix) from above on wooden planks:
// per frame, the olive+yellow body ribbon is segmented, holes filled, spurs
// opened and thinned to a 1-px skeleton; the longest path along the skeleton
// is the trunk midline. Which end is the head is decided by:
//   1) not sitting on the frame border (the rear body always exits the frame),
//   2) the bright yellow + black Natrix collar 0.5–2.2 body-widths behind the end,
//   3) continuity with the previous frame's head.
// Also tracks the handheld camera's shift over the wood planks (by block-matching
// background wood patches outside the snake mask).
//
//   node qa/tools/footage/snake-spine.mjs <video> --out snake.json [--scale 480]
//       [--sheet check.png --from 0 --to 280 --step 10]
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ffmpeg, parseArgs, probe, writeJson } from './lib.mjs';

const { positional, options } = parseArgs(process.argv.slice(2));
const [video] = positional;
if (!video || !options.out) {
  console.error('Usage: node qa/tools/footage/snake-spine.mjs <video> --out snake.json [--scale 480]');
  process.exit(1);
}
const info = probe(video);
const W = Number(options.scale ?? 480);
const H = Math.round((W * info.height) / info.width) & ~1;
const STEP_BW = 0.5; // spacing between resampled spine points, in body widths (BW)
const MAX_POINTS = 25; // snout to 12 BW back along the trunk

const sheet = options.sheet
  ? {
      file: options.sheet,
      from: Number(options.from ?? 0),
      to: Number(options.to ?? 290),
      step: Number(options.step ?? 10),
    }
  : null;
const sheetDir = sheet ? mkdtempSync(join(tmpdir(), 'snake-sheet-')) : null;
const sheetTiles = [];

const gray = new Uint8Array(W * H);
const prevGray = new Uint8Array(W * H);
const rawMask = new Uint8Array(W * H);
const collarScoreMap = new Uint8Array(W * H);
const mask = new Uint8Array(W * H);
const tmp = new Uint8Array(W * H);
const dist = new Float32Array(W * H);
const skel = new Uint8Array(W * H);
const label = new Int32Array(W * H);
const stack = new Int32Array(W * H);

function morph(src, dst, r, erode) {
  const want = erode ? 0 : 1;
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let v = 1 - want;
      for (let k = Math.max(0, x - r); k <= Math.min(W - 1, x + r) && v !== want; k++)
        if (src[y * W + k] === want) v = want;
      tmp[y * W + x] = v;
    }
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      let v = 1 - want;
      for (let k = Math.max(0, y - r); k <= Math.min(H - 1, y + r) && v !== want; k++)
        if (tmp[k * W + x] === want) v = want;
      dst[y * W + x] = v;
    }
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

/** Breadth-first over `skeleton` from `start`: farthest pixel and predecessor map. */
function bfs(skeleton, start) {
  const seen = new Int32Array(W * H).fill(-1);
  const prev = new Int32Array(W * H).fill(-1);
  const queue = [start];
  seen[start] = 0;
  let last = start;
  for (let qi = 0; qi < queue.length; qi++) {
    const p = queue[qi];
    last = p;
    const x = p % W;
    const y = (p / W) | 0;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dy) continue;
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const q = ny * W + nx;
        if (!skeleton[q] || seen[q] >= 0) continue;
        seen[q] = seen[p] + 1;
        prev[q] = p;
        queue.push(q);
      }
  }
  return { last, prev, seen };
}

/** Block-matches background wood patches (outside the snake mask) against the previous frame. */
function trackBackground(hasPrev) {
  if (!hasPrev) return [0, 0];
  const dxs = [];
  const dys = [];
  const R = 10;
  const S = 14;
  for (let gy = 45; gy <= H - 45; gy += 45)
    for (let gx = 60; gx <= W - 60; gx += 60) {
      let nearSnake = false;
      let mean = 0;
      let count = 0;
      for (let dy = -R; dy <= R && !nearSnake; dy += 2)
        for (let dx = -R; dx <= R; dx += 2) {
          const idx = (gy + dy) * W + (gx + dx);
          if (mask[idx]) nearSnake = true;
          mean += prevGray[idx];
          count++;
        }
      mean /= count;
      if (nearSnake || mean < 75 || mean > 235) continue;
      let mad = 0;
      for (let dy = -R; dy <= R; dy += 2)
        for (let dx = -R; dx <= R; dx += 2) mad += Math.abs(prevGray[(gy + dy) * W + (gx + dx)] - mean);
      if (mad / count < 5) continue;

      let bestSad = Infinity;
      let bestDx = 0;
      let bestDy = 0;
      for (let sy = -S; sy <= S; sy++)
        for (let sx = -S; sx <= S; sx++) {
          let sad = 0;
          for (let dy = -R; dy <= R; dy += 2) {
            const py = (gy + dy) * W;
            const cy = (gy + dy + sy) * W;
            for (let dx = -R; dx <= R; dx += 2) sad += Math.abs(prevGray[py + gx + dx] - gray[cy + gx + dx + sx]);
          }
          if (sad < bestSad || (sad === bestSad && sx * sx + sy * sy < bestDx * bestDx + bestDy * bestDy)) {
            bestSad = sad;
            bestDx = sx;
            bestDy = sy;
          }
        }
      dxs.push(bestDx);
      dys.push(bestDy);
    }
  if (dxs.length < 3) return [0, 0];
  dxs.sort((a, b) => a - b);
  dys.sort((a, b) => a - b);
  return [-dxs[dxs.length >> 1], -dys[dys.length >> 1]];
}

function trackFrame(rgb, state, frameIdx) {
  for (let i = 0; i < W * H; i++) {
    const r = rgb[i * 3];
    const g = rgb[i * 3 + 1];
    const b = rgb[i * 3 + 2];
    gray[i] = ((r * 77 + g * 150 + b * 29) >> 8) & 0xff;
    const isBody = g >= 35 && g - b >= 14 && b < g * 0.81 && r < g * 1.24;
    const isCollar = r >= 200 && g >= 185 && g - b >= 30 && b < g * 0.86;
    rawMask[i] = isBody || isCollar ? 1 : 0;
    collarScoreMap[i] = isCollar ? 1 : 0;
  }

  // When the head is raised off the planks, the shadowed olive neck immediately behind the
  // yellow collar is darker (g >= 22, g - b >= 8) than the sunlit trunk, while wood cracks
  // remain neutral grey (g - b <= 5). Bridge only olive-tinted neck pixels near the collar.
  let colX = 0;
  let colY = 0;
  let colN = 0;
  for (let y = 16; y < H - 16; y += 2)
    for (let x = 16; x < W - 16; x += 2) {
      if (!collarScoreMap[y * W + x]) continue;
      if (state.head && Math.hypot(x - state.head[0], y - state.head[1]) > 75) continue;
      colX += x;
      colY += y;
      colN++;
    }
  if (colN >= 6) {
    const cx = Math.round(colX / colN);
    const cy = Math.round(colY / colN);
    for (let dy = -16; dy <= 16; dy++)
      for (let dx = -16; dx <= 16; dx++) {
        if (dx * dx + dy * dy > 16 * 16) continue;
        const nx = cx + dx;
        const ny = cy + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const idx = ny * W + nx;
        const r = rgb[idx * 3];
        const g = rgb[idx * 3 + 1];
        const b = rgb[idx * 3 + 2];
        if ((g >= 22 && g - b >= 8 && b < g * 0.85 && r < g * 1.25) || dx * dx + dy * dy <= 5 * 5) {
          rawMask[idx] = 1;
        }
      }
  }

  morph(rawMask, mask, 4, false);
  morph(mask, mask, 4, true);

  const [bgDx, bgDy] = trackBackground(frameIdx > 0);
  prevGray.set(gray);
  state.camX += bgDx;
  state.camY += bgDy;

  // Pick the largest connected snake body blob.
  label.fill(0);
  let nextId = 1;
  let bestBlob = null;
  let bestArea = 0;
  for (let i = 0; i < W * H; i++) {
    if (!mask[i] || label[i]) continue;
    const id = nextId++;
    let sp = 0;
    stack[sp++] = i;
    label[i] = id;
    let area = 0;
    while (sp) {
      const p = stack[--sp];
      area++;
      const x = p % W;
      for (const q of [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, p - W, p + W]) {
        if (q < 0 || q >= W * H || !mask[q] || label[q]) continue;
        label[q] = id;
        stack[sp++] = q;
      }
    }
    if (area > bestArea) {
      bestArea = area;
      bestBlob = id;
    }
  }
  if (!bestBlob || bestArea < 800) return { ok: false, why: 'no body blob', cam: [state.camX, state.camY] };

  for (let i = 0; i < W * H; i++) mask[i] = label[i] === bestBlob ? 1 : 0;

  // Fill interior holes inside the body ribbon.
  const outside = new Uint8Array(W * H);
  let qHead = 0;
  let qTail = 0;
  for (let x = 0; x < W; x++) {
    if (!mask[x]) {
      outside[x] = 1;
      stack[qTail++] = x;
    }
    const b = (H - 1) * W + x;
    if (!mask[b]) {
      outside[b] = 1;
      stack[qTail++] = b;
    }
  }
  for (let y = 1; y < H - 1; y++) {
    const l = y * W;
    const r = y * W + W - 1;
    if (!mask[l]) {
      outside[l] = 1;
      stack[qTail++] = l;
    }
    if (!mask[r]) {
      outside[r] = 1;
      stack[qTail++] = r;
    }
  }
  while (qHead < qTail) {
    const p = stack[qHead++];
    const x = p % W;
    for (const q of [x > 0 ? p - 1 : -1, x < W - 1 ? p + 1 : -1, p - W, p + W]) {
      if (q < 0 || q >= W * H || outside[q] || mask[q]) continue;
      outside[q] = 1;
      stack[qTail++] = q;
    }
  }
  for (let i = 0; i < W * H; i++) if (!outside[i]) mask[i] = 1;

  // Open with radius 3 to clip thin spurs along wood cracks.
  morph(mask, mask, 3, true);
  morph(mask, mask, 3, false);

  // Chamfer distance transform for body half-width.
  for (let i = 0; i < W * H; i++) dist[i] = mask[i] ? 1e9 : 0;
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      dist[i] = Math.min(dist[i], dist[i - 1] + 1, dist[i - W] + 1, dist[i - W - 1] + 1.414, dist[i - W + 1] + 1.414);
    }
  for (let y = H - 2; y > 0; y--)
    for (let x = W - 2; x > 0; x--) {
      const i = y * W + x;
      dist[i] = Math.min(dist[i], dist[i + 1] + 1, dist[i + W] + 1, dist[i + W + 1] + 1.414, dist[i + W - 1] + 1.414);
    }

  skel.set(mask);
  thin(skel, W, H);
  const startNode = skel.findIndex((v) => v);
  if (startNode < 0) return { ok: false, why: 'no skeleton', cam: [state.camX, state.camY] };
  const endA = bfs(skel, startNode).last;
  const { last: endB, prev } = bfs(skel, endA);
  const path = [];
  for (let p = endB; p >= 0; p = prev[p]) path.push([p % W, (p / W) | 0]);
  if (path.length < 45) return { ok: false, why: 'path too short', cam: [state.camX, state.camY] };

  // Trim any short hook at either end.
  const turnAt = (i, d) => {
    const [ax, ay] = path[i];
    const [bx, by] = path[i + d];
    const [cx, cy] = path[i + 2 * d];
    const t = Math.atan2(cy - by, cx - bx) - Math.atan2(by - ay, bx - ax);
    return Math.abs(Math.atan2(Math.sin(t), Math.cos(t)));
  };
  const step = 4;
  while (path.length > 50 && turnAt(0, step) > 0.75) path.splice(0, step);
  while (path.length > 50 && turnAt(path.length - 1, -step) > 0.75) path.splice(path.length - step, step);

  // Median body width (2 * dist) along the middle of the path.
  const widths = [];
  for (let i = 10; i < Math.min(80, path.length - 10); i++) {
    const [x, y] = path[i];
    widths.push(dist[y * W + x] * 2);
  }
  widths.sort((a, b) => a - b);
  const bw = widths[widths.length >> 1] || 20;

  // Score which end of `path` (0 vs path.length - 1) is the head:
  // 1) An end near the frame border is where the rear body exits the frame.
  // 2) The head end has yellow collar pixels within 24 px of path[0..20].
  // 3) Continuity with the previous frame's head.
  const scoreEnd = (atStart) => {
    const [ex, ey] = atStart ? path[0] : path.at(-1);
    const borderDist = Math.min(ex, W - 1 - ex, ey, H - 1 - ey);
    let score = borderDist < 14 ? -400 : 120;
    // Count yellow collar pixels near the neck (indices 2..20 from this end).
    const neckPt = atStart ? path[Math.min(10, path.length - 1)] : path[Math.max(0, path.length - 11)];
    let yellowNear = 0;
    for (let dy = -16; dy <= 16; dy += 2)
      for (let dx = -16; dx <= 16; dx += 2) {
        const nx = Math.round(neckPt[0] + dx);
        const ny = Math.round(neckPt[1] + dy);
        if (nx >= 0 && ny >= 0 && nx < W && ny < H && collarScoreMap[ny * W + nx]) yellowNear++;
      }
    score += Math.min(180, yellowNear * 6);
    if (state.head) {
      const expX = state.head[0] - bgDx;
      const expY = state.head[1] - bgDy;
      score -= Math.hypot(ex - expX, ey - expY) * 3;
    }
    return score;
  };
  if (scoreEnd(false) > scoreEnd(true)) path.reverse();

  // Reject if the chosen head end is right on the frame border or jumped across the screen.
  const [hx0, hy0] = path[0];
  if (Math.min(hx0, W - 1 - hx0, hy0, H - 1 - hy0) < 8) {
    return { ok: false, why: 'head at border', cam: [state.camX, state.camY] };
  }
  if (state.head) {
    const jump = Math.hypot(hx0 - (state.head[0] - bgDx), hy0 - (state.head[1] - bgDy));
    if (jump > 65) {
      state.head = [hx0, hy0];
      return { ok: false, why: 'head jump', cam: [state.camX, state.camY] };
    }
  }

  // Extend from path[0] to the actual snout tip along the head tangent (the distance transform
  // erosion stops ~0.5 BW inside the rounded snout tip).
  const lookBack = Math.min(path.length - 1, Math.max(6, Math.round(bw * 1.1)));
  let tx = path[0][0] - path[lookBack][0];
  let ty = path[0][1] - path[lookBack][1];
  const td = Math.hypot(tx, ty) || 1;
  tx /= td;
  ty /= td;
  const snout = [path[0][0] + tx * bw * 0.45, path[0][1] + ty * bw * 0.45];
  state.head = snout;

  const full = [snout, ...path];
  const smoothed = full.map((pt, i) => {
    if (i === 0) return pt;
    const a = full[Math.max(0, i - 2)];
    const b = full[Math.min(full.length - 1, i + 2)];
    return [pt[0] * 0.5 + (a[0] + b[0]) * 0.25, pt[1] * 0.5 + (a[1] + b[1]) * 0.25];
  });

  const arc = [0];
  for (let i = 1; i < smoothed.length; i++)
    arc.push(arc[i - 1] + Math.hypot(smoothed[i][0] - smoothed[i - 1][0], smoothed[i][1] - smoothed[i - 1][1]));
  const totalLen = arc.at(-1);
  if (totalLen < bw * 4) return { ok: false, why: 'visible trunk < 4 BW', cam: [state.camX, state.camY] };

  const stepPx = bw * STEP_BW;
  const count = Math.min(MAX_POINTS, Math.floor(totalLen / stepPx) + 1);
  const spine = [];
  for (let j = 0, k = 0; j < count; j++) {
    const target = j * stepPx;
    while (k < arc.length - 2 && arc[k + 1] < target) k++;
    const t = (target - arc[k]) / Math.max(1e-9, arc[k + 1] - arc[k]);
    spine.push([
      +(smoothed[k][0] + (smoothed[k + 1][0] - smoothed[k][0]) * t).toFixed(2),
      +(smoothed[k][1] + (smoothed[k + 1][1] - smoothed[k][1]) * t).toFixed(2),
    ]);
  }

  if (sheet && frameIdx >= sheet.from && frameIdx <= sheet.to && (frameIdx - sheet.from) % sheet.step === 0) {
    const outRgb = Buffer.from(rgb);
    const dot = (cx, cy, r, cr, cg, cb) => {
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) {
          if (dx * dx + dy * dy > r * r) continue;
          const x = Math.round(cx + dx);
          const y = Math.round(cy + dy);
          if (x < 0 || y < 0 || x >= W || y >= H) continue;
          const idx = (y * W + x) * 3;
          outRgb[idx] = cr;
          outRgb[idx + 1] = cg;
          outRgb[idx + 2] = cb;
        }
    };
    for (let j = 0; j < spine.length; j++) {
      const [sx, sy] = spine[j];
      if (j === 0)
        dot(sx, sy, 4, 0, 255, 255); // snout: cyan
      else if (j === 2)
        dot(sx, sy, 4, 255, 255, 0); // collar: yellow
      else dot(sx, sy, 3, 255, 60, 60); // trunk: red
    }
    const tileFile = join(sheetDir, `tile-${String(sheetTiles.length).padStart(4, '0')}.png`);
    const header = Buffer.from(`P6\n${W} ${H}\n255\n`);
    spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'ppm_pipe', '-i', '-', tileFile]).stdin.end(
      Buffer.concat([header, outRgb]),
    );
    sheetTiles.push(frameIdx);
  }

  return {
    ok: true,
    bw: +bw.toFixed(2),
    visibleBW: +(totalLen / bw).toFixed(2),
    cam: [+state.camX.toFixed(1), +state.camY.toFixed(1)],
    heading: +Math.atan2(-ty, tx).toFixed(4),
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
const frameBytes = W * H * 3;
const state = { head: null, camX: 0, camY: 0 };
const frames = [];
let buf = Buffer.alloc(0);
for await (const chunk of ff.stdout) {
  buf = Buffer.concat([buf, chunk]);
  while (buf.length >= frameBytes) {
    const res = trackFrame(buf.subarray(0, frameBytes), state, frames.length);
    buf = buf.subarray(frameBytes);
    frames.push({ f: frames.length, ...res });
  }
}

if (sheet && sheetTiles.length) {
  await new Promise((r) => setTimeout(r, 400));
  const cols = 6;
  const rows = Math.ceil(sheetTiles.length / cols);
  ffmpeg([
    '-framerate',
    '1',
    '-i',
    join(sheetDir, 'tile-%04d.png'),
    '-vf',
    `tile=${cols}x${rows}:padding=4:color=black`,
    '-frames:v',
    '1',
    sheet.file,
  ]);
  rmSync(sheetDir, { recursive: true, force: true });
}

writeJson(options.out, { video, fps: info.fps, width: W, height: H, stepBW: STEP_BW, frames });
const okCount = frames.filter((r) => r.ok).length;
console.log(
  `${options.out}: ${frames.length} frames, ${okCount} tracked (${((100 * okCount) / frames.length).toFixed(1)} %)`,
);
