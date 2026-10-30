# Critters

Interactive, top-down creature studies for the web, the method for building
them, and the harness that measures them. The first study is a frog pond,
**Frogs**: three frogs on lily pads that breathe, blink,
croak, catch fireflies, hop, swim and climb out, in a pond with a bank,
reeds and water you can see into. Tap a frog, a pad, the water or the grass;
Enter or Space drops a pebble.

- **The method:** [`docs/CREATURE_STUDY_SPEC.md`](docs/CREATURE_STUDY_SPEC.md)
  is the single source of truth (numbered MUST/SHOULD rules, interfaces, file
  layout, build procedure, locomotion catalogue, environment design,
  performance, and a QA table where every check names its script).
  [`docs/CREATURE_STUDY_FIELD_MANUAL.html`](docs/CREATURE_STUDY_FIELD_MANUAL.html)
  is its illustrated edition. [`llms.txt`](llms.txt) is the map for language
  models.
- **The study:** [`packages/frog-pond`](packages/frog-pond/README.md), framework-free
  (WebGL2 with a Canvas 2D fallback), no runtime dependencies.
- **The checks:** [`qa/`](qa/README.md), `npm run qa:*`, with thresholds and
  exit codes.

## Setup

Node 22.18 or later.

```bash
npm install
npm run dev        # the site with dev helpers at http://127.0.0.1:5173/frogs/
```

## The site

`dist/site/` has one page per animal, in badge order: `/frogs/`, `/ladybug/`,
`/butterfly/`, `/snail/`, `/mouse/`. The root redirects to `/frogs/`. Every
page is the same shell (`studies/site/`: `page.html`, `site.css`, `shell.ts`,
the list in `animals.mjs`): the picture with the owner's approved border
(`social/approved-settings.json`, drawn at build time into a mask image for
each picture shape, `border.ts`), the animal's name, and a row of round badges
to the other animals. While a scene loads, a worker draws it in pencil and
washes the colour in (`studies/site/sketch/`), then the scene's own first frame
takes over; the strokes are traced from the stills by
`node scripts/trace-sketches.mjs` into `studies/site/sketches/` (rerun it when a
still changes). The shell fetches the next animal ahead on badge hover, focus
or touch, and when idle; supporting browsers grow the clicked badge into the
next page's frame (a cross-page view transition).
General Sans is self-hosted in `studies/site/fonts/` (ITF Free Font License,
`LICENSE-FFL.txt`; not covered by the MIT licence), so the pages work offline.
The older Specimens (`/cockroach/`, `/koi/`, `/snake/`) still build but
aren't linked.

The ladybug, butterfly, snail and mouse are built in their own projects next
to this repository (`../critter-test`, `../critter-butterfly`,
`../critter-snail`, `../critter-mouse`). Their built JavaScript is vendored
into `studies/vendor/<animal>/` and committed, so the site builds without
them. After one of those studies changes, bring it in again with

```bash
node scripts/sync-studies.mjs            # all four (runs each project's npm run build)
node scripts/sync-studies.mjs mouse      # or just one
```

Dev helpers (never shipped): `?renderer=canvas`, `?dpr=fixed`, `?frogs=1`,
and in the console `__critterWorld`, `__critterAdvance(s)`, `__critterTap(x, y)`,
`__critterCheck()`, `__critterMode()`, `__critterLoseContext()`,
`__critterResolution(step)`.

## Scripts

| Script               | Does                                                                                                                    |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `npm run build`      | the package (`packages/frog-pond/dist`), the demo site (`dist/site`) and the single file (`dist/standalone/frogs.html`) |
| `npm run preview`    | serves `dist/site` at http://127.0.0.1:4173/                                                                            |
| `npm run check`      | typecheck, oxlint, oxfmt `--check`, docs check, build and the Node QA checks (what CI runs)                             |
| `npm run format`     | oxfmt                                                                                                                   |
| `npm run docs:write` | regenerates the field manual's generated regions from the spec                                                          |
| `npm run qa:node`    | soak, swims, motion, alloc, size                                                                                        |
| `npm run qa:browser` | the browser checks (Playwright's headless shell: `npx playwright install chromium-headless-shell` once)                 |
| `npm run qa:<check>` | one check; see `qa/README.md`                                                                                           |

## Layout

```
packages/critter-kit/ the kit every study is built from (maths and seeded randomness, easing, limb chains (rig), foot pins and steps (contact), containment, hit distances, the gait clock, WebGL helpers and the scene controller)
packages/frog-pond/   the study (world, scene, renderers, bank, theme)
packages/cockroach-floor/ the cockroach Specimen, built only from the kit (in progress: docs/HANDOFF.md)
packages/koi/             the koi Specimen, built only from the kit (in review: docs/KOI_VISUAL_DIRECTION.md)
studies/site/         the site shell every animal page shares (template, CSS, border, loading sketch, font, badges, stills)
studies/frogs/        the frog page's script and first-frame stills (its index.html and page.css are the single file's page)
studies/vendor/       the four external studies' built scripts (scripts/sync-studies.mjs)
studies/index.html    the site's root (redirects to /frogs/)
standalone/frogs/     the single-file build's entry (the page is studies/frogs with its CSS inlined)
scripts/              builds (esbuild only), GLSL minifier, static server, dev server, docs check
qa/                   the checks, thresholds, CDP driver, tools
docs/                 the spec, the field manual, the frog's art direction and guide, the audit
```

## The single file

`dist/standalone/frogs.html` works offline from disk, with a Night | Day
switch (`frogs.html#day` opens in daylight). Its script also runs as the
bank painter's worker, so it needs nothing beside it. `qa:standalone` checks
it, including inside a sandboxed iframe.

## Licence

Code: MIT ([`LICENSE`](LICENSE)). Docs (`docs/`, `llms.txt`): CC BY 4.0
([`docs/LICENSE`](docs/LICENSE)).
