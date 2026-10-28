// Taps land on what is drawn: the picture's mask (the rounded rectangle)
// against the tap rule (pictureEdge ≤ 1), then real clicks on the demo:
// just outside each rounded corner (nothing), open water, a pad, the board's
// corner pad 11 (drawn, so tappable), the tap cooldown, and the keyboard.
import { THRESHOLDS } from '../thresholds.mjs';

export default async ({ page, pages, site, report }) => {
  const T = THRESHOLDS.hit;
  // 1. The mask as drawn vs the tap rule.
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
      let faintAccepted = 0, visibleRejected = 0, visible = 0;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const o = (y * w + x) * 4, m = mask[o + 3] / 255;
        const wx = (x + .5) / h, wy = 1 - (y + .5) / h;
        const inside = bank.pictureEdge(wx, wy, aspect) <= 1;
        if (inside && m < 0.2) faintAccepted++;
        if (m > 0.6) { visible++; if (!inside) visibleRejected++; }
      }
      return { faintAccepted: faintAccepted / (w * h) * 100, visibleRejected: visibleRejected / visible * 100 };
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
  }

  // 2. Real clicks on the demo (frozen, so nothing moves between aiming and clicking).
  await page.goto(`${site}?dpr=fixed`);
  await page.ready();
  await page.freeze();
  const rect = await page.eval(
    `(() => { const r = document.querySelector('canvas').getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; })()`,
  );
  const toPx = (x, y) => [rect[0] + x * rect[3], rect[1] + (1 - y) * rect[3]];
  const probe = async (px, py) => {
    const before = await page.eval('__critterTaps()');
    await page.click(px, py);
    await page.sleep(120);
    const after = await page.eval('__critterTaps()');
    return (
      Object.keys(after)
        .filter((k) => after[k] !== (before[k] ?? 0))
        .join(',') || 'nothing'
    );
  };
  // 2 CSS px in from each corner of the canvas: outside the rounded corner (radius 0.03 of the height).
  for (const [label, fx, fy] of [
    ['top-left', 0, 0],
    ['top-right', 1, 0],
    ['bottom-left', 0, 1],
    ['bottom-right', 1, 1],
  ]) {
    const r = await probe(rect[0] + (fx ? rect[2] - 2 : 2), rect[1] + (fy ? rect[3] - 2 : 2));
    report.measure(`click in the ${label} corner (outside the picture)`, r, { equals: 'nothing' });
  }
  // Targets from the world: open water well clear of pads and frogs, a free
  // pad's middle, and pad 11's part inside the picture.
  const targets = await page.eval(`(() => {
    const w = __critterWorld, a = ${rect[2] / rect[3]};
    const clearOfFrogs = (x, y) => w.frogs.every((f, i) => w.frogDistance(i, x, y) > 0.05);
    let water = null;
    for (let y = 0.15; y < 0.85 && !water; y += 0.01) for (let x = 0.15; x < a - 0.15 && !water; x += 0.01)
      if (w.pads.every((p) => Math.hypot(x - p.x, y - p.y) > p.radius + 0.05) && clearOfFrogs(x, y)) water = [x, y];
    const free = w.pads.find((p, i) => i < 4 && p.occupant < 0 && clearOfFrogs(p.x, p.y));
    const p11 = w.pads[11];
    let corner = null;
    if (p11) for (let k = 0; k <= 20 && !corner; k++) {
      // Walk from the pad's centre toward the picture's middle until the point is inside the picture.
      const t = k / 20 * 0.9, x = p11.x + (a / 2 - p11.x) * t * p11.radius / Math.hypot(a / 2 - p11.x, 0.5 - p11.y), y = p11.y + (0.5 - p11.y) * t * p11.radius / Math.hypot(a / 2 - p11.x, 0.5 - p11.y);
      if (__critterBank.pictureEdge(x, y, a) < 0.97 && clearOfFrogs(x, y) && w.pads.every((p, i) => i === 11 || Math.hypot(x - p.x, y - p.y) > p.radius)) corner = [x, y];
    }
    return { water, pad: free ? [free.x, free.y] : null, corner };
  })()`);
  for (const [label, at, expected] of [
    ['open water', targets.water, 'water'],
    ['a free pad', targets.pad, 'pad'],
    ['pad 11 in the top-left corner', targets.corner, 'pad'],
  ]) {
    if (!at) report.expect(`found ${label} to click`, false);
    else report.measure(`click on ${label}`, await probe(...toPx(at[0], at[1])), { equals: expected });
  }
  const cool =
    await page.eval(`(() => { const f = __critterWorld.frogs[0]; __critterAdvance(1); const before = __critterTaps().frog ?? 0;
    __critterTap(f.x, f.y); const state = f.state; const time = f.time; __critterTap(f.x, f.y);
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
