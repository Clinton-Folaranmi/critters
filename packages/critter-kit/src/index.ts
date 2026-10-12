// The critter kit: building blocks a creature study is assembled from
// (docs/CRITTER_KIT_PLAN.md). DOM-free except `makeCanvas` and the WebGL
// helpers, which only touch the DOM when called.

export { TAU, clamp, glslFloat, itemSeed, makeCanvas, seeded, smoothstep } from './math';
export { angleDelta, approach, mix, smooth } from './motion';
export { startProgram } from './gl';
export { limbEnd, limbReach, poseChain, type LimbSpec } from './rig';
