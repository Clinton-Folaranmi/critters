import type { BankMask, PaintRequest } from './frog-bank-paint';
import { startBankWorker } from './frog-bank-worker-factory';
import type { FrogTheme } from './frog-theme';

// The painted bank (frog-bank-paint.ts), and by day the caustic tile
// (frog-caustics.ts), made off the main thread in a worker where the browser
// allows it, and kept for reuse: a renderer swap, a switch back to a light
// already seen, or a remount at the same size gets the finished picture at
// once. Where there is no worker (or it fails to start) they are painted
// here instead.

type Picture = ImageBitmap | OffscreenCanvas | HTMLCanvasElement;
export interface BakedBank {
  /** The painted bank, ready to draw or upload. */
  image: Picture;
  /** Its coverage, for hit tests (bankCoverage). */
  mask: BankMask;
}
interface Painted {
  image: Picture;
  mask?: BankMask;
}

/** Baked banks kept, most recently used last. */
const KEEP = 3;
const banks = new Map<string, Promise<BakedBank>>();
const tiles = new Map<number, Promise<Picture>>();

interface Job {
  request: PaintRequest;
  resolve: (painted: Painted) => void;
}
// undefined: not tried yet; null: unavailable here.
let worker: Worker | null | undefined;
let nextId = 1;
const jobs = new Map<number, Job>();
let idleTimer: ReturnType<typeof setTimeout> | undefined;

/** Paints on this thread (the painter's code is only fetched if it's needed). */
async function paintHere(request: PaintRequest): Promise<Painted> {
  if (import.meta.env.DEV) console.info(`[frog-pond] painting the ${request.kind} on the page (no worker)`);
  if (request.kind === 'caustics') {
    const { makeCausticTile } = await import('./frog-caustics');
    return { image: makeCausticTile(request.size) };
  }
  const { bankMask, paintBank } = await import('./frog-bank-paint');
  const layer = paintBank(request.width, request.height, request.theme);
  return { image: layer, mask: bankMask(layer) };
}

const failed = (error: unknown) => console.error('[frog-pond] Could not paint the pond.', error);

/** Stops using the worker; whatever it was painting is painted here instead. */
function dropWorker() {
  worker?.terminate();
  worker = null;
  for (const job of jobs.values()) paintHere(job.request).then(job.resolve, failed);
  jobs.clear();
}

function getWorker() {
  if (worker !== undefined) return worker;
  worker = null;
  if (typeof Worker === 'undefined' || typeof OffscreenCanvas === 'undefined') return null;
  try {
    const started = startBankWorker();
    started.onmessage = (
      event: MessageEvent<{ id: number; bitmap?: ImageBitmap; mask?: BankMask; error?: string }>,
    ) => {
      const { id, bitmap, mask, error } = event.data;
      const job = jobs.get(id);
      if (!job) return;
      jobs.delete(id);
      if (bitmap) job.resolve({ image: bitmap, mask });
      else {
        console.warn('[frog-pond] The painting worker failed; painting on the page instead.', error);
        dropWorker();
        paintHere(job.request).then(job.resolve, failed);
      }
      if (!jobs.size) {
        // An idle worker is let go after a while; the next job starts another.
        clearTimeout(idleTimer);
        idleTimer = setTimeout(() => {
          if (jobs.size || !worker) return;
          worker.terminate();
          worker = undefined;
        }, 15000);
      }
    };
    // It couldn't load (a strict sandbox, say): paint on the page instead.
    started.onerror = (event) => {
      event.preventDefault();
      dropWorker();
    };
    worker = started;
  } catch {
    worker = null;
  }
  return worker;
}

function paint(request: PaintRequest) {
  const runner = getWorker();
  if (!runner) return paintHere(request);
  clearTimeout(idleTimer);
  return new Promise<Painted>((resolve) => {
    const id = nextId++;
    jobs.set(id, { request, resolve });
    runner.postMessage({ id, ...request });
  });
}

/** The bank for a canvas size and light: from the cache, or baked now. */
function bakeBank(width: number, height: number, theme: FrogTheme) {
  const key = `${width}x${height}:${theme}`;
  let baked = banks.get(key);
  if (baked) banks.delete(key);
  else baked = paint({ kind: 'bank', width, height, theme }).then(({ image, mask }) => ({ image, mask: mask! }));
  banks.set(key, baked);
  while (banks.size > KEEP) banks.delete(banks.keys().next().value as string);
  return baked;
}

/** The caustic tile at a size (frog-caustics.ts), made once. */
export function bakeCaustics(size: number) {
  let tile = tiles.get(size);
  if (!tile) {
    tile = paint({ kind: 'caustics', size }).then(({ image }) => image);
    tiles.set(size, tile);
  }
  return tile;
}

/** How much of the bank covers a point (shares of the width and height, from the top left): 0 … 1. */
export function bankCoverage(bank: BakedBank, u: number, v: number) {
  const { data, width, height } = bank.mask;
  const x = Math.min(width - 1, Math.max(0, Math.floor(u * width)));
  const y = Math.min(height - 1, Math.max(0, Math.floor(v * height)));
  return data[y * width + x] / 255;
}

/** How long a canvas size must hold before the bank is baked for it. */
const SETTLE_MS = 200;

/**
 * Keeps a renderer's bank in step with its canvas size. The first bank is
 * asked for at once; after that, while the canvas is being resized, the
 * last one is shown (stretched) until the size has held for a moment, and
 * only then is the new one baked. `onBank` hears each bank that arrives.
 */
export function trackBank(theme: FrogTheme, onBank: (bank: BakedBank) => void) {
  let current: BakedBank | null = null;
  let width = 0;
  let height = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let asked = 0;
  let disposed = false;
  const request = (w: number, h: number) => {
    const ticket = ++asked;
    bakeBank(w, h, theme).then((bank) => {
      // A bake overtaken by a newer size is still better than nothing.
      if (disposed || (ticket !== asked && current)) return;
      current = bank;
      onBank(bank);
    }, failed);
  };
  return {
    get bank() {
      return current;
    },
    /** Call with the canvas size before each frame. */
    fit(w: number, h: number) {
      if (w === width && h === height) return;
      width = w;
      height = h;
      clearTimeout(timer);
      if (!asked) request(w, h);
      else timer = setTimeout(() => request(w, h), SETTLE_MS);
    },
    dispose() {
      disposed = true;
      clearTimeout(timer);
    },
  };
}
