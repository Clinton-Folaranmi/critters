// The simulation on its own (no DOM): step it, tap it, check it. See snake-world.ts.
export {
  PICTURE,
  SPINE_POINTS,
  SnakeWorld,
  bodyLengthFor,
  type GrassBlade,
  type PlankLeaf,
  type ScentSpot,
  type SnakeState,
  type SnakeTap,
} from './snake-world';
export { centreAt, halfWidth, snakeDistance } from './snake-shape';
export * as MOTION from './snake-motion';
