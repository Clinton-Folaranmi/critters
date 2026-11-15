import { withPage } from '../lib/chrome.mjs';
import { serve } from '../../scripts/serve.mjs';
const out = process.argv[2];
const dev = await serve('dist/site-dev');
const site = `${dev.url}cockroach/`;
const moments = [['rest', 0.6], ['walk', 1.9], ['feed', 3.4]];
try {
  await withPage(async (page) => {
    for (const renderer of ['webgl2', 'canvas']) {
      for (const [size, w, h, mobile] of [['desktop', 1400, 1000, false], ['phone', 375, 800, true]]) {
        await page.viewport(w, h, 2, mobile);
        await page.goto(`${site}?dpr=fixed${renderer === 'canvas' ? '&renderer=canvas' : ''}`);
        await page.ready();
        await page.eval(`document.querySelector('.stage').scrollIntoView({ block: 'center' })`);
        await page.sleep?.(300);
        await new Promise((r) => setTimeout(r, 400));
        await page.freeze();
        const mode = await page.eval('__critterMode()');
        for (const [name, at] of moments) {
          // Reset the seeded world so each image matches its labelled time.
          await page.eval(`(() => { const w = __critterWorld; Object.assign(w, new w.constructor(w.aspect, 5)); __critterAdvance(${at}); })()`);
          const state = await page.eval('__critterWorld.roach.state');
          const file = `${out}/${size}-${renderer}-${name}.png`;
          await page.shot(file);
          console.log(file, mode, state);
        }
      }
    }
  }, { width: 1400, height: 1000, dsf: 2 });
} finally {
  await dev.close();
}
