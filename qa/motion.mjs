// Motion quality, frame-stepped: planted feet that slide, settling after a
// turn, turning on the spot in water, straight strokes that aren't mirrored,
// curvature in water, single-frame pose jumps and rotation spikes.
//
//   npm run qa:motion [-- --minutes=N]
import { buildNodeModules } from './lib/prepare.mjs';
import { createReport, flags } from './lib/report.mjs';
import { THRESHOLDS } from './thresholds.mjs';

await buildNodeModules();
const { FrogWorld } = await import('./.out/world.mjs');
const T = THRESHOLDS.motion;
const opts = flags();
const CAPSULES = 10;
const LIMBS = [
  ['hind left', 1, false],
  ['hind right', -1, false],
  ['fore left', 1, true],
  ['fore right', -1, true],
];

/** A foot's position (ankle or wrist) in its pad's frame, as the world's footOnPad() computes it. */
function footOnPad(world, index, side, fore, pad) {
  const frog = world.frogs[index];
  const k = (side === 1 ? 0 : 5) + (fore ? 4 : 2);
  const o = (index * CAPSULES + k) * 4;
  const scale = frog.size * (1 + frog.z * 0.35);
  const lx = world.capsules[o + 2] * frog.bodyStretch * scale;
  const ly = (world.capsules[o + 3] / frog.bodyStretch) * scale;
  const c = Math.cos(frog.bodyHeading);
  const s = Math.sin(frog.bodyHeading);
  const wx = frog.x + lx * c - ly * s - pad.x;
  const wy = frog.y + lx * s + ly * c - pad.y;
  const pc = Math.cos(-pad.angle);
  const ps = Math.sin(-pad.angle);
  return [wx * pc - wy * ps, wx * ps + wy * pc];
}

function run(aspect, minutes, tapped, seed = 11) {
  let s = seed >>> 0;
  const rnd = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
  const world = new FrogWorld(aspect, () => {}, 3);
  const dt = 1 / 60;
  const out = {
    fromPin: {}, // distance of each planted foot from its pin, per frame, by state (body lengths)
    slide: [], // path a planted foot travels on the leaf, per planted stretch (body lengths)
    settle: 0, // largest foot travel in the second after a turn ends (body lengths)
    stillTurn: 0, // largest heading change on a frame a swimmer barely moved (rad)
    mirror: 0, // largest |left − right| of hind extension on a straight stroke
    curvature: [], // |Δheading| / distance while swimming, per frame
    poseJump: {}, // largest single-frame change of any pose channel, by state
    spin: {}, // largest angular acceleration, by state (rad/s²)
  };
  const settling = world.frogs.map(() => ({ frames: 0, start: null }));
  const stretches = world.frogs.map(() => LIMBS.map(() => null));
  /** Frames since each frog's stroke last steered (mirroring is judged a second into straight swimming). */
  const straightFor = world.frogs.map(() => 0);
  const prev = world.frogs.map((f) => ({ ...f, rate: 0 }));
  let nextTap = 1;
  for (let n = 0; n < minutes * 3600; n++) {
    const t = n * dt;
    if (tapped && t >= nextTap) {
      nextTap = t + 0.4 + rnd() * 1.6;
      const f = world.frogs[Math.floor(rnd() * 3)];
      if (rnd() < 0.4) world.tap(f.x + (rnd() - 0.5) * f.size, f.y + (rnd() - 0.5) * f.size, 0.022);
      else world.tap(rnd() * aspect, rnd(), 0.01);
    }
    world.step(dt);
    world.frogs.forEach((f, i) => {
      const p = prev[i];
      const onPad = f.pad >= 0 && (f.state === 'sit' || f.state === 'turn' || f.state === 'crouch');
      // Planted feet: pinned fully, not mid-step, on the frog's own pad. How
      // far is each from its pin? (pose() re-aims the leg at the pin; past a
      // compact reach the foot gives rather than the leg straightening.)
      // And how far does it travel on the leaf while it stays pinned (the
      // slide a viewer sees), summed over each planted stretch?
      f.anchors.forEach((a, k) => {
        const current = stretches[i][k];
        if (!onPad || a.pad !== f.pad || a.w < 0.999 || a.phase % 2 !== 0) {
          if (current) out.slide.push(current.path);
          stretches[i][k] = null;
          return;
        }
        const [, side, fore] = LIMBS[k];
        const here = footOnPad(world, i, side, fore, world.pads[f.pad]);
        (out.fromPin[f.state] ??= []).push(Math.hypot(here[0] - a.x, here[1] - a.y) / f.size);
        const key = `${a.x},${a.y},${a.phase}`;
        if (!current || current.key !== key) {
          if (current) out.slide.push(current.path);
          stretches[i][k] = { key, last: here, path: 0 };
        } else {
          current.path += Math.hypot(here[0] - current.last[0], here[1] - current.last[1]) / f.size;
          current.last = here;
        }
      });
      // The second after a turn on the pad ends: the feet should be still.
      if (p.state === 'turn' && f.state === 'sit' && f.pad >= 0) {
        settling[i] = {
          frames: 60,
          start: LIMBS.map(([, side, fore]) => footOnPad(world, i, side, fore, world.pads[f.pad])),
        };
      } else if (settling[i].frames > 0) {
        if (f.state !== 'sit' || f.pad < 0) settling[i].frames = 0;
        else if (--settling[i].frames === 0) {
          const moved = LIMBS.map(([, side, fore], k) => {
            const now = footOnPad(world, i, side, fore, world.pads[f.pad]);
            return Math.hypot(now[0] - settling[i].start[k][0], now[1] - settling[i].start[k][1]) / f.size;
          });
          out.settle = Math.max(out.settle, ...moved);
        }
      }
      // In water: heading changes only while moving, along a curve; straight strokes mirrored.
      const turn = Math.abs(Math.atan2(Math.sin(f.heading - p.heading), Math.cos(f.heading - p.heading)));
      if ((f.state === 'swim' || f.state === 'dive') && p.state === f.state) {
        const moved = Math.hypot(f.x - p.x, f.y - p.y);
        if (moved < 1e-4) out.stillTurn = Math.max(out.stillTurn, turn);
        else if (moved > 2e-4) out.curvature.push(turn / moved);
        straightFor[i] = f.steer === 0 ? straightFor[i] + 1 : 0;
        if (f.state === 'swim' && straightFor[i] > 60) out.mirror = Math.max(out.mirror, Math.abs(f.hindL - f.hindR));
      }
      // Pose channels and rotation, by the state the frame ended in.
      if (p.state === f.state) {
        const jump = Math.max(
          ...['hindL', 'hindR', 'foreL', 'foreR', 'webL', 'webR', 'stretch', 'lean'].map((c) => Math.abs(f[c] - p[c])),
        );
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
    report.measure(`${tag}: turning while still in water`, +r.stillTurn.toFixed(5), T.turnWhileStill);
    report.measure(`${tag}: straight strokes, hind left − right`, +r.mirror.toFixed(4), T.mirroring);
    const p99 = r.curvature[Math.floor(r.curvature.length * 0.99)] ?? 0;
    report.measure(`${tag}: curvature in water, 99th percentile`, +p99.toFixed(1), T.curvatureP99);
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
