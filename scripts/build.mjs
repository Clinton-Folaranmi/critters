// Builds everything, or one part:
//
//   node scripts/build.mjs                 package + site + standalone
//   node scripts/build.mjs package         packages/frog-pond/dist (ESM, types)
//   node scripts/build.mjs site [--dev]    dist/site (dist/site-dev: dev helpers on)
//   node scripts/build.mjs standalone      dist/standalone/frogs.html
//
// No bundler beyond esbuild: the scene loads its Canvas 2D fallback and the
// page-side bank painter as split chunks, and the bank painter's worker is
// its own classic script, frog-bank-worker.js, next to them (see
// packages/frog-pond/src/frog-bank-worker-factory.ts).
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { buildStandalone } from './build-standalone.mjs';
import { browserOptions, glslMinify } from './esbuild-plugins.mjs';

const PACKAGE = 'packages/frog-pond';
const WORKER = `${PACKAGE}/src/frog-bank-worker.ts`;

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

/** Modules plus the worker script into `outdir`; returns the output sizes. */
async function buildModules(entryPoints, outdir, dev) {
  const modules = await build({
    ...browserOptions(dev),
    entryPoints,
    outdir,
    format: 'esm',
    splitting: true,
    chunkNames: 'chunks/[name]-[hash]',
    sourcemap: dev ? 'linked' : false,
    metafile: true,
    plugins: [glslMinify],
  });
  // The chunk that starts the worker resolves './frog-bank-worker.js'
  // against its own URL, so the worker goes in that chunk's folder.
  const starter = Object.entries(modules.metafile.outputs).find(([, output]) =>
    Object.keys(output.inputs).some((input) => input.endsWith('frog-bank-worker-factory.ts')),
  );
  if (!starter) throw new Error('No output starts the bank worker.');
  const worker = await build({
    ...browserOptions(dev),
    entryPoints: [WORKER],
    outfile: `${dirname(starter[0])}/frog-bank-worker.js`,
    format: 'iife',
    sourcemap: dev ? 'linked' : false,
    metafile: true,
    plugins: [glslMinify],
  });
  return { ...modules.metafile.outputs, ...worker.metafile.outputs };
}

export async function buildPackage() {
  const outdir = `${PACKAGE}/dist`;
  await rm(outdir, { recursive: true, force: true });
  const entries = ['index', 'world', 'bank', 'theme', 'paint'];
  await buildModules(Object.fromEntries(entries.map((name) => [name, `${PACKAGE}/src/${name}.ts`])), outdir, false);
  execFileSync('npx', ['tsc', '-p', `${PACKAGE}/tsconfig.build.json`], { stdio: 'inherit' });
  console.log(`${outdir} (${entries.join(', ')}, types)`);
}

export async function buildSite({ dev = false } = {}) {
  const outdir = dev ? 'dist/site-dev' : 'dist/site';
  await rm(outdir, { recursive: true, force: true });
  await mkdir(outdir, { recursive: true });
  await cp('studies/index.html', `${outdir}/index.html`);
  const frogs = `${outdir}/frogs`;
  const outputs = await buildModules({ main: 'studies/frogs/main.ts' }, frogs, dev);
  for (const file of ['index.html', 'page.css', 'stills.css']) await cp(`studies/frogs/${file}`, `${frogs}/${file}`);
  await cp('studies/frogs/stills', `${frogs}/stills`, { recursive: true });
  // A GitHub Pages site shouldn't be run through Jekyll.
  await writeFile(`${outdir}/.nojekyll`, '');
  if (!dev) {
    for (const [file, { bytes }] of Object.entries(outputs)) {
      if (!file.endsWith('.js')) continue;
      console.log(
        `  ${file.replace(`${frogs}/`, '').padEnd(34)} ${kb(bytes).padStart(9)}  gzip ${kb(gzipSync(readFileSync(file)).length)}`,
      );
    }
  }
  console.log(`${outdir}/ (frogs/)`);
}

export async function buildStandalonePages() {
  await mkdir('dist/standalone', { recursive: true });
  const { html, script } = await buildStandalone('frogs');
  await writeFile('dist/standalone/frogs.html', html);
  console.log(
    `dist/standalone/frogs.html (${kb(Buffer.byteLength(script))} script, gzip ${kb(gzipSync(script).length)})`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [part] = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
  const dev = process.argv.includes('--dev');
  if (!part || part === 'package') await buildPackage();
  if (!part || part === 'site') await buildSite({ dev });
  if (!part || part === 'standalone') await buildStandalonePages();
  if (part && !['package', 'site', 'standalone'].includes(part)) {
    console.error(`Unknown part "${part}": use package, site or standalone.`);
    process.exit(1);
  }
}
