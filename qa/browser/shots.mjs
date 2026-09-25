// Enlarged crops for review by eye, both lights × both renderers, into
// qa/.out/shots: the keyboard focus ring, the reeds, motes after a tap on the
// grass, a midge (or firefly) and its shadow, and by day the caustics.
// Writes qa/.out/shots/sheet.html to see them side by side.
import { writeFileSync } from 'node:fs';

export const browser = { width: 1400, height: 1000, dsf: 2 };

export default async ({ page, site, report }) => {
  const files = [];
  for (const light of ['night', 'day']) {
    for (const renderer of ['webgl2', 'canvas']) {
      const tag = `${light}-${renderer}`;
      await page.goto(
        `${site}?dpr=fixed${renderer === 'canvas' ? '&renderer=canvas' : ''}${light === 'day' ? '#day' : ''}`,
      );
      await page.ready();
      await page.sleep(400);
      // Focus ring, by keyboard.
      await page.eval(`document.querySelector('canvas').focus()`);
      await page.tab();
      await page.tab(true);
      await page.sleep(200);
      const stage = await page.eval(
        `(() => { const r = document.querySelector('.stage').getBoundingClientRect(); return { x: Math.max(0, r.x - 20), y: Math.max(0, r.y - 20), width: r.width + 40, height: r.height + 40 }; })()`,
      );
      files.push(await page.shot(`qa/.out/shots/focus-${tag}.png`, stage));
      await page.eval('document.activeElement.blur()');
      await page.freeze();
      const r = await page.eval(
        `(() => { const r = document.querySelector('canvas').getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; })()`,
      );
      const a = r[2] / r[3];
      const at = (x, y, w, h) => ({ x: r[0] + x * r[3], y: r[1] + (1 - y) * r[3], width: w * r[3], height: h * r[3] });
      const box = await page.eval(
        `(() => { const e = new Float32Array(40), s = new Float32Array(40), box = new Float32Array(4); __frogBank.reedBlades(${a}, 0, e, s, box); __frogAdvance(0); return [...box]; })()`,
      );
      files.push(
        await page.shot(
          `qa/.out/shots/reeds-${tag}.png`,
          at(box[0] - 0.08, box[3] + 0.05, box[2] - box[0] + 0.2, box[3] - box[1] + 0.12),
        ),
      );
      await page.eval(`(() => { __frogTap(${a * 0.42}, 0.12); __frogAdvance(0.45); })()`);
      files.push(await page.shot(`qa/.out/shots/motes-${tag}.png`, at(a * 0.42 - 0.12, 0.28, 0.24, 0.24)));
      await page.eval(`(() => { const w = __frogWorld; w.flies.forEach((f, i) => { f.respawn = 0; f.fade = 1; f.glow = 1; if (i) { f.x = 0.02; f.y = 0.98; } });
        const f = w.flies[0]; f.x = 0.62 * ${a}; f.y = 0.52; f.height = 0.08; f.vx = f.vy = 0; __frogAdvance(0); })()`);
      files.push(await page.shot(`qa/.out/shots/midge-${tag}.png`, at(0.62 * a - 0.08, 0.6, 0.16, 0.16)));
      if (light === 'day') files.push(await page.shot(`qa/.out/shots/caustics-${tag}.png`, at(0.6, 0.72, 0.4, 0.26)));
    }
  }
  const groups = ['focus', 'reeds', 'motes', 'midge', 'caustics'];
  writeFileSync(
    'qa/.out/shots/sheet.html',
    `<!doctype html><meta charset="utf-8"><title>Frog pond shots</title><style>body{font:14px system-ui;margin:16px;background:#888}img{max-width:100%;display:block}figure{margin:0}figcaption{margin:4px 0 12px}section{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px}</style>` +
      groups
        .map(
          (group) =>
            `<h2>${group}</h2><section>${files
              .filter((f) => f.includes(`/${group}-`))
              .map(
                (f) =>
                  `<figure><img src="${f.split('/').pop()}"><figcaption>${f.split('/').pop()}</figcaption></figure>`,
              )
              .join('')}</section>`,
        )
        .join(''),
  );
  report.info('screenshots', `${files.length} in qa/.out/shots (open sheet.html)`);
};
