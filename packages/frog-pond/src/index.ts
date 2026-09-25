// The frog pond study: mount it in any element, in either light.
//
//   import { mountFrogScene } from '@animal-farm/frog-pond';
//   const scene = mountFrogScene(element, { reducedMotion: false, theme: 'day' });
//   // … later
//   scene.dispose();
//
// The simulation (./world) and the shore maths (./bank) are separate entry
// points: they're pure, so they also run in Node (the QA soaks use them).

export { mountFrogScene, type FrogSceneHandle, type FrogSceneOptions } from './frog-scene';
export {
  FROG_COPY,
  FROG_INSTRUCTIONS,
  FROG_LOOKS,
  FROG_PALETTES,
  FROG_THEMES,
  type FrogPalette,
  type FrogTheme,
} from './frog-theme';
export type { TapResult } from './frog-world';
