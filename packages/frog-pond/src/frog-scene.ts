import { bankMaskUrl, pictureEdge, pictureRingUrl, reedAt } from './frog-bank';
import { bankCoverage } from './frog-bank-layer';
import { FROG_COPY, type FrogTheme } from './frog-theme';
import { createFrogWebgl, type FrogRenderer, type FrogRendererHooks } from './frog-webgl';
import { FrogWorld, type TapResult } from './frog-world';

// Framework-free controller for the frog pond: owns the canvas, the
// render loop, input and the WebGL → 2D fallback, so the same code runs in
// a page (studies/frogs), inside an app, and in a standalone single-file build.
//
// It is built to be a good neighbour on an ordinary page: the canvas stays
// hidden (the page shows a still or the ground colour) until the first full
// frame is ready, the shaders compile and the bank paints in the
// background, the loop only runs while the pond is on screen and the tab
// is visible, and the resolution steps down if frames run slow.

const MAX_DPR = 2;
/** Shares of the device pixel ratio the scene steps down through when frames run slow. */
const RESOLUTION_STEPS = [1, 0.8, 0.65, 0.5];
/** Never below this many canvas pixels per CSS pixel (unless the device has fewer). */
const MIN_RATIO = 0.6;
/** A frame slower than this (ms, smoothed) counts as slow; this many slow frames in a row step down. */
const SLOW_FRAME = 22;
const SLOW_FRAMES = 60;
const RIPPLE_SLOTS = 8;
/** A lost WebGL context is retried this many times before Canvas 2D stays. */
const WEBGL_RETRIES = 2;
/** Grass counts as covering the water where the bank layer is at least this opaque. */
const COVERED = 0.35;

type RendererMode = 'webgl2' | 'canvas';

export interface FrogSceneOptions {
  reducedMotion: boolean;
  /** Which light the pond is painted in; night unless given. */
  theme?: FrogTheme;
  /** Label text for the canvas; the motion and still versions differ. */
  label?: { motion: string; still: string };
  /** Id of an element that explains the controls (motion mode only). */
  describedBy?: string;
  onModeChange?: (mode: RendererMode) => void;
  /** Called once the first full frame is on screen (the canvas is shown then). */
  onReady?: () => void;
}

export interface FrogSceneHandle {
  readonly mode: RendererMode;
  dispose(): void;
}

