// Frame-stepped soaks of the world at both aspects: left alone, tapped, and
// resized back and forth. Fails on any check() issue, a non-finite pose, a
// pad under the bank, a swimmer's body or limb over the bank, or a state
// that never ends.
//
//   npm run qa:soak [-- --minutes=N --aspect=1.48 --mode=idle|tap|resize --seed=7]
//
// Frogs on a pad or in the air are drawn over the bank: a toe of a frog on a
// pad may touch the grass (up to a limit), and a leap may pass over it. A
// swimmer is drawn under it, so none of it may.
import { buildNodeModules } from './lib/prepare.mjs';
import { createReport, flags } from './lib/report.mjs';
import { THRESHOLDS } from './thresholds.mjs';

await buildNodeModules();
const { FrogWorld } = await import('./.out/world.mjs');
const { shoreDistance } = await import('./.out/bank.mjs');
const T = THRESHOLDS.soak;
const opts = flags();

/** Body ellipses only (frogDistance's body term): which covered points are body rather than limb. */
const bodyDistance = (f, x, y) => {
  const scale = f.size * (1 + f.z * 0.35);
  const c = Math.cos(-f.bodyHeading);
  const s = Math.sin(-f.bodyHeading);
  const dx = (x - f.x) / scale;
  const dy = (y - f.y) / scale;
  const qx = (dx * c - dy * s) / f.bodyStretch;
  const qy = (dx * s + dy * c) * f.bodyStretch;
  const e = (px, py, rx, ry) => (Math.hypot(px / rx, py / ry) - 1) * Math.min(rx, ry);
  const bx = qx + f.lean;
  return Math.min(e(bx + 0.1, qy, 0.42, 0.28), e(bx - 0.26, qy, 0.28, 0.24));
};

export function soak(aspect, minutes, mode, seed = 7) {
  let s = seed >>> 0;
  const rnd = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
  const world = new FrogWorld(aspect, () => {}, 3);
  let asp = aspect;
  const dt = 1 / 60;
  const frames = Math.round(minutes * 3600);
  const issues = new Map();
  let nan = 0;
  let padUnder = 0;
  let minPadClear = Infinity;
  let swimmerBody = 0;
  let swimmerLimb = 0;
  let worstSwimmer = 0;
  let worstToe = 0;
  let worstAir = 0;
  let noFreeStage = 0;
  let hops = 0;
  const taps = {};
  const since = world.frogs.map(() => ({ state: '', t: 0 }));
  const longest = {};
  const prev = world.frogs.map((f) => ({ state: f.state, pad: f.pad }));
  let nextTap = 1;
  let nextPebble = 20;
  let nextResize = 30;

  for (let n = 0; n < frames; n++) {
    const t = n * dt;
    if (mode === 'tap' && t >= nextTap) {
      nextTap = t + 0.4 + rnd() * 1.6;
      const kind = rnd();
      let x;
      let y;
      if (kind < 0.35) {
        const f = world.frogs[Math.floor(rnd() * world.frogs.length)];
        x = f.x + (rnd() - 0.5) * f.size;
        y = f.y + (rnd() - 0.5) * f.size;
      } else if (kind < 0.65) {
        // Pads, often on the side away from the bank so they're pushed toward it.
        const p = world.pads[Math.floor(rnd() * world.pads.length)];
        const a = rnd() < 0.6 ? Math.atan2(p.y, p.x) : rnd() * Math.PI * 2;
        const r = p.radius * Math.sqrt(rnd()) * 0.95;
        x = p.x + Math.cos(a) * r;
        y = p.y + Math.sin(a) * r;
      } else if (kind < 0.85) {
        x = rnd() * asp;
        y = rnd();
      } else {
        for (let k = 0; k < 50; k++) {
          x = rnd() * asp;
          y = rnd();
          if (shoreDistance(x, y, asp) < 0) break;
        }
      }
      const result = world.tap(x, y, rnd() < 0.5 ? 0.01 : 0.022);
      taps[result] = (taps[result] ?? 0) + 1;
    }
    if (mode === 'tap' && t >= nextPebble) {
      nextPebble = t + 20;
      world.disturbCentre();
    }
    if (mode === 'resize' && t >= nextResize) {
      nextResize = t + 30;
      asp = asp === aspect ? 0.91 : aspect;
      world.resize(asp);
    }
    world.step(dt);
    if (n % 60 === 0) for (const issue of world.check()) issues.set(issue, (issues.get(issue) ?? 0) + 1);

    world.frogs.forEach((f, i) => {
      if (!Number.isFinite(f.x + f.y + f.heading + f.z + f.stretch + f.lean)) nan++;
      // A hop: from the crouch into the air, off a pad.
      if (prev[i].state === 'crouch' && f.state === 'air' && prev[i].pad >= 0) hops++;
      prev[i].state = f.state;
      prev[i].pad = f.pad;
      if (since[i].state !== f.state) since[i] = { state: f.state, t: 0 };
      since[i].t += dt;
      if (f.state !== 'sit') longest[f.state] = Math.max(longest[f.state] ?? 0, since[i].t);
      if (n % 3 !== 0) return;
      // Sample the drawn shape on a grid near the bank: body, limbs, or neither.
      const r = f.size * 1.6 * (1 + f.z * 0.35);
      if (shoreDistance(f.x, f.y, asp) > r) return;
      let body = 0;
      let limb = 0;
      for (let a = -10; a <= 10; a++)
        for (let b = -10; b <= 10; b++) {
          const x = f.x + (a / 10) * r;
          const y = f.y + (b / 10) * r;
          const sd = shoreDistance(x, y, asp);
          if (sd >= 0) continue;
          if (bodyDistance(f, x, y) <= 0) body = Math.max(body, -sd);
          else if (world.frogDistance(i, x, y) <= 0) limb = Math.max(limb, -sd);
        }
      if (f.state === 'air') worstAir = Math.max(worstAir, body, limb);
      else if (f.pad >= 0) worstToe = Math.max(worstToe, body, limb);
      else {
        if (body > 0.002) swimmerBody++;
        if (limb > 0.002) swimmerLimb++;
        worstSwimmer = Math.max(worstSwimmer, body, limb);
      }
    });
    world.pads.forEach((p) => {
      const clear = shoreDistance(p.x, p.y, asp) - p.radius * (1 + Math.abs(p.bob) * 0.03) * 1.024;
      minPadClear = Math.min(minPadClear, clear);
      if (clear < 0) padUnder++;
    });
    if (!world.pads.some((p, i) => i < 4 && p.occupant === -1)) noFreeStage++;
  }
  return {
    issues: Object.fromEntries(issues),
    nan,
    padUnder,
    minPadClear,
    swimmerBody,
    swimmerLimb,
    worstSwimmer,
    worstToe,
    worstAir,
    noFreeStage,
    longest,
    hopsPerFrogPerMinute: hops / world.frogs.length / minutes,
    taps,
  };
}

