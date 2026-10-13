// The kit's gait clock against a measured gait. From the reviewed stances of
// a filmed animal (docs/footage/*.stances.json: the cockroach of
// docs/BEETLE_FOOTAGE_LOG.md) it takes the stride period and length, the
// duty factor and every leg's touch-down phase, builds a GaitSpec from them,
// walks the clock at the measured speeds, and measures the result the same
// way: the primitive must reproduce the gait it was given. Also checks that
// the insect tripod keeps three feet down and that standing still holds the
// cycle (no foot moves without the body moving, L-5).
//
//   npm run qa:gait
import { readFileSync } from 'node:fs';
import { buildNodeModules } from './lib/prepare.mjs';
import { createReport } from './lib/report.mjs';
import { THRESHOLDS } from './thresholds.mjs';

await buildNodeModules();
const kit = await import('./.out/kit.mjs');
const T = THRESHOLDS.gait;
const report = createReport('gait');

const FILE = 'docs/footage/weihmann2017-file3.stances.json';
const SPLIT = 80; // the frame where this animal speeds up (its caption)
const data = JSON.parse(readFileSync(FILE, 'utf8'));
const bodyPx = data.pxPerMm * data.bodyLengthMm;
const seconds = (frames) => (frames * data.frameMs) / 1000;
const mean = (v) => v.reduce((s, x) => s + x, 0) / v.length;
const circularMean = (v) => {
  const c = mean(v.map((p) => Math.cos(2 * Math.PI * p)));
  const s = mean(v.map((p) => Math.sin(2 * Math.PI * p)));
  return (((Math.atan2(s, c) / (2 * Math.PI)) % 1) + 1) % 1;
};
const circularGap = (a, b) => {
  const d = Math.abs(a - b) % 1;
  return Math.min(d, 1 - d);
};

/** Strides of every leg as { leg, td, next, stance (frames), length (px) } — the definitions of qa/tools/footage/gait.mjs. */
function strides(legs, from, to) {
  const out = [];
  for (const [leg, list] of Object.entries(legs)) {
    const sorted = [...list].sort((a, b) => a.td - b.td);
    for (let k = 0; k + 1 < sorted.length; k++) {
      const s = sorted[k];
      const next = sorted[k + 1];
      if (s.td < from || s.td >= to || next.missedBefore || s.clipStart) continue;
      out.push({ leg, td: s.td, next: next.td, stance: s.lo - s.td + 1, length: Math.abs(next.x - s.x) });
    }
  }
  return out;
}
/** Phase of leg a's touch-downs in leg b's strides. */
function phases(legs, a, b, from, to) {
  const values = [];
  for (const s of strides({ [b]: legs[b] }, from, to))
    for (const t of legs[a])
      if (!t.clipStart && t.td >= s.td && t.td < s.next) values.push((t.td - s.td) / (s.next - s.td));
  return values;
}

// The front feet land beside the head and their stances are cut short there,
// so duty factors come from the middle and hind feet (as in the footage log).
const DUTY_LEGS = ['L2', 'L3', 'R2', 'R3'];
const windows = [
  ['before the speed-up', 0, SPLIT],
  ['after it', SPLIT, Infinity],
];
const measured = windows.map(([name, from, to]) => {
  const all = strides(data.legs, from, to);
  const period = seconds(mean(all.map((s) => s.next - s.td)));
  const length = mean(all.filter((s) => Number.isFinite(s.length)).map((s) => s.length)) / bodyPx;
  const duty = mean(all.filter((s) => DUTY_LEGS.includes(s.leg)).map((s) => s.stance / (s.next - s.td)));
  return { name, period, length, duty, speed: length / period };
});
// Touch-down phases, relative to the upper middle foot, from the slower stretch.
const reference = 'R2';
const offsets = { [reference]: 0 };
for (const leg of Object.keys(data.legs))
  if (leg !== reference) {
    const v = phases(data.legs, leg, reference, 0, SPLIT);
    if (v.length) offsets[leg] = circularMean(v);
  }
