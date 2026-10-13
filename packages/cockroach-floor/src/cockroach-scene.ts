import { mountScene, type RendererMode, type SceneHandle, type SceneOptions } from '@critters/critter-kit';
import { COCKROACH_COPY } from './cockroach-theme';
import { createCockroachWebgl } from './cockroach-webgl';
import { CockroachWorld, PICTURE, type TapResult } from './cockroach-world';

// The cockroach study's scene: the kit's controller (mountScene: canvas,
// loop, input, fallback, resolution, visibility) with the study's own parts:
// its world, its two renderers and its picture edge. Nothing on the floor
// covers the animal, and a tap emits nothing for the renderers (the world
// drops a crumb or startles the animal itself).

export interface CockroachSceneOptions extends SceneOptions {
  /** Label text for the canvas; the motion and still versions differ. */
  label?: { motion: string; still: string };
  onModeChange?: (mode: RendererMode) => void;
}

export type CockroachSceneHandle = SceneHandle;

/** The Canvas 2D renderer, fetched only when WebGL can't be used. */
const loadCanvasRenderer = () => import('./cockroach-canvas').then((module) => module.createCockroachCanvas);

/**
 * Mounts the cockroach study in `container`, masked to the picture's soft
 * edge. The container's parent gets `--study-ring` and `--study-ring-halo`,
 * mask images of a line just outside that edge, for a focus ring.
 */
export function mountCockroachScene(container: HTMLElement, options: CockroachSceneOptions): CockroachSceneHandle {
  return mountScene<TapResult, CockroachWorld, ReturnType<typeof createCockroachWebgl>>(
    container,
    {
      name: 'cockroach',
      createWorld: (aspect) => new CockroachWorld(aspect),
      webgl2: (canvas, world, _events, hooks) => createCockroachWebgl(canvas, world, hooks),
      loadCanvas: () =>
        loadCanvasRenderer().then(
          (create) => (canvas: HTMLCanvasElement, world: CockroachWorld, _events: Float32Array, hooks) =>
            create(canvas, world, hooks),
        ),
      placeholder: () => ({ ready: false, draw() {}, dispose() {} }),
      edge: { ...PICTURE, ringProperty: '--study-ring' },
      labels: options.label ?? { motion: COCKROACH_COPY.motionLabel, still: COCKROACH_COPY.stillLabel },
    },
    options,
  );
}
