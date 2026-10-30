// Builds everything, or one part:
//
//   node scripts/build.mjs                 package + site + standalone
//   node scripts/build.mjs package         packages/critter-kit/dist, packages/frog-pond/dist (ESM, types)
//   node scripts/build.mjs site [--dev]    dist/site (dist/site-dev: dev helpers on): one page per
//                                          animal (studies/site/animals.mjs) from the shared shell
//   node scripts/build.mjs standalone      dist/standalone/frogs.html
//
// No bundler beyond esbuild: each scene loads its Canvas 2D fallback as a
// split chunk.
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import { buildStandalone } from './build-standalone.mjs';
import { browserOptions, glslMinify } from './esbuild-plugins.mjs';
import { ANIMALS } from '../studies/site/animals.mjs';

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

const escape = (text) =>
  String(text).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

/** One animal's page, from the shell's template (studies/site/page.html). */
function animalPage(template, animal) {
  const badges = ANIMALS.map(
    (other) =>
      `<li><a class="badge" href="../${other.slug}/"${other.slug === animal.slug ? ' aria-current="page"' : ''}>` +
      `<span class="dot" style="background-image: url('../assets/badges/${other.slug}.jpg')"></span>${escape(other.name)}</a></li>`,
  ).join('\n            ');
  const { still } = animal;
  const stills =
    `.scene { background-color: ${animal.ground}; background-image: url('${still.wide}'); background-size: ${still.size}; }` +
    (still.narrow ? `\n      @media (max-width: 640px) { .scene { background-image: url('${still.narrow}'); } }` : '');
  // The frog pond's how-to-play, for screen readers (the canvas is described by it; page.ts fills it).
  const hint = animal.hint ? '<ul id="hint" class="visually-hidden"></ul>' : '';
  const fill = { name: escape(animal.name), description: escape(animal.description), still: stills, hint, badges };
  const page = template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    if (!(key in fill)) throw new Error(`studies/site/page.html: unknown {{${key}}}`);
    return fill[key];
  });
  return page.replace(/\n\s*\n(\s*<nav)/, '\n$1');
}

/** The shell every animal page shares: its CSS, script, font, badges and stills, in <outdir>/assets. */
async function buildShell(outdir, dev) {
  const assets = `${outdir}/assets`;
  await mkdir(assets, { recursive: true });
  for (const dir of ['fonts', 'badges', 'stills'])
    await cp(`studies/site/${dir}`, `${assets}/${dir}`, { recursive: true });
  await cp('studies/site/site.css', `${assets}/site.css`);
  const border = JSON.parse(readFileSync('social/approved-settings.json', 'utf8'));
  await build({
    ...browserOptions(dev),
    entryPoints: ['studies/site/shell.ts'],
    outfile: `${assets}/shell.js`,
    format: 'esm',
    sourcemap: dev ? 'linked' : false,
    define: { ...browserOptions(dev).define, BORDER: JSON.stringify(border) },
  });
}

/** Builds the site; returns esbuild's outputs for the frog page (for qa/size.mjs). */
export async function buildSite({ dev = false, quiet = false } = {}) {
  const outdir = dev ? 'dist/site-dev' : 'dist/site';
  await rm(outdir, { recursive: true, force: true });
  await mkdir(outdir, { recursive: true });
  // The root sends you to the first animal, the frogs.
  await cp('studies/index.html', `${outdir}/index.html`);
  await buildShell(outdir, dev);
  const template = readFileSync('studies/site/page.html', 'utf8');
  let outputs = {};
  const frogs = `${outdir}/frogs`;
  for (const animal of ANIMALS) {
    const route = `${outdir}/${animal.slug}`;
    if (animal.slug === 'frogs') {
      outputs = await buildModules({ main: 'studies/frogs/main.ts' }, route, dev);
      await cp('studies/frogs/stills', `${route}/stills`, { recursive: true });
    } else {
      // Vendored from its own project (scripts/sync-studies.mjs): main.js mounts into #scene.
      const vendor = `studies/vendor/${animal.slug}`;
      if (!existsSync(`${vendor}/main.js`))
        throw new Error(`${vendor}/main.js is missing: run node scripts/sync-studies.mjs`);
      await cp(vendor, route, { recursive: true });
    }
    await writeFile(`${route}/index.html`, animalPage(template, animal));
  }
  // The older Specimens still build, but nothing links to them until they're redone.
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
  if (!quiet)
    console.log(
      `${outdir}/ (${ANIMALS.map((animal) => `${animal.slug}/`).join(', ')}; unlinked: cockroach/, koi/, snake/)`,
    );
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
