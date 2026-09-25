// The demo with the dev-only helpers on (?renderer=canvas, ?dpr=fixed,
// ?frogs=N, the __frog* console hooks), rebuilt on every change:
//
//   npm run dev     →   http://127.0.0.1:5173/frogs/
//
// Reload the page after a change (there is no hot reload).
import { watch } from 'node:fs';
import { buildSite } from './build.mjs';
import { serve } from './serve.mjs';

let queued = false;
let building = Promise.resolve();
const rebuild = () => {
  if (queued) return;
  queued = true;
  building = building.then(async () => {
    queued = false;
    const started = performance.now();
    try {
      await buildSite({ dev: true });
      console.log(`rebuilt in ${Math.round(performance.now() - started)} ms`);
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
    }
  });
};

await buildSite({ dev: true });
for (const dir of ['packages/frog-pond/src', 'studies']) watch(dir, { recursive: true }, rebuild);
const { url } = await serve('dist/site-dev', Number(process.env.PORT ?? 5173));
console.log(`Frog pond (dev): ${url}frogs/  (night)  ·  ${url}frogs/#day`);
