// The koi study: one kohaku in a murky pond, swimming in beats and glides,
// coming for food a visitor drops, and darting off when touched
// (docs/KOI_FOOTAGE_LOG.md, koi-motion.ts).
//
//   import { mountKoiScene } from '@critters/koi';
//   const scene = mountKoiScene(element, { reducedMotion: false });
//   // … later
//   scene.dispose();
//
// The simulation (./world) is a separate entry point: it's pure, so the QA
// checks run it in Node.

export { mountKoiScene, type KoiSceneOptions } from './scene';
export { KOI_COPY, KOI_INSTRUCTIONS, KOI_PALETTE, type KoiPalette } from './theme';
export type { KoiTap } from './koi-world';
export type { SceneHandle } from '@critters/critter-kit';
