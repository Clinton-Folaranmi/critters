// Traces each animal's still into the pencil strokes the site's loading
// sketch draws (studies/site/sketch/trace.ts), one file per picture shape:
//
//   node scripts/trace-sketches.mjs        → studies/site/sketches/<slug>-{wide,narrow}.json
//
// Run it after a still changes (like npm run qa:stills); the output is
// committed and copied by the site build. It needs the headless shell (to
// decode the stills in a canvas); the browser is closed when it's done.
import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { extname } from 'node:path';
import { withPage } from '../qa/lib/chrome.mjs';
import { ANIMALS } from '../studies/site/animals.mjs';

/** The size each shape is traced at (CSS px; the worker scales to the real picture). */
export const SHAPES = {
  wide: { w: 900, h: Math.round(900 / 1.48) },
  narrow: { w: 440, h: Math.round(440 / 0.91) },
};

/** Where an animal's still is on disk, for a shape (animals.mjs paths are relative to the built page). */
export function stillFile(animal, shape) {
  const url = (shape === 'narrow' && animal.still.narrow) || animal.still.wide;
  if (animal.slug === 'frogs') return `studies/frogs/${url}`;
  return `studies/site/${url.replace('../assets/', '')}`;
}

const OUT = 'studies/site/sketches';
mkdirSync(OUT, { recursive: true });
const bundle = await build({
  entryPoints: ['studies/site/sketch/trace.ts'],
  bundle: true,
  write: false,
  format: 'iife',
  globalName: '__sketchTrace',
  logLevel: 'warning',
});
const code = bundle.outputFiles[0].text;
const TYPES = { '.jpg': 'image/jpeg', '.webp': 'image/webp', '.png': 'image/png' };

await withPage(async (page) => {
  await page.eval(code);
  for (const animal of ANIMALS) {
    for (const [shape, { w, h }] of Object.entries(SHAPES)) {
      const file = stillFile(animal, shape);
      const data = `data:${TYPES[extname(file)]};base64,${readFileSync(file).toString('base64')}`;
      const fit = animal.still.size === '100% 100%' ? 'stretch' : 'cover';
      const result = await page.eval(`(async () => {
        const img = await createImageBitmap(await (await fetch(${JSON.stringify(data)})).blob());
        const c = new OffscreenCanvas(${w}, ${h}); const g = c.getContext('2d', { willReadFrequently: true });
        if (${JSON.stringify(fit)} === 'stretch') g.drawImage(img, 0, 0, ${w}, ${h});
        else { const s = Math.max(${w} / img.width, ${h} / img.height); g.drawImage(img, (${w} - img.width * s) / 2, (${h} - img.height * s) / 2, img.width * s, img.height * s); }
        return JSON.stringify(__sketchTrace.trace(g.getImageData(0, 0, ${w}, ${h}).data, ${w}, ${h}, ${JSON.stringify(fit)}));
      })()`);
      const out = `${OUT}/${animal.slug}-${shape}.json`;
      writeFileSync(out, result + '\n');
      const parsed = JSON.parse(result);
      console.log(`${out}  ${parsed.strokes.length} strokes, ${(result.length / 1024).toFixed(1)} KB`);
    }
  }
});
