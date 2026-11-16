# Handoff

Where the repository stands, as of 2026-11-14. Earlier handoffs (the kit
extraction, the first cockroach, koi and snake Specimens, the first social
posts) are in this file's git history.

Read first: `AGENTS.md`, then `docs/CREATURE_STUDY_SPEC.md`, then this.

## What this repository is

Two things, both kept:

1. **The site.** Eight animals, one page each, live at
   <https://thecritters.vercel.app>.
2. **The method.** The spec (`docs/CREATURE_STUDY_SPEC.md`, version 1.7), the
   kit (`packages/critter-kit`), the Claude Code skill (`skills/critter/`,
   with its team playbook and the agents in `.claude/agents/` and
   `.codex/agents/`) and the QA harness (`qa/`).

## The eight animals and where their source lives

| Page          | What it shows                                     | Source                                      | Vendored build                |
| ------------- | ------------------------------------------------- | ------------------------------------------- | ----------------------------- |
| `/frogs/`     | three frogs on lily pads, open water (Day only)   | here: `packages/frog-pond`, `studies/frogs` | built by `npm run build:site` |
| `/ladybug/`   | three ladybirds on garden bricks                  | `critter-studies/ladybug/`                  | 2026-11-01 (`bcd2088`)        |
| `/butterfly/` | three butterflies on knapweed in a meadow         | `critter-studies/butterfly/`                | r16, 2026-11-01 (`da91583`)   |
| `/snail/`     | three garden snails on a stepping stone           | `critter-studies/snail/`                    | r15, 2026-11-01 (`f55200d`)   |
| `/mouse/`     | three wood mice at a bramble edge                 | `critter-studies/mouse/`                    | 2026-10-31 (`ce34d20`)        |
| `/koi/`       | three koi in a stone-edged garden pond            | `critter-studies/koi/`                      | 2026-11-02                    |
| `/snake/`     | three grass snakes basking by a pond              | `critter-studies/snake/`                    | r3, 2026-11-07 (`9cde6bd`)    |
| `/cockroach/` | three woodland cockroaches at a fallen crab apple | `critter-studies/cockroach/`                | r2c, 2026-11-07 (`c5b98cf`)   |

The seven external animals each have their own project (its own copy of the
kit, footage log, visual direction board, checks and git history). Their home
is one folder, a private `critter-studies/<animal>/` checkout beside this one.
They were first built as sibling folders of this repository (`critter-test`
for the ladybug, `critter-butterfly`, `critter-snail`, `critter-mouse`,
`critter-koi`, `critter-snake`, `critter-cockroach`), and
`scripts/sync-studies.mjs` (`EXTERNAL_STUDIES`) is the one place that maps an
animal to its folder: check it points at the new home before syncing. The
commit ids above are those projects' commits at the time each build was
vendored. This repository holds only their built JavaScript
(`studies/vendor/<animal>/`), a still, a badge and a traced sketch each
(`studies/site/`).

All eight are in the owner's **grainy flat meadow** style (approved
2026-10-27; `docs/FROG_VISUAL_DIRECTION.md` for the frogs, each project's own
board for the rest): looks are stylised, motion stays measured against
footage.

`packages/cockroach-floor`, `packages/koi` and `packages/snake` are **not**
those animals. They are the first, realistic-floor Specimens, kept as the
kit's worked examples and QA fixtures (README, "The three example
packages"). Their pages and boards were removed on 2026-11-14.

## How the site is built and deployed

- `npm run build:site` → `dist/site`: the shared shell (`studies/site/`), the
  frog page bundled from source, and each vendored animal copied into its
  route. One page per animal in `studies/site/animals.mjs`; the root
  redirects to `/frogs/`.
- The picture's border comes from `social/approved-settings.json`.
- **Fonts:** General Sans is not in git. With the three `.woff2` files in
  `studies/site/fonts/` the site self-hosts them; without them the build
  warns once and uses the system sans (README, "Fonts"). Build with the
  fonts in place before deploying.
