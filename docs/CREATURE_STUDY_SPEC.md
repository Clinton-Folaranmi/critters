# Creature Study Spec

Version 1.0 · 2026-09-25 · CC BY 4.0 (see `docs/LICENSE`) · repository `animal-farm`

This is the **single source of truth** for building an interactive, top-down
creature study: a small living scene (a frog pond, a koi pool, a robin on a
branch, a beetle in leaf litter) that runs in a web page, reacts to taps and
keys, and holds up under close inspection. It is written to be followed by a
language model or a person. `CREATURE_STUDY_FIELD_MANUAL.html` is the
illustrated human edition; its rules index, variant targets, locomotion
summary and QA table are generated from this file (`npm run docs:write`), and
`npm run docs:check` fails when they, or `qa/thresholds.mjs`, disagree with it.

The frog pond in `packages/frog-pond` is the worked example throughout. Its
own notes are `docs/FROG_ART_DIRECTION.md` (what each pose and scene element
is meant to read as, with timings) and `docs/FROG_STUDY_GUIDE.md` (a plain
tour of the code).

## How to read this spec

- **MUST** and **MUST NOT** are requirements. **SHOULD** means: do it unless
  you have a written reason not to, and record the reason in the study's
  notes. **MAY** is a permitted option.
- Rules have stable IDs (`A-3`, `E-7`, …) so reviews, commits and QA reports
  can cite them. IDs are never reused; a withdrawn rule keeps its number with
  "(withdrawn)".
- "The world" is the simulation, "a renderer" draws it, "the scene" (or
  controller) owns the canvas, loop and input. "Body lengths" (BL) measure an
  animal; "world units" measure the scene (one world unit is the canvas
  height).
- Each QA check in section 12 names the `npm run` script that measures it.
  A number without a script is an estimate, and this spec says so.

## Contents

1. Principles
2. Architecture
3. File layout
4. Body and pose
5. Behaviour
6. Contact and planting
7. Locomotion catalogue
8. Environment design
9. Light, palettes and time of day
10. Performance
11. Interaction and accessibility
12. QA
13. Build procedure
14. Your first animal: a walkthrough
15. Known issues in the frog study
16. Definition of done
17. Brief template
18. Glossary

---

## 1. Principles

A scene reads as fake because of a small set of errors: a foot sliding while
the body turns, a swimmer rotating in place, a pose changing in one frame, a
shadow cast toward the light, a tap that lands on something that isn't drawn
there. These ten rules target those errors; the sections after them say how.

- **P-1 (MUST)** Research the animal before designing any pose: slow-motion footage and locomotion papers, summarised in your own words (copy nothing). A straight-swimming frog kicks both hind legs at once; most people guess they alternate.
- **P-2 (MUST)** Give every action a motive that exists in the world (food, a threat, rest, a destination). Nothing moves to fill time or because the page loaded.
- **P-3 (MUST)** Pin feet that touch a surface. A pinned foot moves only by stepping.
- **P-4 (MUST)** In water or air, change heading only while moving, along a curve.
- **P-5 (MUST)** Ease every pose change over several frames; nothing snaps in one frame except inside a deliberate push or kick.
- **P-6 (MUST)** Keep mirrored motion mirrored. Paired limbs split only for steering, loading or a stumble.
- **P-7 (MUST)** Use one key light per variant. Every shadow falls away from it; every highlight faces it.
- **P-8 (SHOULD)** Build depth from physical cues: a visible floor, a medium that hides it with depth, shadows offset by height.
- **P-9 (SHOULD)** Keep idle behaviour small (breathing, blinking, looking) and larger actions irregular and individual.
- **P-10 (MUST)** Measure, then review by eye. Every check in section 12 is run and reported before anyone signs off.

## 2. Architecture

The world decides what happens; renderers draw it; the scene controller owns
the canvas, the loop and input. Keeping them apart lets two renderers show
the same scene, makes hit-testing exact, and lets the world be stepped frame
by frame in Node.

```
            ┌───────────────── scene controller (framework-free) ─────────────────┐
 page ─────►│ canvas · loop · input · resize · visibility · fallback · still      │
            └──────┬──────────────────────────────┬───────────────────────────────┘
          step/tap │                              │ draw(time)
                   ▼                              ▼
            ┌─────────────┐   state + limbs   ┌──────────────┐  ┌───────────────┐
            │    world    │──────────────────►│ GPU renderer │  │ 2D renderer   │
            │ pure, seeded│                   │ (WebGL2)     │  │ (lazy loaded) │
            └──────┬──────┘                   └──────┬───────┘  └──────┬────────┘
                   │ events (ripples)                └──── palette ────┘ (theme module)
```

