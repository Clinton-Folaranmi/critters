# Handoff

Where the work stands, for the next session to pick up without the
conversation that produced it. Branch `critter-skill` (not pushed; `main`
is behind it and a fast-forward away). Updated 2026-10-19.

Read first, as always: `AGENTS.md`, `docs/CREATURE_STUDY_SPEC.md` (now
version 1.7), then this file.

## What this work is for

Turning the frog pond and its spec into a **Claude Code skill**
(`skills/critter/SKILL.md`) that builds any animal from one line, in the
style of Ryan's Anatomy skill: one rule at the top ("it moves the way the
real one moves, because it wants something"), sized work
(Specimen / Vignette / Study, spec P-15), a **kit** of tested building
blocks (`packages/critter-kit`), small-to-large examples, and checks that
print numbers. Animals first; moving machines maybe later. An environment
skill comes after the creature skill, sharing the kit.

## Done (20 commits on `critter-skill`, plus the one this file arrives in)

- **Skill draft** `skills/critter/SKILL.md`; **kit plan**
  `docs/CRITTER_KIT_PLAN.md` (inventory of frog-pond, extraction order,
  11-animal **test roster** covering every limb count and locomotion mode);
  **prior-work survey** `docs/CRITTER_PRIOR_WORK.md`.
- **Spec 1.1 → 1.6**: P-15 (size first) and P-16 (a Specimen or Vignette is
  its own board, approved after the first full-scene review; P-12's
  board-before-code is for a Study); unsourced frog and robin numbers
  flagged (section 15); gait table split (slow quadrupeds); L-30 (a gait is a
  measured footfall timeline advanced by distance) with Q-57 to Q-61; the
  kit's scene controller named in sections 2.1 and 3.
- **Dev hooks** renamed `__frog*` → `__critter*` (no aliases).
- **Kit extraction, steps 0–6 of the plan, all under the golden replay**
  (`node qa/tools/golden.mjs`: the frog's whole state hashed every second in
  four seeded sessions; still bit-identical): `math`, `motion`, `gl`, `rig`
  (LimbSpec, limbEnd, limbReach, poseChain), `contact` (Surface, solvePin,
  stepArc), `contain` (contain, gradient, pushOff, separate), `hit`
  (ellipseDistance, capsuleDistance), `scene` (mountScene + SceneConfig;
  `mountFrogScene` is a thin wrapper). New, not extracted: `gait`
  (footfall clock; `qa:gait`), `edge` (createPictureEdge, used by the
  cockroach only so far). Still the pond's: the worker baker.
- **Generic checks**: `qa:motion` and `qa:soak` run any study through an
  adapter in `qa/lib/studies/` (`frog.mjs`; `--study=<name>`); rows were
  identical before and after.
- **Footage pipeline**: `docs/FOOTAGE_BRIEF.md` (ChatGPT sourcing prompt,
  quality first, licence recorded), `docs/FOOTAGE_SCREENING.md` (16 clips
  screened, verdicts), tools in `qa/tools/footage/` (sheet, track,
  footfalls, gait; ffmpeg only; documented in `qa/README.md`). Source video
  lives in `/footage/` (git-ignored; anchored rule).
- **Cockroach evidence**: `docs/COCKROACH_FOOTAGE_LOG.md` (renamed from the
  beetle log; Weihmann et al. 2017, 250 fps): all six legs separated
  (`docs/footage/weihmann2017-file3.stances.json`, gait diagram PNG beside
  it); phases match the authors' (front in hind 0.95 → 0.86 vs 0.9 → 0.82);
  follow-the-leader for middle feet (6 cases); body measured directly on
  frame 60 (195 × 77 px → **7.2 px/mm**, which replaced the earlier 7.6).
- **Roster animal 1 is now the cockroach** (_Nauphoeta cinerea_), not a
  ground beetle, because every measurement is of it.

## Cockroach Specimen — r2 implementation complete; review partially complete

`packages/cockroach-floor` + `studies/cockroach/` — built only from the
kit. Runs in the dev server (`npm run dev` →
`http://127.0.0.1:5173/cockroach/`; add `?eager` when the preview pane is
hidden, since nothing intersects in a hidden document). WebGL2 renders; the
Canvas fallback works (it caught a shader error during the build).

- `cockroach-motion.ts`: the motion sheet, every number tagged measured /
  inferred / guess (gait, speeds, footholds, follow-the-leader, leg
  geometry, reflex step, turning, behaviour timings).
- `cockroach-world.ts`: rest / walk / turn / feed / flee; crumbs as food
  (one placed at start; tap floor drops one; Enter/Space drops one in the
  middle); tap the animal → it runs; search after a long rest. Feet pinned
  to the floor, legs solved each frame; a **reflex step** (C-5) when a
  planted foot falls out of reach. In a 60 s Node run `check()` stays
  empty; planted-foot reach error ≤ 0.03 BL except a single frame of 0.07 BL
  at the start of an escape.
- `cockroach-shape.ts` (shared geometry, GLSL generated from it),
  `cockroach-theme.ts`, `cockroach-shaders.ts`, `cockroach-webgl.ts`,
  `cockroach-canvas.ts`, `cockroach-scene.ts`.

