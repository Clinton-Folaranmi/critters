// The critter kit: building blocks a creature study is assembled from
// (docs/CRITTER_KIT_PLAN.md). DOM-free except `makeCanvas` and the WebGL
// helpers, which only touch the DOM when called.

export { TAU, clamp, glslFloat, itemSeed, makeCanvas, seeded, smoothstep } from './math';
export { angleDelta, approach, mix, smooth } from './motion';
export { startProgram } from './gl';
export { limbEnd, limbReach, poseChain, type LimbSpec } from './rig';
export { fromSurface, solvePin, stepArc, toSurface, type Surface } from './contact';
export {
  TRIPOD_OFFSETS,
  advanceGait,
  createGaitState,
  dutyAt,
  interpolate,
  isStance,
  legPhase,
  quadrupedOffsets,
  strideLengthAt,
  swingProgress,
  waveOffsets,
  type GaitSpec,
  type GaitState,
  type GaitTable,
} from './gait';
