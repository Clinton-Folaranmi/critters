// Losing the WebGL context: the pond switches to the Canvas renderer at
// once, tries WebGL again after 2.5 s (twice), then stays on Canvas. Focus
// stays on the pond and the world stays sound.
export default async ({ page, site, report }) => {
  for (const light of ['night', 'day']) {
    await page.goto(`${site}?dpr=fixed${light === 'day' ? '#day' : ''}`);
    await page.ready();
    await page.eval(`document.querySelector('canvas').focus()`);
    const expectAfter = ['webgl2', 'webgl2', 'canvas'];
    for (let i = 0; i < 3; i++) {
      const lost = await page.eval('__frogLoseContext()');
      await page.sleep(400);
      const now = await page.eval(
        `[__frogMode(), document.querySelectorAll('canvas').length, document.activeElement.tagName]`,
      );
      await page.sleep(3200);
      const later = await page.eval(
        `[__frogMode(), document.querySelectorAll('canvas').length, document.activeElement.tagName, __frogCheck().length]`,
      );
      report.expect(
        `${light}, loss ${i + 1}: Canvas at once, then ${expectAfter[i]}; one canvas; focus kept; world sound`,
        lost &&
          now[0] === 'canvas' &&
          now[1] === 1 &&
          now[2] === 'CANVAS' &&
          later[0] === expectAfter[i] &&
          later[1] === 1 &&
          later[2] === 'CANVAS' &&
          later[3] === 0,
        `${now.join('/')} → ${later.join('/')}`,
      );
    }
  }
};
