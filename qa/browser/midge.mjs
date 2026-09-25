// A midge's shadow falls down-left of it (the light is up-right) in both
// renderers, and the renderers put it in the same place.
import { THRESHOLDS } from '../thresholds.mjs';

export default async ({ page, site, report }) => {
  const offsets = {};
  for (const renderer of ['webgl2', 'canvas']) {
    await page.goto(`${site}?dpr=fixed${renderer === 'canvas' ? '&renderer=canvas' : ''}#day`);
    await page.ready();
    await page.freeze();
    const r = await page.eval(`(() => {
      const w = __frogWorld; const c = document.querySelector('canvas'); const H = c.height;
      // One midge, high up, over open water; the others parked far away.
      w.flies.forEach((f, i) => { f.respawn = 0; f.fade = 1; f.glow = 1; if (i) { f.x = 0.02; f.y = 0.98; } });
      const f = w.flies[0]; f.x = 0.62 * c.width / H; f.y = 0.52; f.height = 0.08;
      const grab = () => {
        __frogAdvance(0);
        if (__frogMode() === 'canvas') return c.getContext('2d').getImageData(0, 0, c.width, H).data;
        const gl = c.getContext('webgl2'); const px = new Uint8Array(c.width * H * 4);
        gl.readPixels(0, 0, c.width, H, gl.RGBA, gl.UNSIGNED_BYTE, px);
        const data = new Uint8Array(px.length);
        for (let y = 0; y < H; y++) data.set(px.subarray((H - 1 - y) * c.width * 4, (H - y) * c.width * 4), y * c.width * 4);
        return data;
      };
      const withFly = grab();
      f.respawn = 99; const without = grab();
      let sx = 0, sy = 0, sw = 0;
      const cx = f.x * H, cy = (1 - f.y) * H;
      for (let y = Math.round(cy - 60); y < cy + 60; y++) for (let x = Math.round(cx - 60); x < cx + 60; x++) {
        const o = (y * c.width + x) * 4;
        const d = (without[o] + without[o + 1] + without[o + 2]) - (withFly[o] + withFly[o + 1] + withFly[o + 2]);
        if (d > 3 && Math.hypot(x - cx, y - cy) > 6) { sx += x * d; sy += y * d; sw += d; }
      }
      return sw ? [sx / sw - cx, sy / sw - cy] : null;
    })()`);
    offsets[renderer] = r;
    report.expect(
      `${renderer}: shadow down-left of the midge (+x right, +y down)`,
      Boolean(r) && r[0] < 0 && r[1] > 0,
      r ? `(${r[0].toFixed(1)}, ${r[1].toFixed(1)}) px` : 'no shadow found',
    );
  }
  if (offsets.webgl2 && offsets.canvas) {
    const gap = Math.max(
      Math.abs(offsets.webgl2[0] - offsets.canvas[0]),
      Math.abs(offsets.webgl2[1] - offsets.canvas[1]),
    );
    report.measure('WebGL vs Canvas shadow position', +gap.toFixed(1), THRESHOLDS.midge.rendererGapPx);
  }
};
