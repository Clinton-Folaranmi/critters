// Reduced motion: one finished still with its own description, no loop,
// no tap target and no instructions.
import { FROG_COPY } from '../../packages/frog-pond/src/frog-theme.ts';

export default async ({ page, site, report }) => {
  await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await page.send('Page.addScriptToEvaluateOnNewDocument', {
    source: (await import('node:fs')).readFileSync('qa/lib/instrument.js', 'utf8'),
  });
  await page.goto(site);
  report.expect('the still is drawn', await page.ready());
  await page.sleep(500);
  const a = await page.eval('__audit.raf');
  await page.sleep(1000);
  const info = await page.eval(
    `(() => { const c = document.querySelector('canvas'); return { role: c.getAttribute('role'), label: c.getAttribute('aria-label'), tabIndex: c.tabIndex, hintHidden: document.getElementById('hint').hidden, raf: __audit.raf - ${a} }; })()`,
  );
  report.measure('animation frames in 1 s', info.raf, { equals: 0 });
  report.expect(
    "an image with the still's description, not focusable",
    info.role === 'img' && info.label === FROG_COPY.stillLabel && info.tabIndex === -1,
  );
  report.expect('instructions hidden', info.hintHidden);
  await page.shot('qa/.out/shots/reduced-motion.png');
};
