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

0. **A golden replay first.** Done 2026-10-12: `node qa/tools/golden.mjs`
   steps `FrogWorld` through four seeded sessions (10 minutes untouched at
   aspects 1.48 and 0.91, 5 minutes tapped, 3 minutes resizing) and hashes the
   whole world state, plus the ripples it emitted, once a second, against
   `qa/tools/golden.json`. It runs in about 2.5 s, and a 1 µs change to one
   frog timing fails all four sessions. Every later step must reproduce it bit
   for bit: moving a function without reordering its arithmetic keeps floating
   point identical, so any difference is a real change.
1. **Pure helpers** (done 2026-10-12: `packages/critter-kit` holds `math.ts`, `motion.ts` and `gl.ts`; golden replay identical, `npm run check` and all 16 browser checks pass): `frog-math.ts`, the easing helpers and `gl-utils.ts` into
   the kit; the frog imports them. Golden replay matches.
2. **Rig** (done 2026-10-12: `rig.ts` has `LimbSpec`, `limbEnd`, `limbReach` and `poseChain`; the frog passes `HIND` and `FORE`; golden replay identical; the standalone file grew 0.3 KB to 97.9 of its 100 KB. Channels as an indexed array (`easeChannel`) are left for when a second animal needs them): `limbEnd`, `limbReach` and the chain part of `pose()` take a
   `LimbSpec`; the frog passes its four. Golden replay matches.
3. **Contact** (done 2026-10-12: `contact.ts` has `Surface`, `toSurface`, `fromSurface`, `solvePin` and `stepArc`; the frog's pad riding, pin solve, foot-on-pad and on-pad step arc call them; golden replay identical, `qa:motion` unchanged at 84 passed and 12 known; standalone 98.2 of 100 KB. The anchor objects keep their `pad` field until the QA probe, step 5): the pin solve, anchoring, surface frames and the step arc.
   Golden replay matches, and so do `qa:motion`'s numbers.
4. **Hit and containment** (done 2026-10-13: `contain.ts` has `contain`, `gradient`, `pushOff` and `separate`; `hit.ts` has `ellipseDistance` and `capsuleDistance`; golden replay identical, `qa:hit`, `qa:tol` and `qa:smoke` pass; standalone 98.4 of 100 KB). Golden replay, `qa:hit` and `qa:tol` match.
5. **The QA probe** (done 2026-10-13, as a study adapter rather than a method on the world, so nothing is added to the shipped page: `qa/lib/studies/frog.mjs`; `qa:motion` and `qa:soak` are generic and report the same 112 and 57 rows as before, value for value). `qa:motion` and the generic half of `qa:soak` read the
   probe and report the same numbers as before.
6. **Scene controller and baker.** `mountFrogScene` becomes a thin wrapper
   over `mountScene`. The full `npm run qa:browser` passes.
7. **New primitives** (`gait.ts` done 2026-10-13: a footfall clock advanced by distance, with tripod, wave and quadruped offsets; `qa:gait` checks it against the measured cockroach gait, spec L-30 and Q-57 to Q-61): `gait.ts`, `chain.ts`, `wave.ts` and `secondary.ts`
   have nothing to extract; they are written new, each with a Node check of
   its own (a gait's measured duty factor and phase match what was asked; a
   chain point never slides sideways off the head's path).
8. **Then the test roster** (below), one Specimen at a time, built from the
   kit and a plain ground only. Anything a Specimen has to copy from the frog,
   or from an earlier Specimen, is a gap in the kit.

The frog's known planted-foot issue (spec section 15, Q-12 and Q-14) stays
until the extraction is done, because fixing it changes the golden replay. It
is the first fix afterwards, made once in `contact.ts`, so every animal gets
it.

## Test roster

A kit is general only if animals that differ in every way pass the same
checks; Spore proved its animation system the same way, on a grid of about a
thousand animations against several hundred creatures
(`docs/CRITTER_PRIOR_WORK.md`). The roster covers every limb count from none
to many and every locomotion mode in spec section 7, and each animal is
chosen for what it adds to the kit. Each is built as a **Specimen** (P-15)
first: one animal, an idle and one mode on a plain ground. Its second mode
comes later, as a Vignette.

| #   | Animal           | Limbs              | First mode (later)                              | What it proves in the kit                                                                 | Evidence so far (`docs/CRITTER_PRIOR_WORK.md`)                 |
| --- | ---------------- | ------------------ | ----------------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| 0   | Frog (exists)    | 4                  | hopping, limb-driven swimming                   | pins on moving surfaces, a synchronous kick; the reference the extraction must not change | kick and landing sourced; crouch and push timings not          |
| 1   | Ground beetle    | 6                  | tripod walk                                     | `gait.ts` with three leg pairs, duty factor and phase, turning by stepping on flat ground | cockroach and fruit-fly gait papers                            |
| 2   | Spider           | 8                  | alternating walk                                | the same gait code at four leg pairs, with no change but its numbers                      | none yet                                                       |
| 3   | Millipede        | many (60+)         | metachronal wave                                | a gait across dozens of legs on a body chain; per-frame cost with many pins               | wave duty factor unverified                                    |
| 4   | Koi              | 0 (fins)           | spine-driven swimming                           | `chain.ts`, `wave.ts`; fins as `secondary.ts`; no feet at all                             | carangiform amplitude envelope, Bainbridge's rule (above 5 Hz) |
| 5   | Grass snake      | 0                  | lateral undulation (concertina)                 | the chain and wave on the ground, where the body must never slip sideways                 | modes chosen by the surface (Jayne)                            |
| 6   | Gecko or newt    | 4, sprawling       | slow walk with a bending spine                  | `gait.ts` and `chain.ts` together: legs that ride a bending spine                         | slow walkers' phase 0.4–0.5 (Usherwood and Self Davies)        |
| 7   | Sparrow or robin | 2 legs and 2 wings | hopping on the ground (flap-bounding, perching) | a two-legged synchronous hop; wings as limbs with a fold value                            | zebra finch wingbeat and flap-bounding; no robin rate          |
| 8   | Dragonfly        | 6 legs and 4 wings | perched (hovering)                              | two wing pairs out of phase; legs gripping a moving perch                                 | none yet                                                       |
| 9   | Turtle           | 4, rigid shell     | slow walk (paddling)                            | a body that can't bend; a swimming stroke unlike the frog's                               | none yet                                                       |
| 10  | Earthworm        | 0                  | burrowing (crawling by peristalsis)             | a body that changes length; depth shown continuously                                      | none yet                                                       |

Between them: limb counts 0, 2 (with wings), 4, 6, 8 and many; all eight
modes of spec section 7 (walking, hopping, limb-driven and spine-driven
swimming, flying, perching, slithering, burrowing). Each animal adds one new
thing: the beetle introduces gaits, the spider and millipede stretch them to
more legs, the koi introduces spines, the snake puts a spine on the ground,
the gecko joins legs to a spine, and the rest add wings, a rigid body and a
body that changes length.

**The roster becomes a check.** Every finished Specimen joins a zoo page that
shows them side by side, and the motion and soak checks run over every animal
in it, not only the frog. That needs the QA probe (step 5) to work for any
body, so the probe is written against the beetle and the koi as well as the
frog before step 7 ends.

**Footage for each one.** Each Specimen needs a footage log before its
motion sheet (P-11). Clips come from the owner, or are openly licensed
(journal supplementary videos, Wikimedia Commons), found by search and
downloaded only with the owner's OK each time.

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