for (const m of measured)
  report.info(
    `measured, ${m.name}`,
    `stride ${(m.period * 1000).toFixed(0)} ms, ${m.length.toFixed(3)} BL, duty ${m.duty.toFixed(2)}, ${m.speed.toFixed(2)} BL/s`,
  );
report.info(
  'measured touch-down phases (in R2’s stride)',
  Object.entries(offsets)
    .map(([l, p]) => `${l} ${p.toFixed(2)}`)
    .join(', '),
);

const spec = {
  offsets,
  table: {
    speed: measured.map((m) => m.speed),
    strideLength: measured.map((m) => m.length),
    duty: measured.map((m) => m.duty),
  },
};

/** Walks the clock at a steady speed for `strides` cycles, sampling every frame; returns each leg's stance flags. */
function walk(gait, speed, frameSeconds, cycles) {
  const state = kit.createGaitState(0.013);
  const frames = Math.round((cycles * kit.strideLengthAt(gait, speed)) / speed / frameSeconds);
  const flags = Object.fromEntries(Object.keys(gait.offsets).map((l) => [l, new Uint8Array(frames)]));
  for (let n = 0; n < frames; n++) {
    kit.advanceGait(state, gait, speed * frameSeconds, speed);
    for (const leg of Object.keys(gait.offsets)) flags[leg][n] = kit.isStance(state, gait, leg) ? 1 : 0;
  }
  return flags;
}
/** Stances from per-frame flags, in the stances-file shape (complete stances only). */
function toStances(flags) {
  const legs = {};
  for (const [leg, f] of Object.entries(flags)) {
    legs[leg] = [];
    for (let n = 1; n < f.length; n++) {
      if (f[n] && !f[n - 1]) legs[leg].push({ td: n, lo: -1, x: NaN });
      if (!f[n] && f[n - 1] && legs[leg].length) legs[leg].at(-1).lo = n - 1;
    }
    legs[leg] = legs[leg].filter((s) => s.lo >= s.td);
  }
  return legs;
}

const frameSeconds = data.frameMs / 1000;
measured.forEach((m, k) => {
  const legs = toStances(walk(spec, m.speed, frameSeconds, 40));
  const all = strides(legs, 0, Infinity);
  const period = seconds(mean(all.map((s) => s.next - s.td)));
  const duty = mean(all.filter((s) => DUTY_LEGS.includes(s.leg)).map((s) => s.stance / (s.next - s.td)));
  report.measure(
    `${m.name}: stride period, relative error`,
    +Math.abs(period / m.period - 1).toFixed(4),
    T.periodError,
  );
  report.measure(`${m.name}: duty factor, error`, +Math.abs(duty - m.duty).toFixed(4), T.dutyError);
  if (k === 0) {
    let worst = 0;
    for (const leg of Object.keys(offsets)) {
      if (leg === reference) continue;
      const v = phases(legs, leg, reference, 0, Infinity);
      worst = Math.max(worst, circularGap(circularMean(v), offsets[leg]));
    }
    report.measure(`${m.name}: touch-down phases, largest error`, +worst.toFixed(4), T.phaseError);
  }
});

// The insect tripod keeps three feet down at any duty factor from 0.5 up.
let fewest = Infinity;
for (const duty of [0.5, 0.55, 0.6, 0.66, 0.7]) {
  const tripod = { offsets: kit.TRIPOD_OFFSETS, table: { speed: [1], strideLength: [0.4], duty: [duty] } };
  const flags = walk(tripod, 1, frameSeconds, 6);
  const n = flags.L1.length;
  for (let i = 0; i < n; i++)
    fewest = Math.min(
      fewest,
      Object.values(flags).reduce((s, f) => s + f[i], 0),
    );
}
report.measure('tripod, fewest feet down (duty 0.5–0.7)', fewest, T.tripodSupport);

// Standing still holds the cycle: no foot lifts or lands without the body moving.
const still = kit.createGaitState(0.3);
for (let i = 0; i < 1000; i++) kit.advanceGait(still, spec, 0, 0);
report.measure('cycle drift while standing still', +Math.abs(still.phase - 0.3).toFixed(6), T.standingDrift);

report.finish();
