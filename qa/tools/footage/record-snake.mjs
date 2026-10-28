// Records the grass snake model (SnakeWorld) in the exact same JSON format as
// snake-spine.mjs (25 spine points spaced by 0.5 BW along the anterior 12 BW
// from the snout), so snake-measure.mjs measures the footage and the model
// identically (spec P-18). Runs the pure world in Node, no browser.
//
//   node qa/tools/footage/record-snake.mjs --out model.json [--seconds 45] [--fps 30] [--seed 7]
import { writeFileSync } from 'node:fs';
import { buildNodeModules, OUT } from '../../lib/prepare.mjs';
import { parseArgs } from './lib.mjs';

const { options } = parseArgs(process.argv.slice(2));
if (!options.out) {
  console.error('Usage: node qa/tools/footage/record-snake.mjs --out model.json [--seconds 45] [--fps 30]');
  process.exit(1);
}
await buildNodeModules();
const { SnakeWorld, centreAt, MOTION } = await import(`../../../${OUT}/snake-world.mjs`);

const fps = Number(options.fps ?? 30);
const seconds = Number(options.seconds ?? 45);
const H = 270;
const W = 480;
const STEP_BW = 0.5;
const MAX_POINTS = 25; // 0 to 12 BW behind the snout, matching snake-spine.mjs

const world = new SnakeWorld(W / H, Number(options.seed ?? 7));
// Clear initial scent spot if we want pure autonomous exploration like the clip.
if (!options.spots) {
  for (const s of world.spots) s.active = false;
  world.noticeIn = -1;
}

const frames = [];
const pt = { x: 0, y: 0, tx: 1, ty: 0 };
const sub = 2;

for (let f = 0; f < Math.round(seconds * fps); f++) {
  for (let k = 0; k < sub; k++) world.step(1 / fps / sub, true);
  const bwPx = (world.length / MOTION.BL_IN_BW) * H;
  const spine = [];
  for (let j = 0; j < MAX_POINTS; j++) {
    const u = (j * STEP_BW) / MOTION.BL_IN_BW;
    centreAt(world.spine, u, pt);
    // Convert world (x, y up) to pixel coordinates (x right, y down) at 480×270.
    spine.push([+(pt.x * H).toFixed(2), +((1 - pt.y) * H).toFixed(2)]);
  }
  frames.push({
    f,
    ok: true,
    state: world.state,
    bw: +bwPx.toFixed(2),
    visibleBW: 12,
    cam: [0, 0],
    heading: +world.heading.toFixed(4),
    spine,
  });
}

writeFileSync(
  options.out,
  `${JSON.stringify({ video: 'model', fps, width: W, height: H, stepBW: STEP_BW, frames }, null, 0)}\n`,
);
const states = {};
for (const r of frames) states[r.state] = (states[r.state] ?? 0) + 1;
console.log(
  `${options.out}: ${frames.length} frames; states: ${Object.entries(states)
    .map(([k, v]) => `${k} ${((100 * v) / frames.length).toFixed(1)}%`)
    .join(', ')}`,
);