- **Deploy:** `npm run deploy` (`scripts/deploy.mjs`): builds, then uploads
  the built `dist/site` folder from this machine to Vercel. Vercel does not
  build from git; the build writes `dist/site/vercel.json`
  (`trailingSlash: true`). No GitHub Pages.
- **Embedding (2026-11-15):** `/embed.js` puts any animal on another page in
  one line (README, "Embedding"). Each animal's page shows the picture alone
  with `?embed`.
- **About and Embed (2026-11-16):** two quiet buttons on the name's row open
  a panel under the badges, one at a time (the owner: no separate pages, no
  extra copy). About's words and links are `SITE` in
  `studies/site/animals.mjs`; the footage credits are `docs/CREDITS.md`.
- **Stills:** every animal has a wide still and a phone-shaped one (0.91),
  the scene's own settled first frame, so the loading sketch hands over to
  the same picture on a phone. The seven vendored animals' narrow stills are
  WebP captures of `/<animal>/?embed&edge=none` under reduced motion at
  455 × 500, 2×.
- **Short windows:** the page narrows until the name and badges fit under
  the picture (`.page` in `site.css`).
- **Updating an animal:** change it in its own project, then
  `node scripts/sync-studies.mjs <animal>`, replace its stills (wide and
  narrow) if the first frame changed (`studies/site/stills/`, then
  `node scripts/trace-sketches.mjs`),
  `npm run build:site`, review, deploy.
- **Social clips:** `social/site-clips/render.mjs` makes the 15-second X
  clips from `dist/site`; `social/render-approved.mjs` makes square posts.
  No clip or sheet is kept in git (`social/README.md`).

## Checks

`npm run check` (typecheck, lint, format check, docs check, build, Node QA)
is what CI runs. The harness measures the frog pond and the three example
packages; the browser checks (`npm run qa:browser`) open the frog page only.
The seven vendored animals are checked in their own projects.

## What is open

1. **Orphan chunks in `studies/vendor/`.** `sync-studies.mjs` copies each
   project's whole `dist/chunks/`, including chunks from earlier builds:
   26 files (816 KB) in `cockroach`, `snake` and `mouse` that nothing
   imports, which the site then ships and lists for fetch-ahead. Fix in the
   sync script (copy only what `main.js` reaches) and re-vendor.
2. **Git history and the push.** The branch `critter-skill` is ahead of
   `origin/main` and not pushed. Its history still holds the social clips
   (about 194 MB) and the font files; they are to be taken out of history
   before the first push. Pushing needs the owner's say-so.
3. **The golden replay is stale.** `node qa/tools/golden.mjs` reports all
   four sessions differing from `qa/tools/golden.json` (recorded
   2026-10-12, before the 2026-10-28 rebuild). It is not part of
   `npm run check`. Re-record it (`--write`) once the owner confirms the
   current motion is the reference; until then compare its hashes before and
   after a change.
4. **Frog pond review artifacts.** No `docs/FROG_COMPOSITION_REVIEW.md`
   (spec section 15). Several frog timings are still unsourced.
5. **The skill and the style.** `skills/critter/SKILL.md` does not yet say
   "pick a style early and judge the look against it"; its look bar predates
   the grainy flat style.
6. **Docs written for the earlier pond.** The field manual's prose and
   figures, `docs/FROG_ART_DIRECTION.md` and `docs/FROG_STUDY_GUIDE.md` still
   show the Night/bank pond in places (each is marked). `docs/CRITTER_KIT_PLAN.md`
   still lists the scrapped turtle and an unfinished step 8.
7. **Not verified on the site:** Safari and Firefox, real touch hardware, a
   slow GPU.

## Habits that worked

- Run `npm run check` and act on its **exit code**, not on a grep of its
  output.
- Timing checks (`qa:first`, `qa:gpu`, `qa:bake`) depend on the machine:
  compare with `node qa/tools/baseline.mjs <ref>` built in the same session
  before calling a regression.
- No composition change without an approved board; say what was verified and
  what wasn't.
