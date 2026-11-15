// The site shell's script, shared by every animal page (studies/site/).
//
// - The owner's border is a CSS mask drawn at build time (border.ts →
//   assets/masks/*.png, set in site.css); here, only the keyboard-focus ring
//   is fitted to it (--ring-inset, --ring-radius).
// - The loading sketch (the owner's pick, 2026-10-30): a worker draws the
//   animal in pencil, then washes the colour in, on a canvas over the picture
//   (sketch/worker.ts, built to assets/sketch.js). It fast-forwards when the
//   scene's own first frame is in (the scene shows its canvas: opacity ''),
//   waits if the scene is late, and cross-fades away. The scene's first frame
//   is the scene's own; the sketch only covers the wait. Reduced motion, or no
//   OffscreenCanvas: no sketch; the still shows until the scene is in.
// - The next animal is fetched ahead: on a badge's hover, focus or touch, and
//   once this page's scene is in and the browser is idle, the one after.
// - Badge to frame: where cross-page view transitions are supported
//   (site.css), the clicked badge's picture grows into the next page's frame.
// - Embedded in another page (embed.ts, ?embed): the picture alone, with a
//   small credit; nothing is fetched ahead.
import { SETTINGS, TOOL } from './border';

const html = document.documentElement;
const narrowQuery = matchMedia('(max-width: 640px)');

/** The focus ring: the border's rounded rectangle, halfway through its fade. */
function fitRing(stage: HTMLElement, picture: HTMLElement) {
  const fit = () => {
    const { clientWidth: width, clientHeight: height } = picture;
    if (!width || !height) return;
    const scale = Math.min(width, height) / TOOL;
    const inset = (8 + (SETTINGS.roughness / 100) * 25 + ((SETTINGS.fade / 100) * TOOL) / 2) * scale;
    const radius = Math.max(0, (SETTINGS.radius / 100) * TOOL * scale - inset);
    stage.style.setProperty('--ring-inset', `${inset.toFixed(1)}px`);
    stage.style.setProperty('--ring-radius', `${radius.toFixed(1)}px`);
  };
  fit();
  let timer = 0;
  window.addEventListener('resize', () => {
    window.clearTimeout(timer);
    timer = window.setTimeout(fit, 120);
  });
}

/** Calls `ready` once the scene's first frame is in: its canvas is shown (the scenes clear its opacity). */
function whenSceneReady(scene: HTMLElement, ready: () => void) {
  const shown = () => {
    const canvas = scene.querySelector('canvas');
    return !!canvas && canvas.style.opacity === '';
  };
  if (shown()) return ready();
  const observer = new MutationObserver(() => {
    if (!shown()) return;
    observer.disconnect();
    ready();
  });
  observer.observe(scene, { subtree: true, childList: true, attributes: true, attributeFilter: ['style'] });
}

/** The longest the sketch waits for a scene before it gives way to the still (s). */
const PATIENCE = 15;

function startSketch(picture: HTMLElement, host: HTMLElement, scene: HTMLElement) {
  const stop = () => {
    html.dataset.still = '';
    host.remove();
  };
  if ('still' in html.dataset) return stop();
  const narrow = narrowQuery.matches;
  const strokes = picture.dataset[narrow ? 'sketchNarrow' : 'sketchWide'];
  const still = picture.dataset[narrow ? 'stillNarrow' : 'stillWide'];
  const { clientWidth: w, clientHeight: h } = host;
  if (!strokes || !still || !w || !h) return stop();
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'display: block; width: 100%; height: 100%;';
  // In a shadow root: the page's own canvas is the scene's (the QA harness and the scenes look for it).
  host.attachShadow({ mode: 'closed' }).append(canvas);
  let worker: Worker;
  try {
    const offscreen = canvas.transferControlToOffscreen();
    worker = new Worker(new URL('sketch.js', import.meta.url), { type: 'module' });
    worker.postMessage(
      {
        type: 'start',
        canvas: offscreen,
        w,
        h,
        // At most 1.5×: the pencil stays crisp, and it costs the scene's paint less.
        dpr: Math.min(1.5, window.devicePixelRatio || 1),
        strokes: new URL(strokes, location.href).href,
        still: new URL(still, location.href).href,
        tip: true,
        seed: Number(picture.dataset.seed ?? 3),
      },
      [offscreen],
    );
  } catch {
    return stop();
  }
  const ready = () => worker.postMessage({ type: 'ready' });
  const patience = window.setTimeout(ready, PATIENCE * 1000);
  worker.onerror = () => {
    window.clearTimeout(patience);
    worker.terminate();
    stop();
  };
  worker.onmessage = (event: MessageEvent<{ type: string }>) => {
    const { type } = event.data;
    if (type === 'drawing') picture.dataset.sketch = 'drawing';
    if (type === 'failed') worker.onerror?.(new ErrorEvent('error'));
    if (type === 'done') {
      window.clearTimeout(patience);
      picture.dataset.sketch = 'done';
      // The live scene takes over: the sketch cross-fades away (site.css), then goes.
      host.classList.add('gone');
      // The worker has stopped drawing; it's left to the page's end (terminating a worker that
      // owns a transferred canvas hung the page in Chrome's headless shell). The canvas is hidden.
      const finish = () => {
        host.hidden = true;
      };
      host.addEventListener('transitionend', finish, { once: true });
      window.setTimeout(finish, 600);
    }
  };
  whenSceneReady(scene, ready);
}

