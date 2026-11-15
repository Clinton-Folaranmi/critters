import { mountScene, type RendererMode, type SceneHandle, type SceneOptions } from 'critter-kit';
import { KOI_COPY } from './theme';
import { createKoiWebgl } from './webgl';
import { KoiWorld, PICTURE, type KoiTap } from './koi-world';

// The koi study's scene: the kit's controller (canvas, loop, input,
// fallback, resolution, visibility) with the study's own world, renderers
// and picture edge. The world emits its own ripples (food landing, a
// mouthful, a startle); a tap emits nothing extra.

export interface KoiSceneOptions extends SceneOptions {
  onModeChange?: (mode: RendererMode) => void;
}

/** The Canvas 2D renderer, fetched only when WebGL can't be used (A-8). */
const loadCanvasRenderer = () => import('./canvas').then((module) => module.createKoiCanvas);

export function mountKoiScene(container: HTMLElement, options: KoiSceneOptions): SceneHandle {
  return mountScene<KoiTap, KoiWorld, ReturnType<typeof createKoiWebgl>>(
    container,
    {
      name: 'koi',
      createWorld: (aspect, emit) => new KoiWorld(aspect, 7, emit),
      webgl2: (canvas, world, events, hooks) => createKoiWebgl(canvas, world, events, hooks),
      loadCanvas: () =>
        loadCanvasRenderer().then(
          (create) => (canvas: HTMLCanvasElement, world: KoiWorld, events: Float32Array) =>
            create(canvas, world, events),
        ),
      placeholder: () => ({ ready: false, draw() {}, dispose() {} }),
      edge: { ...PICTURE, ringProperty: '--study-ring' },
      labels: { motion: KOI_COPY.motionLabel, still: KOI_COPY.stillLabel },
    },
    options,
  );
}
