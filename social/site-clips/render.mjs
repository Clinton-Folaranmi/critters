// Renders the 15-second X (Twitter) clips of the site's animal pages: the
// picture alone in its ragged border on the page's paper (no name, no badges),
// framed tight with an even paper margin, 1920 px wide (about 3:2), 30 fps,
// silent H.264. A drawn pointer glides in like a hand, clicks an animal (a soft
// ring shows the press) and the animal reacts; usually twice per clip.
//
//   npm run build:site                                   (once, or after a scene changes)
//   node social/site-clips/render.mjs                    every animal in CLIPS with clicks set
//   node social/site-clips/render.mjs ladybug mouse      just these
//   node social/site-clips/render.mjs --intro frogs      the opening version: blank paper, pencil
//                                                        sketch, colour wash, live scene, clicks
//   node social/site-clips/render.mjs --probe mouse 5,10 stills at those clip times (s), with the
//                                                        clicks set so far, to place the next one
//   node social/site-clips/render.mjs --probe --intro mouse 6,10
//
// A probe still is the clip's own frame: a point at pixel (X, Y) of it is
// picture fraction ((X - 36) / 1848, (Y - 36) / (height - 72)).
//
// Time is stepped, not recorded: clock-shim.js (injected before the page's own
// scripts) gives the page a virtual clock that moves only when this script
// steps it, 1/60 s per frame callback, two per video frame, so every clip is
// real-speed motion whatever the machine's load, and replays the same way.
// The pointer is an overlay drawn here, in the page, above the picture; the
// real mouse events go to the scene at the same place. Nothing in the scenes
// or the site changes: the name and badges are hidden by capture-time CSS.
// Outputs: <animal>-x-15s.mp4 / -sheet.jpg, <animal>-x-15s-intro.mp4 /
// -intro-sheet.jpg. Needs ffmpeg and the Playwright headless shell.
import { spawn } from 'node:child_process';
import {
  createReadStream,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withPage } from '../../qa/lib/chrome.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const site = join(root, 'dist/site');
const shim = readFileSync(join(here, 'clock-shim.js'), 'utf8');

/** The page is laid out at 1000 × 720 CSS px; its picture is then 900 px wide (site.css max-width). */
const VIEW = { width: 1000, height: 720 };
const PICTURE_CSS_WIDTH = 900;
/** The frame: 1920 px wide, the picture element 1848 px of it; with the border's own soft fade that leaves about 60–70 px (3.3 %) of paper all round. */
const OUT_WIDTH = 1920;
const MARGIN = 36;
const DSF = (OUT_WIDTH - 2 * MARGIN) / PICTURE_CSS_WIDTH;
const FPS = 30;
/** Where the intro's clicks are timed from: the clip time the scene nominally arrives (s). */
const INTRO_SCENE_AT = 2;
const SECONDS = 15;
/** Frame callbacks per video frame: the scenes run at 60 Hz, as in a browser. */
const TICKS = 2;

/**
 * Per animal. `start`: how long the scene has run (s, from its first frame)
 * when the plain clip opens. `clicks`: the pointer's clicks, each at a clip
 * time `at` (s) on `on`, fractions (x, y) of the picture. `intro`: the same
 * for the opening version, whose clip starts on blank paper (the scene comes
 * in at about 2 s). Chosen from --probe stills; a click without `on` is skipped.
 */
export const CLIPS = {
  frogs: {
    start: 4,
    clicks: [
      { at: 5, on: [0.469, 0.591] },
      { at: 10, on: [0.646, 0.633] },
    ],
    intro: [
      { at: 6.5, on: [0.366, 0.399] },
      { at: 11, on: [0.661, 0.653] },
    ],
  },
  ladybug: {
    start: 4,
    clicks: [
      { at: 5, on: [0.491, 0.491] },
      { at: 10, on: [0.42, 0.58] }, // the ground beside the seven-spot: an aphid drops there
    ],
    intro: [
      { at: 6.5, on: [0.479, 0.6] },
      { at: 11, on: [0.413, 0.628] },
    ],
  },
  butterfly: {
    start: 4,
    clicks: [
      { at: 5, on: [0.441, 0.52] },
      { at: 10, on: [0.728, 0.264] },
    ],
    intro: [
      { at: 6.5, on: [0.433, 0.508] },
      { at: 11, on: [0.734, 0.266] },
    ],
  },
  snail: {
    start: 4,
    clicks: [
      { at: 5, on: [0.438, 0.544] },
      { at: 10, on: [0.597, 0.828] },
    ],
    intro: [
      { at: 6.5, on: [0.405, 0.566] },
      { at: 11, on: [0.594, 0.845] },
    ],
  },
  mouse: {
    start: 4,
    clicks: [
      { at: 5, on: [0.464, 0.269] },
      { at: 10, on: [0.51, 0.494] },
    ],
    intro: [
      { at: 6.5, on: [0.47, 0.276] },
      { at: 11, on: [0.532, 0.522] },
    ],
  },
};

