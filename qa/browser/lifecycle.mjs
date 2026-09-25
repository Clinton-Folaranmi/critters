// Mount and unmount many times through the Night | Day switch, then take
// the pond off the page: one canvas at a time, observers and listeners
// released, no loop left running, workers let go, and the heap levels off.
import { readFileSync } from 'node:fs';
import { THRESHOLDS } from '../thresholds.mjs';

export default async ({ page, site, report }) => {
  const T = THRESHOLDS.lifecycle;
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: readFileSync('qa/lib/instrument.js', 'utf8') });
  await page.send('Performance.enable');
  await page.goto(`${site}?dpr=fixed`);
  await page.ready();
  const heap = async () => {
    await page.send('HeapProfiler.collectGarbage');
    await page.sleep(300);
    await page.send('HeapProfiler.collectGarbage');
    const metrics = await page.send('Performance.getMetrics');
    return metrics.metrics.find((m) => m.name === 'JSHeapUsedSize').value / 1048576;
  };
  const series = [await heap()];
  for (let i = 0; i < T.switches; i++) {
    const [x, y] = await page.eval(
      `(() => { const r = document.querySelectorAll('#lights button')[${i % 2 === 0 ? 1 : 0}].getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`,
    );
    await page.click(x, y);
    await page.sleep(700);
    if (i % 20 === 19) series.push(await heap());
  }
  report.info('heap MB every 20 switches', series.map((v) => v.toFixed(1)).join(' → '));
  report.measure(
    `heap growth from switch 20 to ${T.switches}`,
    +(series.at(-1) - series[1]).toFixed(2),
    T.heapGrowthAfterWarmup,
  );
  const live = await page.eval('__auditSummary()');
  report.measure('canvases on the page', live.canvases, { equals: 1 });
  report.measure('animation frames pending', live.rafPending, { max: 1 });
  report.measure('resize observers observing', live.ro.observing, { max: 1 });
  report.measure('visibilitychange listeners', live.listeners['document:visibilitychange'] ?? 0, { max: 1 });
  report.measure('workers running', live.workers.made - live.workers.terminated, { max: 1 });
  report.info('WebGL contexts made in all', live.glContexts);

  await page.eval('__frogPageDispose()');
  await page.sleep(500);
  const a = await page.eval('__audit.raf');
  await page.sleep(1000);
  const gone = await page.eval('__auditSummary()');
  report.measure('after taking the pond off: canvases', gone.canvases, { equals: 0 });
  report.measure('after taking the pond off: animation frames in 1 s', (await page.eval('__audit.raf')) - a, {
    equals: 0,
  });
  report.measure('after taking the pond off: resize observers observing', gone.ro.observing, { equals: 0 });
  report.measure(
    'after taking the pond off: visibilitychange listeners',
    gone.listeners['document:visibilitychange'] ?? 0,
    { equals: 0 },
  );
  // An idle worker stops itself after 15 s.
  report.info(
    'after taking the pond off: workers made / terminated',
    `${gone.workers.made} / ${gone.workers.terminated}`,
  );
};
