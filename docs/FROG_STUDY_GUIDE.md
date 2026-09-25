# The frog pond study, explained

A plain-language tour of what we built, how it works, and where to change
things. The general method behind it (reusable for any creature, with
diagrams) is `CREATURE_STUDY_SPEC.md` (illustrated in `CREATURE_STUDY_FIELD_MANUAL.html`).
For poses, timings and the water model, see `FROG_ART_DIRECTION.md`.

## What it is

An interactive pond seen from above: three frogs on lily pads, fireflies (or
midges by day), reeds in the bay by the grassy point, and water you can see
into. It comes in two lights:

| Version          | Address      | Mood                                                                                  |
| ---------------- | ------------ | ------------------------------------------------------------------------------------- |
| **Night Chorus** | `frogs/`     | The last of a sunset from the top-right as night falls; dark, peaty water; fireflies. |
| **Day Chorus**   | `frogs/#day` | High sun; clear green water; stones and moving light on the bed; midges.              |

The demo (`studies/frogs`, `npm run dev`) shows both with a **Night | Day**
switch. There is also
**one self-contained HTML file** (`dist/standalone/frogs.html`) with both
lights and its own **Night | Day** switch. It works offline and can be shared
on its own, for example as a claude.ai artifact. `frogs.html#day` opens it in
daylight.

What you can do: tap a frog and it leaps away from your finger. Tap a
swimming frog and it dives and curves away. Tap a pad and it rocks. Tap the
water for a ripple. Tap the grass (or the reeds) and a few fireflies start up
out of it (midges by day); near the water's edge the water shivers too.
**Enter** or **Space** drops a pebble in the middle. Only the visible picture
takes taps: the faded margin round it doesn't. With your system's "reduce
motion" setting on, you get a still illustration instead.

We see one stretch of the pond's **shore**: a near bank along the bottom that
curves up the left side, with a grassy point reaching into the water. To the
top and right the water runs on out of the picture, so the pond feels bigger
than the frame. Silt clouds the shallows, then come dark wet earth and pebbles
at the water's edge and the bank rising into earth and grass (lit where it
faces the light), with tufts leaning out over the water, the odd fallen leaf,
and by day a few small flowers. The reeds grow in the bay by the grassy
point and cast soft shadows. The whole picture fades raggedly into the page.
Lily pads never touch the bank: if one drifts toward it, it's nudged back off.

Under the caption, **Night | Day** switches between the two lights; the
address follows (`#day`), and the back button switches back.

## The big idea: one world, two painters

Everything is split into a **world** (what is happening) and **renderers**
(how it's drawn):

```
FrogWorld (frog-world.ts)        ← the simulation: frogs, pads, flies, rules
   │   every frame: step(time) → positions, poses, leg shapes
   ▼
Scene controller (frog-scene.ts) ← owns the canvas, the loop, taps, fallback
   │
   ├─ WebGL renderer (frog-webgl.ts + frog-shaders.ts)   ← the main, rich painter
   └─ Canvas 2D renderer (frog-canvas.ts)                ← a backup painter, loaded only if needed
```

Because both painters draw the **same world**, a frog does exactly the same
thing whichever one you see. If WebGL isn't available, or the graphics card
drops it, the page quietly switches to the backup, and tries WebGL again later.

`frog-theme.ts` holds the **colours and lighting for night and day**, the
frogs' looks and all the page text, and both painters read it (the shader is
generated from it). That's how the two stay matching.

## The files

