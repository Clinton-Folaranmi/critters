// The shipped single file (dist/standalone/frogs.html) opened from disk: a
// proper page head, no dev helpers, the four instruction steps, no requests
// beyond itself, no workers (everything is painted on the page, in slices),
// and the page working in a sandboxed iframe (no storage), as on an
// artifact host.
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export default async ({ page, report }) => {
  await page.send('Page.addScriptToEvaluateOnNewDocument', { source: readFileSync('qa/lib/instrument.js', 'utf8') });
  const url = pathToFileURL(resolve('dist/standalone/frogs.html')).href;
  page.requests.length = 0;
  const from = page.console.length;
  await page.goto(url);
  report.expect('opens and draws', await page.ready());
  const head =
    await page.eval(`(() => ({ compat: document.compatMode, lang: document.documentElement.lang, charset: document.characterSet,
    viewport: document.querySelector('meta[name=viewport]')?.content ?? '', bodyMargin: getComputedStyle(document.body).margin,
    hooks: typeof window.__critterWorld, title: document.title, canvases: document.querySelectorAll('canvas').length, label: document.querySelector('canvas').getAttribute('aria-label'), steps: document.querySelectorAll('#hint li').length }))()`);
  report.measure('standards mode', head.compat, { equals: 'CSS1Compat' });
  report.measure('language', head.lang, { equals: 'en' });
  report.measure('charset', head.charset, { equals: 'UTF-8' });
  report.expect('viewport meta', head.viewport.includes('width=device-width'), head.viewport);
  report.measure('body margin', head.bodyMargin, { equals: '0px' });
  report.measure('dev helpers present', head.hooks, { equals: 'undefined' });
  report.measure('title', head.title, { equals: 'Day Chorus' });
  report.measure('canvases', head.canvases, { equals: 1 });
  report.measure('instruction steps', head.steps, { equals: 4 });
  report.measure('workers started', await page.eval('__audit.workers.made'), { equals: 0 });
  await page.shot('qa/.out/shots/standalone.png');

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
    `(() => { let storage = 'ok'; try { localStorage.getItem('x'); } catch (e) { storage = 'throws'; } const c = document.querySelector('canvas'); return { storage, shown: c?.style.opacity === '', canvases: document.querySelectorAll('canvas').length }; })()`,
  );
  report.expect(
    'sandboxed iframe: draws (storage blocked there)',
    boxed.shown && boxed.canvases === 1,
    JSON.stringify(boxed),
  );
};
