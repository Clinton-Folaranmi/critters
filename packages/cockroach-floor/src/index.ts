// The cockroach study: one Nauphoeta cinerea on a plain floor, walking the
// tripod it was filmed walking (docs/COCKROACH_FOOTAGE_LOG.md).
//
//   import { mountCockroachScene } from '@critters/cockroach-floor';
//   const scene = mountCockroachScene(element, { reducedMotion: false });
//   // … later
//   scene.dispose();
//
// The simulation (./world) is a separate entry point: it's pure, so the QA
// soaks and motion checks run it in Node.

export { mountCockroachScene, type CockroachSceneHandle, type CockroachSceneOptions } from './cockroach-scene';
export { COCKROACH_COPY, COCKROACH_INSTRUCTIONS, COCKROACH_PALETTE, type CockroachPalette } from './cockroach-theme';
export type { TapResult } from './cockroach-world';
