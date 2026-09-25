// The bank stays put when the pond is resized a little: the share of bank
// pixels (the left 400 px, which every size has) that change a lot.
import { THRESHOLDS } from '../thresholds.mjs';

export default async ({ page, pages, report }) => {
  const T = THRESHOLDS.reshuffle;
  await page.goto(`${pages}bake.html`);
  const r = await page.eval(`(() => {
    const cmp = (w1, w2, h) => {
      const a = paintBank(w1, h, 'day'), b = paintBank(w2, h, 'day');
      const da = a.getContext('2d').getImageData(0, 0, 400, h).data, db = b.getContext('2d').getImageData(0, 0, 400, h).data;
      let diff = 0, n = 0;
      for (let i = 0; i < da.length; i += 4) {
        if (da[i + 3] < 128 && db[i + 3] < 128) continue;
        n++;
        if (Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]) > 60) diff++;
      }
      return +(diff / n * 100).toFixed(1);
    };
    return { same: cmp(880, 880, 595), plus1: cmp(880, 881, 595), plus10: cmp(880, 890, 595) };
  })()`);
  report.measure('same size, painted twice', r.same, T.sameSize);
  report.measure('1 px wider', r.plus1, T.plus1px);
  report.measure('10 px wider', r.plus10, T.plus10px);
};
