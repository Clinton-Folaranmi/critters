// Resizing without stalls: the pond paints its pad and shade atlas for each
// canvas height in ≤ 8 ms slices off the frame (paintAtlas), showing the old
// atlas scaled until the new one is done. A 2 s drag-resize, both
// renderers: no main-thread task over 50 ms while dragging, and the scene
// still sound after it.
import { THRESHOLDS } from '../thresholds.mjs';

export default async ({ page, site, report }) => {
  const T = THRESHOLDS.bake;
  for (const renderer of ['webgl2', 'canvas']) {
    await page.goto(`${site}?dpr=fixed${renderer === 'canvas' ? '&renderer=canvas' : ''}`);
    await page.ready();
    await page.sleep(500);
    const r = await page.eval(`(async () => {
      const long = [];
      new PerformanceObserver((list) => { for (const e of list.getEntries()) long.push(Math.round(e.duration)); }).observe({ type: 'longtask' });
      const wrap = document.querySelector('.stage');
      for (let i = 0; i < 40; i++) { wrap.style.width = (600 + i * 7) + 'px'; await new Promise((r) => setTimeout(r, 50)); }
      const longDuring = long.length;
      await new Promise((r) => setTimeout(r, 1500));
      return { longDuring, long, mode: __critterMode(), issues: __critterCheck().length, canvases: document.querySelectorAll('canvas').length };
    })()`);
    report.measure(`${renderer}: long tasks during the drag`, r.longDuring, T.longTasksDuringDrag);
    report.expect(
      `${renderer}: after the drag, same renderer, one canvas, world sound`,
      r.mode === renderer && r.canvases === 1 && r.issues === 0,
      JSON.stringify({ mode: r.mode, canvases: r.canvases, issues: r.issues }),
    );
    if (r.long.length) report.info(`${renderer}: long tasks, incl. 1.5 s after (ms)`, r.long.join(', '));
  }
};
