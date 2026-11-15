# Working in Critters

Instructions for coding agents (Claude Code reads `CLAUDE.md`, which points
here) and for people.

## Read first

1. `docs/CREATURE_STUDY_SPEC.md` — the single source of truth. Follow its
   MUST rules; cite rule IDs (`E-12`, `L-16`, …) in commits and reviews.
2. `qa/README.md` — how the checks work and how to run them.
3. `docs/HANDOFF.md` — what the repository holds now, the eight animals and
   where each one's source lives, how the site is built and deployed.
4. For the frog pond: `docs/FROG_VISUAL_DIRECTION.md` (the approved board:
   Day only, water only, the grainy flat style) and `docs/frog-board/`.
   `docs/FROG_ART_DIRECTION.md` and `docs/FROG_STUDY_GUIDE.md` were written
   for the earlier pond (Night, a bank, reeds, fireflies): their motion
   sections (body plan, jump, feet, swim) still hold, their habitat, look
   and file tour don't.
5. For any study, its review artifacts (spec section 13.1):
   `docs/<ANIMAL>_FOOTAGE_LOG.md`, `docs/<ANIMAL>_VISUAL_DIRECTION.md`,
   `docs/<ANIMAL>_COMPOSITION_REVIEW.md`. The frog pond has the first two;
   it has no composition review yet (spec section 15). The seven other
   animals' artifacts are in their own projects (`docs/HANDOFF.md`).

## Standing decisions

- **No sound anywhere.** No audio code, controls or copy.
- The frog study is **Day only** for now (theme key `day`, title Day Chorus).
  The owner dropped Night on 2026-10-27 with the move to the grainy flat
  meadow style ("no night. just day for now"); a night look would need its
  own board in that style.
- **No new runtime dependencies.** Dev dependencies need the owner's OK,
  except the ones already here (esbuild, TypeScript, oxlint, oxfmt). Don't add
  Playwright as a dependency: the browser checks use its headless shell only.
- The repository is **public** on GitHub. Pushing still needs the owner's
  say-so each time: don't push without being asked.
- The site is on **Vercel**, deployed by building here and uploading the
  built `dist/site` folder (README, "Deploying"). Vercel doesn't build from
  git, and there is no GitHub Pages site. Don't deploy without being asked.
- **No media and no font files in git.** Clips and contact sheets under
  `social/` and the General Sans files in `studies/site/fonts/` are ignored
  (README, "Fonts"; `social/README.md`).
- Licences: MIT for code, CC BY 4.0 for docs (`LICENSE`, `docs/LICENSE`).

## Visual work needs approval first

- **No composition change without an approved board** (spec P-12). Habitat
  layers, palette values, camera, scale and where the animals sit change only
  when `docs/<ANIMAL>_VISUAL_DIRECTION.md` has a person's recorded approval
  for a revision that covers the change. An agent may draft the board and
  prepare frames; it may not approve, and it may not treat its own review as
  sign-off. Fixes that restore an existing measured rule (a shadow's
  direction, a parity error) are allowed.
- **Size it first** (P-15, P-16). Say whether the work is a Specimen, a
  Vignette or a Study, with an estimate, before anything else. A Study needs
  the approved board before production code; a Specimen or a Vignette is
  built first (after the footage log), and its first full-scene frames go to
  a person, whose decision becomes the board's first revision. After that the
  rule above applies to both.
- **Evidence is footage, not pictures of the idea** (P-11, P-13). Poses and
  timings come from the footage log. Generated images are optional,
  labelled `generated-…`, used only to discuss composition, palette or
  material, and never shipped.
- **Full scene before crops** (Q-R4 to Q-R7). Review desktop and phone frames
  at page size and a 30 s live session, and write down the creature, its
  action and its motive, before opening any crop. If they can't be named,
  record a composition defect, even if every check passes.
- **Habitat elements need a job** (E-34, E-35). Keep one that supplies
  motive, scale or depth and quieten it near the animal; quieten or remove
  one without a job.

## The docs

- Change a rule, threshold or QA check in the **spec first**, then
  `qa/thresholds.mjs` to match, then `npm run docs:write` to regenerate the
  field manual's generated regions. `npm run docs:check` (in CI) fails if the
  spec's QA table, `qa/thresholds.mjs`, `package.json`, `llms.txt` and the
  manual disagree.
- Prose and figures in `docs/CREATURE_STUDY_FIELD_MANUAL.html` are edited by
  hand; keep them consistent with the spec.

## Before committing

```bash
npm run check          # typecheck, oxlint, oxfmt --check, docs:check, build, Node QA
npm run qa:browser     # after visual, input or loading changes (needs the headless shell)
```

- Format with `npm run format` (oxfmt, print width 120, single quotes).
- A failed measurement is fixed where it's caused (the world, a renderer),
  never hidden by adjusting another layer (spec Q-R2). A target the study
  can't meet yet is recorded as `known` in `qa/thresholds.mjs` and in the
  spec's known issues, with a reason.
- After any visual change: `npm run qa:stills`, then `npm run qa:size`, then
  `npm run qa:shots` and the full-scene review in the study's composition
  review before any crop review (Q-R4 to Q-R6).
- Report what was verified and what wasn't (browsers, devices, machine load
  for timing checks).

## Layout

See the spec's section 3, and `README.md`.