function devFlag(name: string) {
  if (!import.meta.env.DEV || typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get(name);
}

/** The Canvas 2D renderer, fetched only when WebGL can't be used. */
const loadCanvasRenderer = () => import('./frog-canvas').then((module) => module.createFrogCanvas);

/**
 * Mounts the pond in `container`, which it masks to the picture's ragged
 * edge. The container's parent gets two CSS custom properties,
 * `--pond-ring` and `--pond-ring-halo`: mask images of a line just outside
 * that edge, for drawing a keyboard-focus ring that follows it.
 */
export function mountFrogScene(container: HTMLElement, options: FrogSceneOptions): FrogSceneHandle {
  const { reducedMotion } = options;
  const theme = options.theme ?? 'night';
  const ripples = new Float32Array(RIPPLE_SLOTS * 4);
  let rippleIndex = 0;
  let clock = 0;
  const emit = (x: number, y: number, strength: number) => {
    if (reducedMotion) return;
    ripples[rippleIndex * 4] = x;
    ripples[rippleIndex * 4 + 1] = y;
    ripples[rippleIndex * 4 + 2] = clock + 1e-4;
    ripples[rippleIndex * 4 + 3] = strength;
    rippleIndex = (rippleIndex + 1) % RIPPLE_SLOTS;
  };

  const makeCanvas = () => {
    const element = document.createElement('canvas');
    element.className = 'animal-study__canvas';
    const labels = options.label ?? { motion: FROG_COPY[theme].motionLabel, still: FROG_COPY[theme].stillLabel };
    if (reducedMotion) {
      element.setAttribute('role', 'img');
      element.setAttribute('aria-label', labels.still);
    } else {
      // Enter and Space act on it, like a button.
      element.tabIndex = 0;
      element.setAttribute('role', 'button');
      element.setAttribute('aria-label', labels.motion);
      if (options.describedBy) element.setAttribute('aria-describedby', options.describedBy);
    }
    container.insertBefore(element, container.firstChild);
    return element;
  };

  let canvas = makeCanvas();
  // Hidden until the first full frame is drawn; the page shows through.
  canvas.style.opacity = '0';
  let revealed = false;
  const aspect = () => canvas.clientWidth / Math.max(1, canvas.clientHeight);
  const frogCount = Number(devFlag('frogs')) || undefined;
  const world = new FrogWorld(aspect(), emit, frogCount);

  let renderer: FrogRenderer;
  let mode: RendererMode = 'webgl2';
  let disposed = false;
  let losses = 0;
  let retryTimer = 0;
  let swap = 0;

  // The picture's outer edge: the container is masked to it (bankMaskUrl),
  // and the ring that shows keyboard focus follows it, refreshed whenever
  // the aspect changes.
  let maskedAspect = 0;
  const fitMask = (value: number) => {
    const rounded = Math.round(value * 100) / 100;
    if (rounded === maskedAspect || !Number.isFinite(rounded) || rounded <= 0) return;
    maskedAspect = rounded;
    const url = bankMaskUrl(rounded);
    container.style.setProperty('-webkit-mask-image', url);
    container.style.setProperty('mask-image', url);
    container.style.setProperty('-webkit-mask-size', '100% 100%');
    container.style.setProperty('mask-size', '100% 100%');
    container.style.setProperty('-webkit-mask-repeat', 'no-repeat');
    container.style.setProperty('mask-repeat', 'no-repeat');
    const ringHost = container.parentElement ?? container;
    ringHost.style.setProperty('--pond-ring', pictureRingUrl(rounded, 2.5));
    ringHost.style.setProperty('--pond-ring-halo', pictureRingUrl(rounded, 8));
  };

  // ---- Resolution ----------------------------------------------------------
  // Steps down (never back up) when frames keep running slow.
  let step = 0;
  let locked = devFlag('dpr') === 'fixed';
  let slowFrames = 0;
  let settle = 0;
  let smoothed = 16;
  const resize = () => {
    const device = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const ratio = Math.max(Math.min(device, MIN_RATIO), device * RESOLUTION_STEPS[step]);
    const width = Math.max(1, Math.floor(canvas.clientWidth * ratio));
    const height = Math.max(1, Math.floor(canvas.clientHeight * ratio));
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
      // A new size means a re-bake and a repainted bed; don't count those frames.
      settle = 30;
    }
    // Before the first frame, or in the still, pads go straight to their places.
    world.resize(aspect(), reducedMotion || !revealed);
    fitMask(aspect());
  };
  const pace = (ms: number) => {
    if (locked || step >= RESOLUTION_STEPS.length - 1) return;
    if (settle > 0) {
      settle -= 1;
      return;
    }
    smoothed += (ms - smoothed) * 0.1;
    slowFrames = smoothed > SLOW_FRAME ? slowFrames + 1 : 0;
    if (slowFrames < SLOW_FRAMES) return;
    step += 1;
    slowFrames = 0;
    smoothed = 16;
    if (import.meta.env.DEV)
      console.info(`[frog-pond] frames running slow; resolution ${RESOLUTION_STEPS[step]} of the device's`);
    resize();
  };

  // ---- Input -----------------------------------------------------------------
  const toWorld = (clientX: number, clientY: number) => {
    const bounds = canvas.getBoundingClientRect();
    const y = 1 - (clientY - bounds.top) / bounds.height;
    const x = ((clientX - bounds.left) / bounds.width) * (bounds.width / bounds.height);
    return [x, y] as const;
  };
  const taps: Partial<Record<TapResult, number>> = {};
  const disturb = (x: number, y: number, tolerance?: number) => {
    // Grass, earth or reeds drawn over the water hide what is under them.
    const bank = renderer.bank;
    const covered =
      (bank !== null && bankCoverage(bank, x / aspect(), 1 - y) > COVERED) || reedAt(x, y, aspect(), tolerance ?? 0);
    const hit = world.tap(x, y, tolerance, covered);
    // Water gets a full ripple, a pad a small contact ripple; a frog's own
    // reaction is the point, so it gets only a touch of water movement. (A
    // tap on the bank stirs up motes, and ripples the edge if it's close.)
    if (hit === 'water') emit(x, y, 0.9);
    else if (hit === 'pad') emit(x, y, 0.4);
    else if (hit === 'frog') emit(x, y, 0.2);
    if (import.meta.env.DEV) taps[hit] = (taps[hit] ?? 0) + 1;
    return hit;
  };
  /** Only the visible picture takes taps, not the faded margin around it. */
  const inPicture = (x: number, y: number) => pictureEdge(x, y, aspect()) <= 1;
  const onPointerDown = (event: PointerEvent) => {
    if (reducedMotion || !revealed) return;
    const [x, y] = toWorld(event.clientX, event.clientY);
    if (!inPicture(x, y)) return;
    // Fingers get a more forgiving target than a mouse pointer.
    disturb(x, y, event.pointerType === 'mouse' ? 0.01 : 0.022);
  };
  const onPointerMove = (event: PointerEvent) => {
    if (event.pointerType !== 'mouse') return;
    const inside = inPicture(...toWorld(event.clientX, event.clientY));
    canvas.style.cursor = inside ? '' : 'default';
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (reducedMotion || (event.key !== 'Enter' && event.key !== ' ')) return;
    event.preventDefault();
    if (!event.repeat && revealed) world.disturbCentre();
  };

  const observer = new ResizeObserver(() => {
    resize();
    if (!running()) drawNow();
  });
  // The loop only runs while the pond is at least partly on screen.
  let onScreen = true;
  const visibility = new IntersectionObserver((entries) => {
    onScreen = entries[entries.length - 1].isIntersecting;
    wake();
  });

  // ---- Renderers -------------------------------------------------------------
  const attach = () => {
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('keydown', onKeyDown);
    observer.observe(canvas);
  };
  const detach = () => {
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('keydown', onKeyDown);
    observer.unobserve(canvas);
  };

  const hooks: FrogRendererHooks = {
    onLost() {
      if (disposed) return;
      losses += 1;
      console.warn('[frog-pond] WebGL context lost; drawing with the canvas fallback.');
      void replace('canvas');
      if (losses <= WEBGL_RETRIES) {
        window.clearTimeout(retryTimer);
        retryTimer = window.setTimeout(() => {
          retryTimer = 0;
          if (!disposed && mode === 'canvas') void replace('webgl2');
        }, 2500);
      }
    },
    onFail(error) {
      console.error('[frog-pond] WebGL2 renderer failed, using the canvas fallback.', error);
      void replace('canvas');
    },
    // Something arrived (a bank) that a paused scene should show now.
    onChange() {
      if (!running()) drawNow();
    },
  };

  /**
   * Moves the scene onto a fresh canvas with a new renderer. A canvas is
   * bound to its first context type for life, so every switch gets a new
   * element; listeners and focus move with it.
   */
  const replace = async (kind: RendererMode) => {
    const ticket = ++swap;
    let next: HTMLCanvasElement | null = null;
    let nextRenderer: FrogRenderer;
    try {
      const make = await loadFor(kind);
      if (disposed || ticket !== swap) return false;
      next = makeCanvas();
      nextRenderer = make(next);
    } catch (error) {
      next?.remove();
      console.warn(`[frog-pond] Could not start the ${kind} renderer.`, error);
      return false;
    }
    const hadFocus = document.activeElement === canvas;
    detach();
    renderer.dispose();
    canvas.remove();
    canvas = next;
    if (!revealed) canvas.style.opacity = '0';
    renderer = nextRenderer;
    mode = kind;
    attach();
    resize();
    if (hadFocus) canvas.focus({ preventScroll: true });
    options.onModeChange?.(mode);
    if (import.meta.env.DEV) console.info(`[frog-pond] renderer: ${mode}`);
    wake();
    return true;
  };
  /** A renderer factory for a kind, once any code it needs has loaded. */
  const loadFor = async (kind: RendererMode) => {
    if (kind === 'webgl2') return (target: HTMLCanvasElement) => createFrogWebgl(target, world, ripples, theme, hooks);
    const createCanvas = await loadCanvasRenderer();
    return (target: HTMLCanvasElement) => createCanvas(target, world, ripples, theme, hooks);
  };

  // ---- Loop ------------------------------------------------------------------
  let frame = 0;
  let last = 0;
  let checkIn = 1;
  const reported = new Set<string>();
  /** Runs only while it's worth it: on screen, tab visible, moving (not the reduced-motion still). */
  const running = () => !disposed && !reducedMotion && onScreen && !document.hidden;
  const reveal = () => {
    if (revealed || !renderer.ready) return;
    revealed = true;
    canvas.style.opacity = '';
    options.onReady?.();
  };
  /** Draws the current state once (paused, or the reduced-motion still). */
  const drawNow = () => {
    if (disposed) return;
    resize();
    renderer.draw(clock);
    reveal();
  };
  const loop = (now: number) => {
    frame = 0;
    const ms = last ? now - last : 16;
    const dt = Math.min(ms / 1000, 0.05);
    last = now;
    resize();
    if (!revealed) {
      // Getting ready: shaders compiling, the bank baking. The world waits,
      // so the first frame shown is the same moment as the still.
      renderer.draw(clock);
      reveal();
    } else {
      clock += dt;
      world.step(dt);
      renderer.draw(clock);
      pace(ms);
    }
    if (import.meta.env.DEV) {
      checkIn -= dt;
      if (checkIn <= 0) {
        checkIn = 1;
        for (const issue of world.check()) {
          if (reported.has(issue)) continue;
          reported.add(issue);
          console.warn(`[frog-pond] ${issue}`);
        }
      }
    }
    wake();
  };
  const stop = () => {
    if (frame) cancelAnimationFrame(frame);
    frame = 0;
    last = 0;
  };
  /** Starts or stops the loop to suit the moment. */
  const wake = () => {
    if (disposed || frame) return;
    // Until the first frame is up the loop keeps getting ready, even off screen.
    if (running() || (!revealed && !document.hidden)) frame = requestAnimationFrame(loop);
    else last = 0;
  };
  const onVisibility = () => {
    if (document.hidden) stop();
    else wake();
  };

  try {
    if (devFlag('renderer') === 'canvas') throw new Error('Canvas renderer forced by ?renderer=canvas.');
    renderer = createFrogWebgl(canvas, world, ripples, theme, hooks);
  } catch (error) {
    if (devFlag('renderer') !== 'canvas') {
      console.error('[frog-pond] WebGL2 renderer failed, using the canvas fallback.', error);
    }
    // A stand-in that draws nothing until the Canvas renderer has loaded.
    renderer = { ready: false, bank: null, draw() {}, dispose() {} };
    mode = 'canvas';
    void replace('canvas');
  }
  options.onModeChange?.(mode);
  // The renderer in use is a console note in dev, never an on-screen label.
  if (import.meta.env.DEV)
    console.info(`[frog-pond] renderer: ${mode}${reducedMotion ? ' (reduced motion still)' : ''}`);

  attach();
  resize();
  visibility.observe(container);
  document.addEventListener('visibilitychange', onVisibility);
  wake();

  if (import.meta.env.DEV) {
    // Dev-only: inspect the world and step frames by hand, even while the
    // tab is hidden and requestAnimationFrame is paused.
    Object.assign(window, {
      __frogWorld: world,
      __frogAdvance(seconds: number) {
        for (let t = 0; t < seconds - 1e-6; t += 1 / 60) {
          clock += 1 / 60;
          world.step(1 / 60);
        }
        resize();
        renderer.draw(clock);
        reveal();
      },
      __frogTap(x: number, y: number, tolerance?: number) {
        return disturb(x, y, tolerance);
      },
      /** What taps have done so far, by result. */
      __frogTaps: () => ({ ...taps }),
      __frogCheck: () => world.check(),
      __frogMode: () => mode,
      __frogReady: () => revealed,
      __frogLoseContext() {
        const gl = canvas.getContext('webgl2');
        gl?.getExtension('WEBGL_lose_context')?.loseContext();
        return Boolean(gl);
      },
      /** Reads the resolution step, or sets one (0 = full) and stops it changing. */
      __frogResolution(set?: number) {
        if (set !== undefined) {
          step = Math.max(0, Math.min(RESOLUTION_STEPS.length - 1, Math.round(set)));
          locked = true;
          resize();
        }
        return { step, share: RESOLUTION_STEPS[step], width: canvas.width, height: canvas.height };
      },
    });
  }

  return {
    get mode() {
      return mode;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      stop();
      window.clearTimeout(retryTimer);
      detach();
      observer.disconnect();
      visibility.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      renderer.dispose();
      canvas.remove();
    },
  };
}
