// Renders the 15-second X (Twitter) clips of the site's animal pages:
// the live page as a visitor sees it (scene in its border, the name, the
// badge selector), 1920 × 1080, 30 fps, silent H.264, with one tap mid-clip.
//
//   npm run build:site                                  (once, or after a scene changes)
//   node social/site-clips/render.mjs                   all five
//   node social/site-clips/render.mjs snail butterfly   just these
//   node social/site-clips/render.mjs --probe mouse 4,8,12   stills at those scene times (s), to pick moments
//   node social/site-clips/render.mjs --intro butterfly opens on the badge click from the previous page
//
// Time is stepped, not recorded: clock-shim.js (injected before the page's
// own scripts) gives the page a virtual clock that only moves when this script
// steps it, 1/60 s per frame callback, two per video frame. So the clip is the
// animals' real-time behaviour, whatever the machine's load. Outputs land
// here as <animal>-x-15s.mp4 and <animal>-sheet.jpg. Needs ffmpeg and the
// Playwright headless shell (qa/lib/chrome.mjs). Doesn't touch the scenes.
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

/** The frame: 1920 × 1080 from a 1536 × 864 page at device scale 1.25 (text and badges render at full size). */
const OUT = { width: 1920, height: 1080 };
const VIEW = { width: 1536, height: 864 };
const FPS = 30;
const SECONDS = 15;
/** Frame callbacks per video frame: the scenes run at 60 Hz, as in a browser. */
const TICKS = 2;

/**
 * Per animal: `start` is how long the scene has run (s, from its first frame)
 * when the clip opens; `tapAt` is the clip time (s) of the one tap; `tap` is
 * where, as fractions of the picture (x, y). Chosen from --probe stills.
 */
export const CLIPS = {
  // --intro: the tap at 7 s of scene time, on the spotted frog.
  frogs: { start: 4, tapAt: 7, tap: [0.475, 0.586], introTap: 7, introTapAt: [0.362, 0.398] }, // the brown frog, sitting on the middle pad
  ladybug: { start: 4, tapAt: 7, tap: [0.436, 0.494], introTap: 7, introTapAt: [0.52, 0.546] }, // the seven-spot walking across the brick
  butterfly: { start: 4, tapAt: 7, tap: [0.449, 0.494], introTap: 7, introTapAt: [0.442, 0.51] }, // the peacock feeding in the middle
  snail: { start: 4, tapAt: 7, tap: [0.449, 0.54] }, // the middle snail's shell
  mouse: { start: 4, tapAt: 7, tap: [0.522, 0.525], introTap: 7, introTapAt: [0.466, 0.276] }, // the middle mouse, eating (intro: the grey mouse)
};
const ORDER = Object.keys(CLIPS);

/** Fits the page into the 16:9 frame: its column centred top to bottom, nothing else changed. */
const FIT_CSS = `
  html, body { overflow: hidden !important; }
  .page { min-height: 100vh; display: flex; flex-direction: column; justify-content: center; padding-block: 28px !important; }
`;

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
    let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
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

/** Loads an animal's page and waits until its scene is in, the sketch gone and the clock held. */
async function open(page, base, animal) {
  await page.goto(`${base}/${animal}/`, 500);
  for (let i = 0; i < 300; i++) {
    const state = await page.eval(
      `({ mode: window.__clip?.mode, sketch: document.querySelector('.picture')?.dataset.sketch ?? null, still: 'still' in document.documentElement.dataset, hidden: document.querySelector('.sketch')?.hidden ?? true })`,
    );
    if (state.mode !== 'auto' && (state.hidden || state.still)) break;
    await sleep(100);
  }
  // Background layers some scenes bake in workers, the fonts, the page's own fades: real time.
  await page.eval('document.fonts.ready.then(() => true)');
  await sleep(2500);
  if ((await page.eval('window.__clip.mode')) === 'auto') throw new Error(`${animal}: the scene never showed.`);
  const queued = await page.eval('window.__clip.rebase()');
  if (!queued) throw new Error(`${animal}: the scene's loop didn't restart after the rebase.`);
}

/** The picture's box on the page (CSS px). */
const pictureBox = (page) =>
  page.eval(
    `(() => { const r = document.querySelector('.picture').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; })()`,
  );

async function frame(page) {
  const { data } = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  return Buffer.from(data, 'base64');
}

/** Runs the scene on by `seconds` without taking pictures. */
async function advance(page, seconds) {
  const ticks = Math.round(seconds * 60);
  for (let done = 0; done < ticks; done += 30)
    await page.eval(`window.__clip.step(1000 / 60, ${Math.min(30, ticks - done)})`);
}

