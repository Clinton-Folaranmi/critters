import { devFlag, mountScene, type RendererMode, type SceneHandle, type SceneOptions } from '@critters/critter-kit';
import { bankMaskUrl, pictureEdge, pictureRingUrl, reedAt } from './frog-bank';
import { bankCoverage } from './frog-bank-layer';
import { FROG_COPY, type FrogTheme } from './frog-theme';
import { createFrogWebgl, type FrogRenderer } from './frog-webgl';
import { FrogWorld, type TapResult } from './frog-world';

// The frog pond's scene: the kit's controller (mountScene: canvas, loop,
// input, fallback, resolution, visibility) with the pond's own parts — its
// world and renderers, the bank's ragged edge, the grass and reeds that cover
// the water, and the ripples a tap makes.

/** Grass counts as covering the water where the bank layer is at least this opaque. */
const COVERED = 0.35;

export interface FrogSceneOptions extends SceneOptions {
  /** Which light the pond is painted in; night unless given. */
  theme?: FrogTheme;
  /** Label text for the canvas; the motion and still versions differ. */
  label?: { motion: string; still: string };
  onModeChange?: (mode: RendererMode) => void;
}

export type FrogSceneHandle = SceneHandle;

/** The Canvas 2D renderer, fetched only when WebGL can't be used. */
const loadCanvasRenderer = () => import('./frog-canvas').then((module) => module.createFrogCanvas);

/**
 * Mounts the pond in `container`, which it masks to the picture's ragged
 * edge. The container's parent gets two CSS custom properties,
 * `--pond-ring` and `--pond-ring-halo`: mask images of a line just outside
 * that edge, for drawing a keyboard-focus ring that follows it.
 */
export function mountFrogScene(container: HTMLElement, options: FrogSceneOptions): FrogSceneHandle {
  const theme = options.theme ?? 'night';
  return mountScene<TapResult, FrogWorld, FrogRenderer>(
    container,
    {
      name: 'frog-pond',
      createWorld: (aspect, emit) => new FrogWorld(aspect, emit, Number(devFlag('frogs')) || undefined),
      webgl2: (canvas, world, events, hooks) => createFrogWebgl(canvas, world, events, theme, hooks),
      loadCanvas: () =>
        loadCanvasRenderer().then(
          (create) => (canvas: HTMLCanvasElement, world: FrogWorld, events: Float32Array, hooks) =>
            create(canvas, world, events, theme, hooks),
        ),
      placeholder: () => ({ ready: false, bank: null, draw() {}, dispose() {} }),
      edge: { distance: pictureEdge, maskUrl: bankMaskUrl, ringUrl: pictureRingUrl, ringProperty: '--pond-ring' },
      // Grass, earth or reeds drawn over the water hide what is under them.
      covered: (renderer, x, y, aspect, tolerance) =>
        (renderer.bank !== null && bankCoverage(renderer.bank, x / aspect, 1 - y) > COVERED) ||
        reedAt(x, y, aspect, tolerance),
      // Water gets a full ripple, a pad a small contact ripple; a frog's own
      // reaction is the point, so it gets only a touch of water movement. (A
      // tap on the bank stirs up motes, and ripples the edge if it's close.)
      onTap: (hit, x, y, emit) => {
        if (hit === 'water') emit(x, y, 0.9);
        else if (hit === 'pad') emit(x, y, 0.4);
        else if (hit === 'frog') emit(x, y, 0.2);
      },
      labels: options.label ?? { motion: FROG_COPY[theme].motionLabel, still: FROG_COPY[theme].stillLabel },
    },
    options,
  );
}
