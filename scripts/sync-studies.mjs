// Brings in the four studies that live in their own projects next to this
// repository (each with its own copy of the kit and its own build):
//
//   node scripts/sync-studies.mjs            all four
//   node scripts/sync-studies.mjs mouse      one
//
// For each, it runs that project's `npm run build` and copies the built
// JavaScript (dist/main.js, and dist/chunks/ where there is one) into
// studies/vendor/<animal>/. The vendored files are committed, so the site
// builds without the sibling folders; the site build copies them into each
// animal's route, where main.js mounts the scene into the shell's #scene.
// The sibling projects are never edited, only built.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { cp, mkdir, readdir, rm, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const siblings = resolve(root, '..');

/** Animal → its project folder, next to this repository. */
export const EXTERNAL_STUDIES = {
  ladybug: 'critter-test',
  butterfly: 'critter-butterfly',
  snail: 'critter-snail',
  mouse: 'critter-mouse',
  koi: 'critter-koi',
  snake: 'critter-snake',
  cockroach: 'critter-cockroach',
};

async function sync(animal) {
  const project = join(siblings, EXTERNAL_STUDIES[animal]);
  if (!existsSync(join(project, 'package.json'))) throw new Error(`${animal}: no project at ${project}`);
  execFileSync('npm', ['run', 'build'], { cwd: project, stdio: 'inherit' });
  const out = join(root, 'studies/vendor', animal);
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  await cp(join(project, 'dist/main.js'), join(out, 'main.js'));
  if (existsSync(join(project, 'dist/chunks')))
    await cp(join(project, 'dist/chunks'), join(out, 'chunks'), { recursive: true });
  const files = await readdir(out, { recursive: true });
  let bytes = 0;
  for (const file of files) {
    const info = await stat(join(out, file));
    if (info.isFile()) bytes += info.size;
  }
  console.log(`studies/vendor/${animal}/ ← ${EXTERNAL_STUDIES[animal]} (${(bytes / 1024).toFixed(1)} KB)`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const wanted = process.argv.slice(2);
  const unknown = wanted.filter((animal) => !(animal in EXTERNAL_STUDIES));
  if (unknown.length) {
    console.error(`Unknown study: ${unknown.join(', ')}. Use ${Object.keys(EXTERNAL_STUDIES).join(', ')}.`);
    process.exit(1);
  }
  for (const animal of wanted.length ? wanted : Object.keys(EXTERNAL_STUDIES)) await sync(animal);
}
