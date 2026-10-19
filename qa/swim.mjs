// The kit's swimmer (swim.ts: a follow-the-leader spine with a travelling
// wave, spec L-31) and the koi that uses it. The primitive must lay down the
// wave it is asked for: the tail's swing as set, the head nearly still, the
// body never stretching, and with the tail still the body lying exactly on
// the path its head took. Then a seeded koi soak with visitors dropping food
// and touching the fish: no world issues, most food eaten, never stuck on a
// pellet, and nothing on the fish ever jumping between frames.
//
//   npm run qa:swim
import { buildNodeModules } from './lib/prepare.mjs';
import { createReport } from './lib/report.mjs';
import { THRESHOLDS } from './thresholds.mjs';

await buildNodeModules();
const kit = await import('./.out/kit.mjs');
const { KoiWorld, MOTION } = await import('./.out/koi-world.mjs');
const T = THRESHOLDS.swim;
const report = createReport('swim');
const DT = 1 / 60;

// ---- The primitive, swimming straight at a full beat -------------------------------
{
  const shape = MOTION.WAVE;
  const L = 0.25;
  const n = 17;
  const body = kit.createSwimBody(L, n, 0, 0, 0);
  body.beat = 1;
  const high = Array.from({ length: n }, () => -Infinity);
  const low = Array.from({ length: n }, () => Infinity);
  let stretch = 0;
  for (let f = 0; f < 60 * 12; f++) {
    kit.stepSwimBody(body, shape, DT, 0.6 * L, 0, 1.0);
    if (f < 60 * 3) continue;
    body.spine.forEach((p, i) => {
      high[i] = Math.max(high[i], p.y / L);
      low[i] = Math.min(low[i], p.y / L);
    });
    for (let i = 1; i < n; i++) {
      const d = Math.hypot(body.spine[i].x - body.spine[i - 1].x, body.spine[i].y - body.spine[i - 1].y);
      stretch = Math.max(stretch, Math.abs(d / body.lengths[i - 1] - 1));
    }
  }
  const tail = (high[n - 1] - low[n - 1]) / 2;
  const head = (high[0] - low[0]) / 2;
  report.info('tail half-amplitude asked for, BL', shape.tailAmplitude);
  report.measure(
    'tail half-amplitude, relative error',
    +Math.abs(tail / shape.tailAmplitude - 1).toFixed(4),
    T.tailAmplitudeError,
  );
  report.measure("head's swing as a share of the tail's", +(head / tail).toFixed(4), T.headShare);
  report.measure('largest segment stretch (relative)', +stretch.toExponential(2), T.stretch);
}

// ---- With the tail still, the body lies on the head's path -----------------------------
{
  const L = 0.25;
  const body = kit.createSwimBody(L, 17, 0, 0, 0);
  body.beat = 0;
  const path = [];
  let heading = 0;
  let worst = 0;
  for (let f = 0; f < 60 * 8; f++) {
    // A wandering path: turning left, then right, then left again.
    heading += Math.sin(f / 70) * 1.4 * DT;
    kit.stepSwimBody(body, MOTION.WAVE, DT, 0.5 * L, heading, 1);
    path.push([body.x, body.y]);
    if (f < 60 * 2) continue;
    for (const p of body.spine) {
      let best = Infinity;
      for (let k = 1; k < path.length; k++) {
        const [ax, ay] = path[k - 1];
        const [bx, by] = path[k];
        const dx = bx - ax;
        const dy = by - ay;
        const t = Math.max(0, Math.min(1, ((p.x - ax) * dx + (p.y - ay) * dy) / (dx * dx + dy * dy || 1)));
        best = Math.min(best, Math.hypot(p.x - ax - dx * t, p.y - ay - dy * t));
      }
      worst = Math.max(worst, best / L);
    }
  }
  report.measure('tail still: furthest spine point off the head’s path, BL', +worst.toFixed(5), T.pathError);
}

// ---- The koi, ten minutes at each aspect, with visitors -------------------------------------
for (const aspect of [1.48, 0.91]) {
  const world = new KoiWorld(aspect, 11);
  let seed = 3;
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const issues = new Set();
  let dropped = 0;
  let eaten = 0;
  let startles = 0;
  let chasing = 0;
  let longest = 0;
  let prev = world.state;
  let jump = 0;
  const last = world.koi.spine.map((p) => [p.x, p.y]);
  const live = () => world.pellets.filter((p) => !p.eaten).length;
  for (let f = 0; f < 60 * 600; f++) {
    // A visitor: food every 12 s or so, a touch on the fish now and then.
    if (f % 700 === 350) {
      const before = live();
      world.tap(rnd() * aspect, rnd(), 0.01);
      dropped += Math.max(0, live() - before);
    }
    if (f % 2300 === 1200) {
      const p = world.koi.spine[4];
      world.tap(p.x, p.y, 0.01);
    }
    const was = live();
    world.step(DT);
    if (live() < was && world.state === 'gulp') eaten += was - live();
    if (world.state === 'startle' && prev !== 'startle') startles++;
    chasing = world.state === 'food' ? chasing + DT : 0;
    longest = Math.max(longest, chasing);
    prev = world.state;
    // How far any drawn spine point moved this frame, in body lengths: nothing may jump.
    world.koi.spine.forEach((p, i) => {
      jump = Math.max(jump, Math.hypot(p.x - last[i][0], p.y - last[i][1]) / world.koi.length);
      last[i][0] = p.x;
      last[i][1] = p.y;
    });
    if (f % 6 === 0) for (const issue of world.check()) issues.add(issue);
  }
  const tag = `koi at aspect ${aspect}`;
  report.info(`${tag}: pellets dropped, eaten; startles`, `${dropped + 2}, ${eaten}; ${startles}`);
  report.measure(`${tag}: world issues`, issues.size, T.koiIssues);
  report.measure(`${tag}: share of dropped food eaten`, +(eaten / (dropped + 2)).toFixed(3), T.koiFed);
  report.measure(`${tag}: longest chase without a mouthful, s`, +longest.toFixed(2), T.koiChase);
  report.measure(`${tag}: furthest any spine point moves in one frame, BL`, +jump.toFixed(3), T.koiJump);
  if (issues.size) console.log([...issues].join('\n'));
}

report.finish();
