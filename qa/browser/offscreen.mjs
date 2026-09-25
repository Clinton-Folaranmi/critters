// The loop runs only while the pond is on screen: animation frames per
// second with the pond in view, scrolled away, and back.
import { readFileSync } from 'node:fs';
import { THRESHOLDS } from '../thresholds.mjs';

export default async ({ page, site, report }) => {
  const T = THRESHOLDS.offscreen;
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: readFileSync('qa/lib/instrument.js', 'utf8') });
  await page.goto(`${site}?dpr=fixed`);
  await page.ready();
  await page.eval(
    `(() => { const s = document.createElement('div'); s.style.height = '3000px'; document.querySelector('main').after(s); })()`,
  );
  const rate = async () => {
    const a = await page.eval('__audit.raf');
    await page.sleep(1000);
    return (await page.eval('__audit.raf')) - a;
  };
  report.measure('in view', await rate(), T.inView);
  await page.eval('window.scrollTo(0, 3000)');
  await page.sleep(300);
  report.expect(
    'scrolled away: the pond is off screen',
    await page.eval(
      `(() => { const r = document.querySelector('canvas').getBoundingClientRect(); return r.bottom < 0 || r.top > innerHeight; })()`,
    ),
  );
  report.measure('scrolled away', await rate(), T.away);
  await page.eval('window.scrollTo(0, 0)');
  await page.sleep(300);
  report.measure('back in view', await rate(), T.inView);
};
