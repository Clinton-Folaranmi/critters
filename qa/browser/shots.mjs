// Full scenes first, then enlarged crops for review by eye, both lights × both
// renderers (spec Q-R4 to Q-R6). Into qa/.out/shots: the whole page as a
// visitor sees it, scene in view, at desktop (1400 × 1000) and phone (375 ×
// 800) size; then crops of the focus ring, the reeds, motes after a tap on
// the grass, a midge (or firefly) and its shadow, and by day the caustics.
// sheet.html shows the full scenes at page size and keeps the crops folded
// away until the full-scene review is written down.
import { writeFileSync } from 'node:fs';

export const browser = { width: 1400, height: 1000, dsf: 2 };
const DESKTOP = { width: 1400, height: 1000 };
const PHONE = { width: 375, height: 800 };

export default async ({ page, site, report }) => {
  const files = [];
  for (const light of ['night', 'day']) {
    for (const renderer of ['webgl2', 'canvas']) {
      const tag = `${light}-${renderer}`;
      const url = `${site}?dpr=fixed${renderer === 'canvas' ? '&renderer=canvas' : ''}${light === 'day' ? '#day' : ''}`;
      await page.goto(url);
      await page.ready();
      await page.sleep(400);
      // The whole viewport, not the canvas: the page around the scene is part of the composition.
      const inView = () => page.eval(`document.querySelector('.stage').scrollIntoView({ block: 'center' })`);
      await inView();
      await page.sleep(200);
      files.push(await page.shot(`qa/.out/shots/full-desktop-${tag}.png`));
      await page.viewport(PHONE.width, PHONE.height, 2, true);
      await page.sleep(400); // past the 200 ms bake debounce
      await inView();
      await page.sleep(200);
      files.push(await page.shot(`qa/.out/shots/full-phone-${tag}.png`));
      await page.viewport(DESKTOP.width, DESKTOP.height, 2);
      await page.sleep(300);
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
        `(() => { const e = new Float32Array(40), s = new Float32Array(40), box = new Float32Array(4); __critterBank.reedBlades(${a}, 0, e, s, box); __critterAdvance(0); return [...box]; })()`,
      );
      files.push(
        await page.shot(
          `qa/.out/shots/reeds-${tag}.png`,
          at(box[0] - 0.08, box[3] + 0.05, box[2] - box[0] + 0.2, box[3] - box[1] + 0.12),
        ),
      );
      await page.eval(`(() => { __critterTap(${a * 0.42}, 0.12); __critterAdvance(0.45); })()`);
      files.push(await page.shot(`qa/.out/shots/motes-${tag}.png`, at(a * 0.42 - 0.12, 0.28, 0.24, 0.24)));
      await page.eval(`(() => { const w = __critterWorld; w.flies.forEach((f, i) => { f.respawn = 0; f.fade = 1; f.glow = 1; if (i) { f.x = 0.02; f.y = 0.98; } });
        const f = w.flies[0]; f.x = 0.62 * ${a}; f.y = 0.52; f.height = 0.08; f.vx = f.vy = 0; __critterAdvance(0); })()`);
      files.push(await page.shot(`qa/.out/shots/midge-${tag}.png`, at(0.62 * a - 0.08, 0.6, 0.16, 0.16)));
      if (light === 'day') files.push(await page.shot(`qa/.out/shots/caustics-${tag}.png`, at(0.6, 0.72, 0.4, 0.26)));
    }
  }
  const name = (f) => f.split('/').pop();
  const of = (group) => files.filter((f) => f.includes(`/${group}-`));
  // Full scenes at their CSS size (the shots are 2× device pixels), one per row, never scaled to fit.
  const full = (group, { width }) =>
    `<h2>${group}</h2>${of(group)
      .map(
        (f) =>
          `<figure class="full"><img src="${name(f)}" width="${width}"><figcaption>${name(f)} · creature: ______ · action: ______ · motive: ______</figcaption></figure>`,
      )
      .join('')}`;
  const crops = ['focus', 'reeds', 'motes', 'midge', 'caustics']
    .map(
      (group) =>
        `<h3>${group}</h3><section>${of(group)
          .map((f) => `<figure><img src="${name(f)}"><figcaption>${name(f)}</figcaption></figure>`)
          .join('')}</section>`,
    )
    .join('');
  writeFileSync(
    'qa/.out/shots/sheet.html',
    `<!doctype html><meta charset="utf-8"><title>Frog pond shots</title><style>body{font:14px system-ui;margin:16px;background:#888}figure{margin:0 0 24px}figure.full img{max-width:none;display:block}section img{max-width:100%;display:block}figcaption{margin:4px 0 12px}section{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px}details{margin-top:32px}summary{font-weight:600;cursor:pointer}</style>` +
      `<h1>Full scenes first (spec Q-R4, Q-R5)</h1><p>View this page at 100 % zoom. For each frame, write down in docs/&lt;ANIMAL&gt;_COMPOSITION_REVIEW.md the creature, its action and its environmental motive before opening the crops. If you can't name them without searching the frame, or they don't match the visual direction board, record a composition defect (E-33), whatever the numbers say. Then watch the shipped build live for at least 30 s at desktop and phone size (npm run build, npm run preview).</p>` +
      full('full-desktop', DESKTOP) +
      full('full-phone', PHONE) +
      `<details><summary>Detail crops: open only after the full-scene review is written down (Q-R6)</summary>${crops}</details>`,
  );
  report.info('screenshots', `${files.length} in qa/.out/shots (open sheet.html: full scenes first, then crops)`);
};
