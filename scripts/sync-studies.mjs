// Brings in the seven studies that live in the critter-studies repository next
// to this one (../critter-studies/<animal>, each with its own copy of the kit
// and its own build):
//
//   node scripts/sync-studies.mjs            all seven
//   node scripts/sync-studies.mjs mouse      one
//
// For each, it runs that study's `npm run build` (after `npm ci` if its
// dependencies aren't installed) and copies the built JavaScript into
// studies/vendor/<animal>/: dist/main.js and only the chunks main.js reaches,
// so a chunk left over from an earlier build never ships. The vendored files
// are committed, so the site builds without critter-studies; the site build
// copies them into each animal's route, where main.js mounts the scene into
// the shell's #scene. The studies are never edited, only built.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { cp, mkdir, readdir, rm, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const siblings = resolve(root, '..');

/** Animal → its study folder, next to this repository. */
export const EXTERNAL_STUDIES = {
  ladybug: 'critter-studies/ladybug',
  butterfly: 'critter-studies/butterfly',
  snail: 'critter-studies/snail',
  mouse: 'critter-studies/mouse',
  koi: 'critter-studies/koi',
  snake: 'critter-studies/snake',
  cockroach: 'critter-studies/cockroach',
};

/** The chunk files main.js reaches, directly or through other chunks (by file name, so imports, workers and URLs all count). */
export function reachableChunks(dist) {
  const dir = join(dist, 'chunks');
  if (!existsSync(dir)) return [];
  const names = readdirSync(dir).filter((name) => name.endsWith('.js'));
  const reached = new Set();
  const queue = [join(dist, 'main.js')];
  while (queue.length) {
    const text = readFileSync(queue.pop(), 'utf8');
    for (const name of names) {
      if (reached.has(name) || !text.includes(name)) continue;
      reached.add(name);
      queue.push(join(dir, name));
    }
  }
  return names.filter((name) => reached.has(name));
}

async function sync(animal) {
  const project = join(siblings, EXTERNAL_STUDIES[animal]);
  if (!existsSync(join(project, 'package.json'))) throw new Error(`${animal}: no project at ${project}`);
  if (!existsSync(join(project, 'node_modules'))) execFileSync('npm', ['ci'], { cwd: project, stdio: 'inherit' });
  execFileSync('npm', ['run', 'build'], { cwd: project, stdio: 'inherit' });
  const out = join(root, 'studies/vendor', animal);
  await rm(out, { recursive: true, force: true });
  await mkdir(out, { recursive: true });
  await cp(join(project, 'dist/main.js'), join(out, 'main.js'));
  const chunks = reachableChunks(join(project, 'dist'));
  if (chunks.length) await mkdir(join(out, 'chunks'));
  for (const name of chunks) await cp(join(project, 'dist/chunks', name), join(out, 'chunks', name));
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
