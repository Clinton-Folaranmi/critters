// The shipped single file (dist/standalone/frogs.html) opened from disk: a
// proper page head, no dev helpers, no requests beyond itself, the bank
// painted in a worker, Night | Day by click, by keyboard and by #day, and
// the page working in a sandboxed iframe (no storage), as on an artifact host.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export default async ({ page, report }) => {
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: readFileSync('qa/lib/instrument.js', 'utf8') });
  const url = pathToFileURL(resolve('dist/standalone/frogs.html')).href;
  const state = () =>
    page.eval(`(() => ({ light: document.documentElement.dataset.light, title: document.title,
      pressed: [...document.querySelectorAll('#lights button')].map((b) => b.getAttribute('aria-pressed')).join(','),
      canvases: document.querySelectorAll('canvas').length }))()`);
  page.requests.length = 0;
  const from = page.console.length;
  await page.goto(url);
  report.expect('opens and draws', await page.ready());
  const head =
    await page.eval(`(() => ({ compat: document.compatMode, lang: document.documentElement.lang, charset: document.characterSet,
    viewport: document.querySelector('meta[name=viewport]')?.content ?? '', bodyMargin: getComputedStyle(document.body).margin,
    hooks: typeof window.__frogWorld, label: document.querySelector('canvas').getAttribute('aria-label'), steps: document.querySelectorAll('#hint li').length }))()`);
  report.measure('standards mode', head.compat, { equals: 'CSS1Compat' });
  report.measure('language', head.lang, { equals: 'en' });
  report.measure('charset', head.charset, { equals: 'UTF-8' });
  report.expect('viewport meta', head.viewport.includes('width=device-width'), head.viewport);
  report.measure('body margin', head.bodyMargin, { equals: '0px' });
  report.measure('dev helpers present', head.hooks, { equals: 'undefined' });
  report.measure('instruction steps', head.steps, { equals: 5 });
  const workers = await page.eval('__audit.workers.made');
  report.measure('bank painted in a worker (workers started)', workers, { min: 1 });
  await page.shot('qa/.out/shots/standalone-night.png');

  const [bx, by] = await page.eval(
    `(() => { const r = document.querySelectorAll('#lights button')[1].getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`,
  );
  await page.click(bx, by);
  await page.ready();
  const day = await state();
  report.expect(
    'click Day: day light, title, pressed state, one canvas',
    day.light === 'day' && day.title === 'Day Chorus' && day.pressed === 'false,true' && day.canvases === 1,
    JSON.stringify(day),
  );
  await page.shot('qa/.out/shots/standalone-day.png');
  await page.eval(`document.querySelectorAll('#lights button')[0].focus()`);
  await page.key('Enter', 'Enter', 13);
  await page.ready();
  const night = await state();
  report.expect(
    'Enter on Night: back to night',
    night.light === 'night' && night.pressed === 'true,false',
    JSON.stringify(night),
  );
  await page.goto(`${url}#day`);
  await page.ready();
  report.measure('opened with #day', (await state()).light, { equals: 'day' });
  const outside = page.requests.filter((u) => !/^(file|data|blob|about):/.test(u));
  report.measure('requests beyond the file', outside.length, { equals: 0 });
  report.measure('console errors and warnings', page.problems(from).length, { equals: 0 });

  // A sandboxed iframe without allow-same-origin (like an artifact host).
  writeFileSync('qa/.out/pages/sandbox-inner.html', readFileSync('dist/standalone/frogs.html'));
  writeFileSync(
    'qa/.out/pages/sandbox.html',
    '<!doctype html><iframe sandbox="allow-scripts" src="sandbox-inner.html" style="width:1000px;height:900px;border:0"></iframe>',
  );
  await page.goto(pathToFileURL(resolve('qa/.out/pages/sandbox.html')).href);
  await page.sleep(3500);
  const tree = await page.send('Page.getFrameTree');
  const child = tree.frameTree.childFrames?.[0]?.frame;
  const world = await page.send('Page.createIsolatedWorld', { frameId: child.id });
  const inFrame = async (expression) =>
    (await page.send('Runtime.evaluate', { expression, contextId: world.executionContextId, returnByValue: true }))
      .result.value;
  const boxed = await inFrame(
    `(() => { let storage = 'ok'; try { localStorage.getItem('x'); } catch (e) { storage = 'throws'; } const c = document.querySelector('canvas'); return { storage, shown: c?.style.opacity === '', light: document.documentElement.dataset.light }; })()`,
  );
  report.expect('sandboxed iframe: draws (storage blocked there)', boxed.shown, JSON.stringify(boxed));
  const [ix, iy] = await inFrame(
    `(() => { const r = document.querySelectorAll('#lights button')[1].getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; })()`,
  );
  await page.click(ix, iy);
  await page.sleep(2500);
  const after = await inFrame(
    `({ light: document.documentElement.dataset.light, shown: document.querySelector('canvas')?.style.opacity === '', canvases: document.querySelectorAll('canvas').length })`,
  );
  report.expect(
    'sandboxed iframe: Day switch works',
    after.light === 'day' && after.shown && after.canvases === 1,
    JSON.stringify(after),
  );
};