async function tap(page, box, [fx, fy]) {
  const x = box.x + fx * box.w;
  const y = box.y + fy * box.h;
  await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
  await page.send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await page.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  return { x, y };
}

/** Moves the pointer off the picture, onto the paper (as a visitor's hand leaves after a tap). */
async function pointerAway(page) {
  await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 8, y: 8 });
}

function ffmpeg(args, input) {
  return new Promise((done, fail) => {
    const child = spawn('nice', ['-n', '10', 'ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', ...args], {
      stdio: [input ? 'pipe' : 'ignore', 'inherit', 'inherit'],
    });
    child.on('error', fail);
    child.on('exit', (code) => (code === 0 ? done() : fail(new Error(`ffmpeg exited ${code}`))));
    if (input) input(child.stdin);
  });
}

/** An encoder fed PNG frames on stdin: H.264 High, yuv420p, faststart, no audio. */
function encoder(path) {
  let stdin;
  const finished = ffmpeg(
    [
      '-f',
      'image2pipe',
      '-framerate',
      String(FPS),
      '-c:v',
      'png',
      '-i',
      '-',
      '-vf',
      `scale=${OUT.width}:${OUT.height}:flags=lanczos,format=yuv420p`,
      '-c:v',
      'libx264',
      '-profile:v',
      'high',
      '-preset',
      'slow',
      '-crf',
      '18',
      '-tune',
      'animation',
      '-maxrate',
      '7M',
      '-bufsize',
      '14M',
      '-r',
      String(FPS),
      '-g',
      String(FPS * 2),
      '-an',
      '-movflags',
      '+faststart',
      path,
    ],
    (s) => (stdin = s),
  );
  return {
    write: (png) => new Promise((done) => (stdin.write(png) ? done() : stdin.once('drain', done))),
    end: () => (stdin.end(), finished),
  };
}

/** Eight frames of the clip in a 4 × 2 sheet. */
async function sheet(frames, path) {
  const dir = mkdtempSync(join(tmpdir(), 'critters-sheet-'));
  frames.forEach((png, i) => writeFileSync(join(dir, `f${i}.png`), png));
  await ffmpeg([
    '-i',
    join(dir, 'f%d.png'),
    '-vf',
    'scale=480:270:flags=lanczos,tile=4x2:padding=6:color=white',
    '-frames:v',
    '1',
    '-q:v',
    '3',
    path,
  ]);
  rmSync(dir, { recursive: true, force: true });
}

async function renderClip(page, base, animal) {
  const clip = CLIPS[animal];
  const t0 = Date.now();
  await open(page, base, animal);
  await advance(page, clip.start);
  const box = await pictureBox(page);
  const total = SECONDS * FPS;
  const tapFrame = Math.round(clip.tapAt * FPS);
  // The sheet: evenly through the clip, plus the frames either side of the tap.
  const picks = new Set([
    0,
    Math.round(total * 0.25),
    tapFrame - 1,
    tapFrame + 6,
    tapFrame + 20,
    tapFrame + 45,
    Math.round(total * 0.8),
    total - 1,
  ]);
  const kept = [];
  const name = `${animal}-x-15s.mp4`;
  const out = encoder(join(here, name));
  let where = null;
  for (let i = 0; i < total; i++) {
    if (i === tapFrame) where = await tap(page, box, clip.tap);
    if (i === tapFrame + 2) await pointerAway(page);
    const png = await frame(page);
    await out.write(png);
    if (picks.has(i)) kept.push(png);
    if (i < total - 1) await page.eval(`window.__clip.step(1000 / 60, ${TICKS})`);
  }
  await out.end();
  await sheet(kept, join(here, `${animal}-sheet.jpg`));
  const mb = statSync(join(here, name)).size / 1e6;
  console.log(
    `${name}: ${OUT.width}x${OUT.height} ${FPS} fps, ${mb.toFixed(1)} MB, start ${clip.start}s, tap at ${clip.tapAt}s` +
      (where ? ` (${where.x.toFixed(0)}, ${where.y.toFixed(0)} css px)` : '') +
      `, ${((Date.now() - t0) / 1000).toFixed(0)}s to render`,
  );
}

/**
 * The badge-click opening: a second on the previous animal's page, the
 * pointer comes to this animal's badge and clicks; the page arrives with the
 * view transition, the pencil sketch draws (the scene's first frame is held
 * to 2 s, as on a first visit), the scene takes over and runs as in the
 * plain clip, with the tap at `introTap` s of scene time.
 */
