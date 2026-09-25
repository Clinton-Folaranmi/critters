// A minimal Chrome DevTools Protocol driver for Playwright's headless shell
// (no dependencies: Node 22+ has fetch and WebSocket built in). Playwright
// itself isn't needed, only its browser download:
//
//   npx playwright install chromium-headless-shell     (once, per machine)
//
// It's looked for in Playwright's cache (~/Library/Caches/ms-playwright on
// macOS, ~/.cache/ms-playwright on Linux), or set QA_CHROME to a binary.
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { homedir, platform, tmpdir } from 'node:os';
import { join } from 'node:path';

export function findChrome() {
  if (process.env.QA_CHROME) return process.env.QA_CHROME;
  const caches = [join(homedir(), 'Library/Caches/ms-playwright'), join(homedir(), '.cache/ms-playwright')];
  for (const cache of caches) {
    if (!existsSync(cache)) continue;
    const shells = readdirSync(cache)
      .filter((name) => name.startsWith('chromium_headless_shell-'))
      .sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
    for (const shell of shells) {
      for (const folder of readdirSync(join(cache, shell))) {
        for (const binary of ['chrome-headless-shell', 'headless_shell']) {
          const path = join(cache, shell, folder, binary);
          if (existsSync(path)) return path;
        }
      }
    }
  }
  throw new Error(
    "No headless Chrome found. Install Playwright's headless shell once with\n" +
      '  npx playwright install chromium-headless-shell\n' +
      'or set QA_CHROME to a Chrome or chrome-headless-shell binary.',
  );
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

/**
 * Starts the browser and runs `task(page)`. Options: width, height, dsf
 * (device pixel ratio), flags (extra Chrome flags).
 */
export async function withPage(task, { width = 1600, height = 1100, dsf = 1, flags = [] } = {}) {
  const port = 9300 + Math.floor(Math.random() * 600);
  const profile = mkdtempSync(join(tmpdir(), 'animal-farm-qa-'));
  const gpu = platform() === 'darwin' ? ['--use-angle=metal', '--ignore-gpu-blocklist'] : ['--ignore-gpu-blocklist'];
  const chrome = spawn(
    findChrome(),
    [
      `--remote-debugging-port=${port}`,
      ...gpu,
      '--hide-scrollbars',
      '--no-first-run',
      `--window-size=${width},${height}`,
      `--force-device-scale-factor=${dsf}`,
      `--user-data-dir=${profile}`,
      ...flags,
      'about:blank',
    ],
    { stdio: ['ignore', 'ignore', 'pipe'] },
  );
  let targets = [];
  for (let i = 0; i < 100 && !targets.some((t) => t.type === 'page'); i++) {
    try {
      targets = await (await fetch(`http://127.0.0.1:${port}/json`)).json();
    } catch {
      // not up yet
    }
    if (!targets.length) await sleep(100);
  }
  const target = targets.find((t) => t.type === 'page');
  if (!target) throw new Error('The browser did not start.');
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((done) => ws.addEventListener('open', done));
  let id = 0;
  const pending = new Map();
  const listeners = [];
  ws.addEventListener('message', (event) => {
    const message = JSON.parse(event.data);
    if (message.id && pending.has(message.id)) {
      const { resolve, reject } = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) reject(new Error(JSON.stringify(message.error)));
      else resolve(message.result);
    } else if (message.method) for (const listener of listeners) listener(message);
  });
  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const n = ++id;
      pending.set(n, { resolve, reject });
      ws.send(JSON.stringify({ id: n, method, params }));
    });
  const consoleLines = [];
  const requests = [];
  listeners.push((m) => {
    if (m.method === 'Runtime.consoleAPICalled')
      consoleLines.push(`[${m.params.type}] ` + m.params.args.map((a) => a.value ?? a.description).join(' '));
    if (m.method === 'Runtime.exceptionThrown')
      consoleLines.push(
        '[exception] ' + (m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text),
      );
    if (m.method === 'Log.entryAdded') consoleLines.push(`[log:${m.params.entry.level}] ${m.params.entry.text}`);
    if (m.method === 'Network.requestWillBeSent') requests.push(m.params.request.url);
  });
  for (const domain of ['Runtime', 'Log', 'Page', 'Network']) await send(`${domain}.enable`);

  const page = {
    send,
    console: consoleLines,
    requests,
    listeners,
    sleep,
    /** Console lines that are errors or warnings (logged since `from`). */
    problems(from = 0) {
      return consoleLines.slice(from).filter((line) => /^\[(error|warning|exception|log:error|log:warning)/.test(line));
    },
    /** Loads `url` afresh (via about:blank, so a change of #hash alone still reloads). */
    async goto(url, wait = 300) {
      await send('Page.navigate', { url: 'about:blank' });
      await sleep(50);
      await send('Page.navigate', { url });
      await sleep(wait);
      for (let i = 0; i < 150; i++) {
        try {
          if ((await page.eval('document.readyState')) === 'complete') return;
        } catch {
          // navigating
        }
        await sleep(100);
      }
    },
    async eval(expression) {
      const result = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails)
        throw new Error(result.exceptionDetails.exception?.description ?? result.exceptionDetails.text);
      return result.result.value;
    },
    /** Waits for the pond's first frame (the canvas is shown then); false after `ms`. */
    async ready(ms = 10000) {
      for (let waited = 0; waited < ms; waited += 150) {
        const shown = await page
          .eval(
            `(() => { const c = document.querySelector('canvas'); return !!c && c.style.opacity === '' && (window.__frogReady?.() ?? true); })()`,
          )
          .catch(() => false);
        if (shown) return true;
        await sleep(150);
      }
      return false;
    },
    async viewport(width, height, deviceScaleFactor = 1, mobile = false) {
      await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor, mobile });
    },
    async click(x, y) {
      await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
    },
    async touch(x, y, hold = 30) {
      await send('Input.dispatchTouchEvent', {
        type: 'touchStart',
        touchPoints: [{ x, y, radiusX: 8, radiusY: 8, force: 1 }],
      });
      await sleep(hold);
      await send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    },
    async key(key, code = key, keyCode = 0, modifiers = 0) {
      const text = key === 'Enter' ? '\r' : key === ' ' ? ' ' : undefined;
      await send('Input.dispatchKeyEvent', {
        type: 'keyDown',
        key,
        code,
        windowsVirtualKeyCode: keyCode,
        text,
        modifiers,
      });
      await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: keyCode, modifiers });
    },
    async tab(shift = false) {
      await page.key('Tab', 'Tab', 9, shift ? 8 : 0);
    },
    async shot(path, clip) {
      const result = await send('Page.captureScreenshot', {
        format: 'png',
        ...(clip ? { clip: { ...clip, scale: 1 } } : {}),
      });
      writeFileSync(path, Buffer.from(result.data, 'base64'));
      return path;
    },
    /** Freezes the loop (the scene pauses while the tab is "hidden"), so __frogAdvance() alone moves time. */
    async freeze() {
      await page.eval(
        `(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); })()`,
      );
    },
  };
  try {
    return await task(page);
  } finally {
    if (process.env.QA_CONSOLE === '1') console.log('--- console ---\n' + consoleLines.join('\n'));
    ws.close();
    chrome.kill();
    await sleep(200);
    rmSync(profile, { recursive: true, force: true });
  }
}