/** Capture-time CSS: the picture alone, centred, on the paper; no name or badges, no scrollbars. */
const FIT_CSS = `
  html, body { overflow: hidden !important; }
  .page { min-height: 100vh; display: flex; flex-direction: column; justify-content: center; padding-block: 0 !important; }
  .caption { display: none !important; }
  #clip-pointer, #clip-ring { position: fixed; left: 0; top: 0; pointer-events: none; z-index: 50; will-change: transform; }
  #clip-pointer { width: 26px; height: 34px; transform-origin: 2px 2px; filter: drop-shadow(0 1.5px 2px rgba(31, 42, 30, 0.28)); }
  #clip-ring { width: 2px; height: 2px; border-radius: 50%; box-sizing: border-box;
    border: 2.5px solid rgba(255, 252, 242, 0.95); box-shadow: 0 0 0 1px rgba(31, 42, 30, 0.22), inset 0 0 0 1px rgba(31, 42, 30, 0.12); }
`;

/** The pointer and its press ring, drawn above the picture; __clipPointer(state) places them. */
const OVERLAY = `(() => {
  if (document.getElementById('clip-pointer')) return;
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.id = 'clip-pointer';
  svg.setAttribute('viewBox', '0 0 26 34');
  svg.innerHTML = '<path d="M2.5 2.5 L2.5 26.5 L8.6 20.9 L12.6 30.2 L17 28.3 L13 19.2 L21.4 19.2 Z" fill="#1f2a1e" stroke="#faf7ee" stroke-width="2" stroke-linejoin="round"/>';
  const ring = document.createElement('div');
  ring.id = 'clip-ring';
  document.body.append(ring, svg);
  window.__clipPointer = (s) => {
    svg.style.opacity = s.show ? '1' : '0';
    svg.style.transform = 'translate(' + (s.x - 2.5) + 'px,' + (s.y - 2.5) + 'px) scale(' + s.scale + ')';
    ring.style.opacity = String(s.ring);
    ring.style.transform = 'translate(' + (s.rx - s.r) + 'px,' + (s.ry - s.r) + 'px)';
    ring.style.width = ring.style.height = 2 * s.r + 'px';
  };
  window.__clipPointer({ show: false, x: -100, y: -100, scale: 1, ring: 0, rx: 0, ry: 0, r: 1 });
})()`;

const TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.svg': 'image/svg+xml',
};

/** A static server for dist/site on a free local port (closed when done). */
function serve() {
  const server = createServer((req, res) => {
    const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let file = normalize(join(site, path));
    if (!file.startsWith(site)) return res.writeHead(403).end();
    if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
    if (!existsSync(file)) return res.writeHead(404).end();
    res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
    createReadStream(file).pipe(res);
  });
  return new Promise((done) => server.listen(0, '127.0.0.1', () => done(server)));
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

/** Plain clip: loads the page, waits for the scene and the page's own fades, restarts its clock from a fixed reading. */
async function openLive(page, base, animal) {
  await page.goto(`${base}/${animal}/`, 500);
  for (let i = 0; i < 300; i++) {
    const state = await page.eval(
      `({ mode: window.__clip?.mode, still: 'still' in document.documentElement.dataset, hidden: document.querySelector('.sketch')?.hidden ?? true })`,
    );
    if (state.mode !== 'auto' && (state.hidden || state.still)) break;
    await sleep(100);
  }
  // Background layers some scenes bake in workers, the page's own fades: real time.
  await sleep(2500);
  if ((await page.eval('window.__clip.mode')) === 'auto') throw new Error(`${animal}: the scene never showed.`);
  if (!(await page.eval('window.__clip.rebase()')))
    throw new Error(`${animal}: the scene's loop didn't restart after the rebase.`);
}

/** Intro clip: arrives on the page with the clock stepped from its first moment (sketch and all). */
async function openIntro(page, base, animal) {
  await page.goto(`${base}/`, 300);
  await page.eval(`sessionStorage.setItem('clip-intro', '1')`);
  await page.send('Page.navigate', { url: `${base}/${animal}/` });
  for (let tries = 0; ; tries++) {
    const arrived = await page
      .eval(
        `location.pathname === '/${animal}/' && window.__clip?.intro === true && document.readyState === 'complete'`,
      )
      .catch(() => false);
    if (arrived) break;
    if (tries > 150) throw new Error(`${animal}: the page didn't arrive.`);
    await sleep(100);
  }
  // The border mask and the sketch worker's first strokes file load in real time (the clock waits).
  await sleep(1500);
}

/** The picture's box on the page (CSS px). */
const pictureBox = (page) =>
  page.eval(
    `(() => { const r = document.querySelector('.picture').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()`,
  );

/** The frame around the picture: CSS px clip and output size (even). */
function framing(box) {
  const height = 2 * Math.round((box.h * DSF + 2 * MARGIN) / 2);
  const m = MARGIN / DSF;
  return { clip: { x: box.x - m, y: box.y - m, width: OUT_WIDTH / DSF, height: height / DSF, scale: 1 }, height };
}

async function frame(page, clip) {
  const { data } = await page.send('Page.captureScreenshot', { format: 'png', clip, captureBeyondViewport: false });
  return Buffer.from(data, 'base64');
}

async function step(page) {
  await page.eval(`window.__clip.step(1000 / 60, ${TICKS})`);
}

// ---- The pointer: a hand's path between the clicks -----------------------------

const smooth = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * t * (t * (6 * t - 15) + 10));
const easeOut = (t) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);

