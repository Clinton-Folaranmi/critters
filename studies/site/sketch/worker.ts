// The sketch's worker (built to assets/sketch.js): the shell hands it the
// sketch canvas (transferControlToOffscreen), the URL of the animal's traced
// strokes and of its still. Frames come from the worker's own
// requestAnimationFrame, so the pencil keeps moving while the page's main
// thread is blocked painting the scene's ground. The shell says when the
// scene's first frame is in ('ready'); the worker says when it has finished
// ('done') and the shell cross-fades it away.
import { Clock, Sketch, strokesFor, type SketchFile } from './render';

interface Start {
  type: 'start';
  canvas: OffscreenCanvas;
  w: number;
  h: number;
  dpr: number;
  strokes: string;
  still: string;
  tip: boolean;
  seed: number;
}
type Message = Start | { type: 'ready' };

const scope = self as unknown as {
  postMessage(message: unknown): void;
  requestAnimationFrame?: (fn: (now: number) => void) => number;
  onmessage: ((event: MessageEvent<Message>) => void) | null;
};
const raf = (fn: (now: number) => void) =>
  scope.requestAnimationFrame ? scope.requestAnimationFrame(fn) : setTimeout(() => fn(performance.now()), 16);

const clock = new Clock();
let sketch: Sketch | null = null;
let tip = true;
let last = 0;
let pendingReady = false;

function frame(now: number) {
  if (!sketch) return;
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  sketch.render(clock.step(dt, sketch.hasStill), tip);
  if (clock.done) {
    scope.postMessage({ type: 'done' });
    return;
  }
  raf(frame);
}

async function start(m: Start) {
  tip = m.tip;
  const file = (await (await fetch(m.strokes)).json()) as SketchFile;
  sketch = new Sketch(m.canvas, m.w, m.h, m.dpr, strokesFor(file, m.w, m.h, m.seed), m.seed);
  // The still comes in its own time; the wash waits for it.
  void fetch(m.still)
    .then((response) => response.blob())
    .then((blob) => createImageBitmap(blob))
    .then((bitmap) => sketch?.setStill(bitmap, file.fit))
    .catch(() => clock.markReady());
  sketch.render(0, tip);
  scope.postMessage({ type: 'drawing' });
  if (pendingReady) clock.markReady();
  last = performance.now();
  raf(frame);
}

scope.onmessage = (event) => {
  const m = event.data;
  if (m.type === 'start')
    start(m).catch((error: unknown) => scope.postMessage({ type: 'failed', error: String(error) }));
  if (m.type === 'ready') {
    if (sketch) clock.markReady();
    else pendingReady = true;
  }
};
