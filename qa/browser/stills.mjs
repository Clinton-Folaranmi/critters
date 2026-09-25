// Regenerates the demo's first-frame stills (studies/frogs/stills/*.webp):
// the pond at t = 0, the same moment the reduced-motion still shows, in each
// light at both aspects. Re-run after any visual change, then qa:size.
import { writeFileSync } from 'node:fs';

export default async ({ page, pages, report }) => {
  await page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  // Wide: the 880 px stage at 1×. Narrow: a 400 px phone stage at 2×.
  for (const [shape, width, aspect, quality] of [
    ['wide', 880, 1.48, 0.8],
    ['narrow', 800, 0.91, 0.72],
  ]) {
    for (const light of ['night', 'day']) {
      await page.goto(`${pages}dev-frogs.html#${light}`);
      await page.eval(`(() => { const p = document.querySelector('.pond'); p.style.width = '${width}px'; p.style.aspectRatio = '${aspect} / 1';
        for (const el of [p.parentElement, p.parentElement.parentElement]) { el.style.maxWidth = 'none'; el.style.width = 'auto'; el.style.marginInline = '0'; } })()`);
      await page.ready();
      await page.sleep(900); // a settled size, and its bank
      const [w, h, url] = await page.eval(
        `(() => { __frogResolution(0); __frogAdvance(0); const c = document.querySelector('canvas'); return [c.width, c.height, c.toDataURL('image/webp', ${quality})]; })()`,
      );
      const file = `studies/frogs/stills/${light}-${shape}.webp`;
      const bytes = Buffer.from(url.split(',')[1], 'base64');
      writeFileSync(file, bytes);
      report.info(file, `${w}×${h}, ${(bytes.length / 1024).toFixed(1)} KB`);
    }
  }
};
