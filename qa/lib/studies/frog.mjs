// The frog pond, as the generic Node checks see a study (qa/motion.mjs): how
// to make its world, poke it, and read what the checks measure. A new study
// adds a file like this one; the checks themselves stay the same.
import { buildNodeModules } from '../prepare.mjs';

const CAPSULES = 10;
/** The frog's feet, in the order of Frog.anchors: [name, side, fore]. */
const FEET = [
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

/** Body ellipses only (frogDistance's body term): which covered points are body rather than limb. */
function bodyDistance(f, x, y) {
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
}

const settled = (f) => f.pad >= 0 && (f.state === 'sit' || f.state === 'turn' || f.state === 'crouch');

export default {
  name: 'frog pond',
  async load() {
    await buildNodeModules();
    const { FrogWorld } = await import('../../.out/world.mjs');
    const { pictureDistance, pictureEdge } = await import('../../.out/bank.mjs');
    this.World = FrogWorld;
    this.pictureDistance = pictureDistance;
    this.pictureEdge = pictureEdge;
  },
  create(aspect) {
    return new this.World(aspect, () => {}, 3);
  },
  animals: (world) => world.frogs,
  /** One random tap: on a frog 40 % of the time, anywhere otherwise (a mouse-sized target). */
  tap(world, rnd, aspect) {
    const f = world.frogs[Math.floor(rnd() * 3)];
    if (rnd() < 0.4) world.tap(f.x + (rnd() - 0.5) * f.size, f.y + (rnd() - 0.5) * f.size, 0.022);
    else world.tap(rnd() * aspect, rnd(), 0.01);
  },
  feet: FEET.length,
  /**
   * Foot k of animal i if it is planted (pinned fully, not mid-step, on the
   * frog's own pad): its pin and where it is now, in the surface's frame, and
   * a key that changes when it is re-pinned. Otherwise null.
   */
  planted(world, i, k) {
    const f = world.frogs[i];
    const a = f.anchors[k];
    if (!settled(f) || a.pad !== f.pad || a.w < 0.999 || a.phase % 2 !== 0) return null;
    const [, side, fore] = FEET[k];
    return {
      pin: [a.x, a.y],
      key: `${a.x},${a.y},${a.phase}`,
      here: footOnPad(world, i, side, fore, world.pads[f.pad]),
    };
  },
  /** Every foot of animal i in its surface's frame (for settling after a turn). */
  footPositions: (world, i) =>
    FEET.map(([, side, fore]) => footOnPad(world, i, side, fore, world.pads[world.frogs[i].pad])),
  /** The second after an on-pad turn ends, the feet should be still. */
  settleStarts: (prev, f) => prev.state === 'turn' && f.state === 'sit' && f.pad >= 0,
  settleContinues: (f) => f.state === 'sit' && f.pad >= 0,
  /** Frames in a fluid, where heading may only change while moving, along a curve. */
  inFluid: (prev, f) => (f.state === 'swim' || f.state === 'dive') && prev.state === f.state,
  fluidLabel: 'in water',
  /** Straight strokes must be mirrored: a frame of straight swimming and the left−right gap. */
  straight: (f) => f.steer === 0,
  mirrored: (f) => f.state === 'swim',
  mirrorGap: (f) => Math.abs(f.hindL - f.hindR),
  mirrorLabel: 'straight strokes, hind left − right',
  /** The pose channels whose one-frame change is limited. */
  poseChannels: ['hindL', 'hindR', 'foreL', 'foreR', 'webL', 'webR', 'stretch', 'lean'],

  // ---- Soaks (qa/soak.mjs) ----------------------------------------------------

  /** The state an animal rests in; any other state is temporary and must end (H-6). */
  restState: 'sit',
  /** Whether an animal's pose is made of finite numbers. */
  finite: (f) => Number.isFinite(f.x + f.y + f.heading + f.z + f.stretch + f.lean),
  /**
   * One random soak tap: on a frog, on a pad (often on its side toward the
   * middle, so it is pushed out toward the edge), anywhere, or in the outer
   * band of the picture where the edge pads float; a mouse or a finger.
   * Returns what the world says it hit.
   */
  soakTap(world, rnd, asp) {
    const kind = rnd();
    let x;
    let y;
    if (kind < 0.35) {
      const f = world.frogs[Math.floor(rnd() * world.frogs.length)];
      x = f.x + (rnd() - 0.5) * f.size;
      y = f.y + (rnd() - 0.5) * f.size;
    } else if (kind < 0.65) {
      const p = world.pads[Math.floor(rnd() * world.pads.length)];
      const a = rnd() < 0.6 ? Math.atan2(0.5 - p.y, asp / 2 - p.x) : rnd() * Math.PI * 2;
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
        const edge = this.pictureEdge(x, y, asp);
        if (edge > 0.8 && edge < 1) break;
      }
    }
    return world.tap(x, y, rnd() < 0.5 ? 0.01 : 0.022);
  },
  /** The keyboard's central action (a pebble). */
  disturb: (world) => world.disturbCentre(),

  /** The pond's own soak measurements: pads and drawn parts against the swimmers' outline and the drawn picture, stages, hops. */
  soakStart(world) {
    return {
      padUnder: 0,
      minPadClear: Infinity,
      swimmerBody: 0,
      swimmerLimb: 0,
      worstSwimmer: 0,
      worstToe: 0,
      worstAir: 0,
      noFreeStage: 0,
      hops: 0,
      prev: world.frogs.map((f) => ({ state: f.state, pad: f.pad })),
    };
  },
  soakAnimal(acc, world, f, i, n, asp) {
    // Signed distance inside the swimmers' outline (world units, negative beyond it).
    const inside = this.pictureDistance;
    // A hop: from the crouch into the air, off a pad.
    if (acc.prev[i].state === 'crouch' && f.state === 'air' && acc.prev[i].pad >= 0) acc.hops++;
    acc.prev[i].state = f.state;
    acc.prev[i].pad = f.pad;
    if (n % 3 !== 0) return;
    // Sample the drawn shape on a grid near the swimmers' outline: body,
    // limbs, or neither. No part of a swimmer may go past it; a toe of a frog
    // on a pad may (up to a limit), and a leap's reach is reported.
    const r = f.size * 1.6 * (1 + f.z * 0.35);
    if (inside(f.x, f.y, asp) > r) return;
    let body = 0;
    let limb = 0;
    for (let a = -10; a <= 10; a++)
      for (let b = -10; b <= 10; b++) {
        const x = f.x + (a / 10) * r;
        const y = f.y + (b / 10) * r;
        const sd = inside(x, y, asp);
        if (sd >= 0) continue;
        if (bodyDistance(f, x, y) <= 0) body = Math.max(body, -sd);
        else if (world.frogDistance(i, x, y) <= 0) limb = Math.max(limb, -sd);
      }
    if (f.state === 'air') acc.worstAir = Math.max(acc.worstAir, body, limb);
    else if (f.pad >= 0) acc.worstToe = Math.max(acc.worstToe, body, limb);
    else {
      if (body > 0.002) acc.swimmerBody++;
      if (limb > 0.002) acc.swimmerLimb++;
      acc.worstSwimmer = Math.max(acc.worstSwimmer, body, limb);
    }
  },
  soakFrame(acc, world, asp) {
    // A pad drifted wholly out of the picture (no part of it inside the drawn
    // picture) when its home keeps part of it in: drift has lost it. Also how
    // far out past its home any pad has drifted.
    const seen = (x, y, radius) => {
      for (let k = 0; k < 16; k++) {
        const a = (k / 16) * Math.PI * 2;
        if (this.pictureEdge(x + Math.cos(a) * radius, y + Math.sin(a) * radius, asp) < 1) return true;
      }
      return this.pictureEdge(x, y, asp) < 1;
    };
    world.pads.forEach((p) => {
      const out = this.pictureDistance(p.homeX, p.homeY, asp) - this.pictureDistance(p.x, p.y, asp);
      acc.minPadClear = Math.min(acc.minPadClear, -out);
      if (!seen(p.x, p.y, p.radius) && seen(p.homeX, p.homeY, p.radius)) acc.padUnder++;
    });
    if (!world.pads.some((p, i) => i < 4 && p.occupant === -1)) acc.noFreeStage++;
  },
  soakReport(report, tag, acc, T) {
    report.measure(`${tag}: pad drifted out of the picture, frames`, acc.padUnder, T.padOutOfPictureFrames);
    report.measure(`${tag}: swimmer body past the swimmers' outline`, acc.swimmerBody, T.swimmerPastOutline);
    report.measure(`${tag}: swimmer limbs past the swimmers' outline`, acc.swimmerLimb, T.swimmerPastOutline);
    report.measure(
      `${tag}: toe past the swimmers' outline (frog on a pad)`,
      +acc.worstToe.toFixed(4),
      T.toePastOutline,
    );
    report.info(`${tag}: leaper past the swimmers' outline (in the air, allowed)`, +acc.worstAir.toFixed(4));
  },
  soakNotes(report, tag, acc, world, minutes) {
    report.info(`${tag}: furthest a pad drifted outward of its home`, +(-acc.minPadClear).toFixed(4));
    report.info(`${tag}: frames with no free stage`, acc.noFreeStage);
    report.info(`${tag}: pad jumps per frog per minute`, +(acc.hops / world.frogs.length / minutes).toFixed(2));
  },
};
