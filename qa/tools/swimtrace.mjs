// The longest swim in 2 h untouched, second by second: time, target pad,
// distance to it, heading error, steer, speed, distance to the pond's edge,
// position, swimFor, turn left, nearest other swimmer. For tuning swim homing.
//   node qa/tools/swimtrace.mjs <aspect>
import { buildNodeModules } from '../lib/prepare.mjs';

await buildNodeModules();
const { FrogWorld } = await import('../.out/world.mjs');
const aspect = Number(process.argv[2] ?? 1.48);
const w = new FrogWorld(aspect, () => {});
const start = [null, null, null];
const log = [[], [], []];
let longest = { len: 0, log: [] };
const round = (v, d = 2) => +v.toFixed(d);
for (let n = 0; n < 3600 * 120; n++) {
  w.step(1 / 60);
  const t = n / 60;
  w.frogs.forEach((f, i) => {
    const wet = f.state === 'swim' || f.state === 'dive';
    if (wet && start[i] === null) {
      start[i] = t;
      log[i] = [];
    }
    if (wet && n % 30 === 0) {
      const p = f.homeTo >= 0 ? w.pads[f.homeTo] : null;
      const err = p ? Math.atan2(p.y - f.y, p.x - f.x) - f.heading : 0;
      const others = w.frogs
        .filter((o) => o !== f && (o.state === 'swim' || o.state === 'dive'))
        .map((o) => Math.hypot(o.x - f.x, o.y - f.y));
      log[i].push([
        round(t - start[i], 1),
        f.homeTo,
        p ? round(Math.hypot(p.x - f.x, p.y - f.y), 3) : null,
        round(Math.atan2(Math.sin(err), Math.cos(err))),
        round(f.steer),
        round(f.speed, 3),
        round(w.pondDistance(f.x, f.y, f.size)),
        round(f.x),
        round(f.y),
        round(f.swimFor, 1),
        round(Math.atan2(Math.sin(f.turnTo - f.heading), Math.cos(f.turnTo - f.heading))),
        round(Math.min(9, ...others)),
      ]);
    }
    if (!wet && start[i] !== null) {
      if (t - start[i] > longest.len) longest = { len: t - start[i], log: log[i] };
      start[i] = null;
    }
  });
}
console.log(
  'longest',
  longest.len.toFixed(1),
  's\n[t, homeTo, dist, headingErr, steer, speed, pondDist, x, y, swimFor, turnLeft, nearestSwimmer]',
);
for (const row of longest.log) console.log(JSON.stringify(row));
