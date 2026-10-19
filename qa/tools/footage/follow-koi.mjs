// The koi study framed to follow the fish, at a fixed fish-to-frame ratio and a
// footage frame rate: the build's half of a side-by-side with the reference
// (spec P-19). A tap on the water at frame 100 drops food. Needs a dev build
// (npm run dev, or scripts/build.mjs in dev mode) for the __critter hooks.
//
//   node qa/tools/footage/follow-koi.mjs <outdir> [frames=312] [fps=23.976] [ratio=0.82]
import { withPage } from '../../lib/chrome.mjs';
import { serve } from '../../../scripts/serve.mjs';
import { mkdirSync } from 'node:fs';
const [out, frames = '312', fps = '23.976', ratio = '0.82'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const dev = await serve('dist/site-dev');
try {
  await withPage(
    async (page) => {
      await page.viewport(1400, 1000, 2, false);
      await page.goto(`${dev.url}koi/?eager&dpr=fixed`);
      await page.ready();
      await page.eval(`document.querySelector('.stage').scrollIntoView({ block: 'center' })`);
      await new Promise((r) => setTimeout(r, 400));
      await page.freeze();
      let cx = null,
        cy = null;
      for (let i = 0; i < +frames; i++) {
        if (i === 100) await page.eval(`__critterTap(__critterWorld.aspect * 0.3, 0.7, 0.01)`);
        await page.eval(`__critterAdvance(${1 / +fps})`);
        const c = await page.eval(
          `(() => { const r = document.querySelector('canvas').getBoundingClientRect(); const s = __critterWorld.koi.spine; const xs = s.map(p => r.left + p.x * r.height), ys = s.map(p => r.top + (1 - p.y) * r.height); return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2, L: __critterWorld.koi.length * r.height }; })()`,
        );
        cx = cx === null ? c.x : cx + (c.x - cx) * 0.12;
        cy = cy === null ? c.y : cy + (c.y - cy) * 0.12;
        const size = c.L / +ratio;
        await page.shot(`${out}/${String(i).padStart(4, '0')}.png`, {
          x: cx - size / 2,
          y: cy - size / 2,
          width: size,
          height: size,
        });
      }
    },
    { width: 1400, height: 1000, dsf: 2 },
  );
} finally {
  await dev.close();
}
