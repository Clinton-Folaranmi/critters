// Brightness: mean luma inside the visible picture (where the picture's
// mask is over half opaque), per renderer, and the gap between the
// renderers. Day only (the pond has no other variant). Reads the canvas's
// own pixels at full resolution.
import { THRESHOLDS } from '../thresholds.mjs';

export default async ({ page, site, report }) => {
  const T = THRESHOLDS.luma;
  const results = {};
  for (const renderer of ['webgl2', 'canvas']) {
    await page.goto(`${site}?dpr=fixed${renderer === 'canvas' ? '&renderer=canvas' : ''}`);
    await page.ready();
    await page.sleep(300);
    await page.freeze();
    const r = await page.eval(`(async () => {
      const c = document.querySelector('canvas'); const w = c.width, h = c.height;
      __critterAdvance(0);
      let data;
      if (__critterMode() === 'webgl2') {
        const gl = c.getContext('webgl2');
        const px = new Uint8Array(w * h * 4); gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
        data = new Uint8Array(w * h * 4);
        for (let y = 0; y < h; y++) data.set(px.subarray((h - 1 - y) * w * 4, (h - y) * w * 4), y * w * 4);
      } else data = c.getContext('2d').getImageData(0, 0, w, h).data;
      // The picture's mask (the site shell's border, on .picture), drawn at the canvas's size.
      const picture = document.querySelector('.picture');
      const css = getComputedStyle(picture).maskImage || getComputedStyle(picture).webkitMaskImage;
      const img = new Image(); img.src = css.slice(css.indexOf('"') + 1, css.lastIndexOf('"'));
      await img.decode();
      const m = document.createElement('canvas'); m.width = w; m.height = h;
      const g = m.getContext('2d'); g.drawImage(img, 0, 0, w, h);
      const mask = g.getImageData(0, 0, w, h).data;
      const vals = [];
      for (let y = 0; y < h; y += 2) for (let x = 0; x < w; x += 2) {
        const o = (y * w + x) * 4;
        if (mask[o + 3] < 128) continue;
        vals.push(data[o] * .299 + data[o + 1] * .587 + data[o + 2] * .114);
      }
      vals.sort((a, b) => a - b);
      return { size: w + 'x' + h, mean: vals.reduce((p, q) => p + q, 0) / vals.length, p10: vals[Math.floor(vals.length * .1)], p90: vals[Math.floor(vals.length * .9)], share: vals.length / Math.ceil(w / 2) / Math.ceil(h / 2) };
    })()`);
    results[renderer] = r;
    report.measure(`${renderer}: mean luma`, +r.mean.toFixed(1), T.day);
    report.info(
      `${renderer}: p10 / p90, share of the canvas inside the picture, size`,
      `${r.p10.toFixed(0)} / ${r.p90.toFixed(0)}, ${r.share.toFixed(3)}, ${r.size}`,
    );
  }
  report.measure('WebGL − Canvas', +Math.abs(results.webgl2.mean - results.canvas.mean).toFixed(1), T.rendererGap);
};
