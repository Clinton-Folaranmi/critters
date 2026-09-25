// Runs a group of checks, builds once, and exits non-zero if any fails.
//
//   npm run qa:node      soak, swims, motion, alloc, size (Node only; what CI runs)
//   npm run qa:browser   every pass/fail browser check (needs the headless shell)
//   npm run qa           both
//
// Timing checks (first, gpu, bake) depend on the machine and its load; they
// are in the browser group but can be skipped with --skip=first,gpu,bake.
import { spawnSync } from 'node:child_process';
import { buildNodeModules, buildPages, buildSites } from './lib/prepare.mjs';
import { flags } from './lib/report.mjs';

export const NODE = [
  ['soak', ['qa/soak.mjs']],
  ['swims', ['qa/swims.mjs']],
  ['motion', ['qa/motion.mjs']],
  ['alloc', ['--expose-gc', '--max-semi-space-size=512', 'qa/alloc.mjs']],
  ['size', ['qa/size.mjs']],
];
export const BROWSER = [
  'smoke',
  'parity',
  'luma',
  'hit',
  'tol',
  'a11y',
  'rm',
  'midge',
  'standalone',
  'lifecycle',
  'offscreen',
  'loss',
  'reshuffle',
  'bake',
  'first',
  'gpu',
].map((name) => [name, ['qa/browser.mjs', name]]);

const group = process.argv[2] ?? 'all';
const skip = new Set(
  String(flags().skip ?? '')
    .split(',')
    .filter(Boolean),
);
const checks = [...(group !== 'browser' ? NODE : []), ...(group !== 'node' ? BROWSER : [])].filter(
  ([name]) => !skip.has(name),
);

await buildNodeModules();
if (group !== 'node') await Promise.all([buildPages(), buildSites()]);
const failed = [];
for (const [name, args] of checks) {
  const run = spawnSync(process.execPath, args, { stdio: 'inherit', env: { ...process.env, QA_NO_BUILD: '1' } });
  if (run.status !== 0) failed.push(name);
}
console.log(
  `\n${checks.length - failed.length} of ${checks.length} checks passed${failed.length ? `; failed: ${failed.join(', ')}` : ''}.`,
);
process.exitCode = failed.length ? 1 : 0;
