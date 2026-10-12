# Critter kit plan

Draft · 2026-10-11 · for `skills/critter/SKILL.md`

The critter skill needs a kit: tested building blocks that a new animal is
assembled from, instead of a copy of the whole frog pond. This file sorts
every part of `packages/frog-pond` and `qa/` into **kit** (generic) and
**frog** (this study only), says what each kit module should look like, and
gives an order of extraction that leaves the frog's behaviour unchanged.

**The test for "generic":** a ground beetle Specimen on a plain ground would
use the piece unchanged, with different numbers passed in. Anything that only
a pond, a frog or a hopping animal needs stays in the frog package; pond
pieces will feed the environment skill later.

Nothing has been moved yet. Line numbers are from the working tree on
2026-10-11.

## Summary

| Area                                |       Lines | Kit (moves out)                                                                                                                                  | Frog or pond (stays)                                                               |
| ----------------------------------- | ----------: | ------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| `frog-world.ts`                     |       2,072 | about 450: easing, limb chains, pins and steps, hit test, containment, surface frames                                                            | states and timings, pads, flies, motes, taps, `check()`                            |
| `frog-scene.ts`                     |         452 | about 370: canvas, loop, resolution, visibility, fallback and retry, still, dev hooks                                                            | ripples, bank coverage, reed taps, `--pond-ring` naming                            |
| `frog-math.ts`                      |          46 | all                                                                                                                                              |                                                                                    |
| `gl-utils.ts`                       |          52 | all                                                                                                                                              |                                                                                    |
| `frog-bank.ts`                      |         300 | about 60: the picture edge, its mask and focus ring                                                                                              | shore, shelf depth, reeds (environment skill later)                                |
| `frog-bank-layer.ts` + worker files |         201 | the worker, cache and debounce, made generic over what is painted                                                                                | which layers (bank, caustics)                                                      |
| `frog-bank-paint.ts`                |         465 | value noise and fbm (lines 40–76)                                                                                                                | painting the bank                                                                  |
| `frog-shaders.ts`                   |         867 | hash, noise and fbm in GLSL (lines 73–112); the theme-to-GLSL constants pattern                                                                  | the pond and bed shaders                                                           |
| `frog-webgl.ts`                     |         342 | the renderer interface, hooks and context-loss path                                                                                              | everything it draws                                                                |
| `frog-canvas.ts`                    |       1,199 | a capsule-chain and toe-fan drawer for Canvas 2D                                                                                                 | everything else it draws                                                           |
| `frog-theme.ts`                     |         233 | the `Palette` core and `VariantCopy` types                                                                                                       | the frog's palettes, looks and copy                                                |
| `frog-caustics.ts`                  |          58 |                                                                                                                                                  | water (environment skill later)                                                    |
| `qa/`                               | about 2,300 | the CDP driver, report, runner, thresholds shape, `qa:motion` metrics, the generic half of `qa:soak`, most browser checks once hooks are renamed | `qa:swims`, `qa:midge`, `qa:parity`, `qa:luma` targets, the pond rows of `qa:soak` |

## `frog-world.ts`, line by line

