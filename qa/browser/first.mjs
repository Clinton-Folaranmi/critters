// First-load main-thread cost: long tasks (> 50 ms) from navigation to 4 s,
// on the shipped builds (the demo and the standalone page), at 2× (Retina).
import { THRESHOLDS } from '../thresholds.mjs';

export const browser = { width: 1280, height: 900, dsf: 2 };

// --compare=name,… also loads qa/.out/pages/<name>.html (e.g. a baseline
// from qa/tools/baseline.mjs), reported alongside for the same conditions.
export default async ({ page, pages, prodSite, report, opts }) => {
  const T = THRESHOLDS.first;
  await page.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `window.__long = []; new PerformanceObserver((l) => { for (const e of l.getEntries()) __long.push([Math.round(e.startTime), Math.round(e.duration)]); }).observe({ type: 'longtask' });`,
  });
  const targets = [
    ['demo', prodSite],
    ['standalone', `${pages}prod-frogs.html`],
  ];
  const compare = opts.compare ? String(opts.compare).split(',') : [];
  for (const name of compare) targets.push([`${name} (compare)`, `${pages}${name}.html`]);
  for (const [label, url] of targets) {
    const runs = [];
    for (let r = 0; r < T.runs; r++) {
      await page.goto(`${url}?r=${r}`);
      await page.sleep(4000);
      runs.push(await page.eval('__long'));
    }
    const worst = Math.max(0, ...runs.flat().map(([, duration]) => duration));
    if (label.includes('(compare)')) report.info(`${label}: worst long task over ${T.runs} loads`, worst);
    else report.measure(`${label}: worst long task over ${T.runs} loads`, worst, T.worstLongTask);
    report.info(
      `${label}: long tasks per load`,
      runs.map((l) => l.map(([t, d]) => `${d} ms at ${t}`).join(' ') || 'none').join(' | '),
    );
  }
};
