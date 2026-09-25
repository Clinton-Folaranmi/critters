# Animal Farm

Interactive, top-down creature studies for the web, the method for building
them, and the harness that measures them. The first study is a frog pond,
**Night Chorus / Day Chorus**: three frogs on lily pads that breathe, blink,
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
npm run dev        # the demo with dev helpers at http://127.0.0.1:5173/frogs/ (#day for daylight)
```

Dev helpers (never shipped): `?renderer=canvas`, `?dpr=fixed`, `?frogs=1`,
and in the console `__frogWorld`, `__frogAdvance(s)`, `__frogTap(x, y)`,
`__frogCheck()`, `__frogMode()`, `__frogLoseContext()`,
`__frogResolution(step)`.

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
packages/frog-pond/   the study (world, scene, renderers, bank, theme)
studies/frogs/        the demo page (plain HTML + TypeScript), its CSS and first-frame stills
studies/index.html    the site's index
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
