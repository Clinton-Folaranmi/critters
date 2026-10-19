// The critter kit: building blocks a creature study is assembled from
// (docs/CRITTER_KIT_PLAN.md). DOM-free except `makeCanvas` and the WebGL
// helpers, which only touch the DOM when called.

export { TAU, clamp, glslFloat, itemSeed, makeCanvas, seeded, smoothstep } from './math';
export { angleDelta, approach, mix, smooth } from './motion';
export { createTrail, followChain, recordTrail, resetTrail, sampleTrail, type ChainPoint, type Trail } from './chain';
export { CARANGIFORM_ENVELOPE, travellingWave, waveEnvelope, type WaveShape } from './wave';
export {
  createSwimBody,
  moveSwimBody,
  placeSwimBody,
  relaxSwimBody,
  scaleSwimBody,
  stepSwimBody,
  turnSwimBody,
  type SwimBody,
  type SwimShape,
} from './swim';
export { stepSecondary, type SecondaryPoint } from './secondary';
export { startProgram } from './gl';
export { limbEnd, limbReach, poseChain, type LimbSpec } from './rig';
export { fromSurface, solvePin, stepArc, toSurface, type Surface } from './contact';
export { contain, gradient, pushOff, separate, type RegionDistance, type SignedDistance } from './contain';
export { capsuleDistance, ellipseDistance } from './hit';
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
export {
  devFlag,
  mountScene,
  type Emit,
  type RendererFactory,
  type RendererHooks,
  type RendererMode,
  type SceneConfig,
  type SceneHandle,
  type SceneOptions,
  type SceneRenderer,
  type SceneWorld,
} from './scene';
export { createPictureEdge, type PictureEdge, type PictureEdgeOptions } from './edge';