/** A glide from a to b over [t0, t1], on a gentle curve, easing in and out. */
function glide(a, b, t0, t1, bend = 0.12) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const c = { x: (a.x + b.x) / 2 - dy * bend, y: (a.y + b.y) / 2 + dx * bend };
  return {
    t0,
    t1,
    at(t) {
      const u = smooth((t - t0) / (t1 - t0));
      const v = 1 - u;
      return { x: v * v * a.x + 2 * v * u * c.x + u * u * b.x, y: v * v * a.y + 2 * v * u * c.y + u * u * b.y };
    },
  };
}

/**
 * The pointer's whole path for a clip: in from off the frame's right edge,
 * to each click (arriving a moment early, as a hand settles), a small
 * relaxing drift after each, and out past the lower right after the last.
 */
function pointerPlan(clicks, box) {
  const enter = { x: box.x + box.w + 70, y: box.y + box.h * 0.62 };
  const leave = { x: box.x + box.w + 60, y: box.y + box.h + 50 };
  const moves = [];
  let from = enter;
  let free = -Infinity;
  for (const click of clicks) {
    const glideTime = Math.min(1.25, Math.max(0.7, Math.hypot(click.p.x - from.x, click.p.y - from.y) / 520));
    const t1 = click.at - 0.22;
    const t0 = Math.max(free, t1 - glideTime);
    moves.push(glide(from, click.p, t0, t1));
    const rest = { x: click.p.x + 14, y: click.p.y + 10 };
    moves.push(glide(click.p, rest, click.at + 0.25, click.at + 0.85, 0.05));
    from = rest;
    free = click.at + 0.85;
  }
  const lastAt = clicks.length ? clicks[clicks.length - 1].at : 0;
  moves.push(glide(from, leave, lastAt + 1.4, lastAt + 2.6, -0.1));
  const first = moves[0]?.t0 ?? Infinity;
  const end = lastAt + 2.6;
  return (t) => {
    if (!clicks.length || t < first || t > end) return null;
    let p = from;
    for (const m of moves) {
      if (t < m.t0) break;
      p = m.at(t);
    }
    return p;
  };
}

/** The pointer and ring drawn for clip time t. */
function overlayState(t, where, clicks) {
  const s = { show: !!where, x: where?.x ?? -100, y: where?.y ?? -100, scale: 1, ring: 0, rx: 0, ry: 0, r: 1 };
  for (const click of clicks) {
    const since = t - click.at;
    if (since >= 0 && since < 0.16) s.scale = 0.86;
    if (since >= 0 && since < 0.6) {
      s.ring = 0.95 * (1 - since / 0.6);
      s.rx = click.p.x;
      s.ry = click.p.y;
      s.r = 5 + 24 * easeOut(since / 0.6);
    }
  }
  return s;
}

// ---- Encoding ----------------------------------------------------------------------

/** ffmpeg processes this run started (stopped by PID if the run fails). */
const children = new Set();

