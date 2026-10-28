import { mountScene, type RendererMode, type SceneHandle, type SceneOptions } from '@critters/critter-kit';
import { SNAKE_COPY } from './theme';
import { createSnakeWebgl } from './webgl';
import { PICTURE, SnakeWorld, type SnakeTap } from './snake-world';

// The grass snake study's scene: the kit's controller (canvas, loop, input,
// fallback, resolution, visibility) with the study's own world, renderers
// and picture edge.

export interface SnakeSceneOptions extends SceneOptions {
  onModeChange?: (mode: RendererMode) => void;
}

/** The Canvas 2D renderer, fetched only when WebGL2 can't be used (A-8). */
const loadCanvasRenderer = () => import('./canvas').then((module) => module.createSnakeCanvas);

export function mountSnakeScene(container: HTMLElement, options: SnakeSceneOptions): SceneHandle {
  return mountScene<SnakeTap, SnakeWorld, ReturnType<typeof createSnakeWebgl>>(
    container,
    {
      name: 'snake',
      createWorld: (aspect, emit) => new SnakeWorld(aspect, 7, emit),
      webgl2: (canvas, world, events, hooks) => createSnakeWebgl(canvas, world, events, hooks),
      loadCanvas: () =>
        loadCanvasRenderer().then(
          (create) => (canvas: HTMLCanvasElement, world: SnakeWorld, events: Float32Array) =>
            create(canvas, world, events),
        ),
      placeholder: () => ({ ready: false, draw() {}, dispose() {} }),
      edge: { ...PICTURE, ringProperty: '--study-ring' },
      labels: { motion: SNAKE_COPY.motionLabel, still: SNAKE_COPY.stillLabel },
    },
    options,
  );
}