const report = createReport('soak');
const aspects = opts.aspect ? [Number(opts.aspect)] : T.aspects;
const modes = opts.mode ? [opts.mode] : ['idle', 'tap', 'resize'];
const minutesFor = { idle: T.idleMinutes, tap: T.tapMinutes, resize: T.resizeMinutes };
for (const aspect of aspects) {
  for (const mode of modes) {
    // Resizing already swaps between the two aspects: run it once.
    if (mode === 'resize' && !opts.aspect && aspect !== aspects[0]) continue;
    const minutes = Number(opts.minutes ?? minutesFor[mode]);
    const started = performance.now();
    const r = soak(aspect, minutes, mode, Number(opts.seed ?? 7));
    const tag = `${aspect} ${mode} ${minutes} min`;
    const issueCount = Object.values(r.issues).reduce((a, b) => a + b, 0);
    report.measure(`${tag}: check() issues`, issueCount, T.checkIssues);
    if (issueCount) console.log(`  ${tag} issues:`, r.issues);
    report.measure(`${tag}: frames with a non-finite pose`, r.nan, T.nanFrames);
    report.measure(`${tag}: pad-under-bank frames`, r.padUnder, T.padUnderBankFrames);
    report.measure(`${tag}: swimmer body over bank`, r.swimmerBody, T.swimmerOverBank);
    report.measure(`${tag}: swimmer limbs over bank`, r.swimmerLimb, T.swimmerOverBank);
    report.measure(`${tag}: toe on the grass (frog on a pad)`, +r.worstToe.toFixed(4), T.drawnOverToe);
    report.info(`${tag}: leaper over the grass (in the air, allowed)`, +r.worstAir.toFixed(4));
    const [state, seconds] = Object.entries(r.longest).sort((a, b) => b[1] - a[1])[0] ?? ['none', 0];
    report.measure(`${tag}: longest temporary state (${state})`, +seconds.toFixed(1), T.longestTemporaryState);
    report.info(`${tag}: closest pad rim to the bank`, +r.minPadClear.toFixed(4));
    report.info(`${tag}: frames with no free stage`, r.noFreeStage);
    report.info(`${tag}: pad jumps per frog per minute`, +r.hopsPerFrogPerMinute.toFixed(2));
    if (mode === 'tap') report.info(`${tag}: taps by result`, JSON.stringify(r.taps));
    report.info(`${tag}: ran in`, `${((performance.now() - started) / 1000).toFixed(1)} s`);
  }
}
report.finish();
