// The cockroach Specimen, as the generic Node checks see it (qa/motion.mjs,
// qa/soak.mjs): one animal on a plain floor, six feet pinned to the floor
// (the surface is the world itself), walking and running rather than
// swimming. Rows that only mean something in a fluid (mirrored strokes) are
// labelled as not applying; curvature and turning while still are measured
// while walking or running, where heading may change only with distance
// (P-4 on the ground, cockroach-world.ts).
import { buildNodeModules } from '../prepare.mjs';

/** Capsules per leg (femur, tibia, tarsus); the tarsus tip is the foot. */
const LEG_SEGMENTS = 3;

/** The tip of leg k's tarsus in world units, from the capsules the renderers draw. */
function footTip(world, k) {
  const r = world.roach;
  const o = (k * LEG_SEGMENTS + LEG_SEGMENTS - 1) * 4;
  const lx = world.capsules[o + 2];
  const ly = world.capsules[o + 3];
  const c = Math.cos(r.bodyHeading);
  const s = Math.sin(r.bodyHeading);
  return [r.x + (lx * c - ly * s) * r.size, r.y + (lx * s + ly * c) * r.size];
}

const moving = (f) => f.state === 'walk' || f.state === 'flee';
/** Stopped with every foot down: from here the feet should not move. */
const settled = (f) =>
  (f.state === 'rest' || f.state === 'feed') && f.speed === 0 && f.feet.every((foot) => foot.planted);

export default {
  name: 'cockroach',
  async load() {
    await buildNodeModules();
    const { CockroachWorld, PICTURE } = await import('../../.out/cockroach-world.mjs');
    this.World = CockroachWorld;
    this.picture = PICTURE;
  },
  create(aspect) {
    this.wasSettled = false;
    return new this.World(aspect, 5);
  },
  animals: (world) => [world.roach],
  /** One random tap: on the cockroach 40 % of the time, anywhere otherwise (a mouse-sized target). */
  tap(world, rnd, aspect) {
    const r = world.roach;
    if (rnd() < 0.4) world.tap(r.x + (rnd() - 0.5) * r.size, r.y + (rnd() - 0.5) * r.size, 0.012);
    else world.tap(rnd() * aspect, rnd(), 0.012);
  },
  feet: 6,
  /**
   * Foot k if it is planted (pinned to the floor, not stepping): its pin, the
   * tarsus tip as drawn, and a key that changes at each touch-down.
   */
  planted(world, i, k) {
    const foot = world.roach.feet[k];
    if (!foot.planted) return null;
    return { pin: [foot.x, foot.y], key: foot.stance, here: footTip(world, k) };
  },
  footPositions: (world) => world.roach.feet.map((_, k) => footTip(world, k)),
  /**
   * The second after it comes to a stop with every foot down, the feet should
   * be still. (The previous frame's copy shares the feet array, so whether it
   * was settled is remembered here.)
   */
  wasSettled: false,
  settleStarts(prev, f) {
    const now = settled(f);
    const starts = now && !this.wasSettled;
    this.wasSettled = now;
    return starts;
  },
  settleContinues: (f) => settled(f),
  /** Frames where heading may change only with distance, along a curve: walking and running. */
  inFluid: (prev, f) => moving(f) && prev.state === f.state,
  fluidLabel: 'walking or running',
  /** No mirrored strokes on the ground (the tripod alternates): nothing to measure. */
  straight: () => false,
  mirrored: () => false,
  mirrorGap: () => 0,
  mirrorLabel: 'mirrored strokes (none on the ground; not measured)',
  /** The drawn pose channels the world eases (legs are solved from the feet, measured above). */
  poseChannels: ['antennaAim'],

  // ---- Soaks (qa/soak.mjs) ----------------------------------------------------

  restState: 'rest',
  finite: (f) =>
    Number.isFinite(f.x + f.y + f.heading + f.bodyHeading + f.speed) &&
    f.feet.every((foot) => Number.isFinite(foot.x + foot.y)),
  /** One random soak tap: on the cockroach (its body, a leg or an antenna), on the floor, or anywhere; a mouse or a finger. */
  soakTap(world, rnd, asp) {
    const r = world.roach;
    const kind = rnd();
    let x;
    let y;
    if (kind < 0.35) {
      x = r.x + (rnd() - 0.5) * r.size * 1.4;
      y = r.y + (rnd() - 0.5) * r.size * 1.4;
    } else {
      x = rnd() * asp;
      y = rnd();
    }
    return world.tap(x, y, rnd() < 0.5 ? 0.012 : 0.022);
  },
  /** The keyboard's central action (a crumb in the middle). */
  disturb: (world) => world.disturbCentre(),

  /** The Specimen's own soak measurements: reflex steps, crumbs eaten, escapes, feet past the picture's edge. */
  soakStart(world) {
    return { reflex: 0, eaten: 0, flees: 0, footOutside: 0, prevState: world.roach.state, prevCrumb: -1 };
  },
  soakAnimal(acc, world, f) {
    if (f.state === 'flee' && acc.prevState !== 'flee') acc.flees++;
    if (acc.prevState === 'feed' && f.state !== 'feed') acc.eaten++;
    acc.prevState = f.state;
    for (const foot of f.feet) if (foot.reflex === 0) acc.reflex++;
    // How far past the picture's soft edge a foot is drawn (the body is kept inside).
    for (let k = 0; k < f.feet.length; k++) {
      const [x, y] = footTip(world, k);
      acc.footOutside = Math.max(acc.footOutside, this.picture.distance(x, y, world.aspect) - 1);
    }
  },
  soakFrame() {},
  soakReport() {},
  soakNotes(report, tag, acc, world, minutes) {
    report.info(`${tag}: reflex steps per minute (C-5)`, +(acc.reflex / minutes).toFixed(1));
    report.info(`${tag}: crumbs finished, escapes`, `${acc.eaten}, ${acc.flees}`);
    report.info(
      `${tag}: furthest foot past the picture's edge (region units)`,
      +Math.max(0, acc.footOutside).toFixed(3),
    );
  },
};