async function renderIntro(page, base, animal) {
  const clip = CLIPS[animal];
  const t0 = Date.now();
  const before = ORDER[(ORDER.indexOf(animal) + ORDER.length - 1) % ORDER.length];
  await open(page, base, before);
  await advance(page, 3);
  const badge = await page.eval(
    `(() => { const r = document.querySelector('.badge[href="../${animal}/"] .dot').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`,
  );
  await page.eval(`sessionStorage.setItem('clip-intro', '1')`);
  const name = `${animal}-x-15s-intro.mp4`;
  const out = encoder(join(here, name));
  const total = SECONDS * FPS;
  const kept = [];
  const keep = (i, png) => {
    // The previous page, the sketch drawing, the wash, the live scene; then the tap (below).
    if ([0, 36, 52, 75, 100].includes(i)) kept.push(png);
  };
  let i = 0;
  for (; i < FPS; i++) {
    if (i === 12) await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: badge.x - 30, y: badge.y - 40 });
    if (i === 20) await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: badge.x, y: badge.y });
    const png = await frame(page);
    await out.write(png);
    keep(i, png);
    await page.eval(`window.__clip.step(1000 / 60, ${TICKS})`);
  }
  await page.send('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: badge.x,
    y: badge.y,
    button: 'left',
    clickCount: 1,
  });
  await page.send('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: badge.x,
    y: badge.y,
    button: 'left',
    clickCount: 1,
  });
  for (let tries = 0; ; tries++) {
    const arrived = await page
      .eval(`location.pathname === '/${animal}/' && window.__clip?.intro === true && document.readyState !== 'loading'`)
      .catch(() => false);
    if (arrived) break;
    if (tries > 150) throw new Error(`${animal}: the badge click didn't arrive.`);
    await sleep(100);
  }
  let box = null;
  let tapAt = -1;
  let shownAt = -1;
  for (; i < total; i++) {
    const ticks = await page.eval('window.__clip.sceneTicks');
    if (ticks > 0 && shownAt < 0) shownAt = i;
    if (tapAt < 0 && ticks >= clip.introTap * 60) {
      box ??= await pictureBox(page);
      await tap(page, box, clip.introTapAt ?? clip.tap);
      tapAt = i;
    }
    if (i === tapAt + 2) await pointerAway(page);
    const png = await frame(page);
    await out.write(png);
    keep(i, png);
    // Just before the tap, 0.3 s and 1.5 s after it.
    if (tapAt >= 0 && [tapAt, tapAt + 9, tapAt + 45].includes(i)) kept.push(png);
    if (i < total - 1) await page.eval(`window.__clip.step(1000 / 60, ${TICKS})`);
  }
  await out.end();
  await sheet(kept, join(here, `${animal}-intro-sheet.jpg`));
  const mb = statSync(join(here, name)).size / 1e6;
  console.log(
    `${name}: ${OUT.width}x${OUT.height} ${FPS} fps, ${mb.toFixed(1)} MB, click at 1.0s, ` +
      `scene in at ${(shownAt / FPS).toFixed(2)}s, tap at ${(tapAt / FPS).toFixed(2)}s, ${((Date.now() - t0) / 1000).toFixed(0)}s to render`,
  );
}

async function probe(page, base, animal, times) {
  const dir = join(here, 'probe');
  mkdirSync(dir, { recursive: true });
  await open(page, base, animal);
  let at = 0;
  for (const t of times) {
    await advance(page, t - at);
    at = t;
    const file = join(dir, `${animal}-${String(t).padStart(5, '0')}s.png`);
    writeFileSync(file, await frame(page));
    console.log(file);
  }
  console.log('picture box', await pictureBox(page));
}

const args = process.argv.slice(2);
const server = await serve();
const base = `http://127.0.0.1:${server.address().port}`;
try {
  await withPage(
    async (page) => {
      await page.viewport(VIEW.width, VIEW.height, OUT.width / VIEW.width);
      await page.send('Page.addScriptToEvaluateOnNewDocument', { source: shim });
      // The frame's fit, in place before the page lays out (so the scene never sees a resize).
      await page.send('Page.addScriptToEvaluateOnNewDocument', {
        source: `document.addEventListener('DOMContentLoaded', () => { const s = document.createElement('style'); s.textContent = ${JSON.stringify(FIT_CSS)}; document.head.append(s); }, { once: true });`,
      });
      if (args[0] === '--probe') return probe(page, base, args[1], (args[2] ?? '0,4,8,12').split(',').map(Number));
      if (args[0] === '--intro') {
        for (const animal of args.slice(1).filter((a) => CLIPS[a])) await renderIntro(page, base, animal);
        return;
      }
      const animals = args.filter((a) => CLIPS[a]);
      for (const animal of animals.length ? animals : ORDER) await renderClip(page, base, animal);
    },
    { width: VIEW.width, height: VIEW.height, dsf: OUT.width / VIEW.width },
  );
} finally {
  server.close();
}