| File                                                                             | Job                                                                                                                                                                     |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/frog-pond/src/frog-world.ts`                                           | The brain: behaviour, movement, the frog skeleton ("rig"), foot planting, the pad layouts, motes.                                                                       |
| `packages/frog-pond/src/frog-scene.ts`                                           | Sets up the canvas, runs the animation loop (only while the pond is on screen), handles taps and keys, switches painters, steps the resolution down if frames run slow. |
| `packages/frog-pond/src/frog-shaders.ts`                                         | The GPU drawing code: water, riverbed, pads, frogs, fireflies, reeds.                                                                                                   |
| `packages/frog-pond/src/frog-webgl.ts`                                           | Feeds the world to the GPU each frame, and bakes the riverbed image once per size.                                                                                      |
| `packages/frog-pond/src/frog-canvas.ts`                                          | The backup painter (same look, simpler drawing).                                                                                                                        |
| `packages/frog-pond/src/frog-theme.ts`                                           | Night and day palettes, the frogs' looks, and the page text.                                                                                                            |
| `packages/frog-pond/src/frog-bank.ts`                                            | Where the shore is (one function everyone shares), how deep the water is, where the reeds are, and the page's ragged outer edge.                                        |
| `packages/frog-pond/src/frog-bank-paint.ts`                                      | Paints the bank (earth, stones, grass, silt in the shallows) for a size.                                                                                                |
| `packages/frog-pond/src/frog-bank-layer.ts`                                      | Gets the bank (and by day the caustic pattern) painted in a background worker, and keeps finished ones for reuse.                                                       |
| `packages/frog-pond/src/frog-bank-worker.ts`                                     | That worker (`frog-bank-worker-factory.ts` starts it).                                                                                                                  |
| `packages/frog-pond/src/frog-caustics.ts`                                        | The daylight "light web" pattern on the bed, shared by both painters.                                                                                                   |
| `packages/frog-pond/src/frog-math.ts`, `gl-utils.ts`                             | Small shared helpers.                                                                                                                                                   |
| `packages/frog-pond/src/index.ts`, `world.ts`, `bank.ts`, `theme.ts`, `paint.ts` | What the package exports (the world and bank ones work in Node).                                                                                                        |
| `studies/frogs/`                                                                 | The demo page: `index.html`, `page.css`, `page.ts` (caption, Night \| Day, instructions), `main.ts` (loads the pond as it comes near).                                  |
| `studies/frogs/stills/*.webp`                                                    | Stills of the first frame, shown until the pond is ready.                                                                                                               |
| `standalone/frogs/entry.ts` + `scripts/build-standalone.mjs`                     | The offline single-file version (the demo page with its CSS inlined).                                                                                                   |
| `scripts/build.mjs`, `scripts/glsl-minify.mjs`                                   | The builds (esbuild), and the step that strips comments and spaces from the shaders.                                                                                    |
| `qa/`                                                                            | The measuring harness (soaks, motion, parity, brightness, hit tests, GPU cost…), `npm run qa:*`; see its README.                                                        |

## How a frog "thinks"

Each frog is always in exactly one **state**, and each state has its own
choreography:

```
        ┌──────────── turn (small shift on the pad) ────────────┐
        ▼                                                       │
sit ──► crouch ──► air ──► land ──► sit
 ▲                   │
 │                   └──► (lands in water) ──► swim ◄──► dive (when tapped)
 │                                               │
 └────────────── climbs out onto a free pad ◄────┘
```

- **Sit:** breathes (each frog at its own rate), blinks, croaks now and then
  (three throat swells), watches the nearest firefly, and snaps its tongue at
  one that drifts into reach. Mostly it just sits. Every so often it decides
  to hop (40% of the time when its idle timer runs out) or slip into the water.
- **Turn:** only happens for a reason: to face a hop it has already chosen, or
  to bring a firefly into reach. It's small (at most ~43°) and low.
- **Crouch → air → land:** the jump. It loads, pushes off (one leg a
  split-second before the other), gathers its legs in flight, reaches with the
  front feet, lands, squashes, and settles.
- **Swim:** a real frog stroke. The knees draw in, both legs kick together,
  then a long, still glide. After 3–7 s it comes round toward the nearest
  free pad (starting two seconds early, and stroking sooner when it has far to
  turn), swims round any pad in the way, and climbs out onto that pad, or any
  free one it bumps into. Half the swims are over in about 5–7 s; a few,
  when the way is crowded, take up to 25 s.
- **Dive:** when you tap a swimming frog: a quick tuck, then a strong kick
  that curves away from your tap, deeper under the surface. Once the scare
  has passed it heads out again within a few seconds.

Nothing happens at a fixed time. Every frog runs its own timers, with a little
randomness, so the pond never loops.

## How the body works (the rig)

Seen from above, a frog is:

- a **body** made of a few overlapping ovals (back, hips, head, snout, eyes,
  throat sacs) that can squash, stretch, and shift its weight back and forth;
- **two hind legs** of three segments each (thigh, shin, foot), with webbed
  toes that spread and close;
- **two front legs** of two segments each.

Each leg is driven by one number from "folded" to "extended", plus a
**yaw**, which swings the whole leg around the hip or shoulder. The world
turns those numbers into leg segments every frame, and both painters draw
those segments. Hit-testing uses the same shapes, so tapping a toe counts as
tapping the frog.

### Planted feet

When a frog turns on a leaf its feet stay put: **each foot on a leaf is
pinned** to a spot on that leaf. Every frame the leg re-aims at its pinned
spot and adjusts its reach, so the foot stays still while the body moves over
it. That's why a sitting frog's body breathes while its feet stay still, why
a turn is a few short, low steps, and why the feet grip for the first instant
of a jump. The aim is for planted feet to hold within 6% of a body length;
most do, but a front foot pinned a little beyond its reach still moves with
each breath (a known issue, measured by `npm run qa:motion`).

### How turning works

- **On a pad:** the frog swings round a point near its hips, so the back end
  barely moves and the head end travels. Its arms are short, so the front
  feet patter (two small steps each), and each back foot steps once.
- **In the air:** any turn left over is spread smoothly across the whole
  jump.
- **In water:** a frog can only change direction while it's actually moving,
  and it curves rather than spinning on the spot. While it turns, its legs
  trail to the outside of the curve, as they would through water. Only a
  "steering" stroke is uneven (one leg kicks harder); ordinary strokes are
  perfectly mirrored, which is how real frogs swim.

### Keeping to the water

A swimmer's body keeps a little way off the bank, and so do its legs: a frog
turning back from the shore trails its hind legs well behind it, so the world
checks every knee, ankle and toe against the shore and eases the frog clear
if any would go under the grass. Frogs on pads or in the air are drawn over
the bank, so a leap near the shore passes over the grass.

## How the pond looks

The water is built in layers, from the bottom up:

1. **The riverbed:** silt, sandy patches toward the edges, darker patches of
   old leaves, and stones: a few big ones, lots of pebbles near the bank,
   many half-sunk, some mossy, each lit on the side facing the sun. Because
   it never changes, it's painted **once** into an image and reused. That's
   the main reason it's cheap to draw.
2. **Depth:** the pond is shallow at the bank and deeper in the middle
   (`shelfDepth` in `frog-bank.ts`, the same for both painters). The deeper it
   is, the more the water's own colour hides the bed.
3. **Light on the bed:** by day, moving **caustics** (the bright wobbly web
   sunlight makes on a pond floor), fainter over deep water. Pads and swimming
   frogs cast **shadows on the bed**, offset further over deeper water. That
   offset is what makes the pads read as floating.
4. **The surface:** the sky reflected, the glow of the sun (or sunset), small
   glints, slow reflections, and ripples when you tap. The bed wobbles
   slightly through the moving surface.
5. **The bank**, over the water's edge (and over a swimmer close to it).
6. **On top:** frogs on pads or in the air with their shadows, fireflies or
   midges (and motes from the grass), and the reeds with their shadows.

One lighting rule holds everywhere: **the light is up and to the right, so
every shadow falls down and to the left.**

**Night vs day** is mostly the palette in `frog-theme.ts`: water colours, how
murky the water is, how much sky it reflects, how bright the bed is, caustics
on or off, pad and reed colours, shadow strength, and vignette. Brightness is
measured, not guessed: mean luma inside the visible picture is about 39 at
night and 86–87 by day (`npm run qa:luma`).

## Speed, and being a good neighbour on the page

- **Nothing loads until it's needed.** The page ships a small piece of code
  and a still image of the pond's first frame. The pond's code (about 64 KB,
  25 KB gzipped) loads when it's about to scroll into view. The backup painter
  only loads if WebGL fails.
- **No stalls.** The shaders compile in the background, and the bank and the
  caustic pattern are painted in a background worker. The live pond replaces
  the still when its first frame is ready (the same moment, so nothing jumps).
- **It rests when you can't see it:** the loop stops when the pond scrolls off
  screen or the tab is hidden.
- **It adapts:** if frames keep running slow, the pond steps its resolution
  down (never below 0.6 of a CSS pixel).
- **Cost per frame** on the M1 at 1520×1027: about 10–11 ms of GPU time, the
  same as before this round (measured with GPU timer queries).

## Accessibility

- **Reduce motion on:** a finished still picture with its own description, and
  no animation loop at all.
- **Keyboard:** the pond is focusable; its focus ring follows the picture's
  ragged edge, with a pale halo so it shows over dark water. Enter or Space
  drops a pebble.
- **Screen readers:** the pond has a label and points to the instructions.
- **Touch:** fingers get a slightly more forgiving hit area than a mouse.
- The Night | Day switch's outline is at least 3:1 against the page, and all
  text at least 4.5:1, in both lights (`npm run qa:a11y`).

## Changing common things

| You want…                                        | Look at                                                                                                                                      |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Different colours or brightness for night or day | `FROG_PALETTES` in `frog-theme.ts` (then run `npm run qa:luma` and `npm run qa:stills`)                                                      |
| Different page title, caption or instructions    | `FROG_COPY` and `FROG_INSTRUCTIONS` in `frog-theme.ts`                                                                                       |
| Faster or slower jumps or strokes                | Timing constants near the top of `frog-world.ts` (`CROUCH_*`, `PUSH`, `LANDING`, `KICK`, `RECOVER`, `HOMING`)                                |
| How often frogs hop or turn                      | `sit()` and `startJump()` in `frog-world.ts`                                                                                                 |
| Where the pads are                               | `PADS`, `PAD_HOMES_WIDE` and `PAD_HOMES_NARROW` in `frog-world.ts`                                                                           |
| Frog colours and bar strength                    | `FROG_LOOKS` in `frog-theme.ts` (both painters); the markings are `markings()` in `frog-shaders.ts` and `makeMarkings()` in `frog-canvas.ts` |
| Riverbed look                                    | `bedAlbedo()` in `frog-shaders.ts`, and `paintBed()` in `frog-canvas.ts`                                                                     |
| The shore's shape                                | `BOTTOM`, `LEFT`, `POINT` and the wobbles at the top of `frog-bank.ts` (then re-check the pad homes: every pad must stay clear of the bank)  |
| The reeds                                        | `reedBlades()` in `frog-bank.ts` (both painters and the tap test use it)                                                                     |
| The bank's look                                  | `paintBank()` in `frog-bank-paint.ts`; its colours are `soil*`, `grass*`, `moss` and `flowers` in `frog-theme.ts`                            |

After a visual change, regenerate the stills (`npm run qa:stills`) and check
their size (`npm run qa:size`).

## Developer tools (`npm run dev` only; never shipped)

- `?renderer=canvas`: force the backup painter.
- `?frogs=1` (or 2): fewer frogs.
- `?dpr=fixed`: keep full resolution (no stepping down when frames run slow).
- In the browser console: `__frogWorld` (inspect everything), `__frogAdvance(s)`
  (step time by hand), `__frogTap(x, y)`, `__frogTaps()` (what taps have done,
  by result), `__frogCheck()` (lists anything broken, such as a frog outside
  the pond or two frogs on one pad), `__frogMode()` (which painter),
  `__frogReady()` (whether the first frame is up), `__frogLoseContext()`
  (simulate the graphics card dropping WebGL), `__frogResolution(step?)`
  (read or fix the resolution step).
- The renderer in use is logged to the console on load (`[frog-pond]
renderer: webgl2`); painting on the page instead of in the worker is logged
  too.

## What we did, in order

1. **Swimming fixed to match real frogs:** mirrored legs on straight
   strokes; recovery → kick → glide; lopsided strokes only when steering; no
   spinning on the spot in water.
2. **Pad turns made motivated and small.**
3. **Full motion audit:** planted feet with stepping, turns spread across
   jumps, legs trailing in turns, smooth entry and exit from the water.
4. **New water and riverbed** for both versions, with correct shadows.
5. **The day version**, brightness measured and matched to a target.
6. Committed in the portfolio (`2bf1a18`), where the study began.
7. A **stretch of shore** at the bottom and left with the water running out of
   the frame, and a switch between the two lights.
8. **Audit and fixes (2026-09-25):** the lights renamed Night and Day, and
   the audit's findings fixed: the standalone page
   (one file, both lights, proper page head), taps only in the visible
   picture, a focus ring that follows the picture, midge shadows, legs kept off
   the bank, a narrow pad layout for phones, bank taps that show something,
   swims that head home, brighter day, caustics and reeds in the backup
   painter, and the loading and speed work above (`docs/audit-report.html`).
9. **Moved to its own repository (Animal Farm)** as a framework-free package
   with a plain demo page, the single file built from that page, and the
   audit harness turned into `npm run qa:*` checks with thresholds, including
   a new motion check (planted feet, mirroring, pose jumps).

## Known gaps

Not yet checked: a long real-time watch (motion checks were done by stepping
frames), a real OS reduce-motion toggle, real touch devices, Safari and
Firefox, a slow graphics card, and the standalone file running live as an
artifact. The backup painter's caustics are softer and fade with depth now,
but still look more regular than the WebGL ones. The shared artifact on
claude.ai is out of date. Some planted feet sit a little off their pins and
move with each breath (see Planted feet above).
