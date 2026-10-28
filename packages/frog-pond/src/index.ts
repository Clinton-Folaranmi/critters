// The frog pond study: mount it in any element.
//
//   import { mountFrogScene } from '@critters/frog-pond';
//   const scene = mountFrogScene(element, { reducedMotion: false });
//   // … later
//   scene.dispose();
//
// The simulation (./world) and the picture's maths (./bank) are separate
// entry points: they're pure, so they also run in Node (the QA soaks use them).

export { mountFrogScene, type FrogSceneHandle, type FrogSceneOptions } from './frog-scene';
export { FROG_COPY, FROG_INSTRUCTIONS, FROG_LOOKS, FROG_PALETTE, type FrogPalette } from './frog-theme';
export type { TapResult } from './frog-world';
