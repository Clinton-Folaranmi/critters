// Replays the tapped soak's taps (qa/soak.mjs, mode tap) to a frame and
// writes the world to qa/.out/state.json; qa/browser/replay.mjs draws it.
//   node qa/tools/dump.mjs <aspect> <seed> <frame>
import { writeFileSync } from 'node:fs';
import { buildNodeModules } from '../lib/prepare.mjs';

await buildNodeModules();
const { FrogWorld } = await import('../.out/world.mjs');
const [aspect, seed, frame] = process.argv.slice(2).map(Number);
let s = seed >>> 0;
const rnd = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
const world = new FrogWorld(aspect, () => {}, 3);
let nextTap = 1;
for (let n = 0; n <= frame; n++) {
  const t = n / 60;
  if (t >= nextTap) {
    nextTap = t + 0.4 + rnd() * 1.6;
    const f = world.frogs[Math.floor(rnd() * 3)];
    if (rnd() < 0.4) world.tap(f.x + (rnd() - 0.5) * f.size, f.y + (rnd() - 0.5) * f.size, 0.022);
    else world.tap(rnd() * aspect, rnd(), 0.01);
  }
  world.step(1 / 60);
}
writeFileSync(
  'qa/.out/state.json',
  JSON.stringify({ aspect, frogs: world.frogs, pads: world.pads, flies: world.flies, capsules: [...world.capsules] }),
);
console.log('qa/.out/state.json written at frame', frame);
