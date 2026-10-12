// Gait numbers from a reviewed stances file: stride period and length, duty
// factor per leg, and phases between legs, plus a gait diagram.
//
//   node qa/tools/footage/gait.mjs <stances.json> [--png diagram.png] [--split 80]
//
// stances.json (written by a person or agent after checking footfalls by eye):
//   { "clip": "...", "frameMs": 4, "pxPerMm": 5.2, "bodyLengthMm": 27,
//     "legs": { "L1": [{ "td": 20, "lo": 34, "x": 411, "footfall": 7 }, ...], "R1": [...], ... } }
// Legs are named L/R for side and 1–3 front to back (spec section 7.1); a leg
// with four or more pairs continues 4, 5, …. `x` (the foothold, px) is
// optional and gives stride lengths; `"missedBefore": true` on a stance means
// one before it was not detected, so no stride is counted across the gap. --split n reports frames before n and
// from n separately (a change of speed or gait).
//
// Definitions. Stride: touch-down to the same leg's next touch-down. Duty
// factor: stance ÷ stride, for each stance followed by a touch-down. Phase of
// leg A in leg B's stride: (touch-down of A − touch-down of B) ÷ B's stride,
// taken mod 1, for each B stride containing a touch-down of A; 0 or 1 means
// together, 0.5 alternating (Weihmann et al. 2017 use the same convention:
// front in middle's stride ≈ 0.5 in an alternating tripod).
import { readFileSync } from 'node:fs';
import { parseArgs, writeGrayPng } from './lib.mjs';

const { positional, options } = parseArgs(process.argv.slice(2));
const [file] = positional;
if (!file) {
  console.error('Usage: node qa/tools/footage/gait.mjs <stances.json> [--png diagram.png] [--split n]');
  process.exit(1);
}
const data = JSON.parse(readFileSync(file, 'utf8'));
const ms = data.frameMs;
const legs = data.legs;
const names = Object.keys(legs).sort((a, b) => a[0].localeCompare(b[0]) || Number(a.slice(1)) - Number(b.slice(1)));
const split = options.split !== undefined ? Number(options.split) : null;
const windows =
  split === null
    ? [['all', -Infinity, Infinity]]
    : [
        ['before ' + split, -Infinity, split],
        ['from ' + split, split, Infinity],
      ];

const mean = (v) => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : NaN);
const fmt = (v, d = 2) => (Number.isFinite(v) ? v.toFixed(d) : '—');
/** Circular mean of phases in [0, 1). */
const circular = (v) => {
  if (!v.length) return NaN;
  const c = mean(v.map((p) => Math.cos(2 * Math.PI * p)));
  const s = mean(v.map((p) => Math.sin(2 * Math.PI * p)));
  return (((Math.atan2(s, c) / (2 * Math.PI)) % 1) + 1) % 1;
};

/** Strides of one leg whose touch-down lies in [from, to): { td, next, stance, period, length }. */
function strides(leg, from, to) {
  const list = [...legs[leg]].sort((a, b) => a.td - b.td);
  const out = [];
  for (let k = 0; k + 1 < list.length; k++) {
    if (list[k].td < from || list[k].td >= to || list[k + 1].missedBefore) continue;
    const period = list[k + 1].td - list[k].td;
    out.push({
      td: list[k].td,
      next: list[k + 1].td,
      stance: list[k].lo - list[k].td + 1,
      period,
      length: list[k].x !== undefined && list[k + 1].x !== undefined ? Math.abs(list[k + 1].x - list[k].x) : NaN,
    });
  }
  return out;
}

function phase(a, b, from, to) {
  const values = [];
  for (const s of strides(b, from, to))
    for (const t of legs[a]) if (t.td >= s.td && t.td < s.next) values.push((t.td - s.td) / s.period);
  return values;
}

const pairs = [];
for (const side of ['L', 'R']) {
  if (legs[side + '1'] && legs[side + '2']) pairs.push([side + '1', side + '2']);
  if (legs[side + '2'] && legs[side + '3']) pairs.push([side + '2', side + '3']);
  if (legs[side + '1'] && legs[side + '3']) pairs.push([side + '1', side + '3']);
}
for (const k of ['1', '2', '3']) if (legs['L' + k] && legs['R' + k]) pairs.push(['L' + k, 'R' + k]);

console.log(`${data.clip}\nframe ${ms} ms${data.pxPerMm ? `, ${data.pxPerMm} px/mm` : ''}`);
for (const [label, from, to] of windows) {
  console.log(`\n== ${label}`);
  console.log('leg  strides  period ms  stance ms  duty   length mm   (each stride: period/stance frames)');
  for (const leg of names) {
    const s = strides(leg, from, to);
    const length = mean(s.map((x) => x.length).filter(Number.isFinite));
    console.log(
      `${leg.padEnd(4)} ${String(s.length).padStart(7)} ${fmt(mean(s.map((x) => x.period * ms)), 0).padStart(10)} ${fmt(
        mean(s.map((x) => x.stance * ms)),
        0,
      ).padStart(10)} ${fmt(mean(s.map((x) => x.stance / x.period))).padStart(5)} ${(data.pxPerMm
        ? fmt(length / data.pxPerMm, 1)
        : '—'
      ).padStart(11)}   ${s.map((x) => `${x.period}/${x.stance}`).join(' ')}`,
    );
  }
  console.log('phase (A in B’s stride)  n   circular mean   values');
  for (const [a, b] of pairs) {
    const v = phase(a, b, from, to);
    console.log(
      `${(a + ' in ' + b).padEnd(23)} ${String(v.length).padStart(2)}   ${fmt(circular(v)).padStart(13)}   ${v.map((p) => p.toFixed(2)).join(' ')}`,
    );
  }
}

if (options.png) {
  const last = Math.max(...names.flatMap((l) => legs[l].map((s) => s.lo))) + 1;
  const CW = 4;
  const RH = 18;
  const GAP = 6;
  const W = last * CW;
  const H = names.length * (RH + GAP);
  const img = new Uint8Array(W * H).fill(255);
  names.forEach((leg, r) => {
    for (const s of legs[leg])
      for (let n = s.td; n <= s.lo; n++)
        for (let y = r * (RH + GAP); y < r * (RH + GAP) + RH; y++)
          for (let x = n * CW; x < (n + 1) * CW; x++) img[y * W + x] = 0;
    for (let n = 0; n < last; n += 10)
      for (let y = r * (RH + GAP) + RH; y < (r + 1) * (RH + GAP) - 1; y++) img[y * W + n * CW] = n % 50 === 0 ? 0 : 150;
  });
  if (split !== null) for (let y = 0; y < H; y++) img[y * W + split * CW] = 120;
  writeGrayPng(options.png, img, W, H);
  console.log(`\n${options.png}: rows ${names.join(', ')}; black = foot planted; ticks every 10 frames`);
}
