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
