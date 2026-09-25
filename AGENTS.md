# Working in Animal Farm

Instructions for coding agents (Claude Code reads `CLAUDE.md`, which points
here) and for people.

## Read first

1. `docs/CREATURE_STUDY_SPEC.md` — the single source of truth. Follow its
   MUST rules; cite rule IDs (`E-12`, `L-16`, …) in commits and reviews.
2. `qa/README.md` — how the checks work and how to run them.
3. For the frog pond: `docs/FROG_ART_DIRECTION.md`, `docs/FROG_STUDY_GUIDE.md`.

## Standing decisions

- **No sound anywhere.** No audio code, controls or copy.
- The frog study's variants are **Night | Day** (theme keys `night`, `day`;
  titles Night Chorus, Day Chorus).
- **No new runtime dependencies.** Dev dependencies need the owner's OK,
  except the ones already here (esbuild, TypeScript, oxlint, oxfmt). Don't add
  Playwright as a dependency: the browser checks use its headless shell only.
- The repository is **private** until the owner says otherwise. Don't push,
  make it public or turn on GitHub Pages without being asked.
- Licences: MIT for code, CC BY 4.0 for docs (`LICENSE`, `docs/LICENSE`).

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
- After any visual change: `npm run qa:stills`, then `npm run qa:size`.
- Report what was verified and what wasn't (browsers, devices, machine load
  for timing checks).

## Layout

See the spec's section 3, and `README.md`.
