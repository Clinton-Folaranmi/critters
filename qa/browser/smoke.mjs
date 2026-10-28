// The demo loads with both renderers, becomes ready, labels the pond for
// screen readers, and logs no errors; the shipped build has no dev helpers.
// Screenshots in qa/.out/shots/smoke-*.png.
import { FROG_COPY } from '../../packages/frog-pond/src/frog-theme.ts';

export default async ({ page, site, prodSite, report }) => {
  for (const renderer of ['webgl2', 'canvas']) {
    const tag = renderer;
    const from = page.console.length;
    await page.goto(`${site}?dpr=fixed${renderer === 'canvas' ? '&renderer=canvas' : ''}`);
    report.expect(`${tag}: ready within 10 s`, await page.ready());
    const info = await page.eval(`(() => {
      const c = document.querySelector('canvas');
      return { mode: __critterMode(), canvases: document.querySelectorAll('canvas').length, role: c.getAttribute('role'),
        label: c.getAttribute('aria-label'), describedBy: c.getAttribute('aria-describedby'), tabIndex: c.tabIndex,
        title: document.title, check: __critterCheck() };
    })()`);
    report.measure(`${tag}: renderer`, info.mode, { equals: renderer });
    report.measure(`${tag}: canvases`, info.canvases, { equals: 1 });
    report.expect(
      `${tag}: a focusable button labelled from FROG_COPY, pointing at the instructions`,
      info.role === 'button' &&
        info.tabIndex === 0 &&
        info.label === FROG_COPY.motionLabel &&
        info.describedBy === 'hint',
    );
    report.measure(`${tag}: title`, info.title, { equals: FROG_COPY.title });
    report.measure(`${tag}: check() issues`, info.check.length, { equals: 0 });
    // The forced fallback logs that it was forced; nothing else may warn.
    const problems = page.problems(from).filter((line) => !/forced by \?renderer=canvas/.test(line));
    report.measure(`${tag}: console errors and warnings`, problems.length, { equals: 0 });
    for (const line of problems) console.log('   ', line);
    await page.eval('__critterAdvance(0)');
    await page.shot(`qa/.out/shots/smoke-${renderer}.png`);
  }
  const from = page.console.length;
  await page.goto(prodSite);
  report.expect('shipped build: ready', await page.ready());
  report.measure('shipped build: dev helpers present', await page.eval(`typeof window.__critterWorld`), {
    equals: 'undefined',
  });
  report.measure('shipped build: console errors and warnings', page.problems(from).length, { equals: 0 });
};
