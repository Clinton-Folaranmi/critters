// How long swims last and how often frogs hop, over 2 h untouched at each
// aspect (frame-stepped; the world is seeded, so these are exact repeats).
//
//   npm run qa:swims [-- --hours=N --aspect=1.48]
import { buildNodeModules } from './lib/prepare.mjs';
import { createReport, flags } from './lib/report.mjs';
import { THRESHOLDS } from './thresholds.mjs';

await buildNodeModules();
const { FrogWorld } = await import('./.out/world.mjs');
const T = THRESHOLDS.swims;
const opts = flags();
const hours = Number(opts.hours ?? T.hours);
const report = createReport('swims');

for (const aspect of opts.aspect ? [Number(opts.aspect)] : THRESHOLDS.soak.aspects) {
  const world = new FrogWorld(aspect, () => {}, 3);
  const dt = 1 / 60;
  const start = world.frogs.map(() => null);
  const lengths = [];
  let padJumps = 0;
  let intoWater = 0;
  const prev = world.frogs.map((f) => ({ state: f.state, pad: f.pad }));
  for (let n = 0; n < hours * 3600 * 60; n++) {
    world.step(dt);
    const t = n * dt;
    world.frogs.forEach((f, i) => {
      const wet = f.state === 'swim' || f.state === 'dive';
      if (wet && start[i] === null) start[i] = t;
      if (!wet && start[i] !== null) {
        lengths.push(t - start[i]);
        start[i] = null;
      }
      if (prev[i].state === 'crouch' && f.state === 'air' && prev[i].pad >= 0) {
        padJumps++;
        if (f.toPad < 0) intoWater++;
      }
      prev[i] = { state: f.state, pad: f.pad };
    });
  }
  lengths.sort((a, b) => a - b);
  const q = (p) => +lengths[Math.floor(p * (lengths.length - 1))].toFixed(1);
  const tag = `${aspect}, ${hours} h`;
  report.info(`${tag}: swims`, lengths.length);
  report.measure(`${tag}: median swim`, q(0.5), T.median);
  report.measure(`${tag}: 90th percentile swim`, q(0.9), T.p90);
  report.measure(`${tag}: longest swim`, q(1), T.longest);
  report.measure(
    `${tag}: pad jumps per frog per minute`,
    +(padJumps / 3 / (hours * 60)).toFixed(2),
    T.padJumpsPerFrogPerMinute,
  );
  report.measure(`${tag}: share of pad jumps into the water`, +(intoWater / padJumps).toFixed(2), T.intoWaterShare);
}
report.finish();