### Done since (2026-10-13, second session)

- Issues 1–3 below fixed in `b7efc91`: smooth fbm floor; thinner, longer,
  better-rooted legs with outward knees and feet aimed at the tarsus tip
  (`TIP_OUT`, measured on frame 58); one-oval body (no waist; the Canvas
  renderer traces the shader's outline); turning with eased turn rate,
  turning only with distance actually moved, pivots at the floor's edge, an
  escape that turns first. QA adapter `qa/lib/studies/cockroach.mjs`;
  `qa:node` runs soak and motion for it (15/15, 92/92 pass).
- **Cockroach board decision and r2** (2026-10-17): the owner approved the
  existing crumb scale and colour for now, and approved the other r1 proposals:
  stop with food ahead of the head and reach toward it, keep dropped crumbs in
  the clearly visible floor, start farther from food, and shorten the search
  interval. Implemented in `cockroach-world.ts` and `cockroach-motion.ts`;
  motion check passes 92/92. R2 desktop/phone frames are in
  `docs/cockroach-board/r2/`. The owner approved the r2 desktop and phone
  full-scene frames as a cold review. Sample detail crops were inspected with
  no new defect found; the complete Q-R6 crop set still needs review. Final
  crumb styling remains open.
- Browser QA after r2: 14/16 check groups passed. The two failures were
  timing checks on the unchanged frog page (`qa:bake` Canvas long tasks at 51
  and 86 ms; `qa:first` one 85 ms demo task and one 486 ms standalone task).
  Cockroach desktop and phone 30 s sessions ran on the shipped build, with no
  dev hooks, and had no browser errors.
- Frame scripts used for the board live in `qa/.out/board-shots.mjs` and
  `qa/.out/live.mjs` (git-ignored, scratch); a generic `qa:shots` for any
  study would replace them.
- The browser pane throttles a hidden page to ~1 frame/s: a "frozen" animal
  there is not a bug. Watch live in the headless shell instead.

### Large next batch started (2026-10-17)

- `docs/RENDERING_STYLE_PLAN.md` records the proposed separation between
  motion and rendering, the exploratory p5.js catalogue, the implementation
  sequence and completion checks. `docs/cockroach-board/sketch-style-contact.jpg`
  is a visual-only contact sheet; motion evidence remains the footage log.
- Spec A-6/A-7 and `skills/critter/SKILL.md` now state that a drawing style
  cannot alter the world, pose, contacts or behavior. The field manual was
  regenerated, and `npm run docs:check` passes.
- No production renderer style has been changed yet. Next: finish the
  cockroach crop set; prepare the production-facing style board; implement the
  shared style contract and port Gouache and Gait Blueprint after that board
  is approved.
- The owner wants the skill to work from a reusable body of movement knowledge
  for common animals, reducing research on each new build:
  `docs/MOVEMENT_LIBRARY.md` is the lookup index (added to the skill's
  evidence-first step). `docs/FROG_FOOTAGE_LOG.md` holds family-level frog
  sources; frog timings remain unsourced.

## Koi Specimen — rebuilt 2026-10-18; board r1 awaits the owner

A review on 2026-10-18 found the first koi (written in another session)
unusable, and it was replaced, not patched:

- The kit's koi example compounded its wave through the chain solver: asked
  for a 0.10 BL tail swing it produced 0.27 (0.54 peak to peak), the
  mid-body swinging nearly as much. The wave was advanced by distance with
  wave speed equal to swim speed (slip 1: no thrust), at 0.27 tail beats/s.
- The fish circled a fixed orbit for ever and swam through its food; a tap
  froze it. The two renderers drew different fish (snout, fins, eyes,
  shadow, patches); the Canvas fallback loaded eagerly; lint and format
  failed; the docs overclaimed (a "full" local clip that is truncated at
  41 s; a fish "redrawn from logged footage" that was never measured).

What replaced it:

- Kit: `swim.ts` (body on the head's path from a `Trail` in `chain.ts`, the
  wave in `wave.ts` with a carangiform quadratic envelope, phase advanced by
  tail-beat frequency, `bend` and `turnSwimBody` for a C-start and pivots).
  Spec L-31 and Q-62 to Q-68; `qa:swim` (in `qa:node`) checks the primitive
  and soaks the koi for 10 minutes at two aspects.
- `packages/koi`: motion sheet `koi-motion.ts` (every number tagged
  measured / literature / inferred / guess); world `koi-world.ts` (beats and
  glides, hover, notices food, brakes and pivots to it, eats with a ring,
  C-start when touched, cooldown, fins as secondary motion); shared geometry
  `koi-shape.ts` (one triangle mesh both renderers draw); `koi-paint.ts`
  paints one atlas (skin in body coordinates, fins, leaves, pellets,
  shadows) and the floor, so WebGL2 and Canvas 2D draw the same pixels;
  WebGL2 adds caustics and ripple refraction only.
- Evidence: `docs/KOI_FOOTAGE_LOG.md` rewritten from frames of the clip
  (outline measured on one frame; surface feeding with rings).
- Board `docs/KOI_VISUAL_DIRECTION.md` r1 (PENDING) with four open
  questions; builder's review `docs/KOI_COMPOSITION_REVIEW.md`; frames in
  `docs/koi-board/r1/`. Scratch frame script: `qa/.out/koi-shots.mjs`
  (git-ignored).

## The reference loop — 2026-10-19 (the skill's new core)

The rebuilt koi still looked dead to the owner. Tracking the real koi in
footage and measuring the model the same way found why, and one round of
changes made it "clearly more alive" (owner, 2026-10-19). The skill
(`skills/critter/SKILL.md`) is rewritten around that loop, and the spec
(1.7) gains P-17 (grade the evidence A/B/C), P-18 (track, measure footage
and model with the same code, compare), P-19 (real-speed side-by-side to
the owner early) and Q-R8 (motion is judged at real speed).

- Tools: `qa/tools/footage/spine.mjs` (a pale fish's midline per frame),
  `spine-measure.mjs` (the same measures on footage or a model's recorded
  spine), `follow-koi.mjs` (the build's half of a side-by-side). Results and
  limits are in `docs/KOI_FOOTAGE_LOG.md` (grade B: the camera is ~30° off
  vertical; the local clip stops at 41 s).
- What the comparison changed in the koi (`koi-motion.ts`, tagged
  "tracked"): tail beats ~1.1 Hz and beating most of the time; Bainbridge's
  0.75 BL stride; turns of 0.8 BL radius or wider with gradual steering; the
  body straightens when slow (`relaxSwimBody` in the kit); a gentler
  meander; a looser mid-body wave; the fish drawn smaller (0.18 of the
  picture's height on desktop, 0.15 on a phone) because at its real speed it
  did laps of a pond five body lengths across; roll into turns and a head
  lift to feed, drawn by sliding and foreshortening the skin (both
  renderers). Unfed, every measure is now within about 30 % of the
  footage's; before, several were 2–4 times off.
- The touch response was a C-start that snapped the whole fish round in
  five frames (a visible jump); it is now a swish along a curve, and
  `qa:swim` fails any frame where a spine point moves more than 0.08 BL
  (Q-69).
- Videos: `reports/koi-tracking/` (git-ignored): `koi-side-by-side.mp4`,
  `koi-before-after.mp4`, `koi-curves.png`.
- The fish's size is board r1's open question 2: the owner hasn't decided;
  the frames in `docs/koi-board/r1/` are from before the change.

### Still open

1. Complete the cockroach r2 detail crop set (Q-R6); full-scene owner review
   and cold sign-off are recorded.
2. Reduced-motion still review and dedicated `qa:browser` coverage for the
   cockroach page. No single-file build (optional, P-15).
3. Guesses still to source: antenna length and sweep, behaviour timings,
   stride yaw amplitude, turning numbers (now including escape turn rate and
   turn acceleration), leg segment split.
4. The site build's `buildModules` gained a `bankWorker` flag so the
   cockroach build doesn't look for the frog's worker; the frog's site and
   size budgets are unchanged.
5. Koi: the owner's decision on board r1; then crops (Q-R6), a reduced-motion
   still review and `qa:browser` coverage. Re-download the full koi clip
   and track one fish to replace the speed, turning and beat-and-glide
   guesses. The turtle example remains open.

## Numbers to watch

- Frog single-file script **98.9 of 100 KB**; on-approach gzip 27.2 of
  28 KB. The owner hasn't decided whether to raise the cap.
- `qa:first` and `qa:gpu` fail by a few ms when the machine is busy;
  compare with `node qa/tools/baseline.mjs HEAD` built in the same session
  before calling a regression (did so for step 6: equal).

## Habits that worked (and one that didn't)

- Run `npm run check` and commit only on its **exit code** (a grep on its
  output once let a lint failure through).
- Every kit move: golden replay must stay identical; results of moved
  checks diffed row by row against a saved run.
- Footage: screen with `sheet.mjs`, measure with `footfalls.mjs`, assign
  legs by touch-down position relative to the body and by successive
  footholds one body displacement apart, then check every assignment on a
  sheet drawn with `--stances` before computing with `gait.mjs`. Antennae
  resting on the floor look like footfalls; exclude them.
- A top view can't see height: report "still on the floor, seen from above"
  separately from true contact.

## Next steps, in order

1. Get the owner's review/decision on board r2; after sign-off, finish the
   Specimen's remaining review checks and crops.
2. Update `docs/CRITTER_KIT_PLAN.md` (step 8 under way) and the skill's
   Setup table (cockroach as the first small example).
3. Koi: re-shoot board r1's frames at the new size and get the owner's
   decision; then crops and remaining checks. Better koi footage (straight
   down, steady, 50–60 fps) would let the tail-beat rate be measured, not
   ranged.
4. Prove the loop on a second animal before generalising the tools: the
   cockroach already has grade-A data; a new mode (a bird, a snake) would
   test spine.mjs and the grading on something else.
