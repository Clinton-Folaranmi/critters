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
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { cp, mkdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { crc32, deflateSync, gzipSync } from 'node:zlib';
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

/** The picture's shapes (site.css aspect-ratio): the border mask is drawn for each with a short side of 512. */
const SHAPES = { wide: 1.48, narrow: 0.91 };

/** A hand-drawn circle for a badge's ring (66 × 66 box): goes round once and a bit, drifting outward. */
function ringPath(seed) {
  const pts = [];
  const a0 = -2.1 + seed * 0.9;
  const sweep = Math.PI * 2 + 0.42;
  for (let i = 0; i <= 64; i++) {
    const t = i / 64;
    const a = a0 + sweep * t;
    const r = 29.2 + 0.7 * Math.sin(2 * a + seed) + 1.6 * t;
    pts.push(`${(33 + Math.cos(a) * r * 1.01).toFixed(1)} ${(33 + Math.sin(a) * r).toFixed(1)}`);
  }
  return `M${pts.join('L')}`;
}

/** Every file under `dir` (recursively) whose name passes `keep`, as paths relative to `dir`. */
function filesUnder(dir, keep) {
  return readdirSync(dir, { recursive: true })
    .map(String)
    .filter((name) => keep(name) && statSync(`${dir}/${name}`).isFile());
}

/** What the next animal's page needs, to fetch ahead on badge hover or focus, or when idle (shell.ts). */
function preloadsFor(animal, outdir) {
  const route = `../${animal.slug}/`;
  const scripts = filesUnder(`${outdir}/${animal.slug}`, (name) => name.endsWith('.js')).map((name) => route + name);
  const still = (url) => (url.startsWith('../') ? url : route + url);
  return {
    common: [route, ...scripts],
    wide: [still(animal.still.wide), `../assets/sketches/${animal.slug}-wide.json`],
    narrow: [still(animal.still.narrow ?? animal.still.wide), `../assets/sketches/${animal.slug}-narrow.json`],
  };
}

/** One animal's page, from the shell's template (studies/site/page.html). */
function animalPage(template, animal, outdir) {
  const badges = ANIMALS.map((other, i) => {
    const pre = preloadsFor(other, outdir);
    const current = other.slug === animal.slug;
    const preload = current
      ? ''
      : ` data-preload="${pre.common.join(' ')}" data-preload-wide="${pre.wide.join(' ')}" data-preload-narrow="${pre.narrow.join(' ')}"`;
    return (
      `<li><a class="badge" href="../${other.slug}/"${current ? ' aria-current="page"' : ''}${preload}>` +
      `<span class="dot" style="background-image: url('../assets/badges/${other.slug}.jpg')">` +
      `<svg viewBox="0 0 66 66" aria-hidden="true"><path pathLength="1" d="${ringPath(i * 1.7 + 0.4)}" /></svg></span>` +
      `${escape(other.name)}</a></li>`
    );
  }).join('\n            ');
  const { still } = animal;
  const stills =
    `.scene { background-color: ${animal.ground}; background-image: url('${still.wide}'); background-size: ${still.size}; }` +
    (still.narrow ? `\n      @media (max-width: 640px) { .scene { background-image: url('${still.narrow}'); } }` : '');
  // The loading sketch (shell.ts): the traced strokes and the still, for each shape.
  const sketch =
    `data-sketch-wide="../assets/sketches/${animal.slug}-wide.json" data-sketch-narrow="../assets/sketches/${animal.slug}-narrow.json" ` +
    `data-still-wide="${still.wide}" data-still-narrow="${still.narrow ?? still.wide}" data-seed="${ANIMALS.indexOf(animal) * 7 + 3}"`;
  // The name, its letters settling in one by one (site.css); read as one word.
  const letters = [...animal.name]
    .map((c, i) => `<span style="--i: ${i}; --r: ${(((i * 37) % 11) - 5) * 1.3}deg">${escape(c)}</span>`)
    .join('');
  const title = `<span class="visually-hidden">${escape(animal.name)}</span><span class="letters" aria-hidden="true">${letters}</span>`;
  // The frog pond's how-to-play, for screen readers (the canvas is described by it; page.ts fills it).
  const hint = animal.hint ? '<ul id="hint" class="visually-hidden"></ul>' : '';
  const fill = {
    name: escape(animal.name),
    description: escape(animal.description),
    still: stills,
    sketch,
    title,
    hint,
    badges,
  };
  const page = template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    if (!(key in fill)) throw new Error(`studies/site/page.html: unknown {{${key}}}`);
    return fill[key];
  });
  return page.replace(/\n\s*\n(\s*<nav)/, '\n$1');
}

/** A grey + alpha PNG (alpha only matters: it's a CSS mask). */
function maskPng(w, h, alpha) {
  const row = w * 2 + 1;
  const raw = Buffer.alloc(row * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) raw[y * row + 1 + x * 2 + 1] = alpha[y * w + x];
  const chunk = (type, data) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(data.length, 0);
    head.write(type, 4, 'ascii');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
    return Buffer.concat([head, data, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 4;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/**
 * The owner's border for each picture shape, drawn once here with the same
 * maths as before (studies/site/border.ts), so the page has it from the first
 * paint and the still shows as soon as it has loaded.
 */
async function buildMasks(assets, border) {
  const bundled = await build({
    entryPoints: ['studies/site/border.ts'],
    bundle: true,
    write: false,
    format: 'esm',
    platform: 'node',
    logLevel: 'warning',
    define: { BORDER: JSON.stringify(border) },
  });
  const { borderMask, TOOL } = await import(
    `data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`
  );
  await mkdir(`${assets}/masks`, { recursive: true });
  for (const [shape, aspect] of Object.entries(SHAPES)) {
    const w = aspect >= 1 ? Math.round(TOOL * aspect) : TOOL;
    const h = aspect >= 1 ? TOOL : Math.round(TOOL / aspect);
    await writeFile(`${assets}/masks/${shape}.png`, maskPng(w, h, borderMask(w, h)));
  }
}

/** The shell every animal page shares: its CSS, scripts, font, badges, stills, masks and sketches, in <outdir>/assets. */
async function buildShell(outdir, dev) {
  const assets = `${outdir}/assets`;
  await mkdir(assets, { recursive: true });
  for (const dir of ['fonts', 'badges', 'stills', 'sketches'])
    await cp(`studies/site/${dir}`, `${assets}/${dir}`, { recursive: true });
  await cp('studies/site/site.css', `${assets}/site.css`);
  const border = JSON.parse(readFileSync('social/approved-settings.json', 'utf8'));
  await buildMasks(assets, border);
  await build({
    ...browserOptions(dev),
    entryPoints: ['studies/site/shell.ts'],
    outfile: `${assets}/shell.js`,
    format: 'esm',
    sourcemap: dev ? 'linked' : false,
    define: { ...browserOptions(dev).define, BORDER: JSON.stringify(border) },
  });
  // The loading sketch's worker (studies/site/sketch/), loaded by shell.js.
  await build({
    ...browserOptions(dev),
    entryPoints: ['studies/site/sketch/worker.ts'],
    outfile: `${assets}/sketch.js`,
    format: 'esm',
    sourcemap: dev ? 'linked' : false,
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
  }
  // The pages last: each lists what the others need, to fetch ahead.
  for (const animal of ANIMALS)
    await writeFile(`${outdir}/${animal.slug}/index.html`, animalPage(template, animal, outdir));
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
      `${outdir}/ (${ANIMALS.map((animal) => `${animal.slug}/`).join(', ')})`,
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
