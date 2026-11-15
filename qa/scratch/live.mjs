import { withPage } from '../lib/chrome.mjs';
import { serve } from '../../scripts/serve.mjs';
const out = process.argv[2];
const prod = await serve('dist/site');
try {
  await withPage(async (page) => {
    for (const [size, w, h, mobile] of [['desktop', 1400, 1000, false], ['phone', 375, 800, true]]) {
      await page.viewport(w, h, 1, mobile);
      await page.goto(`${prod.url}cockroach/`);
      await page.ready();
      await page.eval(`document.querySelector('.stage').scrollIntoView({ block: 'center' })`);
      const hooks = await page.eval(`Object.keys(window).filter((k) => k.startsWith('__critter')).length`);
      let frames = 0;
      await page.eval(`(() => { window.__f = 0; const f = () => { window.__f++; requestAnimationFrame(f); }; requestAnimationFrame(f); })()`);
      for (let s = 0; s <= 30; s += 3) {
        await page.shot(`${out}/${size}-${String(s).padStart(2, '0')}.png`);
        if (s === 12) {
          // A tap on the floor, away from the animal (a crumb), as a visitor would.
          const r = await page.eval(`(() => { const r = document.querySelector('canvas').getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; })()`);
          if (mobile) await page.touch(r[0] + r[2] * 0.2, r[1] + r[3] * 0.75);
          else await page.click(r[0] + r[2] * 0.2, r[1] + r[3] * 0.75);
        }
        await new Promise((res) => setTimeout(res, 3000));
      }
      frames = await page.eval('window.__f');
      console.log(size, 'dev hooks', hooks, 'frames in ~33 s', frames);
    }
  }, { width: 1400, height: 1000, dsf: 1 });
} finally {
  await prod.close();
}