/** Fetches ahead what a badge's page needs (into the HTTP cache, so the next page finds it). */
const fetched = new Set<string>();
function fetchAhead(badge: HTMLAnchorElement) {
  const shape = narrowQuery.matches ? 'preloadNarrow' : 'preloadWide';
  const urls = `${badge.dataset.preload ?? ''} ${badge.dataset[shape] ?? ''}`.split(' ').filter(Boolean);
  for (const url of urls) {
    if (fetched.has(url)) continue;
    fetched.add(url);
    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.href = url;
    document.head.append(link);
  }
}

function startBadges(picture: HTMLElement, scene: HTMLElement) {
  const badges = [...document.querySelectorAll<HTMLAnchorElement>('.badge')];
  const current = badges.findIndex((badge) => badge.getAttribute('aria-current') === 'page');
  for (const badge of badges) {
    if (badge.getAttribute('aria-current') === 'page') continue;
    const ahead = () => fetchAhead(badge);
    badge.addEventListener('pointerenter', ahead);
    badge.addEventListener('focus', ahead);
    badge.addEventListener('touchstart', ahead, { passive: true });
    // Badge to frame (site.css): this badge's picture is the one that grows into the next page's frame.
    badge.addEventListener('click', (event) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;
      picture.style.setProperty('view-transition-name', 'none');
      badge.querySelector<HTMLElement>('.dot')?.style.setProperty('view-transition-name', 'picture');
    });
  }
  // Back to this page from the cache: the names as they were.
  window.addEventListener('pageshow', (event) => {
    if (!event.persisted) return;
    picture.style.removeProperty('view-transition-name');
    for (const dot of document.querySelectorAll<HTMLElement>('.dot')) dot.style.removeProperty('view-transition-name');
  });
  // When idle, after this page's scene is in: the next animal along.
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  if (connection?.saveData || current < 0) return;
  const next = badges[(current + 1) % badges.length];
  whenSceneReady(scene, () => {
    const idle = (fn: () => void) =>
      typeof window.requestIdleCallback === 'function'
        ? window.requestIdleCallback(fn, { timeout: 4000 })
        : window.setTimeout(fn, 1500);
    window.setTimeout(() => idle(() => fetchAhead(next)), 800);
  });
}

/** How long the credit shows in an embedded picture before it steps back (s). */
const CREDIT_SHOWS = 6;

/**
 * Embedded in another page (page.html sets data-embed): no badges to fetch ahead for. The
 * credit steps back once the scene has been in for a while (site.css brings it back under
 * the pointer or the keyboard); with no border ('plain') the focus ring hugs the frame.
 */
function startEmbed(stage: HTMLElement, scene: HTMLElement) {
  if (html.dataset.embed === 'plain') {
    stage.style.setProperty('--ring-inset', '5px');
    stage.style.setProperty('--ring-radius', '0px');
  }
  const credit = stage.querySelector<HTMLElement>('.credit');
  if (credit) whenSceneReady(scene, () => window.setTimeout(() => credit.classList.add('quiet'), CREDIT_SHOWS * 1000));
}

function startShell() {
  const stage = document.querySelector<HTMLElement>('.stage');
  const picture = document.querySelector<HTMLElement>('.picture');
  const scene = document.getElementById('scene');
  const host = document.querySelector<HTMLElement>('.sketch');
  if (!stage || !picture || !scene) return;
  if (html.dataset.embed !== 'plain') fitRing(stage, picture);
  if (host) startSketch(picture, host, scene);
  if ('embed' in html.dataset) startEmbed(stage, scene);
  else startBadges(picture, scene);
}

startShell();
