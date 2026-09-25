// Brightness: mean luma inside the visible picture (where the picture's
// mask is over half opaque), bank included, per light and renderer, and the
// gap between the renderers. Reads the canvas's own pixels at full resolution.
import { THRESHOLDS } from '../thresholds.mjs';

export default async ({ page, site, report }) => {
  const T = THRESHOLDS.luma;
  const results = {};
  for (const light of ['night', 'day']) {
    for (const renderer of ['webgl2', 'canvas']) {
      await page.goto(
        `${site}?dpr=fixed${renderer === 'canvas' ? '&renderer=canvas' : ''}${light === 'day' ? '#day' : ''}`,
      );
      await page.ready();
      await page.sleep(300);
      await page.freeze();
      const r = await page.eval(`(async () => {
        const c = document.querySelector('canvas'); const w = c.width, h = c.height;
        __frogAdvance(0);
        let data;
        if (__frogMode() === 'webgl2') {
          const gl = c.getContext('webgl2');
          const px = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
          data = new Uint8Array(w * h * 4);
          for (let y = 0; y < h; y++) data.set(px.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
        } else data = c.getContext('2d').getImageData(0, 0, w, h).data;
        // The mask the scene put on the pond, drawn at the canvas's size.
        const css = getComputedStyle(document.getElementById('pond')).maskImage || getComputedStyle(document.getElementById('pond')).webkitMaskImage;
        const img = new Image(); img.src = css.slice(css.indexOf('"') + 1, css.lastIndexOf('"'));
        await img.decode();
        const m = document.createElement('canvas'); m.width = w; m.height = h;
        const g = m.getContext('2d'); g.drawImage(img, 0, 0, w, h);
        const mask = g.getImageData(0, 0, w, h).data;
        const vals = [], water = [], bank = [];
        for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) {
          const o = (y * w + x) * 4;
          if (mask[o + 3] < 128) continue;
          const l = data[o] * .299 + data[o + 1] * .587 + data[o + 2] * .114;
          vals.push(l);
          (__frogBank.shoreDistance((x + .5) / h, 1 - (y + .5) / h, w / h) > 0 ? water : bank).push(l);
        }
        vals.sort((a, b) => a - b);
        const avg = (a) => a.reduce((p, q) => p + q, 0) / a.length;
        return { size: w + 'x' + h, mean: avg(vals), p10: vals[Math.floor(vals.length * .1)], p90: vals[Math.floor(vals.length * .9)], water: avg(water), bank: avg(bank), bankShare: bank.length / vals.length };
      })()`);
      results[`${light} ${renderer}`] = r;
      report.measure(`${light} ${renderer}: mean luma`, +r.mean.toFixed(1), T[light]);
      report.info(
        `${light} ${renderer}: p10 / p90, water / bank, bank share, size`,
        `${r.p10.toFixed(0)} / ${r.p90.toFixed(0)}, ${r.water.toFixed(1)} / ${r.bank.toFixed(1)}, ${r.bankShare.toFixed(2)}, ${r.size}`,
      );
    }
    report.measure(
      `${light}: WebGL − Canvas`,
      +Math.abs(results[`${light} webgl2`].mean - results[`${light} canvas`].mean).toFixed(1),
      T.rendererGap,
    );
  }
};
