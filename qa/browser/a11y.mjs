// Keyboard and contrast, at desktop width and at 375 px: the pond is the
// first thing Tab reaches, text contrast against the page (AA), the
// keyboard-focus ring against the water and its own halo (non-text), and no
// sideways scrolling on a phone. Focus screenshots in qa/.out/shots (at 1×:
// headless captures of this WebGL scene hang above about 1.5 Mpx).
import { THRESHOLDS } from '../thresholds.mjs';

export default async ({ page, site, report }) => {
  const T = THRESHOLDS.a11y;
  for (const [shape, width, height] of [
    ['desktop', 1600, 1100],
    ['phone', 375, 812],
  ]) {
    await page.viewport(width, height, 1, shape === 'phone');
    const tag = shape;
    await page.goto(`${site}?dpr=fixed`);
    await page.ready();
    await page.eval('document.activeElement?.blur(); window.scrollTo(0, 0)');
    const order = [];
    for (let i = 0; i < 2; i++) {
      await page.tab();
      order.push(
        await page.eval(
          `(() => { const e = document.activeElement; return e === document.body ? 'body' : e.tagName.toLowerCase() + (e.textContent.trim() ? ' ' + e.textContent.trim() : '') + (e.hasAttribute('aria-pressed') ? ' pressed=' + e.getAttribute('aria-pressed') : ''); })()`,
        ),
      );
      if (i === 0) await page.shot(`qa/.out/shots/a11y-focus-${shape}.png`);
    }
    report.measure(`${tag}: first Tab stop`, order[0], { equals: 'canvas' });
    report.info(`${tag}: tab order`, order.join(' → '));
    const contrast = await page.eval(`(() => {
      const parse = (c) => c.match(/[\\d.]+/g).map(Number);
      const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }; return .2126 * f(r) + .7152 * f(g) + .0722 * f(b); };
      const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + .05) / (y + .05); };
      const root = getComputedStyle(document.documentElement);
      const pages = ['--page', '--page-deep'].map((v) => { const d = document.createElement('div'); d.style.color = root.getPropertyValue(v); document.body.append(d); const c = parse(getComputedStyle(d).color); d.remove(); return c; });
      const bgOf = (e) => { while (e && e !== document.body) { const v = parse(getComputedStyle(e).backgroundColor); if (v.length === 3 || v[3] > 0) return [v.slice(0, 3)]; e = e.parentElement; } return pages; };
      const items = { title: 'h1', 'badge label': '.badge:not([aria-current])', 'current badge label': '.badge[aria-current]' };
      const out = {};
      for (const [k, sel] of Object.entries(items)) { const e = document.querySelector(sel); if (!e) continue; const c = parse(getComputedStyle(e).color).slice(0, 3); out[k] = Math.min(...bgOf(e).map((b) => ratio(c, b))); }
      // The focus ring (the site shell's): an ink line on a halo, both over the water (the pond's ground colour).
      const stage = document.querySelector('.stage');
      const over = (c, b) => c.slice(0, 3).map((v, i) => v * (c[3] ?? 1) + b[i] * (1 - (c[3] ?? 1)));
      const water = parse(getComputedStyle(document.getElementById('scene')).backgroundColor).slice(0, 3);
      const halo = over(parse(getComputedStyle(stage, '::before').backgroundColor), water);
      const ring = over(parse(getComputedStyle(stage, '::after').backgroundColor), water);
      out['focus ring, against the water'] = ratio(ring, water);
      out['focus ring, against its halo'] = ratio(ring, halo);
      return out;
    })()`);
    for (const [what, value] of Object.entries(contrast)) {
      report.measure(
        `${tag}: contrast, ${what}`,
        +value.toFixed(2),
        what.startsWith('focus ring') ? T.nonText : T.text,
      );
    }
    if (shape === 'phone') {
      const layout = await page.eval(`(() => ({ overflow: document.documentElement.scrollWidth - innerWidth,
        outside: [...document.querySelectorAll('main *')].filter((e) => { const r = e.getBoundingClientRect(); return r.right > innerWidth + 0.5 || r.left < -0.5; }).map((e) => e.id || e.className).slice(0, 4) }))()`);
      report.measure(`${tag}: sideways overflow at 375 px`, layout.overflow, T.phoneOverflow);
      report.expect(
        `${tag}: nothing sticks out of the screen`,
        layout.outside.length === 0,
        layout.outside.join(', ') || 'none',
      );
      await page.shot(`qa/.out/shots/a11y-phone.png`);
    }
  }
};
