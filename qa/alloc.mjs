// Garbage made per frame: bytes allocated by world.step() and reedBlades().
//   npm run qa:alloc   (runs node with --expose-gc)
import { buildNodeModules } from './lib/prepare.mjs';
import { createReport } from './lib/report.mjs';
import { THRESHOLDS } from './thresholds.mjs';

if (typeof globalThis.gc !== 'function') {
  console.error('Run with node --expose-gc (npm run qa:alloc does).');
  process.exit(1);
}
await buildNodeModules();
const { FrogWorld } = await import('./.out/world.mjs');
const { REED_BLADES, reedBlades } = await import('./.out/bank.mjs');
const report = createReport('alloc');

/** Fewest bytes per call over a few runs: V8 books other work (compiling, feedback) to the heap now and then. */
const measure = (run, calls) => {
  const results = [];
  for (let k = 0; k < 5; k++) {
    globalThis.gc();
    globalThis.gc();
    const before = process.memoryUsage().heapUsed;
    for (let i = 0; i < calls; i++) run(i);
    results.push((process.memoryUsage().heapUsed - before) / calls);
  }
  return Math.round(Math.min(...results));
};

const world = new FrogWorld(1.48, () => {}, 3);
for (let i = 0; i < 36000; i++) world.step(1 / 60); // warm up the JIT
// Put a frog in the water so swimming is included.
world.tap(world.frogs[0].x, world.frogs[0].y, 0.02);
for (let i = 0; i < 120; i++) world.step(1 / 60);
report.measure(
  'world.step() bytes per frame',
  measure(() => world.step(1 / 60), 3000),
  THRESHOLDS.alloc.stepBytesPerFrame,
);

const ends = new Float32Array(REED_BLADES * 4);
const shape = new Float32Array(REED_BLADES * 4);
const box = new Float32Array(4);
for (let i = 0; i < 20000; i++) reedBlades(1.48, i / 60, ends, shape, box);
report.measure(
  'reedBlades() bytes per call',
  measure((i) => reedBlades(1.48, i / 60, ends, shape, box), 600),
  THRESHOLDS.alloc.reedBytesPerCall,
);
report.finish();
