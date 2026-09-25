// Download sizes: the standalone page's script, and the demo split into
// what loads with the page, what loads as the pond comes near, and what
// loads only if needed (the Canvas fallback, painting on the page). Also
// the first-frame stills.
//
//   npm run qa:size
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { buildSite } from '../scripts/build.mjs';
import { buildStandalone } from '../scripts/build-standalone.mjs';
import { createReport } from './lib/report.mjs';
import { THRESHOLDS } from './thresholds.mjs';

const T = THRESHOLDS.size;
const KB = (bytes) => +(bytes / 1024).toFixed(1);
const report = createReport('size');

const { script } = await buildStandalone('frogs');
report.measure('standalone script, minified', KB(Buffer.byteLength(script)), T.standaloneMin);
report.measure('standalone script, gzip', KB(gzipSync(script).length), T.standaloneGzip);

const { outdir, outputs } = await buildSite({ quiet: true });
/** The files `from` pulls in statically (itself included). */
const closure = (from, seen = new Set()) => {
  if (seen.has(from)) return seen;
  seen.add(from);
  for (const next of outputs[from].imports) if (next.kind === 'import-statement') closure(next.path, seen);
  return seen;
};
const sum = (files) => [...files].reduce((total, file) => total + outputs[file].bytes, 0);
const gzip = (files) => [...files].reduce((total, file) => total + gzipSync(readFileSync(file)).length, 0);
const main = `${outdir}/main.js`;
const first = closure(main);
const approach = new Set();
for (const next of outputs[main].imports)
  if (next.kind === 'dynamic-import') for (const file of closure(next.path)) if (!first.has(file)) approach.add(file);
const js = Object.keys(outputs).filter((file) => file.endsWith('.js'));
const worker = js.find((file) => file.endsWith('frog-bank-worker.js'));
const lazy = js.filter((file) => !first.has(file) && !approach.has(file) && file !== worker);
report.measure('demo: with the page, minified', KB(sum(first)), T.demoFirstLoadMin);
report.measure('demo: as the pond comes near, minified', KB(sum(approach)), T.demoOnApproachMin);
report.measure('demo: as the pond comes near, gzip', KB(gzip(approach)), T.demoOnApproachGzip);
report.measure('demo: bank worker, minified', KB(outputs[worker].bytes), T.workerMin);
report.info(
  'demo: only if needed (Canvas fallback, painting on the page)',
  `${KB(sum(lazy))} KB in ${lazy.length} files`,
);
const stills = 'studies/frogs/stills';
for (const file of readdirSync(stills))
  report.measure(`still ${file}`, KB(statSync(`${stills}/${file}`).size), T.stillKB);
report.finish();
