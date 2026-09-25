// Draws the world saved by qa/tools/dump.mjs in both lights (WebGL), as
// qa/.out/shots/replay-<light>.png. A debugging tool, not a check.
import { readFileSync, writeFileSync } from 'node:fs';

export default async ({ page, site, report }) => {
  const state = readFileSync('qa/.out/state.json', 'utf8');
  for (const light of ['night', 'day']) {
    await page.goto(`${site}?dpr=fixed${light === 'day' ? '#day' : ''}`);
    await page.ready();
    await page.freeze();
    const url = await page.eval(`(() => {
      const s = ${state}; const w = __frogWorld;
      s.frogs.forEach((f, i) => Object.assign(w.frogs[i], f));
      s.pads.forEach((p, i) => Object.assign(w.pads[i], p));
      w.capsules.set(s.capsules);
      __frogAdvance(0);
      return document.querySelector('canvas').toDataURL('image/png');
    })()`);
    writeFileSync(`qa/.out/shots/replay-${light}.png`, Buffer.from(url.split(',')[1], 'base64'));
    report.info(light, `qa/.out/shots/replay-${light}.png`);
  }
};
