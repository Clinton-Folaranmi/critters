// Frame cost at 1520 px wide (1520 × 1027), both lights: GPU time alone
// (EXT_disjoint_timer_query_webgl2), and CPU + GPU with a one-pixel readback
// after each frame (a tiny canvas's cost subtracted). Machine-dependent:
// run on a quiet machine, and compare with a baseline built from another
// commit (qa/tools/baseline.mjs) rather than trusting one number.
//
//   npm run qa:gpu [-- --rounds=3 --pages=dev-frogs,base-frogs]
import { execSync } from 'node:child_process';
import { THRESHOLDS } from '../thresholds.mjs';

const load = () => {
  try {
    return execSync('uptime')
      .toString()
      .split(/load averages?:/)[1]
      .trim();
  } catch {
    return 'unknown';
  }
};

const resize = `(() => {
  const wrap = document.querySelector('.pond');
  wrap.style.width = '1520px'; wrap.style.maxWidth = 'none'; wrap.style.aspectRatio = '1.48 / 1';
  for (const el of [wrap.parentElement, wrap.parentElement.parentElement]) { el.style.maxWidth = 'none'; el.style.width = 'auto'; }
})()`;

const timerQueries = `(async () => {
  __frogResolution(0);
  ${resize};
  __frogAdvance(0);
  await new Promise((r) => setTimeout(r, 1200)); // the bank re-bakes for the new size
  const c = document.querySelector('canvas'); const gl = c.getContext('webgl2');
  const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2');
  if (!ext) return null;
  const px = new Uint8Array(4);
  for (let i = 0; i < 5; i++) { __frogAdvance(1 / 60); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); }
  const gpu = [];
  for (let i = 0; i < 30; i++) {
    const q = gl.createQuery();
    gl.beginQuery(ext.TIME_ELAPSED_EXT, q); __frogAdvance(1 / 60); gl.endQuery(ext.TIME_ELAPSED_EXT);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px);
    for (let k = 0; k < 200 && !gl.getQueryParameter(q, gl.QUERY_RESULT_AVAILABLE); k++) await new Promise((r) => setTimeout(r, 1));
    gpu.push(gl.getQueryParameter(q, gl.QUERY_RESULT) / 1e6); gl.deleteQuery(q);
  }
  gpu.sort((a, b) => a - b);
  return { size: c.width + 'x' + c.height, gpu: gpu[15] };
})()`;

const synced = `(async () => {
  const wrap = document.querySelector('.pond');
  const measure = async (w) => {
    wrap.style.width = w + 'px';
    await new Promise((r) => setTimeout(r, 900));
    const c = document.querySelector('canvas'); const gl = c.getContext('webgl2'); const px = new Uint8Array(4);
    for (let i = 0; i < 5; i++) { __frogAdvance(1 / 60); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); }
    const times = [];
    for (let i = 0; i < 40; i++) { const t = performance.now(); __frogAdvance(1 / 60); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, px); times.push(performance.now() - t); }
    return times.reduce((a, b) => a + b) / 40;
  };
  const big = await measure(1520);
  const tiny = await measure(16);
  return big - tiny;
})()`;

export default async ({ page, pages, report, opts }) => {
  const T = THRESHOLDS.gpu;
  const rounds = Number(opts.rounds ?? T.rounds);
  const variants = String(opts.pages ?? 'dev-frogs').split(',');
  report.info('load average before', load());
  const results = {};
  for (let r = 0; r < rounds; r++) {
    for (const variant of variants) {
      for (const light of ['night', 'day']) {
        await page.goto(`${pages}${variant}.html#${light}`);
        await page.ready();
        await page.freeze();
        const tq = await page.eval(timerQueries);
        const sync = await page.eval(synced);
        (results[`${variant} ${light}`] ??= []).push({ ...tq, sync });
      }
    }
  }
  report.info('load average after', load());
  for (const [key, runs] of Object.entries(results)) {
    const median = (values) => values.sort((a, b) => a - b)[values.length >> 1];
    const gpu = runs.map((run) => run.gpu).filter((v) => v !== undefined);
    const sync = median(runs.map((run) => run.sync));
    const official = key.startsWith('dev-frogs ');
    if (gpu.length) {
      const value = +median(gpu).toFixed(2);
      if (official) report.measure(`${key}: GPU ms per frame (median of ${rounds})`, value, T.gpuMs);
      else report.info(`${key}: GPU ms per frame (median of ${rounds})`, value);
    } else report.info(`${key}: GPU timer queries`, 'not available here');
    if (official) report.measure(`${key}: CPU + GPU ms per frame, synced`, +sync.toFixed(2), T.syncedMs);
    else report.info(`${key}: CPU + GPU ms per frame, synced`, +sync.toFixed(2));
    report.info(
      `${key}: every round (GPU / synced)`,
      runs.map((run) => `${run.gpu?.toFixed(2)} / ${run.sync.toFixed(2)}`).join(' | ') + ` at ${runs[0].size}`,
    );
  }
};
