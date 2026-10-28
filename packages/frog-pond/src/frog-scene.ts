import { devFlag, mountScene, type RendererMode, type SceneHandle, type SceneOptions } from '@critters/critter-kit';
import { bankMaskUrl, pictureEdge, pictureRingUrl } from './frog-bank';
import { FROG_COPY } from './frog-theme';
import { createFrogWebgl, type FrogRenderer } from './frog-webgl';
import { FrogWorld, type TapResult } from './frog-world';

// The frog pond's scene: the kit's controller (mountScene: canvas, loop,
// input, fallback, resolution, visibility) with the pond's own parts — its
// world and renderers, the picture's edge, and the ripples a tap makes.

export interface FrogSceneOptions extends SceneOptions {
  /** Label text for the canvas; the motion and still versions differ. */
  label?: { motion: string; still: string };
  onModeChange?: (mode: RendererMode) => void;
}

export type FrogSceneHandle = SceneHandle;

/** The Canvas 2D renderer, fetched only when WebGL can't be used. */
const loadCanvasRenderer = () => import('./frog-canvas').then((module) => module.createFrogCanvas);

/**
 * Mounts the pond in `container`, which it masks to the picture's edge (a
 * rectangle with softly rounded corners). The container's parent gets two
 * CSS custom properties, `--pond-ring` and `--pond-ring-halo`: mask images of
 * a line just inside that edge, for drawing a keyboard-focus ring along it.
 */
export function mountFrogScene(container: HTMLElement, options: FrogSceneOptions): FrogSceneHandle {
  return mountScene<TapResult, FrogWorld, FrogRenderer>(
    container,
    {
      name: 'frog-pond',
      createWorld: (aspect, emit) => new FrogWorld(aspect, emit, Number(devFlag('frogs')) || undefined),
      webgl2: (canvas, world, events, hooks) => createFrogWebgl(canvas, world, events, hooks),
      loadCanvas: () => loadCanvasRenderer(),
      placeholder: () => ({ ready: false, draw() {}, dispose() {} }),
      edge: { distance: pictureEdge, maskUrl: bankMaskUrl, ringUrl: pictureRingUrl, ringProperty: '--pond-ring' },
      // Water gets a full ripple, a pad a small contact ripple; a frog's own
      // reaction is the point, so it gets only a touch of water movement.
      onTap: (hit, x, y, emit) => {
        if (hit === 'water') emit(x, y, 0.9);
        else if (hit === 'pad') emit(x, y, 0.4);
        else if (hit === 'frog') emit(x, y, 0.2);
      },
      labels: options.label ?? { motion: FROG_COPY.motionLabel, still: FROG_COPY.stillLabel },
    },
    options,
  );
}
