// The grass snake study: one Natrix natrix on weathered wooden planks,
// weaving along its path, pausing to flick its forked tongue, coming to
// investigate a tapped plank, and recoiling when touched
// (docs/SNAKE_FOOTAGE_LOG.md, snake-motion.ts).
//
//   import { mountSnakeScene } from '@critters/snake';
//   const scene = mountSnakeScene(element, { reducedMotion: false });
//   // … later
//   scene.dispose();
//
// The simulation (./world) is a separate entry point: it's pure, so the QA
// checks and footage tools run it in Node.

export { mountSnakeScene, type SnakeSceneOptions } from './scene';
export { SNAKE_COPY, SNAKE_INSTRUCTIONS, SNAKE_PALETTE, type SnakePalette } from './theme';
export type { SnakeTap } from './snake-world';
export type { SceneHandle } from '@critters/critter-kit';