/** Fails loudly instead of waiting forever (a render once sat 5 hours on one call). */
function guard(promise, what, ms = 90000) {
  let timer;
  const timeout = new Promise((_, fail) => {
    timer = setTimeout(() => fail(new Error(`Timed out after ${ms / 1000}s: ${what}`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function ffmpeg(args, input) {
  return new Promise((done, fail) => {
    const child = spawn('nice', ['-n', '10', 'ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', ...args], {
      stdio: [input ? 'pipe' : 'ignore', 'inherit', 'inherit'],
    });
    children.add(child);
    child.on('error', fail);
    child.on('exit', (code) => {
      children.delete(child);
      code === 0 ? done() : fail(new Error(`ffmpeg exited ${code}`));
    });
    if (input) input(child.stdin);
  });
}

/** An encoder fed PNG frames on stdin: H.264 High, yuv420p, faststart, no audio. */
function encoder(path, height) {
  let stdin;
  const finished = ffmpeg(
    [
      ...['-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'png', '-i', '-'],
      ...['-vf', `scale=${OUT_WIDTH}:${height}:flags=lanczos,format=yuv420p`],
      ...['-c:v', 'libx264', '-profile:v', 'high', '-preset', 'slow', '-crf', '18', '-tune', 'animation'],
      ...['-maxrate', '8M', '-bufsize', '16M', '-r', String(FPS), '-g', String(FPS * 2)],
      ...['-an', '-movflags', '+faststart', path],
    ],
    (s) => (stdin = s),
  );
  return {
    write: (png) =>
      guard(new Promise((done) => (stdin.write(png) ? done() : stdin.once('drain', done))), 'ffmpeg input'),
    end: () => (stdin.end(), guard(finished, 'ffmpeg finishing', 300000)),
  };
}

/** Frames of the clip in a 4 × 2 sheet. */
async function sheet(frames, path, height) {
  const dir = mkdtempSync(join(tmpdir(), 'critters-sheet-'));
  frames.forEach((png, i) => writeFileSync(join(dir, `f${i}.png`), png));
  const h = 2 * Math.round((480 * height) / OUT_WIDTH / 2);
  await ffmpeg([
    ...['-i', join(dir, 'f%d.png'), '-vf', `scale=480:${h}:flags=lanczos,tile=4x2:padding=6:color=white`],
    ...['-frames:v', '1', '-q:v', '3', path],
  ]);
  rmSync(dir, { recursive: true, force: true });
}

// ---- One clip ------------------------------------------------------------------------

/**
 * Runs an animal's clip: renders it (and its sheet), or with `probe` saves
 * the frames at those clip times instead.
 */
async function run(page, base, animal, { intro = false, probe = null } = {}) {
  const spec = CLIPS[animal];
  const t0 = Date.now();
  if (intro) await openIntro(page, base, animal);
  else await openLive(page, base, animal);
  await page.eval(OVERLAY);
  if (!intro) {
    const ticks = Math.round(spec.start * 60);
    for (let done = 0; done < ticks; done += 30)
      await page.eval(`window.__clip.step(1000 / 60, ${Math.min(30, ticks - done)})`);
  }
  const box = await pictureBox(page);
  const { clip, height } = framing(box);
  const total = SECONDS * FPS;
  const name = intro ? `${animal}-x-15s-intro.mp4` : `${animal}-x-15s.mp4`;
  const probeFrames = probe ? new Set(probe.map((t) => Math.round(t * FPS))) : null;
  const lastProbe = probe ? Math.max(...probeFrames) : total - 1;
  const out = probe ? null : encoder(join(here, name), height);
  // The clicks, at clip times shifted by `offset` s. On the intro page they're
  // timed from the scene's arrival (nominally INTRO_SCENE_AT; loading in real
  // time moves it a little run to run), so each click meets the same moment.
  let clicks = [];
  let pointerAt = () => null;
  let clickFrames = new Map();
  let releaseFrames = new Map();
  let picks = new Set([0, 20, 40, 75]);
  const plan = (offset) => {
    clicks = (intro ? spec.intro : spec.clicks)
      .filter((c) => c.on)
      .map((c) => ({ at: c.at + offset, p: { x: box.x + c.on[0] * box.w, y: box.y + c.on[1] * box.h } }));
    pointerAt = pointerPlan(clicks, box);
    const cf = clicks.map((c) => Math.round(c.at * FPS));
    clickFrames = new Map(clicks.map((c, k) => [cf[k], c]));
    releaseFrames = new Map(clicks.map((c, k) => [cf[k] + 3, c]));
    picks = new Set(
      intro
        ? [0, 20, 40, 75, ...cf.flatMap((f) => [f - 1, f + 15])].slice(0, 8)
        : [0, ...cf.flatMap((f) => [f - 1, f + 9, f + 40]), total - 1].slice(0, 8),
    );
  };
  if (!intro) plan(0);
  const kept = [];
  let shownAt = -1;
  let last = null;
  for (let i = 0; i <= lastProbe; i++) {
    const t = i / FPS;
    const where = pointerAt(t);
    if (where && (!last || where.x !== last.x || where.y !== last.y))
      await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: where.x, y: where.y });
    last = where;
    if (clickFrames.has(i)) {
      const { p } = clickFrames.get(i);
      await page.send('Input.dispatchMouseEvent', {
        type: 'mousePressed',
        x: p.x,
        y: p.y,
        button: 'left',
        clickCount: 1,
      });
    }
    if (releaseFrames.has(i)) {
      const { p } = releaseFrames.get(i);
      await page.send('Input.dispatchMouseEvent', {
        type: 'mouseReleased',
        x: p.x,
        y: p.y,
        button: 'left',
        clickCount: 1,
      });
    }
    await page.eval(`window.__clipPointer(${JSON.stringify(overlayState(t, where, clicks))})`);
    if (intro && shownAt < 0 && (await page.eval('window.__clip.sceneTicks')) > 0) {
      shownAt = i;
      plan(i / FPS - INTRO_SCENE_AT);
    }
    if (!probe || probeFrames.has(i)) {
      const png = await frame(page, clip);
      if (probe && probeFrames.has(i)) {
        const file = join(here, 'probe', `${animal}${intro ? '-intro' : ''}-${t.toFixed(2)}s.png`);
        writeFileSync(file, png);
        console.log(file);
      }
      if (out) await out.write(png);
      if (picks.has(i)) kept.push(png);
    }
    if (i < lastProbe) await step(page);
  }
  if (probe) return;
  await out.end();
  await sheet(kept, join(here, intro ? `${animal}-intro-sheet.jpg` : `${animal}-sheet.jpg`), height);
  const mb = statSync(join(here, name)).size / 1e6;
  console.log(
    `${name}: ${OUT_WIDTH}x${height} ${FPS} fps, ${mb.toFixed(1)} MB` +
      (intro ? `, scene in at ${(shownAt / FPS).toFixed(2)}s` : `, scene from ${spec.start}s`) +
      `, clicks at ${clicks.map((c) => c.at.toFixed(2) + 's').join(', ') || 'none'}, ${((Date.now() - t0) / 1000).toFixed(0)}s to render`,
  );
}

// ---- Command line -----------------------------------------------------------------

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  if (i >= 0) args.splice(i, 1);
  return i >= 0;
};
const probeMode = flag('--probe');
const intro = flag('--intro');
const server = await serve();
const base = `http://127.0.0.1:${server.address().port}`;
try {
  await withPage(
    async (page) => {
      // Every DevTools call and every page evaluation has a deadline.
      const send = page.send;
      const evaluate = page.eval;
      page.send = (method, params) => guard(send(method, params), method);
      page.eval = (expression) => guard(evaluate(expression), `eval ${expression.slice(0, 70)}`);
      await page.viewport(VIEW.width, VIEW.height, DSF);
      await page.send('Page.addScriptToEvaluateOnNewDocument', { source: shim });
      // The frame's fit, in place before the page lays out (so the scene never sees a resize).
      await page.send('Page.addScriptToEvaluateOnNewDocument', {
        source: `document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = ${JSON.stringify(FIT_CSS)}; document.head.append(s); }, { once: true });`,
      });
      if (probeMode) {
        mkdirSync(join(here, 'probe'), { recursive: true });
        return run(page, base, args[0], { intro, probe: (args[1] ?? '2,5,10').split(',').map(Number) });
      }
      const named = args.filter((a) => CLIPS[a]);
      const animals = named.length
        ? named
        : Object.keys(CLIPS).filter((a) => (intro ? CLIPS[a].intro : CLIPS[a].clicks).some((c) => c.on));
      for (const animal of animals) await run(page, base, animal, { intro });
    },
    { width: VIEW.width, height: VIEW.height, dsf: DSF },
  );
} catch (error) {
  console.error(String(error?.stack ?? error));
  process.exitCode = 1;
} finally {
  server.close();
  for (const child of children) child.kill('SIGKILL');
}
