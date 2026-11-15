// Scratch: koi full-scene frames and a close crop of the fish, at given world times.
//   node qa/.out/koi-shots.mjs <outdir> [times=0,2,4] [renderer=webgl2|canvas] [size=desktop|phone] [taps]
import { withPage } from '../lib/chrome.mjs';
import { serve } from '../../scripts/serve.mjs';
const [out, timesArg = '0', renderer = 'webgl2', size = 'desktop', script = ''] = process.argv.slice(2);
const times = timesArg.split(',').map(Number);
const dev = await serve('dist/site-dev');
const [w, h, mobile] = size === 'phone' ? [375, 800, true] : [1400, 1000, false];
try {
  await withPage(async (page) => {
    await page.viewport(w, h, 2, mobile);
    await page.goto(`${dev.url}koi/?eager&dpr=fixed${renderer === 'canvas' ? '&renderer=canvas' : ''}`);
    await page.ready();
    await page.eval(`document.querySelector('.stage').scrollIntoView({ block: 'center' })`);
    await new Promise((r) => setTimeout(r, 400));
    await page.freeze();
    let t = 0;
    for (const at of times) {
      if (script) await page.eval(script.replaceAll('$T', String(at)));
      await page.eval(`__critterAdvance(${at - t})`);
      t = at;
      const info = await page.eval(`(() => { const c = document.querySelector('canvas').getBoundingClientRect(); const wd = __critterWorld; const s = wd.koi.spine; const xs = s.map(p => c.left + p.x * c.height), ys = s.map(p => c.top + (1 - p.y) * c.height); const pad = wd.koi.length * c.height * 0.25; return { x: Math.min(...xs) - pad, y: Math.min(...ys) - pad, w: Math.max(...xs) - Math.min(...xs) + 2 * pad, h: Math.max(...ys) - Math.min(...ys) + 2 * pad, state: wd.state, mode: __critterMode(), stage: (() => { const r = document.querySelector('.stage').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; })() }; })()`);
      await page.shot(`${out}/${size}-${renderer}-${at}.png`, { x: info.stage.x, y: info.stage.y, width: info.stage.w, height: info.stage.h });
      await page.shot(`${out}/${size}-${renderer}-${at}-fish.png`, { x: info.x, y: info.y, width: info.w, height: info.h });
      console.log(at, info.state, info.mode);
    }
    console.log(await page.eval('JSON.stringify(__critterCheck())'));
  }, { width: w, height: h, dsf: 2 });
} finally {
  await dev.close();
}
