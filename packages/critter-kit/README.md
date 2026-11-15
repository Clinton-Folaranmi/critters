# Critter kit

The building blocks every creature study here is assembled from: feet that
stay planted, legs that step in a measured gait, a spine that swims, and the
scene controller that runs it all on a page. TypeScript, no dependencies, no
framework. Everything is plain functions over plain data, and the per-frame
paths are written not to allocate.

It is the machinery, not the animals: you design and draw your own creature,
and the kit keeps its feet planted and its body moving the way a real one
does.

```bash
npm install critter-kit
```

```ts
import { advanceGait, createGaitState, isStance, solvePin, TRIPOD_OFFSETS } from 'critter-kit';
```

## What's in it

| Module         | For                                                                                                                                                                                                                                                                 |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `gait.ts`      | Footfall timing for legged animals. Every leg runs the same cycle at its own offset; the cycle advances with distance travelled, so a walk speeds up, slows or stops without a planted foot sliding. Stride length and duty factor come from a table against speed. |
| `contact.ts`   | Planting. A foot is pinned to a point in its surface's own frame, so a drifting lily pad carries it; each frame the leg is re-aimed at its pin (`solvePin`) and a foot only moves by stepping (`stepArc`).                                                          |
| `rig.ts`       | Limb chains: one extension value bends every joint from its folded pose to its extended one (`poseChain`, `limbEnd`, `limbReach`).                                                                                                                                  |
| `swim.ts`      | A spine-driven swimmer (fish, tadpole, eel, snake): the head is steered, the body follows the path the head took, a travelling wave rides on it, and the chain keeps its length.                                                                                    |
| `chain.ts`     | The chain solver under the swimmer (`followChain`) and a trail of where a head has been (`createTrail`, `sampleTrail`).                                                                                                                                             |
| `wave.ts`      | The travelling body wave and its amplitude envelope along the body.                                                                                                                                                                                                 |
| `secondary.ts` | A damped point that trails a target, for fin tips and antennae.                                                                                                                                                                                                     |
| `contain.ts`   | Keeping animals where the picture says they can be: pull a point back inside a region, push two animals apart.                                                                                                                                                      |
| `hit.ts`       | Distances to the shapes an animal is drawn with, so a tap is tested against what is drawn.                                                                                                                                                                          |
| `motion.ts`    | Frame-rate-independent easing (`approach`, `smooth`) and angle differences.                                                                                                                                                                                         |
| `math.ts`      | Seeded randomness, `smoothstep`, a canvas that also works in a worker.                                                                                                                                                                                              |
| `scene.ts`     | The scene controller (`mountScene`): owns the canvas, the render loop, taps and keys, the WebGL2 to Canvas 2D fallback, reduced motion, and pausing off screen or in a hidden tab. A study passes in its world, its two renderers and its picture edge.             |
| `edge.ts`      | The picture's designed edge, used as the tap rule, a CSS mask and a focus ring.                                                                                                                                                                                     |
| `gl.ts`        | Compiling a WebGL program without blocking the page.                                                                                                                                                                                                                |

## Worked examples

- [`packages/frog-pond`](../frog-pond): planted feet on drifting pads, hops, swimming, the full scene controller.
- [`packages/cockroach-floor`](../cockroach-floor): a six-legged tripod gait measured from footage (`gait.ts`, `contact.ts`, `rig.ts`).
- [`packages/koi`](../koi): the spine swimmer (`swim.ts`, `secondary.ts`).
- [`packages/snake`](../snake): lateral undulation along the trail its head leaves (`chain.ts`).

The rules these follow (why a foot may never slide, how a gait is measured
from footage) are in [`docs/CREATURE_STUDY_SPEC.md`](../../docs/CREATURE_STUDY_SPEC.md).
To build a whole new animal from one line, use the skill:
[`skills/critter/SKILL.md`](../../skills/critter/SKILL.md).

## Licence

MIT.
