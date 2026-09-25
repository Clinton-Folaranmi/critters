// The bank: how long a paint takes (on the page, for reference; the scene
// paints in a worker), and what dragging the pond's size costs: long tasks
// on the main thread, and how many bakes it asks for while the size keeps
// changing (a true debounce asks for at most one, then one after).
import { readFileSync } from 'node:fs';
import { THRESHOLDS } from '../thresholds.mjs';

export default async ({ page, pages, site, report }) => {
  const T = THRESHOLDS.bake;
  await page.goto(`${pages}bake.html`);
  const times = await page.eval(`(() => {
    const out = {};
    for (const theme of ['night', 'day']) for (const [w, h] of [[1520, 1028], [880, 595], [1760, 1190], [375, 412]]) {
      paintBank(w, h, theme);
      const t = [];
      for (let i = 0; i < 3; i++) { const s = performance.now(); paintBank(w, h, theme); t.push(performance.now() - s); }
      out[theme + ' ' + w + '×' + h] = Math.min(...t);
    }
    return out;
  })()`);
  for (const [key, ms] of Object.entries(times))
    report.info(`paint ${key} on the page (fastest of 3)`, `${ms.toFixed(0)} ms`);
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: readFileSync('qa/lib/instrument.js', 'utf8') });
  for (const renderer of ['webgl2', 'canvas']) {
    await page.goto(`${site}?dpr=fixed${renderer === 'canvas' ? '&renderer=canvas' : ''}`);
    await page.ready();
    await page.sleep(500);
    const r = await page.eval(`(async () => {
      const long = [];
      new PerformanceObserver((list) => { for (const e of list.getEntries()) long.push(Math.round(e.duration)); }).observe({ type: 'longtask' });
      const wrap = document.querySelector('.stage');
      const posted = __audit.workers.posted;
      for (let i = 0; i < 40; i++) { wrap.style.width = (600 + i * 7) + 'px'; await new Promise((r) => setTimeout(r, 50)); }
      const during = __audit.workers.posted - posted;
      const longDuring = long.length;
      await new Promise((r) => setTimeout(r, 1500));
      return { during, total: __audit.workers.posted - posted, longDuring, long };
    })()`);
    report.measure(`${renderer}: bakes asked for during a 2 s drag`, r.during, T.bakesDuringDrag);
    report.measure(`${renderer}: long tasks during the drag`, r.longDuring, T.longTasksDuringDrag);
    report.info(`${renderer}: bakes asked for in all (incl. after the drag)`, r.total);
    if (r.long.length) report.info(`${renderer}: long tasks (ms)`, r.long.join(', '));
  }
};
