// Fingers get a more forgiving target than a mouse: a point just off a
// frog's outline (0.016 away) misses with the mouse (tolerance 0.01) and
// hits by touch (0.022).
export default async ({ page, site, report }) => {
  const results = {};
  for (const kind of ['mouse', 'touch']) {
    await page.send(
      'Emulation.setTouchEmulationEnabled',
      kind === 'touch' ? { enabled: true, maxTouchPoints: 5 } : { enabled: false },
    );
    await page.goto(`${site}?dpr=fixed`);
    await page.ready();
    await page.freeze();
    const p = await page.eval(`(() => {
      const w = __frogWorld; const i = 1; const f = w.frogs[i];
      let x = f.x, y = f.y; const dx = Math.cos(f.heading + Math.PI / 2), dy = Math.sin(f.heading + Math.PI / 2);
      let d = w.frogDistance(i, x, y); let k = 0;
      while (d < 0.016 && k++ < 400) { x += dx * 0.0005; y += dy * 0.0005; d = w.frogDistance(i, x, y); }
      const r = document.querySelector('canvas').getBoundingClientRect();
      window.__res = []; const tap = w.tap.bind(w); w.tap = (a, b, t, c) => { const res = tap(a, b, t, c); __res.push({ res, t }); return res; };
      return [r.x + x * r.height, r.y + (1 - y) * r.height, +d.toFixed(4)];
    })()`);
    if (kind === 'touch') await page.touch(p[0], p[1]);
    else await page.click(p[0], p[1]);
    await page.sleep(100);
    results[kind] = (await page.eval('__res'))[0];
    report.info(`${kind}: tap ${p[2]} from the frog's outline`, JSON.stringify(results[kind]));
  }
  report.expect(
    'the mouse misses the frog',
    results.mouse && !results.mouse.res.startsWith('frog'),
    results.mouse?.res,
  );
  report.expect('a finger hits the frog', results.touch?.res.startsWith('frog') ?? false, results.touch?.res);
};
