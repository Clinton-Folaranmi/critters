// Motion quality, frame-stepped: planted feet that slide, settling after a
// turn, turning on the spot in a fluid, straight strokes that aren't
// mirrored, curvature in a fluid, single-frame pose jumps and rotation
// spikes. The metrics are generic; the study (qa/lib/studies/<name>.mjs,
// the frog pond by default) says which feet are planted, what counts as a
// fluid and which channels are its pose.
//
//   npm run qa:motion [-- --minutes=N] [-- --study=frog]
import { createReport, flags } from './lib/report.mjs';
import { THRESHOLDS } from './thresholds.mjs';

const opts = flags();
// The study under test: qa/lib/studies/<name>.mjs (how to make its world, poke
// it and read its feet, pose channels and states). The metrics are the same
// for every study.
const study = (await import(`./lib/studies/${opts.study ?? 'frog'}.mjs`)).default;
await study.load();
const T = THRESHOLDS.motion;

function run(aspect, minutes, tapped, seed = 11) {
  let s = seed >>> 0;
  const rnd = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
  const world = study.create(aspect);
  const animals = study.animals(world);
  const dt = 1 / 60;
  const out = {
    fromPin: {}, // distance of each planted foot from its pin, per frame, by state (body lengths)
    slide: [], // path a planted foot travels on its surface, per planted stretch (body lengths)
    settle: 0, // largest foot travel in the second after a turn ends (body lengths)
    stillTurn: 0, // largest heading change on a frame the animal barely moved in a fluid (rad)
    mirror: 0, // largest left − right gap on a straight stroke
    curvature: [], // |Δheading| / distance in a fluid, per frame
    poseJump: {}, // largest single-frame change of any pose channel, by state
    spin: {}, // largest angular acceleration, by state (rad/s²)
  };
  const settling = animals.map(() => ({ frames: 0, start: null }));
  const stretches = animals.map(() => Array.from({ length: study.feet }, () => null));
  /** Frames since each animal last steered (mirroring is judged a second into straight motion). */
  const straightFor = animals.map(() => 0);
  const prev = animals.map((f) => ({ ...f, rate: 0 }));
  let nextTap = 1;
  for (let n = 0; n < minutes * 3600; n++) {
    const t = n * dt;
    if (tapped && t >= nextTap) {
      nextTap = t + 0.4 + rnd() * 1.6;
      study.tap(world, rnd, aspect);
    }
    world.step(dt);
    animals.forEach((f, i) => {
      const p = prev[i];
      // Planted feet: how far is each from its pin? (A leg is re-aimed at its
      // pin every frame; past a compact reach the foot gives rather than the
      // leg straightening.) And how far does it travel on its surface while it
      // stays pinned (the slide a viewer sees), summed over each planted stretch?
      for (let k = 0; k < study.feet; k++) {
        const current = stretches[i][k];
        const foot = study.planted(world, i, k);
        if (!foot) {
          if (current) out.slide.push(current.path);
          stretches[i][k] = null;
          continue;
        }
        const { pin, key, here } = foot;
        (out.fromPin[f.state] ??= []).push(Math.hypot(here[0] - pin[0], here[1] - pin[1]) / f.size);
        if (!current || current.key !== key) {
          if (current) out.slide.push(current.path);
          stretches[i][k] = { key, last: here, path: 0 };
        } else {
          current.path += Math.hypot(here[0] - current.last[0], here[1] - current.last[1]) / f.size;
          current.last = here;
        }
      }
      // The second after a turn ends: the feet should be still.
      if (study.settleStarts(p, f)) {
        settling[i] = { frames: 60, start: study.footPositions(world, i) };
      } else if (settling[i].frames > 0) {
        if (!study.settleContinues(f)) settling[i].frames = 0;
        else if (--settling[i].frames === 0) {
          const moved = study
            .footPositions(world, i)
            .map((now, k) => Math.hypot(now[0] - settling[i].start[k][0], now[1] - settling[i].start[k][1]) / f.size);
          out.settle = Math.max(out.settle, ...moved);
        }
      }
      // In a fluid: heading changes only while moving, along a curve; straight strokes mirrored.
      const turn = Math.abs(Math.atan2(Math.sin(f.heading - p.heading), Math.cos(f.heading - p.heading)));
      if (study.inFluid(p, f)) {
        const moved = Math.hypot(f.x - p.x, f.y - p.y);
        if (moved < 1e-4) out.stillTurn = Math.max(out.stillTurn, turn);
        else if (moved > 2e-4) out.curvature.push(turn / moved);
        straightFor[i] = study.straight(f) ? straightFor[i] + 1 : 0;
        if (study.mirrored(f) && straightFor[i] > 60) out.mirror = Math.max(out.mirror, study.mirrorGap(f));
      }
      // Pose channels and rotation, by the state the frame ended in.
      if (p.state === f.state) {
        const jump = Math.max(...study.poseChannels.map((c) => Math.abs(f[c] - p[c])));
        out.poseJump[f.state] = Math.max(out.poseJump[f.state] ?? 0, jump);
      }
      const rate = Math.atan2(Math.sin(f.heading - p.heading), Math.cos(f.heading - p.heading)) / dt;
      const accel = Math.abs(rate - p.rate) / dt;
      if (n > 0) out.spin[f.state] = Math.max(out.spin[f.state] ?? 0, accel);
      prev[i] = { ...f, rate };
    });
  }
  for (const row of stretches) for (const current of row) if (current) out.slide.push(current.path);
  out.slide.sort((a, b) => a - b);
  out.curvature.sort((a, b) => a - b);
  for (const list of Object.values(out.fromPin)) list.sort((a, b) => a - b);
  return out;
}

