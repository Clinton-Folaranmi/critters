// Builds everything, or one part:
//
//   node scripts/build.mjs                 package + site + standalone
//   node scripts/build.mjs package         packages/critter-kit/dist, packages/frog-pond/dist (ESM, types)
//   node scripts/build.mjs site [--dev]    dist/site (dist/site-dev: dev helpers on)
//   node scripts/build.mjs standalone      dist/standalone/frogs.html
//
// No bundler beyond esbuild: each scene loads its Canvas 2D fallback as a
// split chunk.
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { buildStandalone } from './build-standalone.mjs';
import { browserOptions, glslMinify } from './esbuild-plugins.mjs';

const PACKAGE = 'packages/frog-pond';
const KIT = 'packages/critter-kit';

const kb = (bytes) => `${(bytes / 1024).toFixed(1)} KB`;

/** Modules into `outdir`; returns the output sizes. */
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
  return modules.metafile.outputs;
}

/** The kit: ESM and declarations (the frog package's declarations refer to them). */
async function buildKit() {
  const outdir = `${KIT}/dist`;
  await rm(outdir, { recursive: true, force: true });
  await build({
    ...browserOptions(false),
    entryPoints: { index: `${KIT}/src/index.ts` },
    outdir,
    format: 'esm',
    plugins: [glslMinify],
  });
  execFileSync('npx', ['tsc', '-p', `${KIT}/tsconfig.build.json`], { stdio: 'inherit' });
  console.log(`${outdir} (index, types)`);
}

export async function buildPackage() {
  await buildKit();
  const outdir = `${PACKAGE}/dist`;
  await rm(outdir, { recursive: true, force: true });
  const entries = ['index', 'world', 'bank', 'theme'];
  await buildModules(Object.fromEntries(entries.map((name) => [name, `${PACKAGE}/src/${name}.ts`])), outdir, false);
  execFileSync('npx', ['tsc', '-p', `${PACKAGE}/tsconfig.build.json`], { stdio: 'inherit' });
  console.log(`${outdir} (${entries.join(', ')}, types)`);
}

/** Builds the demo; returns esbuild's outputs (for qa/size.mjs). */
export async function buildSite({ dev = false, quiet = false } = {}) {
  const outdir = dev ? 'dist/site-dev' : 'dist/site';
  await rm(outdir, { recursive: true, force: true });
  await mkdir(outdir, { recursive: true });
  await cp('studies/index.html', `${outdir}/index.html`);
  const frogs = `${outdir}/frogs`;
  const outputs = await buildModules({ main: 'studies/frogs/main.ts' }, frogs, dev);
  for (const file of ['index.html', 'page.css', 'stills.css']) await cp(`studies/frogs/${file}`, `${frogs}/${file}`);
  await cp('studies/frogs/stills', `${frogs}/stills`, { recursive: true });
  // The cockroach Specimen (packages/cockroach-floor): no stills or single file yet.
  const cockroach = `${outdir}/cockroach`;
  await buildModules({ main: 'studies/cockroach/main.ts' }, cockroach, dev);
  for (const file of ['index.html', 'page.css']) await cp(`studies/cockroach/${file}`, `${cockroach}/${file}`);
  // The koi Specimen (packages/koi): no stills or single file yet.
  const koi = `${outdir}/koi`;
  await buildModules({ main: 'studies/koi/main.ts' }, koi, dev);
  for (const file of ['index.html', 'page.css']) await cp(`studies/koi/${file}`, `${koi}/${file}`);
  // The grass snake Specimen (packages/snake): WebGL2 + Canvas 2D fallback.
  const snake = `${outdir}/snake`;
  await buildModules({ main: 'studies/snake/main.ts' }, snake, dev);
  for (const file of ['index.html', 'page.css']) await cp(`studies/snake/${file}`, `${snake}/${file}`);
  // A GitHub Pages site shouldn't be run through Jekyll.
  await writeFile(`${outdir}/.nojekyll`, '');
  if (!dev && !quiet) {
    for (const [file, { bytes }] of Object.entries(outputs)) {
      if (!file.endsWith('.js')) continue;
      console.log(
        `  ${file.replace(`${frogs}/`, '').padEnd(34)} ${kb(bytes).padStart(9)}  gzip ${kb(gzipSync(readFileSync(file)).length)}`,
      );
    }
  }
  if (!quiet) console.log(`${outdir}/ (frogs/, cockroach/, koi/, snake/)`);
  return { outdir: frogs, outputs };
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