- **A-1 (MUST)** The world has no DOM, canvas or timer access. It exposes `step(dt)`, input methods (`tap`, a keyboard action), `resize(aspect)`, geometry for renderers and hit tests, and `check()`. It runs unchanged in Node.
- **A-2 (MUST)** World units: fractions of the canvas height, y up, x from 0 to the aspect ratio. Animal units: body lengths, head toward +x. Everything then scales with the screen.
- **A-3 (MUST)** Seed all randomness in the world, so a session can be replayed exactly (the QA soaks depend on it).
- **A-4 (MUST)** Clamp the time step (the frog uses 50 ms) so a stalled tab can't throw anything across the scene.
- **A-5 (MUST)** The scene controller is framework-free (plain DOM), so the same code runs in an app, in a plain page and in a single offline HTML file. It is mounted with one call that returns a handle with `dispose()`.
- **A-6 (MUST)** Colours, looks and all visible copy for every variant live in one theme module that every renderer reads. The GPU shader is generated from it; no renderer holds its own colour literals.
- **A-7 (MUST)** Renderers draw the same world. Shared geometry (shore distance, depth, reed blades, the picture's outline) is written once in TypeScript, and where a shader needs it the GLSL is generated from, or checked against, that code (`qa:parity`).
- **A-8 (MUST)** A GPU renderer and a Canvas 2D fallback. If the GPU context is lost or a shader fails, switch to the fallback at once and retry the GPU a couple of times later (the frog: after 2.5 s, twice). The fallback's code loads only when it's needed.
- **A-9 (MUST)** The world reports events (ripples, taps and what they hit) instead of drawing them; the controller and renderers respond.
- **A-10 (MUST)** Dev-only tools (frame stepping, forced fallback, fixed resolution, console hooks) are behind a build-time flag (`import.meta.env.DEV`) and absent from shipped builds (`qa:smoke`, `qa:standalone`). Debug information appears on screen only when asked for with a flag.
- **A-11 (MUST)** `check()` lists every broken rule the world can detect (two animals claiming one perch, a reservation nobody holds, a non-finite pose, an animal outside where it may be). It stays empty through every soak.
- **A-12 (SHOULD)** The package exports the scene (`mountX`), the theme and its types from the main entry, and the world and the shore maths as separate DOM-free entries, so tools and tests can import them in Node.

### 2.1 Interfaces

These are the contracts, written as TypeScript. The frog's concrete versions
are in `packages/frog-pond/src` (named in comments). A new study copies the
shapes and renames them.

```ts
/** The simulation (frog-world.ts: FrogWorld). Pure: no DOM, seeded, steppable in Node. */
interface CreatureWorld<TapResult extends string = string> {
  /** Advance by dt seconds (clamped inside, e.g. to 0.05). */
  step(dt: number): void;
  /** A tap at world coordinates; tolerance widens the target (touch > mouse). `covered`: scenery drawn over this point. */
  tap(x: number, y: number, tolerance?: number, covered?: boolean): TapResult;
  /** The keyboard's central action (the frog: a pebble in the middle). */
  disturbCentre(): TapResult;
  /** A new canvas shape. `settle`: nothing is moving yet (or never will): go straight to the new layout. */
  resize(aspect: number, settle?: boolean): void;
  /** Signed distance (world units, negative inside) from a point to what an animal visibly occupies. */
  animalDistance(index: number, x: number, y: number): number; // frog: frogDistance()
  /** Every broken rule it can detect, as sentences. Empty when all is well. */
  check(): string[];
}

/** What renderers get from the world each frame (frog-world.ts: Frog, Pad, Firefly, Mote). */
interface AnimalState {
  x: number;
  y: number;
  z: number; // world units; z = height above the ground or surface
  heading: number; // radians, 0 = +x
  size: number; // one body length in world units
  state: string; // exactly one named state (section 5)
  time: number; // seconds in that state
  stretch: number; // body length ÷ width scale: < 1 squashed
  lean: number; // weight shift, body lengths, + toward the rear
  slip: number; // small body yaw off the heading
}

/** One limb's pose (frog: hindL/hindR/foreL/foreR + yawHL…, webL/webR). */
interface LimbPose {
  extension: number; // 0 folded … 1 extended; one value bends every joint of the chain
  yaw: number; // radians about the hip or shoulder, animal-local, + counter-clockwise
  spread: number; // toes or feathers: 0 closed … 1 open
}

/** A foot pinned to a surface (frog-world.ts: FootAnchor). Stored in the surface's own frame. */
interface FootPin {
  surface: number; // index of the pad, branch, ground patch; -1 when free
  x: number;
  y: number; // surface-local position, world units
  weight: number; // 0 … 1: how firmly pose() holds the foot there
  phase: number; // 0 planted; odd while a step carries it; even once that step is done
  fromX: number;
  fromY: number;
  toX: number;
  toY: number; // the step under way
}

/** The picture and its scenery (frog-bank.ts). All pure functions of (x, y, aspect). */
interface Habitat {
  /** Signed distance to the boundary of where animals may go (the frog: + on water, − on the bank). */
  shoreDistance(x: number, y: number, aspect: number): number;
  /** Below 1 inside the picture's outline, 1 on it, above 1 outside (taps beyond 1 do nothing). */
  pictureEdge(x: number, y: number, aspect: number): number;
  /** Whether a point is on scenery drawn over the animals' layer (reeds, overhanging grass). */
  occluderAt(x: number, y: number, aspect: number, tolerance?: number): boolean; // frog: reedAt() + bank coverage
  /** Depth (or height) field 0 … 1, the same for every renderer. */
  depth(x: number, y: number, aspect: number): number; // frog: shelfDepth()
}

/** A renderer (frog-webgl.ts: FrogRenderer). */
interface CreatureRenderer {
  /** Draw a frame once ready; until then only get ready (compile, bake). */
  draw(time: number): void;
  /** True once it has drawn a full frame. The scene shows the canvas then. */
  readonly ready: boolean;
  dispose(): void;
}
interface CreatureRendererHooks {
  onLost?: () => void; // context lost: draw() is a no-op from now on (called once)
  onFail?: (error: unknown) => void; // setup failed after construction (a shader didn't compile)
  onChange?: () => void; // something arrived between frames (a baked layer)
}

/** Mounting the scene (frog-scene.ts: FrogSceneOptions, FrogSceneHandle). */
interface SceneOptions<Variant extends string> {
  reducedMotion: boolean; // true: one still, no loop, no tap target
  theme?: Variant; // which variant (the frog: 'night' | 'day')
  label?: { motion: string; still: string }; // defaults from the theme's copy
  describedBy?: string; // id of the element that explains the controls
  onModeChange?: (mode: 'webgl2' | 'canvas') => void;
  onReady?: () => void; // the first full frame is on screen
}
interface SceneHandle {
  readonly mode: 'webgl2' | 'canvas';
  dispose(): void; // releases the canvas, loop, observers, listeners and GPU resources
}
declare function mountScene<V extends string>(container: HTMLElement, options: SceneOptions<V>): SceneHandle;

/** One variant's palette (frog-theme.ts: FrogPalette, abridged). Every colour in the scene comes from here. */
interface Palette {
  light: [number, number, number]; // key light colour
  sun: [number, number]; // direction the light comes from (y up)
  shadow: number; // cast shadow strength
  vignette: number; // vignette floor (1 = none)
  // … medium, ground materials, plants, props, ambient life, ripple colours
}

/** Visible copy for one variant (frog-theme.ts: FROG_COPY). */
interface VariantCopy {
  light: string; // the switch's label ("Night")
  eyebrow: string;
  title: string;
  lede: string;
  description: string;
  motionLabel: string; // aria-label of the live scene
  stillLabel: string; // aria-label of the reduced-motion still
}
```

## 3. File layout

A study is a framework-free package, a demo page that uses it, a standalone
entry, and QA scripts. The frog pond:

```
packages/<study>/                    the study, no framework
  package.json                       exports ".", "./world", "./bank", "./theme", "./paint"; "source" condition → src
  src/
    index.ts                         mountScene(), the theme, types
    world.ts, bank.ts, theme.ts      DOM-free entry points (Node can import them)
    <animal>-world.ts                simulation: states, poses, pins, check()
    <animal>-scene.ts                controller: canvas, loop, input, fallback, resolution, visibility
    <animal>-theme.ts                palettes, looks, copy, instructions
    <animal>-shaders.ts              GLSL as /* glsl */ template literals (minified at build)
    <animal>-webgl.ts                GPU renderer
    <animal>-canvas.ts               Canvas 2D fallback (dynamically imported)
    <habitat>.ts                     boundary, depth, occluders, picture edge (+ generated GLSL)
    <habitat>-paint.ts               static layers painted once per size
    <habitat>-layer.ts               painting in a worker, with a cache and a debounce
    <habitat>-worker.ts              the worker entry
    <habitat>-worker-factory.ts      starts the worker (swapped in single-file builds)
    <animal>-math.ts, gl-utils.ts    small shared helpers
    env.d.ts                         import.meta.env.DEV
studies/<study>/                     the demo page (plain HTML + TS)
  index.html, page.css, page.ts, main.ts, stills.css, stills/*.webp
standalone/<study>/entry.ts          the single-file build's script (also its own worker)
scripts/                             build.mjs, build-standalone.mjs, esbuild-plugins.mjs, glsl-minify.mjs, serve.mjs, dev.mjs, docs.mjs
qa/                                  checks (section 12), thresholds.mjs, lib/, browser/, tools/
docs/                                this spec, the field manual, the study's art direction and guide
```

- **A-13 (MUST)** One file per concern, named for the animal or habitat. The world and habitat files import nothing from the DOM.
- **A-14 (SHOULD)** A study adds its `qa:*` checks by extending `qa/thresholds.mjs` and `qa/run.mjs` rather than writing separate harnesses.

## 4. Body and pose

- **B-1 (MUST)** Bodies are a few overlapping ellipses blended together; limbs are short chains of tapered capsules rooted at a hip or shoulder, with toes fanning from the end; spines are chains of 8–13 points with a width profile. All dimensions in body lengths.
- **B-2 (MUST)** Draw and hit-test the same shapes. Renderers draw the capsules the world computes; taps are tested against them (`animalDistance`), so a toe, a fin or a wingtip counts (`qa:hit`, `qa:tol`).
- **B-3 (MUST)** Each limb is driven by one extension value (0 folded … 1 extended) that bends every joint together, plus a yaw about its root, plus a spread for toes or feathers. Behaviours set targets; `pose()` turns values into capsules every frame.
- **B-4 (MUST)** Ease values toward targets with `v += (target − v) · (1 − e^(−rate·dt))`, or follow an authored curve between key poses. A change may be quick but spans several frames (a landing squash: 20–30 ms). Largest one-frame changes are measured by `qa:motion`.
- **B-5 (MUST)** The body has three values of its own: stretch (squash along the spine, area kept), lean (weight forward or back) and slip (a small yaw off the heading).
- **B-6 (SHOULD)** Keep joints visibly bent from the camera; a straight chain reads as a stick figure. Full extension belongs to the push.
- **B-7 (MUST)** Individuals differ: size, colouring, markings, breathing rate, rhythm. Markings and highlights live in body coordinates so they move with it.
- **B-8 (SHOULD)** Small signs of life (a throat pulse, a head tilt, antennae) add more than any large action.

Frog: body of four blended ellipses; hind legs thigh 0.37, shin 0.36, foot
0.25 BL plus a five-toe webbed fan; forelegs 0.20 + 0.26 with four fingers;
channels `hindL/R` −0.2 … 1.1, `foreL/R` −0.6 … 1, `webL/R` 0 … 1, yaws
`yawHL/HR/FL/FR`; breathing 1.18 / 1.41 / 1.27 Hz for the three frogs.

## 5. Behaviour

- **H-1 (MUST)** Each animal is in exactly one named state; each state authors its own pose curves. The frog: `sit`, `turn`, `crouch`, `air`, `land`, `swim`, `dive`.
- **H-2 (MUST)** Every action has a motive in the world (P-2). Stagger the first actions and give each individual its own jittered timers so they never move in sync.
- **H-3 (MUST)** A committed animal (in the air, mid-strike) may flinch at a tap but can't change course. A cooldown after each tap (the frog: 0.35 s) prevents resets and teleports.
- **H-4 (MUST)** Turns on the spot stay small (the frog: at most ~43°); a larger change of heading finishes in the crouch and during the movement itself.
- **H-5 (SHOULD)** Calm animals prefer destinations roughly ahead. Steering away from edges and each other starts early enough that hard boundaries almost never act.
- **H-6 (MUST)** No temporary state lasts forever: a swim, a flight or a search has an end and a way home (`qa:soak` fails a state that lasts more than 40 s).
- **H-7 (SHOULD)** Write down what a viewer should see in 45 seconds of watching, and measure it (the frog: `qa:swims` for swim lengths and hop rate).

## 6. Contact and planting

- **C-1 (MUST)** A foot touching a surface is pinned to a point stored in the surface's frame, so a floating pad or a swaying branch carries it. Every frame, before drawing, the leg is re-aimed at its pin (yaw) and its reach solved (extension).
- **C-2 (MUST)** A settled animal keeps every touching foot pinned; breathing moves the body over still feet.
- **C-3 (MUST)** A foot moves by stepping: release the pin, work out where it should rest relative to the body when the step ends, carry the pin there on an eased path that curves slightly toward the body (toes closing), set it down (toes spreading), pin again.
- **C-4 (MUST)** Turning on a surface happens by stepping, never by rotating the whole rig. Pivot near the hindquarters so neither end outruns its legs' reach; short legs take two small steps rather than dragging.
- **C-5 (MUST)** Plan steps around reach: a leg whose root is carried away from its foot steps before it straightens. Cap a planted leg's stretch; beyond a compact reach the foot may give slightly rather than the leg being hauled straight — and that give is measured (`qa:motion`).
- **C-6 (MUST)** At take-off every foot lets go over the first frames of the push, as the body is driven away; at landing the forefeet reach before contact and are pinned on touchdown.
- **C-7 (MUST)** An animal on a moving support inherits the support's movement and rotation in every state, including landing and crouching.

Targets (section 12): a planted foot holds within 0.06 BL of its pin and
slides no more than that per planted stretch (95th percentile); foot travel
in the second after a turn ends is about 0. The frog meets the second, not
yet the first (section 15).

## 7. Locomotion catalogue

Each mode below gives **pose keys** (the key poses and what each must read
as), **contact and pins**, **turning**, and **QA** (what to measure and the
pass mark). Frog rows are measured by the named scripts; rows for other
animals are the targets a new study adopts, measured by the same metrics in
its own `qa:motion` (section 14 shows how).

<!-- locomotion-summary:start -->

| Mode                      | Examples                                                     | Pinned                                             | Heading changes by                                    | Signature check                                                              |
| ------------------------- | ------------------------------------------------------------ | -------------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------- |
| Walking gaits             | beetle (tripod), millipede (wave), lizard (walk), dog (trot) | every stance foot                                  | stepping; body follows the feet                       | stance-foot slide ≤ 0.06 BL; duty factor within design                       |
| Hopping and jumping       | frog, robin on a lawn, rabbit                                | all feet until the push                            | on the ground in the crouch; spread across the flight | one-frame pose change large only in the push; landing squash over ≥ 2 frames |
| Limb-driven swimming      | frog, turtle, duck                                           | nothing                                            | curvature × distance travelled                        | straight strokes mirrored (L−R ≤ 0.01); no turning while still               |
| Spine-driven swimming     | koi, tadpole, eel                                            | nothing                                            | the head's path; the spine follows it                 | wave runs head to tail; no sideways slide of the body                        |
| Flying, flapping, gliding | robin, bat, dragonfly                                        | nothing (feet tucked)                              | banking along a curve                                 | no yaw while hovering without a reason; glides hold still                    |
| Perching                  | robin, dragonfly on a reed                                   | both feet on the perch                             | stepping, or a hop in place                           | feet ride the perch's sway; zero slide on the perch                          |
| Slithering                | grass snake, worm, sidewinder                                | contact points along the body (except sidewinding) | the head's path                                       | body never slides sideways except when sidewinding                           |
| Burrowing                 | mole cricket, earthworm, beetle larva                        | forelimbs on the face being dug                    | the tunnel's path                                     | depth cue continuous; spoil appears where digging happened                   |

<!-- locomotion-summary:end -->

- **L-1 (MUST)** Pick the locomotion modes from research (P-1) and write their pose keys and timings into the motion sheet before building them.
- **L-2 (MUST)** Every mode states its contact rule: what is pinned, when a pin is released, where it is set down.
- **L-3 (MUST)** Every mode states its turning rule, and turning is measured (turning while still, curvature, angular acceleration).
- **L-4 (MUST)** Transitions between modes are eased and physical (a frog entering water dips deeper, then rises; leaving, it clears the surface over a few frames).

### 7.1 Walking gaits

Pose keys (per leg): **lift-off** (foot unpinned, toes close), **swing**
(foot carried forward on an eased arc curving slightly toward the body),
**touch-down** (toes spread, pinned), **stance** (pinned; the body moves over
it). The gait is a footfall timeline:

| Gait                              | Animals                           | Order                                                 | Duty factor (share of the cycle on the ground) |
| --------------------------------- | --------------------------------- | ----------------------------------------------------- | ---------------------------------------------- |
| Tripod                            | beetles, ants (6 legs)            | L1 R2 L3 together, then R1 L2 R3                      | ≈ 0.5 (0.6 when slow)                          |
| Wave (metachronal)                | millipedes, slow insects, spiders | back to front on each side, sides offset half a cycle | 0.7–0.9                                        |
| Quadruped walk (lateral sequence) | lizards, cats, dogs slow          | LH, LF, RH, RF                                        | 0.6–0.75                                       |
| Trot                              | dogs, horses, fast lizards        | diagonal pairs: LF+RH, then RF+LH                     | ≈ 0.5                                          |

- **L-5 (MUST)** Stance feet are pinned to the ground (C-1). Speed comes from the stride and the cycle rate, never from sliding stance feet.
- **L-6 (MUST)** Turning on the ground: the body yaws at most as fast as the stance feet can follow; the swing target for each foot is where it will rest relative to the body at the end of its stance. A turn on the spot is a sequence of short steps pivoting near the hips (the frog's on-pad turn is the worked example: forefeet two short steps each, inside first; each hind foot once, the outside one mid-swing).
- **L-7 (SHOULD)** Legs on the outside of a turn take longer strides; the body leans into the turn slightly.
- QA: stance-foot slide per stance (95th percentile) ≤ 0.06 BL; duty factor within ±0.05 of design; no two contralateral legs of a tripod in swing at once; one-frame pose change small outside touch-down.

### 7.2 Hopping and jumping (worked example: the frog)

Pose keys, from `docs/FROG_ART_DIRECTION.md` and `frog-world.ts`:

| Key                 | Timing (frog)                                      | Reads as                                                                                                               |
| ------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Sit                 | rest                                               | Knees out beside the hips, feet forward, breathing.                                                                    |
| Loading crouch      | 190 ms calm, 75 ms startled, 160 ms from the water | Weight back over the hips (lean), legs folded tight, toes spread; squaring up only slightly (≤ 2.2 rad/s; 5 startled). |
| Launch              | first ~100 ms of air (push 75 ms)                  | The lead hind leg drives back first, the other 52 ms later; webs spread; forelegs tucked; the pad is shoved back.      |
| Apex                | mid-flight                                         | Legs relaxing; body barely larger (lift 0.35 per unit height); shadow furthest, softest, faintest.                     |
| Landing compression | 0–100 ms after touchdown                           | Forefeet reached forward before contact; body squashes to 0.81; hind legs fold; the pad recoils and dimples.           |
| Recovery            | 100–300 ms                                         | One small after-bounce (≈ 1.03) and settle into sit, never a snap.                                                     |

- **L-8 (MUST)** Pins: all feet pinned through the sit and the crouch (hind feet grip in the crouch; forefeet ease off as the weight goes back); every pin released over the first frames of the push (C-6); forefeet pinned at touchdown.
- **L-9 (MUST)** Turning: on the ground only by stepping (L-6), up to ~43°; the rest of a larger turn happens in the crouch (≤ 2.2 rad/s) and is spread across the flight with an ease in and out. A committed jump doesn't change course (H-3).
- **L-10 (MUST)** The shadow keeps the ground-sized footprint; height only offsets it along the light, blurs it and fades it.
- QA (frog, `qa:motion`): largest one-frame pose change in `crouch` and `air` ≤ 0.4 (the push), in `land` ≤ 0.1; angular acceleration ≤ 400 rad/s² (a take-off once measured 1600 before its fix); `qa:swims`: 2–3.5 pad jumps per frog per minute, 20–36 % into the water.

### 7.3 Limb-driven swimming (worked example: the frog)

Pose keys:

| Key      | Timing (frog)                                           | Reads as                                                                                             |
| -------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Recovery | last ~340 ms before a kick                              | Both knees draw in under the body together, toes closed, forelegs tucked.                            |
| Kick     | 120 ms                                                  | Bilateral, mirrored drive back with webs open; all the speed arrives here, with a small wake ripple. |
| Glide    | 1.15–1.85 s (a steering stroke comes up to 40 % sooner) | Legs ease to a long, bent trail and hold together; toes closed; visibly still.                       |

- **L-11 (MUST)** Straight strokes are mirrored exactly. A steering stroke (wanted heading more than ~15° off) is the only asymmetric one: the outside leg recovers further and drives fully, the inside leg kicks up to 40 ms later and ~30 % shorter.
- **L-12 (MUST)** Heading changes by curvature × distance actually travelled, measured after containment has clamped the position (curvature 3–20 per unit distance for the frog). A stroke pushing against a bank counts its push, or an animal facing the edge could never turn back.
- **L-13 (MUST)** Trailing limbs swing to the outside of a turn from a smoothed turn rate (yaw ≈ −rate × gain, capped near 0.4 rad), and the body lags its path slightly, so a turn reads as a bend.
- **L-14 (MUST)** Nothing is pinned in water. A startled escape is a very short gather and a hard steering stroke curving away from the threat, deeper under the surface.
- **L-15 (MUST)** A swim has an end and a way home: over its last seconds the animal comes round toward its exit and keeps to one target (**swim homing**, below).
- **L-16 (MUST)** Every part of a swimmer that is drawn stays on the water, not only its centre (**leg clearance**, below).

**Swim homing (frog).** A swim lasts `swimFor` = 3–7 s. Over the last 2 s
(`HOMING`) the frog blends its wandering heading toward the nearest free
stage (weight `smooth((time − swimFor + 2) / 2)`), then keeps to that stage
(`homeTo`) while it stays free instead of dithering between two. A pad in the
way is swum round on the side the frog is already heading for, not just
pushed off (which could leave it circling). A homing frog gives other
swimmers less room (it never touches them). It climbs onto its stage, or any
free stage it meets, once the swim is over and the kick is spent. After a
dive it heads out within 1.5–3 s. Measured over 2 h untouched (`qa:swims`):
median 6.6 s, 90 % within 10.7 s, longest 25 s at aspect 1.48; 5.4 / 6.8 /
14.5 s at 0.91.

**Leg clearance (frog).** Containment keeps the body's centre inside the
swimmable water, but trailing hind legs reach well behind it and would slip
under the bank as a frog turns back from the shore. After posing,
`keepLegsOffBank()` checks every knee, ankle and toe (with its drawn
thickness, the toe fans extended) against `shoreDistance`, and moves the frog
straight away from the shore by the largest shortfall plus 0.004, twice.
Measured (`qa:soak`): swimmer body and limbs over the bank, 0 samples in every
run. A frog on a pad or in the air is drawn over the bank (section 8.2), so
it is exempt; a toe of a frog on a pad may touch the grass by ≤ 0.02 world
units (measured ≤ 0.0031).

- QA (`qa:motion`): straight strokes |L − R| ≤ 0.01 (measured ≤ 0.002 a second into straight swimming); turning while still ≤ 0.05 rad per frame; curvature 99th percentile ≤ 30 (design 3–20; dives and pushes off the bank go past it).

### 7.4 Spine-driven swimming (koi, tadpole, eel)

Pose keys: **cruise** (a gentle travelling wave, amplitude small at the head
and growing toward the tail), **turn** (the head leads round a curve; the
wave continues), **burst** (one or two big tail beats, the body bending to a
C, then a glide), **hover** (fins sculling, tail barely moving).

- **L-17 (MUST)** Heading comes from the head's path; the rest of the spine follows the path the head took (each point trails the one ahead at a fixed spacing). Nothing slides sideways.
- **L-18 (MUST)** The wave runs head to tail; its frequency rises with speed; its amplitude grows toward the tail.
- **L-19 (MUST)** Fins are flexible flaps driven by the local turn rate and speed; pectoral fins trail in turns and scull when hovering.
- QA: turning while still ≤ 0.05 rad per frame; lateral slip of spine points (motion perpendicular to the local tangent) ≤ 0.02 BL per frame except in a burst; wave phase monotonic head to tail.

### 7.5 Flying, flapping and gliding (robin, bat, dragonfly)

Pose keys (wing, with a fold value 0 … 1 like a limb's extension):
**folded**, **crouch** (before take-off: body low, wings starting to open),
**downstroke** (fully spread, primaries separated), **upstroke** (partly
folded, wrist leading), **glide** (spread and still), **flare** (landing:
wings forward, tail fanned, feet reaching).

- **L-20 (MUST)** Nothing is pinned in the air; feet tuck after take-off and reach before landing, and are pinned on touchdown (C-6).
- **L-21 (MUST)** Heading changes by banking along a curve (P-4); the body rolls into the turn (seen from above: the near wing foreshortens), and the tail fans to steer.
- **L-22 (MUST)** Flap timing comes from research (a robin ~ 10–15 beats/s in climbing flight; glides between bursts). A glide holds still: no flapping in a glide.
- **L-23 (SHOULD)** Hovering (hummingbirds, dragonflies) is a figure-of-eight stroke with the body held; yaw in a hover only with a reason (tracking prey).
- QA: turning while still ≤ 0.05 rad per frame outside a hover; wing fold one-frame change large only in the downstroke; flap rate within ±10 % of design; shadow offset grows with height (section 8.2).

### 7.6 Perching (robin, dragonfly on a reed)

Pose keys: **approach** (flare), **grip** (feet close on the perch), **perched**
(weight settled, body upright, tail balancing), **shuffle** (a sideways step
along the perch), **take-off** (crouch, push, feet release).

- **L-24 (MUST)** Both feet are pinned in the perch's frame (C-1), so the perch's sway carries the bird and its tail balances against it.
- **L-25 (MUST)** Turning on a perch is a hop in place or a shuffle of short steps; the body never spins over still feet by more than the legs allow.
- QA: foot slide on the perch = 0 (pinned in its frame); body angular acceleration bounded on sway.

### 7.7 Slithering (grass snake, worm, sidewinder)

Four modes (from research, pick what the species does):
**lateral undulation** (waves pushing against ground irregularities; the body
follows the head's path), **concertina** (in tight spaces: anchor rear
curves, extend the front, anchor, pull), **rectilinear** (straight, belly
scales: the body stays straight and creeps), **sidewinding** (on loose sand:
the body lifts in sections; only two short contact segments at a time;
tracks are parallel diagonal lines).

- **L-26 (MUST)** In undulation, concertina and rectilinear, the body follows the head's path: no sideways slip. Contact segments (concertina, sidewinding) are pinned to the ground while in contact.
- **L-27 (MUST)** Heading changes only as the head advances; the rest follows.
- QA: sideways slip of body points ≤ 0.02 BL per frame (except sidewinding); for sidewinding, contact segments' slide ≤ 0.02 BL while in contact.

### 7.8 Burrowing (mole cricket, earthworm, beetle larva)

Pose keys: **probe** (head or forelimbs push into the face), **dig** (forelimbs
sweep soil back; the body braces), **advance** (the body moves into the
space made), **turn** (a wider scrape to one side, then advance).

- **L-28 (MUST)** The bracing parts are pinned to the tunnel wall while the forelimbs dig; the body only advances into space that has been dug.
- **L-29 (MUST)** Depth is shown continuously (the animal sinks under a soil layer that thickens with depth; a raised ridge or spoil appears where digging happened), never by a jump cut.
- QA: advance per dig cycle within design; depth changes eased (no one-frame depth jump); spoil appears within 0.5 s of a dig at the dig site.

## 8. Environment design

The habitat is not a backdrop: it sets where animals can go, what covers
them, what a tap hits, how the picture meets the page, and what gives the
animals reasons to move. Every rule below was a real bug or lesson in the
frog study, and each has the frog's worked example.

### 8.1 Boundaries match what's drawn

- **E-1 (MUST)** One function defines the boundary (the frog: `shoreDistance(x, y, aspect)`, positive on water, negative on the bank), shared by the world, both renderers (GLSL generated from the same numbers) and the hit test. JS and GLSL agree to float precision (`qa:parity`: ≤ 1e-5, no sign flips).
- **E-2 (MUST)** Containment keeps each animal's body off the boundary with a clearance (the frog: 0.012 plus a margin of 0.8 BL inside the open-water oval), and checks every drawn part, not only the centre (7.3, leg clearance).
- **E-3 (MUST)** Scenery the animals use is kept clear of the boundary too: a drifting pad is nudged back off the bank (clearance 0.015; `qa:soak`: pad-under-bank frames 0; closest rim measured 0.011).
- **E-4 (MUST)** Anything the world treats as the boundary is visibly the boundary: the painted bank's waterline follows `shoreDistance`, and details (pebbles at the waterline) are placed along the visible shore, at their intended distance from the water.
- **E-5 (SHOULD)** Where the scene continues out of the frame (the frog's water runs off the top and right), the swimmable area ends a little inside the picture's edge so animals never swim into the fade.

### 8.2 Occluders, draw order and taps on them

Draw order (bottom → top) in the frog study: bed → depth tint and caustics →
shadows on the bed → water surface and ripples → swimmers (drawn under the
bank) → **the bank** (earth, grass overhanging the water) → pads and frogs on
pads or in the air (drawn over the bank) → fireflies or midges, motes → reeds
and their shadows → vignette and grain → the picture's edge (a CSS mask).

- **E-6 (MUST)** Decide per state what is drawn over what, and write it down. An animal in the air or on a raised perch is drawn over ground scenery (a frog's leap near the shore passes over the grass); a swimmer is drawn under the bank.
- **E-7 (MUST)** A tap goes to the topmost thing drawn at that point. Scenery drawn over the animals' layer (grass overhanging the water, reeds) takes the tap as scenery (the frog: bank-layer coverage ≥ 0.35 from a ¼-size mask the painter returns, or `reedAt()`), unless an animal drawn over that scenery is there (a frog on a pad or in the air still wins). `qa:hit`: ≥ 85 % of opaque grass over the water counts as bank (measured 92–93 %).
- **E-8 (MUST)** Every tap on scenery produces a visible response (the frog: a tap on the bank or reeds lifts 4 motes — fireflies at night, midges by day — that drift off over ~1.6 s, and ripples the water if within 0.05 of the waterline).
- **E-9 (MUST)** Occluders cast shadows in the key light's direction like everything else (the frog's reeds, both renderers).
- **E-10 (SHOULD)** An occluder's geometry is one data layout used by every renderer and the tap test (the frog: `reedBlades()`, uploaded to the shader as uniforms).

### 8.3 The picture's edge

- **E-11 (MUST)** The scene has a designed edge where it meets the page (the frog: a squarish oval, a superellipse with exponent 2/0.6, radii (aspect/2 − 0.05, 0.45), made ragged and soft with turbulence, applied as a CSS mask).
- **E-12 (MUST)** No interaction outside the visible picture: taps where the edge is faded out do nothing and the cursor turns back to the default (`pictureEdge(x, y, aspect) ≤ 1` accepts; `qa:hit`: 0 taps accepted where the mask is under 0.2; ≤ 0.5 % of the clearly visible picture outside the rule, the ragged fringe).
- **E-13 (MUST)** The keyboard focus ring follows the same outline, a little outside it (0.03 world units), as an ink line on a halo so it reads over dark water and the page alike (the scene sets `--pond-ring` and `--pond-ring-halo` mask images on the container's parent).
- **E-14 (SHOULD)** Until the scene applies its edge, the container shows a plain soft oval, so nothing appears with a hard rectangle.

### 8.4 Composition across aspect ratios

- **E-15 (MUST)** The layout works from a phone (375 px wide, aspect 0.91) to a wide screen (aspect 1.48) with no horizontal scroll (`qa:a11y`).
- **E-16 (MUST)** Positions that matter (perches, stages) have a layout per shape, blended by aspect, not the same shares of the width stretched (the frog: `PAD_HOMES_WIDE` at 1.48 and `PAD_HOMES_NARROW` at 0.91, blended with `smoothstep`; stages rim to rim ≥ 0.035 apart at 0.91). On resize, things drift to their new homes; before the first frame or in the still they snap there.
- **E-17 (MUST)** Static layers are re-painted for a new size only after the size has held (a true debounce: the frog waits 200 ms; `qa:bake`: ≤ 1 bake asked for during a drag), and the old layer is shown stretched meanwhile.
- **E-18 (SHOULD)** Scenery placement is stable under small resizes: items placed along the shore with per-item seeds (`qa:reshuffle`: a 1 px wider canvas changes ≤ 2 % of bank pixels, measured 0.8 %; 10 px ≤ 15 %, measured 9.4 %).
- **E-19 (SHOULD)** There is a still of the first frame for each shape and variant (section 10).

### 8.5 Affordances as motives

- **E-20 (MUST)** The habitat offers the things behaviour needs, and behaviour uses them: perches or stages to rest on, water or open ground to move through, cover to hide in, food to catch. The frog: four stages (three occupied, one spare, so a swimmer always has somewhere to go — `qa:soak` reports frames with no free stage, 0 measured), open water for swims, fireflies to track and catch.
- **E-21 (MUST)** Only usable things count as affordances: a stage must be big enough for the animal and within reach of the swimmable water (the frog: pads beyond 0.8 pond radii are scenery, and frogs leave them alone).
- **E-22 (SHOULD)** Scenery that isn't an affordance is visibly different (the frog's small bud pad, pads drifting off the edges).

### 8.6 Ambient life

- **E-23 (MUST)** Ambient life has a source and a place: the frog's fireflies gather in three clusters (near the left stage, right of centre, mid-pond) and leave the lower pond quiet; midges by day; motes only where the grass was tapped.
- **E-24 (MUST)** It is sparse and cheap: a fixed pool (the frog: 8 flies, 6 motes), each drawn only inside a box around it (section 10, the motes regression).
- **E-25 (SHOULD)** Animals notice it (eyes follow fireflies; a tongue strike when one drifts within reach, then 6–14 s of rest).

### 8.7 Wind and weather

The frog study has no wind or weather yet; its reeds sway with time
(`reedBlades(aspect, time, …)`). These rules are for studies that add them.

- **E-26 (MUST)** Wind is one field (direction, strength, gusts over time) owned by the world and read by everything that moves in it: grass, reeds, leaves, the water's ripples, an animal's feathers or balance. Nothing sways on its own clock.
- **E-27 (MUST)** Gusts travel: a gust reaches things upwind first, so a meadow shows a wave passing, not everything bending at once.
- **E-28 (MUST)** Weather is a palette plus particles (section 9): rain adds drops and ring ripples on water and darkens the ground; overcast removes hard shadows and caustics; each weather variant has its own brightness target.
- **E-29 (SHOULD)** Animals respond to weather with motives (shelter under a leaf in rain, feathers fluffed in cold), not decoration.
- QA: particle counts bounded; the wind field's value is identical for the world and every renderer (a parity check like `qa:parity`); each weather variant's luma inside its target.

### 8.8 Time-of-day variants as palettes

- **E-30 (MUST)** A time of day is a palette applied to the same scene, geometry and behaviour (the frog's Night and Day differ only in `FROG_PALETTES`, copy, and fireflies becoming midges). Copy, title and labels are written for each variant.
- **E-31 (MUST)** Each variant has a brightness target: mean luma (0–255, Rec. 601 weights) inside the visible picture, bank included, where the picture's mask is over half opaque. The renderers stay within 5 of each other (`qa:luma`).
- **E-32 (MUST)** The key light's direction may change between variants but each variant has one; shadows follow it (P-7). `qa:midge` checks a small flier's shadow in both renderers.

<!-- variants:start -->

| Variant              | Mean luma | 10th–90th percentile (frog, measured) | Floor                         | Sky reflection | Grain   |
| -------------------- | --------- | ------------------------------------- | ----------------------------- | -------------- | ------- |
| Night (Night Chorus) | 35 … 40   | 19–66 WebGL, 21–57 Canvas             | a hint, lit toward the light  | 0.35–0.55      | ± 0.025 |
| Day (Day Chorus)     | 85 … 90   | 61–111 WebGL, 63–110 Canvas           | plainly, with moving caustics | 0.05–0.1       | ± 0.02  |

<!-- variants:end -->

## 9. Light, palettes and colour

- **V-1 (MUST)** Each variant's palette holds the light's colour and direction, the medium's colours and cloudiness, sky reflection, ground materials, moving light strength, plant and prop colours, ambient life colours, ripple colours, shadow strength and vignette. No colour literals in renderers (A-6).
- **V-2 (MUST)** Build depth physically: a depth field (the frog: `shelfDepth()`, shallow at the bank, deepest mid-pond, the same in both renderers), a medium that hides the floor more with depth, ground shadows of floating or raised things offset further and softer the deeper or higher they are.
- **V-3 (MUST)** Every effect has a physical source: a glow needs a light, a sparkle a surface and a sun, caustics a sun and clear water.
- **V-4 (MUST)** Static ground is painted once per size (the frog's bed and bank) and never moves; repeating light patterns (caustics) are a seamless tile drawn once, two copies sliding past each other at different scales, faded over deep water, the same tile in both renderers.
- **V-5 (MUST)** Check shadow direction deliberately: contact, body and ground shadows fall away from the light; sheens, rim light and eye highlights face it.
- **V-6 (SHOULD)** In low light the floor shows mostly near the light, and raised details catch warm light on the side facing it.
- **V-7 (MUST)** Finish with a light vignette set by the palette, fine grain, and the designed edge (E-11).

## 10. Performance

A 60 Hz frame lasts 16.7 ms. The scene must be a good neighbour on an
ordinary page: small to download, no stalls on load, nothing running when it
can't be seen, and cheap per frame. Each rule names the frog's implementation
and the check.

- **F-1 (MUST) Lazy load near the viewport.** The page ships only the caption, the switch and a still; the scene's code loads when its container comes within 300 px of the viewport (an `IntersectionObserver` with `rootMargin: '300px 0px'`). Frog demo: 4.9 KB of JS with the page, 66.1 KB (26.5 KB gzip) as the pond comes near (`qa:size`).
- **F-2 (MUST) A still until the first frame.** Until the first full frame is drawn the canvas is hidden (`opacity: 0`) and the container shows a WebP still of that very frame (the frog: `studies/frogs/stills/{night,day}-{wide,narrow}.webp`, 35–53 KB, regenerated by `qa:stills`). The world waits (no time passes) until the first frame, so the still and the first live frame match.
- **F-3 (MUST) Parallel shader compile.** Compile and link without waiting (`KHR_parallel_shader_compile`; `startProgram()` in `gl-utils.ts` polls `COMPLETION_STATUS_KHR`); the renderer only "gets ready" until it completes.
- **F-4 (MUST) Paint static layers in a worker.** The bank and the caustic tile are painted in a worker with `OffscreenCanvas` and sent back as `ImageBitmap`s, with a main-thread fallback if workers or `OffscreenCanvas` are missing or the worker fails to load. Baked layers are cached by (width, height, variant), 3 kept, so a renderer swap or a switch back to a variant reuses them; an idle worker stops itself after 15 s.
- **F-5 (MUST) Pause off screen.** The loop runs only while the scene is at least partly on screen (`IntersectionObserver`) and the tab is visible (`visibilitychange`); `qa:offscreen`: 0 animation frames scrolled away.
- **F-6 (MUST) Adaptive resolution.** Cap the pixel ratio at 2. Measure frame time (smoothed); after 60 frames slower than 22 ms, step the resolution down (1, 0.8, 0.65, 0.5 of the device ratio, never below 0.6 CSS px per canvas px), never back up; ignore frames right after a resize. A dev flag (`?dpr=fixed`) holds full resolution for measuring.
- **F-7 (MUST) Minify GLSL.** Shaders are `/* glsl */` template literals; the build strips comments and spare whitespace (`scripts/glsl-minify.mjs`), keeping every `${…}` interpolation as written.
- **F-8 (MUST) Load the fallback only when needed.** The Canvas 2D renderer and the main-thread painter are split chunks, fetched only if WebGL fails or the worker can't run.
- **F-9 (MUST) Per-pixel loop discipline.** A full-screen fragment loop runs over as few items as possible; rare effects get their own loop inside a bounding box. The motes regression: adding 6 motes to the two per-pixel firefly loops (8 → 14 iterations) cost +3 ms per frame; giving motes their own loop inside a box round them, with each speck skipping its exponentials beyond its reach, won it back.
- **F-10 (MUST)** Limit each animal's detailed shading to a radius around it, and check the radius against the animal's largest real extent over a long run (legs at full push under ~0.9 of it).
- **F-11 (MUST)** No per-frame garbage in the hot path: scratch arrays hoisted, uniforms written by index (`qa:alloc`: `world.step` ≤ 1 KB per frame, measured ~0.1–0.5 KB).
- **F-12 (MUST)** Release everything on dispose: the loop, observers, listeners, the canvas and its GPU resources (`qa:lifecycle`: 80 switches, heap flat, 0 canvases and 0 animation frames after dispose).
- **F-13 (SHOULD)** First load has no main-thread task over 50 ms (`qa:first`, limit 80 ms for noise; measured none on a quiet M1, Phase 1). Frame cost ≲ 15 ms GPU at 1520 × 1027 (`qa:gpu`; measured 10.3 night, 11.4–13.0 day on the M1 in Phase 1). Timing checks depend on the machine: compare against a baseline built in the same session (`qa/tools/baseline.mjs`).

How to measure frame cost: keep the page visible (hidden tabs throttle GPU
work); force the GPU to finish after each frame (read back one pixel);
average ~40 frames; subtract the same loop on a tiny canvas; or use
`EXT_disjoint_timer_query_webgl2` for GPU time alone. To find what's
expensive, return early after each layer in turn and time it.

## 11. Interaction and accessibility

- **I-1 (MUST)** Every tap produces a visible response: the animal reacts (the frog leaps away from the tap; a swimmer dives and curves away), a prop reacts (a pad dimples, bobs and drifts with a small contact ripple), the medium reacts (a full ripple), scenery reacts (E-8).
- **I-2 (MUST)** Taps are tested against drawn shapes (B-2); touch gets a larger target than a mouse (the frog: 0.022 vs 0.01 world units; `qa:tol`).
- **I-3 (MUST)** The scene is focusable (`tabindex="0"`, `role="button"`), labelled per variant, and points to its instructions (`aria-describedby`). Enter or Space triggers a central action (the frog: a pebble in the middle), prevents scrolling and ignores key repeat (`qa:hit`).
- **I-4 (MUST)** A visible focus ring that follows the picture's edge (E-13).
- **I-5 (MUST)** With reduced motion: no loop at all; one finished still; `role="img"` with the still's own description; not focusable; the instructions hidden (`qa:rm`).
- **I-6 (MUST)** A variant switch (the frog: Night | Day) is real buttons with `aria-pressed` (or links with `aria-current` when each variant has its own address); the variant may also be chosen in the address (`#day`).
- **I-7 (MUST)** Text contrast ≥ 4.5:1 and non-text (the switch's outline) ≥ 3:1 against the page in every variant (`qa:a11y`).
- **I-8 (MUST)** A single self-contained HTML file that works offline: a doctype, `lang`, UTF-8, a viewport meta, `body { margin: 0 }`, no external requests, the worker started from the page's own script, working in a sandboxed iframe without storage (`qa:standalone`; the build fails if any basic is missing).

## 12. QA

Run the checks after every change; report the numbers, not just PASS. The
limits are in `qa/thresholds.mjs`; `npm run docs:check` fails if the Pass
column below differs from it. "Known issue" marks a target the frog doesn't
meet yet (section 15): the check reports it as KNOWN and doesn't fail.

<!-- qa-table:start -->

| ID   | Check                         | Measures                                                                                     | Pass                              | Threshold                         | Script                  |
| ---- | ----------------------------- | -------------------------------------------------------------------------------------------- | --------------------------------- | --------------------------------- | ----------------------- |
| Q-1  | Broken rules                  | `check()` issues over 10 min untouched, 5 min tapped, 10 min resizing, aspects 1.48 and 0.91 | = 0                               | `soak.checkIssues`                | `npm run qa:soak`       |
| Q-2  | Non-finite poses              | frames with NaN or infinite pose values, same soaks                                          | = 0                               | `soak.nanFrames`                  | `npm run qa:soak`       |
| Q-3  | Scenery clear of the boundary | frames with a pad under the bank                                                             | = 0                               | `soak.padUnderBankFrames`         | `npm run qa:soak`       |
| Q-4  | Swimmers on the water         | samples with a swimmer's body or any limb over the bank                                      | = 0 samples                       | `soak.swimmerOverBank`            | `npm run qa:soak`       |
| Q-5  | Toes on the grass             | deepest toe over the bank from a frog on a pad (drawn over it)                               | ≤ 0.02 world units                | `soak.drawnOverToe`               | `npm run qa:soak`       |
| Q-6  | Getting stuck                 | longest stretch in any temporary state                                                       | ≤ 40 s                            | `soak.longestTemporaryState`      | `npm run qa:soak`       |
| Q-7  | Swim length                   | median swim over 2 h untouched                                                               | 3 … 8 s                           | `swims.median`                    | `npm run qa:swims`      |
| Q-8  | Swim length, long tail        | 90th percentile swim                                                                         | ≤ 12 s                            | `swims.p90`                       | `npm run qa:swims`      |
| Q-9  | Longest swim                  | longest swim in 2 h                                                                          | ≤ 30 s                            | `swims.longest`                   | `npm run qa:swims`      |
| Q-10 | Hop rate                      | pad jumps per frog per minute                                                                | 2 … 3.5                           | `swims.padJumpsPerFrogPerMinute`  | `npm run qa:swims`      |
| Q-11 | Into the water                | share of pad jumps that end in the water                                                     | 0.2 … 0.36                        | `swims.intoWaterShare`            | `npm run qa:swims`      |
| Q-12 | Planted foot slide            | path a pinned foot travels on its surface per planted stretch, 95th percentile               | ≤ 0.06 body lengths · known issue | `motion.plantedSlideP95`          | `npm run qa:motion`     |
| Q-13 | Planted foot at its pin       | distance from the pin, median by state                                                       | ≤ 0.01 body lengths               | `motion.plantedFoot.median`       | `npm run qa:motion`     |
| Q-14 | Planted foot at its pin, tail | distance from the pin, 95th percentile by state                                              | ≤ 0.06 body lengths · known issue | `motion.plantedFoot.p95`          | `npm run qa:motion`     |
| Q-15 | Settle slide                  | foot travel in the second after an on-pad turn ends                                          | ≤ 0.03 body lengths               | `motion.settleSlide`              | `npm run qa:motion`     |
| Q-16 | Turning while still           | heading change on frames a swimmer moved < 1e-4                                              | ≤ 0.05 rad                        | `motion.turnWhileStill`           | `npm run qa:motion`     |
| Q-17 | Mirroring                     | hind left − right a second into straight swimming                                            | ≤ 0.01                            | `motion.mirroring`                | `npm run qa:motion`     |
| Q-18 | Curvature                     | heading change ÷ distance while swimming, 99th percentile                                    | ≤ 30 per unit distance            | `motion.curvatureP99`             | `npm run qa:motion`     |
| Q-19 | Pose jumps in pushes          | largest one-frame pose change in the crouch and the air                                      | ≤ 0.4                             | `motion.poseJump.air`             | `npm run qa:motion`     |
| Q-20 | Pose jumps elsewhere          | largest one-frame pose change in sit, turn, land                                             | ≤ 0.1                             | `motion.poseJump.other`           | `npm run qa:motion`     |
| Q-21 | Rotation spikes               | largest angular acceleration, by state                                                       | ≤ 400 rad/s²                      | `motion.angularAcceleration`      | `npm run qa:motion`     |
| Q-22 | Garbage per frame             | bytes allocated per `world.step()`                                                           | ≤ 1024 B                          | `alloc.stepBytesPerFrame`         | `npm run qa:alloc`      |
| Q-23 | Download, standalone          | the single file's script, minified                                                           | ≤ 100 KB                          | `size.standaloneMin`              | `npm run qa:size`       |
| Q-24 | Download, standalone gzip     | the same, gzipped                                                                            | ≤ 40 KB                           | `size.standaloneGzip`             | `npm run qa:size`       |
| Q-25 | Download with the page        | the demo's JS before the pond comes near                                                     | ≤ 8 KB                            | `size.demoFirstLoadMin`           | `npm run qa:size`       |
| Q-26 | Download on approach          | the scene's JS as the pond comes near, minified                                              | ≤ 70 KB                           | `size.demoOnApproachMin`          | `npm run qa:size`       |
| Q-27 | Download on approach, gzip    | the same, gzipped                                                                            | ≤ 28 KB                           | `size.demoOnApproachGzip`         | `npm run qa:size`       |
| Q-28 | Stills                        | each first-frame still                                                                       | ≤ 60 KB                           | `size.stillKB`                    | `npm run qa:size`       |
| Q-29 | Loads cleanly                 | both variants × renderers ready, labelled, no console errors; no dev hooks shipped           | pass                              | —                                 | `npm run qa:smoke`      |
| Q-30 | Shared geometry               | JS vs GLSL shore and open-water distance, largest difference                                 | ≤ 0.00001                         | `parity.shoreAbs`                 | `npm run qa:parity`     |
| Q-31 | Shared depth                  | bed depth vs `shelfDepth()`, mean difference                                                 | ≤ 0.03                            | `parity.depthMeanAbs`             | `npm run qa:parity`     |
| Q-32 | Night brightness              | mean luma inside the picture, each renderer                                                  | 35 … 40                           | `luma.night`                      | `npm run qa:luma`       |
| Q-33 | Day brightness                | mean luma inside the picture, each renderer                                                  | 85 … 90                           | `luma.day`                        | `npm run qa:luma`       |
| Q-34 | Renderers match               | WebGL − Canvas mean luma, each variant                                                       | ≤ 5                               | `luma.rendererGap`                | `npm run qa:luma`       |
| Q-35 | No taps outside the picture   | taps accepted where the mask is under 0.2                                                    | ≤ 0 %                             | `hit.acceptedWhereFaint`          | `npm run qa:hit`        |
| Q-36 | Visible picture takes taps    | clearly visible picture outside the tap rule                                                 | ≤ 0.5 %                           | `hit.visibleRejected`             | `npm run qa:hit`        |
| Q-37 | Occluders take taps           | opaque grass over the water counted as bank                                                  | ≥ 85 %                            | `hit.overhangCounted`             | `npm run qa:hit`        |
| Q-38 | Touch tolerance               | a finger hits a frog a mouse misses                                                          | pass                              | —                                 | `npm run qa:tol`        |
| Q-39 | Text contrast                 | caption, lede, instructions, switch, both variants                                           | ≥ 4.5                             | `a11y.text`                       | `npm run qa:a11y`       |
| Q-40 | Outline contrast              | the switch's outline against the page                                                        | ≥ 3                               | `a11y.nonText`                    | `npm run qa:a11y`       |
| Q-41 | Phone layout                  | sideways overflow at 375 px                                                                  | ≤ 0 px                            | `a11y.phoneOverflow`              | `npm run qa:a11y`       |
| Q-42 | Reduced motion                | a described still, no loop, not focusable, no instructions                                   | pass                              | —                                 | `npm run qa:rm`         |
| Q-43 | Shadow direction              | a midge's shadow falls down-left in both renderers, same place                               | ≤ 3 px                            | `midge.rendererGapPx`             | `npm run qa:midge`      |
| Q-44 | Single file                   | page basics, no hooks, no requests, worker, switch, sandboxed iframe                         | pass                              | —                                 | `npm run qa:standalone` |
| Q-45 | Lifecycle                     | heap growth over 80 variant switches after the first 20                                      | ≤ 2 MB                            | `lifecycle.heapGrowthAfterWarmup` | `npm run qa:lifecycle`  |
| Q-46 | Pause off screen              | animation frames per second scrolled away                                                    | = 0 rAF/s                         | `offscreen.away`                  | `npm run qa:offscreen`  |
| Q-47 | Runs on screen                | animation frames per second in view                                                          | ≥ 20 rAF/s                        | `offscreen.inView`                | `npm run qa:offscreen`  |
| Q-48 | Context loss                  | Canvas at once, WebGL retried twice, then Canvas stays; focus kept                           | pass                              | —                                 | `npm run qa:loss`       |
| Q-49 | Stable scenery                | bank pixels changed by a 1 px wider canvas                                                   | ≤ 2 %                             | `reshuffle.plus1px`               | `npm run qa:reshuffle`  |
| Q-50 | Debounced bakes               | bakes asked for during a 2 s drag-resize                                                     | ≤ 1                               | `bake.bakesDuringDrag`            | `npm run qa:bake`       |
| Q-51 | No stalls on resize           | long tasks during the drag                                                                   | = 0                               | `bake.longTasksDuringDrag`        | `npm run qa:bake`       |
| Q-52 | No stalls on load             | worst long task, navigation to 4 s, shipped builds, 2×                                       | ≤ 80 ms                           | `first.worstLongTask`             | `npm run qa:first`      |
| Q-53 | Frame cost, GPU               | GPU ms per frame at 1520 × 1027                                                              | ≤ 15 ms                           | `gpu.gpuMs`                       | `npm run qa:gpu`        |
| Q-54 | Frame cost, synced            | CPU + GPU ms per frame with a readback                                                       | ≤ 16.7 ms                         | `gpu.syncedMs`                    | `npm run qa:gpu`        |
| Q-55 | Review by eye                 | enlarged crops of each key moment, both variants × renderers                                 | reviewed                          | —                                 | `npm run qa:shots`      |

<!-- qa-table:end -->

- **Q-R1 (MUST)** Run `npm run check` (typecheck, lint, format, docs, build, Node checks) before every commit, and `npm run qa:browser` before a release or after any visual, input or loading change.
- **Q-R2 (MUST)** A failed measurement is fixed in the simulation or the renderer that causes it, not hidden by adjusting another layer.
- **Q-R3 (MUST)** Report what was verified and what wasn't (machines, browsers, real devices, how the timing was taken and the load average).
- **Q-R4 (MUST)** Review enlarged frame-by-frame crops of each key moment (a turn, a take-off, a landing, a stroke, a steering turn) in both renderers (`qa:shots`, `qa:stills`).

## 13. Build procedure

Follow these steps in order for a new study. Each step names its output.

1. **Brief.** Fill in the brief template (section 17). Output: the brief.
2. **Research.** Watch slow-motion footage; read locomotion papers; write observation notes in your own words: gaits and their timings, how it turns, what it does when idle, what startles it, how individuals differ. Output: `docs/<ANIMAL>_NOTES.md`.
3. **Motion sheet.** Body dimensions in body lengths; for each behaviour a key-pose table with timings (section 7's format); the locomotion modes and their contact and turning rules; individuals; the scene layout; what a viewer sees in 45 s; what each tap and key does. Output: `docs/<ANIMAL>_ART_DIRECTION.md`. Get it agreed before building.
4. **Scaffold.** Copy `packages/frog-pond` to `packages/<study>`, rename files (section 3), empty the world, keep the scene controller, the build and the harness wiring. Add the study to `scripts/build.mjs`, `studies/<study>/`, `standalone/<study>/entry.ts`. Output: a page that mounts an empty scene in both renderers.
5. **Habitat geometry.** Write the boundary, depth, occluders and picture edge as pure functions (section 8), with generated GLSL, and a parity check. Output: `<habitat>.ts`, `qa:parity` passing.
6. **World.** States, timers, motives, containment, `check()`, seeded; the rig and `pose()`; pins and steps. Step it in Node from the first day. Output: `<animal>-world.ts`, `qa:soak` passing.
7. **Motion.** Author each key pose and transition from the motion sheet; measure with `qa:motion` (planted feet, mirroring, turning while still, pose jumps, spins) and fix in the world. Output: `qa:motion` passing.
8. **Renderers.** The GPU renderer first (static layers baked once, detail near each animal), then the Canvas fallback matching it. Output: both renderers, `qa:smoke` passing.
9. **Palettes.** Every variant in the theme module; brightness to target; shadows checked. Output: `qa:luma`, `qa:midge` passing.
10. **Interaction.** Taps against drawn shapes, occluders, the picture edge, keyboard, reduced motion, the variant switch. Output: `qa:hit`, `qa:tol`, `qa:a11y`, `qa:rm` passing.
11. **Performance.** Lazy load, still, parallel compile, worker painting, pause, adaptive resolution, minified GLSL, per-pixel loop discipline. Output: `qa:size`, `qa:first`, `qa:gpu`, `qa:bake`, `qa:offscreen`, `qa:lifecycle`, `qa:loss` passing.
12. **Single file.** Output: `dist/standalone/<study>.html`, `qa:standalone` passing.
13. **Stills and review.** `qa:stills`, `qa:shots`; review by eye in both renderers and variants.
14. **Docs and report.** Update the study's guide and art direction; add its thresholds; write the change log with verified and not verified. Output: a QA report with numbers.

## 14. Your first animal: a walkthrough

A ground beetle walking over leaf litter, seen from above, by day. It shows
every part of the method on a body plan unlike the frog's.

**1. Brief.** One ground beetle (later two, differing in size and sheen) on
damp leaf litter under a log; top-down; a single warm key light from the
upper right (dappled through a canopy); it walks with a tripod gait,
pauses, antennae sweeping, and changes course round twigs; tap the beetle →
it runs off (a short burst), tap the litter → a leaf shifts, tap the log →
the beetle freezes; Enter → a drop of water falls mid-scene; desktop and
375 px, offline single file.

**2. Research notes (your words).** Walking beetles alternate two tripods
(front and back leg of one side with the middle leg of the other); at slow
speeds the stance lasts longer than the swing (duty factor ~0.6); turning,
the outside legs take longer strides; antennae sweep ahead and touch
obstacles; a startled beetle runs in a burst then freezes.

**3. Motion sheet (excerpt).** Body: head 0.18, thorax 0.24, elytra 0.58 BL;
six legs of femur 0.22 + tibia 0.26 + tarsus 0.12. Gait: tripod, cycle
0.45 s walking (0.25 s running), duty factor 0.6 (0.5). Keys per leg:
lift-off, swing (toes close, arc toward the body), touch-down, stance.
Turning: stepping only; body yaw ≤ what stance feet allow; outside strides
×1.3. Idle: antennae sweep 0.8 Hz; a pause every 4–9 s.

**4. Scaffold.**

```bash
cp -R packages/frog-pond packages/beetle-litter
# rename frog-* files to beetle-* / litter-*, update package.json "name" and exports
mkdir -p studies/beetles standalone/beetles
```

**5. The world's skeleton** (pure, seeded, steppable in Node):

```ts
// packages/beetle-litter/src/beetle-world.ts
import { groundDistance } from './litter';

type BeetleState = 'walk' | 'pause' | 'run' | 'freeze';
const TRIPODS = [
  [0, 3, 4],
  [1, 2, 5],
] as const; // legs L1 R1 L2 R2 L3 R3 → indices 0…5

export class BeetleWorld {
  readonly beetles: Beetle[];
  private seed = 1234;
  constructor(
    private aspect: number,
    private emit: (x: number, y: number, s: number) => void,
  ) {
    this.beetles = [makeBeetle(0.4 * aspect, 0.5, this)];
  }
  step(dt: number) {
    dt = Math.min(dt, 0.05);
    for (const b of this.beetles) {
      this.think(b, dt); // states, motives (twigs to go round, a destination), timers
      this.gait(b, dt); // footfall timeline: which tripod swings, pins and steps
      this.pose(b); // legs re-aimed at their pins (C-1), capsules written
    }
  }
  private gait(b: Beetle, dt: number) {
    b.phase = (b.phase + dt / b.cycle) % 1;
    const swinging = b.phase < 1 - b.duty ? 0 : 1; // which tripod is in swing
    for (const leg of TRIPODS[swinging]) this.swing(b, leg, b.phase); // unpin, carry, set down, pin
    for (const leg of TRIPODS[1 - swinging]) this.holdPinned(b, leg); // stance: pinned to the ground
    // The body advances over the stance feet; it never pushes them.
  }
  check(): string[] {
    const issues: string[] = [];
    this.beetles.forEach((b, i) => {
      if (!Number.isFinite(b.x + b.y + b.heading)) issues.push(`beetle ${i} has a non-finite pose`);
      if (groundDistance(b.x, b.y, this.aspect) < 0) issues.push(`beetle ${i} is inside the log`);
    });
    return issues;
  }
  // tap(), disturbCentre(), resize(), beetleDistance() as in section 2.1
}
```

**6. A soak from day one.** Copy `qa/soak.mjs` to `qa/beetle-soak.mjs`,
import `BeetleWorld`, and keep the same structure: seeded taps, `check()`
every second, NaN, containment of every leg against the log
(`groundDistance`), longest temporary state. Add `qa:beetle-soak` to
`package.json` and the Node group in `qa/run.mjs`, and its limits to
`qa/thresholds.mjs` (and to the QA table here).

**7. The motion check.** `qa/motion.mjs` already measures what walking
needs: planted-foot slide per stance (≤ 0.06 BL), turning while still (the
body may turn only as its stance feet allow), pose jumps by state. Add the
gait's own: duty factor per leg within ±0.05 of the sheet, and "no two legs
of a tripod on different phases". Fix failures in the world.

**8–13.** Renderers (the litter and log painted once per size in the worker;
the beetle's elytra sheen facing the light), the palette with a day
brightness target, taps (the log is an occluder: a tap there freezes the
beetle), performance (the same scene controller gives lazy load, the still,
parallel compile, pause and adaptive resolution for free), the single file,
stills and shots. Then write the report: numbers, crops, what wasn't checked.

## 15. Known issues in the frog study

- **Planted feet off their pins (Q-12, Q-14).** Measured 2026-09-25 by
  `qa:motion`: per planted stretch, the 95th percentile foot slide is
  0.11–0.18 BL (target 0.06), and a forefoot of the largest frog can sit
  ~0.29 BL off its pin through a 40 s sit, moving ~0.02 BL with each breath.
  The pins are set where the feet are at landing or after a turn; when the
  body settles, a pin can end up beyond the compact reach `pose()` allows
  (hind 0.6 extension, fore 0.7, aim ±1.3 rad), and the foot "gives" (C-5).
  The art direction's "planted feet hold within ~0.06 body lengths" holds for
  the median (0), not the tail. Fix direction: re-pin a foot that is out of
  reach as a small settling step after landing and after a turn, or bound the
  body's settle so pins stay reachable. Until then these rows report KNOWN.
- **Timing checks on a busy machine.** `qa:first`, `qa:gpu` and `qa:bake`
  (long tasks) depend on the GPU and load; on 2026-09-25 (battery, load
  average 5–24) they read 58–77 ms per frame for both this repo and the
  portfolio's Phase 1 page, so they were compared pairwise, not against the
  limits (see the repo's HANDOFF entry in the portfolio).
- **Not verified yet:** Safari and Firefox (`:has()`, CSS masks,
  `OffscreenCanvas` 2D in workers, `KHR_parallel_shader_compile`), real touch
  hardware, a real OS reduced-motion toggle and tab switch, a slow GPU (the
  resolution step-down has never triggered in a measured run), the standalone
  as a claude.ai artifact, long real-time watching. The Canvas caustics read
  more regular than the WebGL ones.

## 16. Definition of done

- Research notes and a motion sheet are written and agreed.
- The world is separate from the renderers, seeded, steppable in Node, and `check()` stays empty through the soaks.
- Every check in section 12 is run and reported; failures are fixed or recorded as known issues with a reason.
- Enlarged crops of each key moment are reviewed in both renderers and every variant.
- Every variant meets its brightness target; the renderers are within 5.
- Frame cost ≲ 15 ms GPU at 1520 × 1027 on the reference machine, static layers painted once (in a worker), the shading radius checked.
- Losing the GPU context falls back and recovers; the console shows no errors.
- Reduced motion, keyboard, the focus ring and the 375 px layout work.
- The single offline HTML file works, including in a sandboxed iframe.
- A change log lists what was checked and what wasn't.

## 17. Brief template

```text
Build an interactive creature study that follows docs/CREATURE_STUDY_SPEC.md.
Treat its MUST rules as requirements, cite rule IDs in commits and reviews,
and report every check in its section 12 with numbers.

Animal: [species, how many, how the individuals differ]
Habitat: [pond, reef, forest floor, meadow, rock face, sky…]
Camera: [top-down, side-on, three-quarter]
Variants: [e.g. night and day; where the light comes from; weather]
Locomotion: [modes from section 7 the animal really uses]
What it really does: [basking, hopping, swimming strokes, feeding, calling…]
Idle life: [breathing, blinks, throat or gill pulse, grooming…]
Environment: [boundaries, occluders, perches and cover, ambient life, wind]
Interactions: [tap the creature → …; tap the ground or a prop → …; keyboard → …]
Mood and colour: [described in words, not copied images]
Platforms: [desktop and phone at 375 px; offline single file]
Constraints: [no new runtime dependencies, frame budget, fallback required]
Deliver: observation notes, a motion sheet, the working study, and a QA
report with numbers, stills, and a list of anything unchecked.
```

## 18. Glossary

- **Aspect** — canvas width ÷ height; the world's x runs from 0 to it.
- **Body length (BL)** — an animal's own unit; the frog's `size` in world units.
- **Duty factor** — share of a gait cycle a foot is on the ground.
- **Key light** — the one light each variant's shadows fall away from.
- **Luma** — 0.299 R + 0.587 G + 0.114 B, 0–255.
- **Occluder** — scenery drawn over the animals' layer (grass, reeds, a log).
- **Picture edge** — the designed outline where the scene fades into the page; nothing outside it is interactive.
- **Pin (anchor)** — a foot's fixed point in a surface's frame.
- **Stage** — a perch big enough and near enough to be an affordance (the frog: pads 0–3).
- **Variant** — one palette of the same scene (Night, Day).
- **World unit** — one canvas height.
