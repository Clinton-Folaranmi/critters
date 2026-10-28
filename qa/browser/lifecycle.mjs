// Mount and unmount many times, then take the pond off the page: one canvas
// at a time, observers and listeners released, no loop left running, and the
// heap levels off. The page remounts the pond whenever the reduced-motion
// setting changes, so the check flips that setting (the live scene and the
// reduced-motion still, in turn); the pond has no other switch.
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
  for (let i = 0; i < T.remounts; i++) {
    await page.send('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: i % 2 === 0 ? 'reduce' : 'no-preference' }],
    });
    await page.sleep(700);
    if (i % 20 === 19) series.push(await heap());
  }
  report.info('heap MB every 20 remounts', series.map((v) => v.toFixed(1)).join(' → '));
  report.measure(
    `heap growth from remount 20 to ${T.remounts}`,
    +(series.at(-1) - series[1]).toFixed(2),
    T.heapGrowthAfterWarmup,
  );
  const live = await page.eval('__auditSummary()');
  report.measure('canvases on the page', live.canvases, { equals: 1 });
  report.measure('animation frames pending', live.rafPending, { max: 1 });
  report.measure('resize observers observing', live.ro.observing, { max: 1 });
  report.measure('visibilitychange listeners', live.listeners['document:visibilitychange'] ?? 0, { max: 1 });
  report.measure('workers started (the pond paints on the main thread, in slices)', live.workers.made, { equals: 0 });
  report.info('WebGL contexts made in all', live.glContexts);

  await page.eval('__critterPageDispose()');
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
};
