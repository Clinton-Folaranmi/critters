// Keyboard and contrast, in both lights, at desktop width and at 375 px:
// tab order (the pond, then Night, then Day), the switch's state, text
// contrast against the page (AA), the switch's outline (non-text), and no
// sideways scrolling on a phone. Focus screenshots in qa/.out/shots.
import { THRESHOLDS } from '../thresholds.mjs';

export default async ({ page, site, report }) => {
  const T = THRESHOLDS.a11y;
  for (const [shape, width, height] of [
    ['desktop', 1600, 1100],
    ['phone', 375, 812],
  ]) {
    await page.viewport(width, height, 1, shape === 'phone');
    for (const light of ['night', 'day']) {
      const tag = `${shape} ${light}`;
      await page.goto(`${site}?dpr=fixed${light === 'day' ? '#day' : ''}`);
      await page.ready();
      await page.eval('document.activeElement?.blur(); window.scrollTo(0, 0)');
      const order = [];
      for (let i = 0; i < 4; i++) {
        await page.tab();
        order.push(
          await page.eval(
            `(() => { const e = document.activeElement; return e === document.body ? 'body' : e.tagName.toLowerCase() + (e.textContent.trim() ? ' ' + e.textContent.trim() : '') + (e.hasAttribute('aria-pressed') ? ' pressed=' + e.getAttribute('aria-pressed') : ''); })()`,
          ),
        );
        if (i === 0) await page.shot(`qa/.out/shots/a11y-focus-${shape}-${light}.png`);
      }
      const pressed = light === 'night' ? ['true', 'false'] : ['false', 'true'];
      report.measure(`${tag}: tab order`, order.slice(0, 3).join(' → '), {
        equals: `canvas → button Night pressed=${pressed[0]} → button Day pressed=${pressed[1]}`,
      });
      const contrast = await page.eval(`(() => {
        const parse = (c) => c.match(/[\\d.]+/g).map(Number);
        const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= .03928 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4; }; return .2126 * f(r) + .7152 * f(g) + .0722 * f(b); };
        const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + .05) / (y + .05); };
        const root = getComputedStyle(document.documentElement);
        const pages = ['--page', '--page-deep'].map((v) => { const d = document.createElement('div'); d.style.color = root.getPropertyValue(v); document.body.append(d); const c = parse(getComputedStyle(d).color); d.remove(); return c; });
        const bgOf = (e) => { while (e && e !== document.body) { const v = parse(getComputedStyle(e).backgroundColor); if (v.length === 3 || v[3] > 0) return [v.slice(0, 3)]; e = e.parentElement; } return pages; };
        const items = { eyebrow: '.eyebrow', title: '#title', lede: '#lede', hint: '#hint li', 'key caps': '#hint kbd', 'switch, pressed': '#lights button[aria-pressed=true]', 'switch, not pressed': '#lights button[aria-pressed=false]' };
        const out = {};
        for (const [k, sel] of Object.entries(items)) { const e = document.querySelector(sel); if (!e) continue; const c = parse(getComputedStyle(e).color).slice(0, 3); out[k] = Math.min(...bgOf(e).map((b) => ratio(c, b))); }
        const border = parse(getComputedStyle(document.getElementById('lights')).borderTopColor);
        out.outline = Math.min(...pages.map((p) => ratio(border.slice(0, 3).map((v, i) => v * (border[3] ?? 1) + p[i] * (1 - (border[3] ?? 1))), p)));
        return out;
      })()`);
      for (const [what, value] of Object.entries(contrast)) {
        report.measure(`${tag}: contrast, ${what}`, +value.toFixed(2), what === 'outline' ? T.nonText : T.text);
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
        await page.shot(`qa/.out/shots/a11y-phone-${light}.png`);
      }
    }
  }
};