| Lines     | What                                                             | Verdict                                                                                                                                                                                                                                   |
| --------- | ---------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 16–30     | capsule count, pool sizes, `FrogState`, `TapResult`              | frog                                                                                                                                                                                                                                      |
| 32–76     | `Pad`, `Firefly`                                                 | pond                                                                                                                                                                                                                                      |
| 77–183    | `Frog`                                                           | split. Generic core (the spec's `AnimalState`): position, z, heading, size, state, time, stretch, lean, slip, spin, startle and its cooldown, blink, breath. Frog: the named channels (`hindL` … `webR`, `yawHL` …), jump and swim fields |
| 185–203   | `FootAnchor`                                                     | **kit** as `FootPin`, with `pad` renamed `surface` (the spec already calls it that)                                                                                                                                                       |
| 205–255   | ripples, `Mote`                                                  | pond                                                                                                                                                                                                                                      |
| 257–289   | pad homes per aspect, frog list, clearances                      | frog data; the wide/narrow blend by aspect (E-16) is a two-line **kit** helper                                                                                                                                                            |
| 291–299   | `angleDelta`, `approach`, `smooth`, `mix`, `SIDES`               | **kit** (`motion.ts`)                                                                                                                                                                                                                     |
| 300–336   | `limbEnd`, `limbReach`                                           | **kit** (`rig.ts`), taking a limb spec instead of reading the frog's constants                                                                                                                                                            |
| 337–352   | hind and fore lengths, key angles, hip, shoulder, toes           | frog rig data                                                                                                                                                                                                                             |
| 354–369   | jump, swim and turn timings                                      | frog: this is the motion sheet, and becomes `frog-motion.ts` (skill step 2)                                                                                                                                                               |
| 371–534   | constructor                                                      | frog                                                                                                                                                                                                                                      |
| 535–538   | `random()`                                                       | **kit**: the same LCG as `seeded()` in `frog-math.ts`; keep one                                                                                                                                                                           |
| 547–567   | `pondDistance`, `contain` (bisection toward a centre)            | `contain` is **kit**, given any distance function; `pondDistance` is pond                                                                                                                                                                 |
| 569–591   | `keepOffBank` (push a disc off a boundary along its gradient)    | **kit** (`contain.ts`)                                                                                                                                                                                                                    |
| 593–628   | `resize`                                                         | frog                                                                                                                                                                                                                                      |
| 630–650   | `step`                                                           | frog; its order (props, animals, separation, pose, clearance) goes in the example as the pattern                                                                                                                                          |
| 652–698   | `keepLegsOffBank`                                                | **kit** algorithm (every drawn part clears the boundary, L-16); the frog's part indexing and toe radii become a parts callback                                                                                                            |
| 700–909   | pads, flies, reservations, `startJump`, `chooseHop`, `openWater` | frog and pond. The reservation pattern (occupant, reserved, checked by `check()`) is documented in the references, not coded                                                                                                              |
| 910–970   | `stepFrog` dispatch                                              | frog                                                                                                                                                                                                                                      |
| 971–1001  | `both`, `limb` (ease one channel or a pair)                      | **kit** once channels are an indexed array instead of named fields                                                                                                                                                                        |
| 1002–1010 | `trail` (limbs swing outside a turn, L-13)                       | **kit**, with the gains and caps passed in                                                                                                                                                                                                |
| 1011–1138 | `crouch`, `air`, `landing`                                       | frog (hopping). Worth keeping as the hopping worked example in `references/locomotion.md`                                                                                                                                                 |
| 1139–1156 | `ridePad` (an animal carried by a moving support, C-7)           | **kit** (`contact.ts`) as surface-frame transforms                                                                                                                                                                                        |
| 1157–1283 | `startTurn`, `turnOnPad`                                         | split. **Kit:** the pivot placement, "where the foot rests when this step ends", and the step arc that draws in toward the body. Frog: the step schedule (which foot, when)                                                               |
| 1284–1440 | `sit`, `land`                                                    | frog                                                                                                                                                                                                                                      |
| 1441–1656 | `swim`, `dive`                                                   | frog. Heading by curvature × distance travelled (L-12, near line 1633) may be a **kit** helper; not yet read closely enough to say                                                                                                        |
| 1657–1683 | `separateSwimmers`                                               | **kit** (pairwise separation)                                                                                                                                                                                                             |
| 1684–1755 | `pose()`                                                         | **kit** core: channels to capsules, and a pinned foot's reach solved by bisection and its yaw aimed (C-1). Frog: flinch offsets, channel ranges                                                                                           |
| 1757–1798 | `footOnPad`, `anchorFoot`, `anchorAll`                           | **kit**, through the surface transform                                                                                                                                                                                                    |
| 1800–1851 | `frogDistance`, `frogAt`                                         | **kit** (`hit.ts`): a signed distance to body ellipses, capsules and toe discs, and the topmost-by-height pick; the frog's ellipses are data                                                                                              |
| 1853–2045 | taps, startles, central action                                   | frog; the cooldown (H-3) is a pattern for the references                                                                                                                                                                                  |
| 2046–2072 | `check()`                                                        | frog; the shape of it goes in the example                                                                                                                                                                                                 |

## Kit modules

The kit lives in `packages/critter-kit` (a workspace package, so no new
dependency), and a script copies a built version into `skills/critter/kit/`
so the skill works outside this repository, the way Anatomy ships
`iso-kit.ts` and `iso-kit.mjs`.

| Module         | Exports (first draft)                                                                                                                                                                                                                                                                                                                                                               |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `math.ts`      | `TAU`, `clamp`, `smoothstep`, `seeded`, `itemSeed`, `glslFloat`, `makeCanvas`, `noise`, `fbm`                                                                                                                                                                                                                                                                                       |
| `motion.ts`    | `approach(v, target, rate, dt)`, `angleDelta`, `mix`, `smooth`, `blendByAspect(wide, narrow, aspect)`, a critically damped `spring`                                                                                                                                                                                                                                                 |
| `rig.ts`       | `LimbSpec { root, lengths, folded, extended, range, toe }`, `limbEnd(spec, side, t, yaw, lean)`, `limbReach`, `poseChain(spec, …) → capsules`, `easeChannel`                                                                                                                                                                                                                        |
| `contact.ts`   | `FootPin`, `Surface { x, y, angle }` (a static ground is the identity), `toSurface`, `fromSurface`, `pinFoot`, `solvePin(spec, pin, body) → { t, yaw }`, `stepArc(pin, w, centre, lift)`, `restAfterStep`, `trailYaw(spin, gain, cap)`                                                                                                                                              |
| `gait.ts`      | new, not in the frog: a footfall timeline. Leg groups, each foot's duty factor and phase offset (Hildebrand), small whole-number frequency ratios between groups of different leg length (Spore), the phase advanced by distance travelled rather than time, and a per-channel phase vector whose amplitude falls to zero at rest so idle-to-walk needs no special case (DeepPhase) |
| `chain.ts`     | new: a follow-the-leader spine with a bend limit and a width per vertebra for the outline (argonaut), for koi, snakes, tadpoles and tails                                                                                                                                                                                                                                           |
| `wave.ts`      | new: a travelling lateral wave with an amplitude envelope along the body (carangiform: near zero over the front fifth, about 0.10 body lengths at the tail; Miller's snakes)                                                                                                                                                                                                        |
| `secondary.ts` | new: passive, damped motion for parts nothing drives (antennae, a tongue, fins), a short constraint chain that never feeds back into the driven body (Spore's jiggles)                                                                                                                                                                                                              |
| `hit.ts`       | `bodyDistance(ellipses, capsules, toes, point)`, `topmost(animals, point, tolerance)`                                                                                                                                                                                                                                                                                               |
| `contain.ts`   | `contain(point, distance, centre, margin)`, `pushOff(disc, boundary, clearance)`, `clearParts(parts, boundary, clearance)`, `separate(discs, gap)`                                                                                                                                                                                                                                  |
| `scene.ts`     | `mountScene({ createWorld, renderers: { webgl2, canvas }, edge, coveredAt, onTap, copy, name })` returning `{ mode, dispose }`                                                                                                                                                                                                                                                      |
| `gl.ts`        | `startProgram`, a full-screen pass, `GLSL_NOISE` (hash, noise, fbm), constants from a palette                                                                                                                                                                                                                                                                                       |
| `bake.ts`      | `createBaker(paint, { keep: 3, settleMs: 200, idleMs: 15000 })`: worker, cache and debounce over any layer                                                                                                                                                                                                                                                                          |
| `edge.ts`      | `pictureEdge`, `picturePath`, `edgeMaskUrl`, `edgeRingUrl` (the superellipse and its turbulence as parameters)                                                                                                                                                                                                                                                                      |
| `draw2d.ts`    | `drawChain(ctx, capsules, radii, palette)`, `drawToeFan`                                                                                                                                                                                                                                                                                                                            |
| `types.ts`     | `AnimalState`, `LimbPose`, `FootPin`, `Habitat`, `CreatureRenderer`, hooks, `SceneOptions`, `Palette`, `VariantCopy` (spec section 2.1)                                                                                                                                                                                                                                             |

Checks move with it: `qa/motion.mjs` today re-derives a foot's position with
the frog's capsule layout and a hard-coded lift of 0.35. Instead the world
exposes a small probe (each animal's state and channels, each pin's world
position and whether it is planted, the drawn parts), and the motion metrics
and the generic soak rows read only the probe. The prior-work survey
(`docs/CRITTER_PRIOR_WORK.md`) suggests five checks to add once the probe
exists: a skating ratio for feet near a surface that aren't pinned, a
ballistic check in the air (constant horizontal velocity, constant gravity),
smoothness (SPARC) per single movement, phase error and a left-right
symmetry index for walkers, and the centre of mass over the planted feet when
slow. Per-frame limits should be restated per second. The dev hooks the browser
checks drive are already generic: `__critterWorld`, `__critterAdvance` and
the rest (renamed from `__frog*` on 2026-10-11, no aliases kept).

## Order of extraction

Each step must leave the frog's motion exactly as it is.

0. **A golden replay first.** A Node script steps `FrogWorld` for 10 minutes
   untouched and 5 minutes tapped, at aspects 1.48 and 0.91, with fixed seeds,
   and writes a hash of every pose (positions, headings, channels, capsules)
   once a second. Every later step must reproduce it bit for bit. Moving a
   function without reordering its arithmetic keeps floating point identical,
   so any difference is a real change.
1. **Pure helpers:** `frog-math.ts`, the easing helpers and `gl-utils.ts` into
   the kit; the frog imports them. Golden replay matches.
2. **Rig:** `limbEnd`, `limbReach` and the chain part of `pose()` take a
   `LimbSpec`; the frog passes its four. Golden replay matches.
3. **Contact:** the pin solve, anchoring, surface frames and the step arc.
   Golden replay matches, and so do `qa:motion`'s numbers.
4. **Hit and containment.** Golden replay, `qa:hit` and `qa:tol` match.
5. **The QA probe.** `qa:motion` and the generic half of `qa:soak` read the
   probe and report the same numbers as before.
6. **Scene controller and baker.** `mountFrogScene` becomes a thin wrapper
   over `mountScene`. The full `npm run qa:browser` passes.
7. **New primitives:** `gait.ts`, `chain.ts`, `wave.ts` and `secondary.ts`
   have nothing to extract; they are written new, each with a Node check of
   its own (a gait's measured duty factor and phase match what was asked; a
   chain point never slides sideways off the head's path).
8. **Then the beetle Specimen** (skill plan step 4), built from the kit and a
   plain ground only. Anything it has to copy from the frog is a gap in the
   kit.

The frog's known planted-foot issue (spec section 15, Q-12 and Q-14) stays
until the extraction is done, because fixing it changes the golden replay. It
is the first fix afterwards, made once in `contact.ts`, so every animal gets
it.

## Decided

- **Scope:** animals first. Moving machines may follow later with the same
  approach; plants and weather are habitat, not subjects (owner, 2026-10-11).
- **The approval gate:** a Study keeps the board before production code; for
  a Specimen or a Vignette the first build is the board (spec P-15, P-16,
  owner, 2026-10-11).
- **Where the kit lives:** `packages/critter-kit`, with a generated copy in
  `skills/critter/kit/` (owner, 2026-10-11).
- **Hook names:** `__critter*`, renamed now, no aliases (owner, 2026-10-11).

## Open decisions

- **Footage before more kit code?** The prior-work survey recommends making
  the first real footage log before writing more kit code, because the
  frog's headline timings have no source. Extraction under the golden replay
  doesn't change any motion, so it can go ahead in parallel; the new
  primitives in step 7 should wait for a footage log to test against. A
  footage log needs clips: ones the owner supplies, or ones with a Creative
  Commons licence.

- **Time estimates:** the skill's sizes (Specimen 1–2 h, Vignette 3–6 h, Study
  days) are guesses. Replace them with measured times once the beetle and one
  Vignette have been built.
