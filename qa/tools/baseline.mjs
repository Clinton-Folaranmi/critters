// Builds the standalone page (with the dev helpers) from another commit, for
// side-by-side timing: qa/.out/pages/<name>.html and <name>-prod.html.
//
//   node qa/tools/baseline.mjs <git-ref> [name]     default name: base-frogs
//   npm run qa:gpu -- --pages=dev-frogs,base-frogs
//   npm run qa:first -- --compare=base-frogs-prod
//
// Timing depends on the machine and what else it's doing; a baseline run in
// the same session is the fair comparison.
import { execSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const [ref, name = 'base-frogs'] = process.argv.slice(2);
if (!ref) {
  console.error('Usage: node qa/tools/baseline.mjs <git-ref> [name]');
  process.exit(1);
}
const tree = mkdtempSync(join(tmpdir(), 'animal-farm-baseline-'));
try {
  execSync(`git archive ${ref} | tar -x -C ${JSON.stringify(tree)}`, { stdio: 'inherit' });
  execSync(`ln -s ${JSON.stringify(resolve('node_modules'))} ${JSON.stringify(join(tree, 'node_modules'))}`);
  const { buildStandalone } = await import(join(tree, 'scripts/build-standalone.mjs'));
  const here = process.cwd();
  process.chdir(tree);
  const pages = [];
  for (const dev of [true, false]) pages.push([dev, (await buildStandalone('frogs', { dev })).html]);
  process.chdir(here);
  mkdirSync('qa/.out/pages', { recursive: true });
  for (const [dev, html] of pages) writeFileSync(`qa/.out/pages/${name}${dev ? '' : '-prod'}.html`, html);
  console.log(`qa/.out/pages/${name}.html and ${name}-prod.html from ${ref}`);
} finally {
  rmSync(tree, { recursive: true, force: true });
}