const report = createReport('motion');
for (const aspect of THRESHOLDS.soak.aspects) {
  for (const tapped of [false, true]) {
    const minutes = Number(opts.minutes ?? (tapped ? THRESHOLDS.soak.tapMinutes : THRESHOLDS.soak.idleMinutes));
    const r = run(aspect, minutes, tapped);
    const tag = `${aspect} ${tapped ? 'tapped' : 'untouched'} ${minutes} min`;
    const slide = (p) => +r.slide[Math.min(r.slide.length - 1, Math.floor(p * r.slide.length))].toFixed(3);
    report.measure(`${tag}: planted foot slide per stretch, 95th percentile`, slide(0.95), T.plantedSlideP95);
    report.info(
      `${tag}: planted foot slide per stretch, median / largest (${r.slide.length} stretches)`,
      `${slide(0.5)} / ${slide(1)}`,
    );
    for (const [state, list] of Object.entries(r.fromPin).sort()) {
      const q = (p) => +list[Math.min(list.length - 1, Math.floor(p * list.length))].toFixed(3);
      report.measure(`${tag}: planted foot from its pin, ${state}, median`, q(0.5), T.plantedFoot.median);
      report.measure(
        `${tag}: planted foot from its pin, ${state}, 95th percentile`,
        q(0.95),
        T.plantedFoot[state]?.p95 ?? T.plantedFoot.p95,
      );
      report.info(`${tag}: planted foot from its pin, ${state}, largest`, q(1));
    }
    report.measure(`${tag}: foot travel in the second after a turn`, +r.settle.toFixed(4), T.settleSlide);
    report.measure(`${tag}: turning while still ${study.fluidLabel}`, +r.stillTurn.toFixed(5), T.turnWhileStill);
    report.measure(`${tag}: ${study.mirrorLabel}`, +r.mirror.toFixed(4), T.mirroring);
    const p99 = r.curvature[Math.floor(r.curvature.length * 0.99)] ?? 0;
    report.measure(`${tag}: curvature ${study.fluidLabel}, 99th percentile`, +p99.toFixed(1), T.curvatureP99);
    for (const [state, value] of Object.entries(r.poseJump).sort()) {
      const limit = T.poseJump[state] ?? T.poseJump.other;
      report.measure(`${tag}: largest one-frame pose change, ${state}`, +value.toFixed(3), limit);
    }
    for (const [state, value] of Object.entries(r.spin).sort()) {
      report.measure(`${tag}: largest angular acceleration, ${state}`, Math.round(value), T.angularAcceleration);
    }
  }
}
report.finish();
