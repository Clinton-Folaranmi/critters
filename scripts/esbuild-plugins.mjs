// esbuild plugins shared by the builds (scripts/build.mjs,
// scripts/build-standalone.mjs) and the QA harness.
import { readFile } from 'node:fs/promises';
import { minifyGlslTemplates } from './glsl-minify.mjs';

/** Where the studies' sources live: their /* glsl *\/ templates are minified. */
const STUDY_SOURCE = /packages[\\/][^\\/]+[\\/]src[\\/][^\\/]+\.ts$/;

/** Shaders are written as /* glsl *\/ template literals; ship them without comments and spare whitespace. */
export const glslMinify = {
  name: 'glsl-minify',
  setup(build) {
    build.onLoad({ filter: STUDY_SOURCE }, async (args) => {
      const source = await readFile(args.path, 'utf8');
      return { contents: source.includes('/* glsl */') ? minifyGlslTemplates(source) : source, loader: 'ts' };
    });
  },
};

/**
 * The bank painter's worker in a single-file page: there is no worker file
 * to point at, so the page starts its own script again as the worker (the
 * entry only answers bake requests when there's no document). Replaces
 * frog-bank-worker-factory.ts, which points at frog-bank-worker.js.
 */
export const selfWorker = {
  name: 'self-worker',
  setup(build) {
    build.onResolve({ filter: /frog-bank-worker-factory$/ }, () => ({ path: 'self-worker', namespace: 'self-worker' }));
    build.onLoad({ filter: /.*/, namespace: 'self-worker' }, () => ({
      contents: `const source = typeof document !== 'undefined' && document.currentScript ? document.currentScript.textContent : '';
export function startBankWorker() {
  if (!source) throw new Error('The page script is not available to start as a worker.');
  const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
  const started = new Worker(url);
  URL.revokeObjectURL(url);
  return started;
}`,
      loader: 'js',
    }));
  },
};

/** Options every browser build shares. `dev` keeps the dev-only helpers (the QA harness uses them). */
export const browserOptions = (dev) => ({
  bundle: true,
  minify: true,
  target: 'es2020',
  conditions: ['source'],
  define: { 'import.meta.env.DEV': String(dev) },
  logLevel: 'warning',
  legalComments: 'none',
});
