// Builds what the checks drive, into qa/.out (git-ignored):
//   world.mjs, bank.mjs      the simulation and shore maths, for Node
//   pages/bake.{html,js}     painter, shore maths, shaders, a GL helper (in-browser maths checks)
//   pages/{dev,prod}-frogs.html   the standalone page with and without the dev helpers
// and the demo site (dist/site-dev with the dev helpers, dist/site as shipped).
// QA_NO_BUILD=1 skips the builds (qa/run.mjs builds once, then runs each check).
import { build } from 'esbuild';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { buildSite } from '../../scripts/build.mjs';
import { buildStandalone } from '../../scripts/build-standalone.mjs';
import { browserOptions, glslMinify } from '../../scripts/esbuild-plugins.mjs';

export const OUT = 'qa/.out';
export const PAGES = `${OUT}/pages`;
const SRC = 'packages/frog-pond/src';
const skip = () => process.env.QA_NO_BUILD === '1';

/** The world and shore maths as Node modules: qa/.out/world.mjs, bank.mjs. */
export async function buildNodeModules() {
  if (skip() && existsSync(`${OUT}/world.mjs`)) return;
  const node = {
    bundle: true,
    format: 'esm',
    platform: 'node',
    define: { 'import.meta.env.DEV': 'false' },
    logLevel: 'warning',
  };
  await build({ ...node, entryPoints: [`${SRC}/world.ts`], outfile: `${OUT}/world.mjs` });
  await build({ ...node, entryPoints: [`${SRC}/frog-bank.ts`], outfile: `${OUT}/bank.mjs` });
}

/** Pages opened from file://: the bake page and the standalone builds. */
export async function buildPages() {
  if (skip() && existsSync(`${PAGES}/bake.html`)) return;
  await mkdir(PAGES, { recursive: true });
  await build({
    stdin: {
      contents: `import { paintBank, bankMask } from './${SRC}/frog-bank-paint';
import * as bank from './${SRC}/frog-bank';
import * as shaders from './${SRC}/frog-shaders';
// A plain compile-and-link, waiting for the result (the scene compiles in the background).
function createProgram(gl, vertex, fragment) {
  const program = gl.createProgram();
  for (const [type, source] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]]) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader));
    gl.attachShader(program, shader);
  }
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program));
  return program;
}
Object.assign(window, { paintBank, bankMask, bank, shaders, createProgram });`,
      resolveDir: '.',
      loader: 'ts',
    },
    ...browserOptions(false),
    format: 'iife',
    outfile: `${PAGES}/bake.js`,
    plugins: [glslMinify],
  });
  await writeFile(`${PAGES}/bake.html`, '<!doctype html><body><script src="bake.js"></script>');
  for (const dev of [true, false]) {
    const { html } = await buildStandalone('frogs', { dev });
    await writeFile(`${PAGES}/${dev ? 'dev' : 'prod'}-frogs.html`, html);
  }
  // The shipped file too (qa:standalone opens it).
  await mkdir('dist/standalone', { recursive: true });
  await writeFile('dist/standalone/frogs.html', (await buildStandalone('frogs')).html);
}

/** The demo site: dist/site-dev (dev helpers) and dist/site (as shipped). */
export async function buildSites() {
  if (skip() && existsSync('dist/site-dev/frogs/main.js') && existsSync('dist/site/frogs/main.js')) return;
  await buildSite({ dev: true, quiet: true });
  await buildSite({ dev: false, quiet: true });
}
