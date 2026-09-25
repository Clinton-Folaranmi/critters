// Taps land on what is visible: the picture's mask vs the tap rule
// (pictureEdge ≤ 1), grass drawn over the water counted as bank, and real
// clicks on the demo (corners outside the picture, the bank, a reed), the
// tap cooldown, and the keyboard.
import { THRESHOLDS } from '../thresholds.mjs';

export default async ({ page, pages, site, report }) => {
  const T = THRESHOLDS.hit;
  // 1. The mask as drawn vs the tap rule, and the bank layer's coverage vs the water.
  await page.goto(`${pages}bake.html`);
  for (const [w, h] of [
    [880, 595],
    [375, 412],
  ]) {
    const r = await page.eval(`(async () => {
      const w = ${w}, h = ${h}, aspect = w / h;
      const url = bank.bankMaskUrl(Math.round(aspect * 100) / 100);
      const img = new Image(); img.src = url.slice(url.indexOf('"') + 1, url.lastIndexOf('"'));
      await img.decode();
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const g = c.getContext('2d'); g.drawImage(img, 0, 0, w, h);
      const mask = g.getImageData(0, 0, w, h).data;
      const layer = paintBank(w, h, 'night');
      const lay = layer.getContext('2d').getImageData(0, 0, w, h).data;
      const cover = bankMask(layer);
      let faintAccepted = 0, visibleRejected = 0, visible = 0, overhang = 0, counted = 0;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const o = (y * w + x) * 4, m = mask[o + 3] / 255;
        const wx = (x + .5) / h, wy = 1 - (y + .5) / h;
        const inside = bank.pictureEdge(wx, wy, aspect) <= 1;
        if (inside && m < 0.2) faintAccepted++;
        if (m > 0.6) { visible++; if (!inside) visibleRejected++; }
        // Opaque bank (grass, earth) drawn where the shore maths says water.
        if (lay[o + 3] > 200 && bank.shoreDistance(wx, wy, aspect) > 0 && m > 0.3) {
          overhang++;
          const cx = Math.min(cover.width - 1, Math.floor(x / w * cover.width)), cy = Math.min(cover.height - 1, Math.floor(y / h * cover.height));
          if (cover.data[cy * cover.width + cx] / 255 > 0.35) counted++;
        }
      }
      return { faintAccepted: faintAccepted / (w * h) * 100, visibleRejected: visibleRejected / visible * 100, overhang, counted: counted / Math.max(1, overhang) * 100 };
    })()`);
    const tag = `${w}×${h}`;
    report.measure(
      `${tag}: taps accepted where the mask is under 0.2`,
      +r.faintAccepted.toFixed(2),
      T.acceptedWhereFaint,
    );
    report.measure(
      `${tag}: clearly visible picture outside the tap rule`,
      +r.visibleRejected.toFixed(2),
      T.visibleRejected,
    );
    report.measure(
      `${tag}: grass over the water counted as bank (${r.overhang} px)`,
      +r.counted.toFixed(1),
      T.overhangCounted,
    );
  }

  // 2. Real clicks on the demo.
  await page.goto(`${site}?dpr=fixed`);
  await page.ready();
  const rect = await page.eval(
    `(() => { const r = document.querySelector('canvas').getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; })()`,
  );
  const toPx = (x, y) => [rect[0] + x * rect[3], rect[1] + (1 - y) * rect[3]];
  const probe = async (px, py) => {
    const before = await page.eval('__frogTaps()');
    const motes = await page.eval('__frogWorld.motes.filter((m) => m.life > 0).length');
    await page.click(px, py);
    await page.sleep(120);
    const after = await page.eval('__frogTaps()');
    const moved = Object.keys(after).filter((k) => after[k] !== (before[k] ?? 0));
    return {
      results: moved.join(',') || 'nothing',
      motes: (await page.eval('__frogWorld.motes.filter((m) => m.life > 0).length')) > motes,
    };
  };
  for (const [label, fx, fy] of [
    ['top-right', 0.985, 0.02],
    ['bottom-right', 0.985, 0.98],
    ['top-left', 0.015, 0.02],
  ]) {
    const r = await probe(rect[0] + rect[2] * fx, rect[1] + rect[3] * fy);
    report.measure(`click in the ${label} corner (outside the picture)`, r.results, { equals: 'nothing' });
  }
  const onBank = await probe(...toPx(0.45, 0.12));
  report.expect(
    'click on the bank: counts as bank and lifts motes',
    onBank.results === 'bank' && onBank.motes,
    `${onBank.results}, motes ${onBank.motes}`,
  );
  const reed = await page.eval(`(() => {
    const a = ${rect[2] / rect[3]};
    for (let y = 0.4; y < 0.75; y += 0.002) for (let x = 0.02; x < 0.4; x += 0.002)
      if (__frogBank.reedAt(x, y, a, -0.002) && !__frogBank.reedAt(x, y - 0.03, a, 0)) return [x, y];
    return null;
  })()`);
  report.expect('found a reed blade to click', Boolean(reed));
  if (reed) {
    const onReed = await probe(...toPx(reed[0], reed[1]));
    report.expect(
      'click on a reed: counts as bank and lifts motes',
      onReed.results === 'bank' && onReed.motes,
      `${onReed.results}, motes ${onReed.motes}`,
    );
  }
  const cool =
    await page.eval(`(() => { const f = __frogWorld.frogs[0]; __frogAdvance(1); const before = __frogTaps().frog ?? 0;
    __frogTap(f.x, f.y); const state = f.state; const time = f.time; __frogTap(f.x, f.y);
    return { state, same: f.state === state && Math.abs(f.time - time) < 1e-9 }; })()`);
  report.expect(
    'a second tap on a frog within its cooldown changes nothing',
    cool.same,
    `after the first tap: ${cool.state}`,
  );
  const keys = await page.eval(`(() => {
    const c = document.querySelector('canvas'); c.focus(); const sy = scrollY;
    const e1 = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }); c.dispatchEvent(e1);
    const e2 = new KeyboardEvent('keydown', { key: ' ', repeat: true, bubbles: true, cancelable: true }); c.dispatchEvent(e2);
    return { prevented: e1.defaultPrevented, repeatPrevented: e2.defaultPrevented, scrolled: scrollY - sy };
  })()`);
  report.expect(
    'Space on the pond: handled, repeats too, no scroll',
    keys.prevented && keys.repeatPrevented && keys.scrolled === 0,
    JSON.stringify(keys),
  );
};
