// Builds a single self-contained HTML page for one study, for sharing on its
// own (e.g. as a claude.ai artifact) or opening from disk:
//
//   node scripts/build-standalone.mjs frogs   →   dist/standalone/frogs.html
//
// The page is the study's demo page (studies/<name>/index.html) with its
// page.css inlined, its stills left out, and standalone/<name>/entry.ts as
// one inline classic script that is also the bank painter's worker. The
// output needs no network: anything it loads from elsewhere is a build
// error, and so is a page missing the basics a phone needs (a doctype, a
// language, a charset, a viewport, no body margin).
import { build } from 'esbuild';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { browserOptions, glslMinify, selfWorker } from './esbuild-plugins.mjs';

/** Replaces the one tag in `page` that `pattern` matches, or fails. */
function swap(page, pattern, replacement, template) {
  const count = page.match(new RegExp(pattern.source, 'g'))?.length ?? 0;
  if (count !== 1) throw new Error(`${template} needs exactly one ${pattern}; found ${count}.`);
  return page.replace(pattern, () => replacement);
}

/**
 * The page for studies/<name>, as HTML. `dev` keeps the dev-only helpers
 * (the QA harness uses those); the shipped page never has them.
 */
export async function buildStandalone(name, { dev = false } = {}) {
  const result = await build({
    ...browserOptions(dev),
    entryPoints: [`standalone/${name}/entry.ts`],
    format: 'iife',
    write: false,
    plugins: [selfWorker, glslMinify],
  });
  const script = result.outputFiles[0].text;
  if (script.includes('</script')) throw new Error('Bundle contains a closing script tag.');
  const template = `studies/${name}/index.html`;
  const css = await readFile(`studies/${name}/page.css`, 'utf8');
  if (css.includes('</style')) throw new Error('page.css contains a closing style tag.');
  const fetched = css.match(/url\(\s*['"]?(?!data:|#)[^)'"]+/i);
  if (fetched) throw new Error(`studies/${name}/page.css loads a file: ${fetched[0]}`);
  let page = await readFile(template, 'utf8');
  page = swap(page, /<link rel="stylesheet" href="page\.css"\s*\/?>/, `<style>\n${css}</style>`, template);
  page = page.replace(/\n\s*<link rel="stylesheet" href="stills\.css"\s*\/?>/, '');
  page = swap(page, /<script type="module" src="main\.js"><\/script>/, `<script>\n${script}</script>`, template);
  const external = page.match(/<(?:link|script|img|iframe|source)\b[^>]*\b(?:href|src)=/i);
  if (external) throw new Error(`${template} still loads a file: ${external[0]}`);
  const basics = [
    ['a <!doctype html> first', /^\s*<!doctype html>/i],
    ['<html lang="…">', /<html\b[^>]*\blang=["']?[a-z]/i],
    ['<meta charset="utf-8">', /<meta\s+charset=["']?utf-8/i],
    ['a viewport meta (width=device-width)', /<meta\s+name=["']?viewport["']?\s+content=["'][^"']*width=device-width/i],
    ['body { margin: 0 }', /\bbody\s*\{[^}]*\bmargin:\s*0\s*[;}]/i],
  ];
  const missing = basics.filter(([, test]) => !test.test(page)).map(([what]) => what);
  if (missing.length) throw new Error(`${template} is missing: ${missing.join('; ')}.`);
  return { html: page, script };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const name = process.argv[2];
  if (!name) {
    console.error('Usage: node scripts/build-standalone.mjs <study>');
    process.exit(1);
  }
  const { html, script } = await buildStandalone(name);
  await mkdir('dist/standalone', { recursive: true });
  const out = `dist/standalone/${name}.html`;
  await writeFile(out, html);
  console.log(`${out} (${(Buffer.byteLength(script) / 1024).toFixed(1)} KB script)`);
}
