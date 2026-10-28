// Frame-stepped soaks of the world at both aspects: left alone, tapped, and
// resized back and forth. Fails on any check() issue, a non-finite pose or a
// temporary state that never ends (H-6), and on whatever the study adds: the
// frog pond (qa/lib/studies/frog.mjs) checks pads drifted out of the
// picture, a swimmer's body or limbs past the picture's outline, and toes
// past it.
//
//   npm run qa:soak [-- --minutes=N --aspect=1.48 --mode=idle|tap|resize --seed=7 --study=frog]
import { createReport, flags } from './lib/report.mjs';
import { THRESHOLDS } from './thresholds.mjs';

const T = THRESHOLDS.soak;
const opts = flags();
const study = (await import(`./lib/studies/${opts.study ?? 'frog'}.mjs`)).default;
await study.load();

export function soak(aspect, minutes, mode, seed = 7) {
  let s = seed >>> 0;
  const rnd = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
  const world = study.create(aspect);
  const animals = study.animals(world);
  let asp = aspect;
  const dt = 1 / 60;
  const frames = Math.round(minutes * 3600);
  const issues = new Map();
  let nan = 0;
  const taps = {};
  const since = animals.map(() => ({ state: '', t: 0 }));
  const longest = {};
  const own = study.soakStart(world);
  let nextTap = 1;
  let nextPebble = 20;
  let nextResize = 30;

  for (let n = 0; n < frames; n++) {
    const t = n * dt;
    if (mode === 'tap' && t >= nextTap) {
      nextTap = t + 0.4 + rnd() * 1.6;
      const result = study.soakTap(world, rnd, asp);
      taps[result] = (taps[result] ?? 0) + 1;
    }
    if (mode === 'tap' && t >= nextPebble) {
      nextPebble = t + 20;
      study.disturb(world);
    }
    if (mode === 'resize' && t >= nextResize) {
      nextResize = t + 30;
      asp = asp === aspect ? 0.91 : aspect;
      world.resize(asp);
    }
    world.step(dt);
    if (n % 60 === 0) for (const issue of world.check()) issues.set(issue, (issues.get(issue) ?? 0) + 1);

    animals.forEach((f, i) => {
      if (!study.finite(f)) nan++;
      if (since[i].state !== f.state) since[i] = { state: f.state, t: 0 };
      since[i].t += dt;
      if (f.state !== study.restState) longest[f.state] = Math.max(longest[f.state] ?? 0, since[i].t);
      study.soakAnimal(own, world, f, i, n, asp);
    });
    study.soakFrame(own, world, asp);
  }
  return { issues: Object.fromEntries(issues), nan, longest, taps, own, world };
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
    study.soakReport(report, tag, r.own, T, r.world, minutes);
    const [state, seconds] = Object.entries(r.longest).sort((a, b) => b[1] - a[1])[0] ?? ['none', 0];
    report.measure(`${tag}: longest temporary state (${state})`, +seconds.toFixed(1), T.longestTemporaryState);
    study.soakNotes(report, tag, r.own, r.world, minutes);
    if (mode === 'tap') report.info(`${tag}: taps by result`, JSON.stringify(r.taps));
    report.info(`${tag}: ran in`, `${((performance.now() - started) / 1000).toFixed(1)} s`);
  }
}
report.finish();
