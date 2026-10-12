// The golden replay: proof that moving code into the kit changed no motion
// (docs/CRITTER_KIT_PLAN.md, step 0). Steps the frog world through fixed,
// seeded sessions and hashes its whole state once a second; a run must match
// qa/tools/golden.json bit for bit. Moving a function without reordering its
// arithmetic keeps floating point identical, so any difference is a real
// change in behaviour.
//
//   node qa/tools/golden.mjs            compare with qa/tools/golden.json (exit 1 on any difference)
//   node qa/tools/golden.mjs --write    record a new baseline (only when a change is meant to alter motion)
//
// The hash covers every own field of the world, its frogs, pads, flies and
// motes, and the capsule buffer (functions skipped, keys sorted). If an
// extraction renames or reshapes a field without changing any value, map it
// back in `normalise()` rather than re-recording the baseline.
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { buildNodeModules } from '../lib/prepare.mjs';

const BASELINE = 'qa/tools/golden.json';
const DT = 1 / 60;

await buildNodeModules();
const { FrogWorld } = await import('../.out/world.mjs');

/** The session plans: untouched at both aspects, tapped, and resizing. */
const SESSIONS = [
  { name: 'untouched 1.48', aspect: 1.48, minutes: 10 },
  { name: 'untouched 0.91', aspect: 0.91, minutes: 10 },
  { name: 'tapped 1.48', aspect: 1.48, minutes: 5, taps: true },
  { name: 'resizing', aspect: 1.48, minutes: 3, resize: true },
];

/** Hook for field renames during the extraction; identity until one is needed. */
const normalise = (world) => world;

/** Feeds every number, string and boolean reachable from `value` into the hash, in a fixed order. */
function feed(hash, value, seen) {
  if (value === null || value === undefined) return hash.update('_');
  const type = typeof value;
  if (type === 'number') {
    const bytes = Buffer.alloc(8);
    bytes.writeDoubleLE(value);
    return hash.update(bytes);
  }
  if (type === 'string' || type === 'boolean') return hash.update(`${type}:${value};`);
  if (type === 'function') return;
  if (ArrayBuffer.isView(value)) return hash.update(Buffer.from(value.buffer, value.byteOffset, value.byteLength));
  if (seen.has(value)) return hash.update('↺');
  seen.add(value);
  if (Array.isArray(value)) {
    hash.update(`[${value.length}`);
    for (const item of value) feed(hash, item, seen);
    return hash.update(']');
  }
  for (const key of Object.keys(value).sort()) {
    if (typeof value[key] === 'function') continue;
    hash.update(`${key}=`);
    feed(hash, value[key], seen);
  }
}

const digest = (world) => {
  const hash = createHash('sha256');
  feed(hash, normalise(world), new WeakSet());
  return hash.digest('hex').slice(0, 16);
};

function run({ aspect, minutes, taps, resize }) {
  let s = 7;
  const rnd = () => (s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296;
  const ripples = [];
  const world = new FrogWorld(aspect, (x, y, strength) => ripples.push(x, y, strength), 3);
  const seconds = [];
  let nextTap = 1;
  let nextResize = 2;
  let wide = true;
  for (let n = 1; n <= minutes * 3600; n++) {
    const t = n * DT;
    if (taps && t >= nextTap) {
      nextTap = t + 0.4 + rnd() * 1.6;
      const f = world.frogs[Math.floor(rnd() * world.frogs.length)];
      const roll = rnd();
      if (roll < 0.4) world.tap(f.x + (rnd() - 0.5) * f.size, f.y + (rnd() - 0.5) * f.size, 0.022);
      else if (roll < 0.9) world.tap(rnd() * world.aspect, rnd(), 0.01, rnd() < 0.2);
      else world.disturbCentre();
    }
    if (resize && t >= nextResize) {
      nextResize = t + 1.5 + rnd() * 3;
      wide = !wide;
      world.resize(wide ? 1.48 : 0.91 + rnd() * 0.2);
    }
    world.step(DT);
    if (n % 60 === 0) {
      // The ripples the world emitted this second are part of its behaviour too.
      world.__goldenRipples = ripples.splice(0);
      seconds.push(digest(world));
      delete world.__goldenRipples;
    }
  }
  const all = createHash('sha256').update(seconds.join('')).digest('hex').slice(0, 16);
  return { all, seconds, issues: world.check() };
}

const write = process.argv.includes('--write');
const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : null;
if (!write && !baseline) {
  console.error(`No baseline at ${BASELINE}. Record one with: node qa/tools/golden.mjs --write`);
  process.exit(1);
}

const results = {};
let failed = 0;
for (const session of SESSIONS) {
  const started = performance.now();
  const result = run(session);
  const ms = Math.round(performance.now() - started);
  results[session.name] = result;
  if (write) {
    console.log(`  rec   ${session.name.padEnd(16)} ${result.all}  (${result.seconds.length} s, ${ms} ms)`);
    continue;
  }
  const want = baseline.sessions[session.name];
  if (!want) {
    failed++;
    console.log(`  FAIL  ${session.name.padEnd(16)} not in the baseline`);
    continue;
  }
  if (want.all === result.all) {
    console.log(`  PASS  ${session.name.padEnd(16)} ${result.all}  (${result.seconds.length} s, ${ms} ms)`);
    continue;
  }
  failed++;
  const first = result.seconds.findIndex((h, i) => h !== want.seconds[i]);
  console.log(`  FAIL  ${session.name.padEnd(16)} ${result.all} ≠ ${want.all}; first differs at ${first + 1} s`);
}

if (write) {
  const sessions = Object.fromEntries(
    Object.entries(results).map(([name, r]) => [name, { all: r.all, seconds: r.seconds }]),
  );
  writeFileSync(BASELINE, `${JSON.stringify({ recorded: new Date().toISOString().slice(0, 10), sessions })}\n`);
  console.log(`golden: recorded ${BASELINE}`);
} else {
  console.log(failed ? `golden: ${failed} of ${SESSIONS.length} sessions differ` : 'golden: motion unchanged');
  process.exit(failed ? 1 : 0);
}
