# Handoff

Where the work stands, for the next session to pick up without the
conversation that produced it. Branch `critter-skill` (not pushed; `main`
is behind it and a fast-forward away). Written 2026-10-13.

Read first, as always: `AGENTS.md`, `docs/CREATURE_STUDY_SPEC.md` (now
version 1.6), then this file.

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

## In progress: the cockroach Specimen (in this commit, unreviewed)

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

### Known issues to fix next

1. **Floor mottle reads as blocky squares** (shader value noise at scale 9,
   too contrasty): use smoother noise (quintic, fbm, rotated octaves) and
   less amplitude; keep the Canvas floor in step.
2. **Legs read short and stubby**; much of each leg hides under the body.
   Try longer legs and roots nearer the body edge, then re-run the Node
   reach check (scratch script: step the world, compare each planted foot
   with its tarsus end).
3. **No QA adapter yet**: add `qa/lib/studies/cockroach.mjs` (planted feet
   from `world.roach.feet`, surface = the floor), build its world in
   `qa/lib/prepare.mjs`, and decide whether `qa/run.mjs` runs motion and
   soak per study.
4. **Not yet done for the Specimen**: first-frame stills, reduced-motion
   still check, `qa:browser` coverage of the page, the full-scene review
   (Q-R4, Q-R5) and **the board for the owner (P-16)**: desktop and phone
   frames, creature / action / motive written down, the owner's decision
   recorded in `docs/COCKROACH_VISUAL_DIRECTION.md` (doesn't exist yet).
   No single-file build (optional for a Specimen, P-15).
5. Guesses still to source: antenna length and sweep, behaviour timings,
   stride yaw amplitude, turning numbers, leg segment split.
6. The site build's `buildModules` gained a `bankWorker` flag so the
   cockroach build doesn't look for the frog's worker; the frog's site and
   size budgets are unchanged.

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

1. Fix the cockroach's floor and legs (issues 1–2), then its QA adapter
   (issue 3) and run `qa:motion`/`qa:soak --study=cockroach`.
2. Full-scene review and the P-16 board for the owner.
3. Commit; update `docs/CRITTER_KIT_PLAN.md` (step 8 under way) and the
   skill's Setup table (cockroach as the first small example).
4. Then the plan's step 7 primitives (`chain.ts`, `wave.ts`,
   `secondary.ts`) with the koi (footage screened: top-down koi kept) and
   the turtle (top-down swim kept).
