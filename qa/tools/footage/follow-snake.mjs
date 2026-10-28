// The grass snake study filmed the way the reference clip was: a handheld-style
// camera following the anterior third of the snake (head, yellow-black collar
// and anterior S-loop) at ~11 body-widths across the frame, at 30 fps (spec P-19).
// Needs a dev build (node scripts/build.mjs site --dev) for the __critter hooks.
//
//   node qa/tools/footage/follow-snake.mjs <outdir> [frames=210] [fps=30] [bwSpan=11.5]
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { withPage } from '../../lib/chrome.mjs';
import { serve } from '../../../scripts/serve.mjs';

const [out, frames = '210', fps = '30', bwSpan = '11.5'] = process.argv.slice(2);
mkdirSync(out, { recursive: true });
const workDir = dirname(out);
const dev = await serve('dist/site-dev');
try {
  await withPage(
    async (page) => {
      // 1. Capture full-scene phone frame (390×844) and Canvas 2D parity frame first (spec Q-R4, Q-R5).
      await page.viewport(390, 844, 2, true);
      await page.goto(`${dev.url}snake/?eager&dpr=fixed`);
      await page.ready();
      await new Promise((r) => setTimeout(r, 350));
      await page.freeze();
      await page.shot(`${workDir}/scene-phone.png`);

      await page.viewport(1400, 1000, 2, false);
      await page.goto(`${dev.url}snake/?eager&dpr=fixed&renderer=canvas`);
      await page.ready();
      await new Promise((r) => setTimeout(r, 350));
      await page.freeze();
      await page.shot(`${workDir}/scene-canvas.png`);

      // 2. Capture full-scene desktop frame (1400×1000, WebGL2) and then record the follow clip.
      await page.viewport(1400, 1000, 2, false);
      await page.goto(`${dev.url}snake/?eager&dpr=fixed`);
      await page.ready();
      await new Promise((r) => setTimeout(r, 350));
      await page.freeze();
      await page.shot(`${workDir}/scene-desktop.png`);

      await page.eval(`document.querySelector('.stage').scrollIntoView({ block: 'center' })`);
      await new Promise((r) => setTimeout(r, 200));
      // Clear initial scent spots so we film autonomous crawl + pause + tongue-flicks like the clip.
      await page.eval(
        `__critterWorld.spots.forEach((s) => { s.active = false; s.strength = 0; }); __critterWorld.noticeIn = -1;`,
      );

      const where = `(() => {
        const r = document.querySelector('canvas').getBoundingClientRect();
        const w = __critterWorld;
        const head = w.spine[0];
        const mid = w.spine[4];
        const focusX = head.x * 0.65 + mid.x * 0.35;
        const focusY = head.y * 0.65 + mid.y * 0.35;
        return {
          x: r.left + focusX * r.height,
          y: r.top + (1 - focusY) * r.height,
          bw: (w.length / 34) * r.height,
          heading: w.heading,
          state: w.state,
          canvasLeft: r.left,
          canvasTop: r.top,
          canvasW: r.width,
          canvasH: r.height,
        };
      })()`;

      const path = [];
      let cx = null;
      let cy = null;
      for (let i = 0; i < +frames; i++) {
        await page.eval(`__critterAdvance(${1 / +fps})`);
        const c = await page.eval(where);
        path.push(c);
        cx = cx === null ? c.x : cx + (c.x - cx) * 0.1;
        cy = cy === null ? c.y : cy + (c.y - cy) * 0.1;
        const size = Math.min(c.bw * +bwSpan, c.canvasH * 0.72);
        const clipX = Math.max(c.canvasLeft + 8, Math.min(c.canvasLeft + c.canvasW - size - 8, cx - size / 2));
        const clipY = Math.max(c.canvasTop + 8, Math.min(c.canvasTop + c.canvasH - size - 8, cy - size / 2));
        await page.shot(`${out}/${String(i).padStart(4, '0')}.png`, {
          x: clipX,
          y: clipY,
          width: size,
          height: size,
        });
      }
      const heading = Math.atan2(
        path.reduce((s, p) => s + Math.sin(p.heading), 0),
        path.reduce((s, p) => s + Math.cos(p.heading), 0),
      );
      writeFileSync(`${out}/path.json`, JSON.stringify({ heading, states: path.map((p) => p.state) }));
    },
    { width: 1400, height: 1000, dsf: 2 },
  );
} finally {
  await dev.close();
}
