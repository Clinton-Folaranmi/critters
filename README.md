# Critters

Interactive, top-down creature studies for the web, the method for building
them, and the harness that measures them. This repository is two things:

- **The site:** eight animals, one page each: frogs, ladybug, butterfly,
  snail, mouse, koi, snake and cockroach. Each is a small living scene you can
  tap.
- **The method:** a spec, a kit of building blocks, a Claude Code skill and
  QA checks, with the frog pond as the worked example.

Three ways to use it:

| You want                                      | Use                                                                            |
| --------------------------------------------- | ------------------------------------------------------------------------------ |
| One of these animals on your own page         | The Embed button on any animal's page: one line of HTML, no code ("Embedding") |
| To build your own animal with this method     | The Claude Code skill, [`skills/critter/SKILL.md`](skills/critter/SKILL.md)    |
| Just the motion maths inside your own project | `npm install critter-kit` ([`packages/critter-kit`](packages/critter-kit))     |

The first study is the frog pond, **Frogs** (Day Chorus): three frogs on lily
pads that breathe, blink, croak, catch midges, hop, swim and climb out, on
open water in a grainy flat style. Tap a frog, a pad or the water; Enter or
Space drops a pebble.

- **The method:** [`docs/CREATURE_STUDY_SPEC.md`](docs/CREATURE_STUDY_SPEC.md)
  is the single source of truth (numbered MUST/SHOULD rules, interfaces, file
  layout, build procedure, locomotion catalogue, environment design,
  performance, and a QA table where every check names its script).
  [`docs/CREATURE_STUDY_FIELD_MANUAL.html`](docs/CREATURE_STUDY_FIELD_MANUAL.html)
  is its illustrated edition. [`llms.txt`](llms.txt) is the map for language
  models. [`skills/critter/SKILL.md`](skills/critter/SKILL.md) is the skill
  that builds a new animal from one line.
- **The study:** [`packages/frog-pond`](packages/frog-pond/README.md), framework-free
  (WebGL2 with a Canvas 2D fallback), no runtime dependencies.
- **The checks:** [`qa/`](qa/README.md), `npm run qa:*`, with thresholds and
  exit codes.
- **Where the work stands:** [`docs/HANDOFF.md`](docs/HANDOFF.md).

## Setup

Node 22.18 or later.

```bash
npm install
npm run dev        # the site with dev helpers at http://127.0.0.1:5173/frogs/
```

## The site

`dist/site/` has one page per animal, in badge order: `/frogs/`, `/ladybug/`,
`/butterfly/`, `/snail/`, `/mouse/`, `/koi/`, `/snake/`, `/cockroach/`. The
root redirects to `/frogs/`. Every page is the same shell (`studies/site/`:
`page.html`, `site.css`, `shell.ts`, the list in `animals.mjs`): the picture
with the owner's approved border (`social/approved-settings.json`, drawn at
build time into a mask image for each picture shape, `border.ts`), the
animal's name, and a row of round badges to the other animals. While a scene
loads, a worker draws it in pencil and washes the colour in
(`studies/site/sketch/`), then the scene's own first frame takes over; the
strokes are traced from the stills by `node scripts/trace-sketches.mjs` into
`studies/site/sketches/` (rerun it when a still changes). The shell fetches
the next animal ahead on badge hover, focus or touch, and when idle;
supporting browsers grow the clicked badge into the next page's frame (a
cross-page view transition).

### Where each animal's source lives

The frog pond is built here, from `packages/frog-pond` and
`packages/critter-kit`. The other seven are built in their own projects, one
folder each in `../critter-studies/<animal>/` (ladybug, butterfly, snail,
mouse, koi, snake, cockroach), each with its own copy of the kit. Their built
JavaScript is vendored into `studies/vendor/<animal>/` and committed, so the
site builds without them. After one of those studies changes, bring it in
again with

```bash
node scripts/sync-studies.mjs            # all seven (runs each project's npm run build)
node scripts/sync-studies.mjs mouse      # or just one
```

(`EXTERNAL_STUDIES` in that script maps each animal to its project folder.)

### Fonts

The site's type is General Sans (Indian Type Foundry, from
[Fontshare](https://www.fontshare.com/fonts/general-sans)), self-hosted so the
pages work offline. Its licence (`studies/site/fonts/LICENSE-FFL.txt`, the ITF
Free Font License; not covered by this repository's MIT licence) allows
self-hosting on your own site but not redistribution, so **the font files are
not in git**. Download General Sans from Fontshare and put these three files
in `studies/site/fonts/` (they are git-ignored):

```
GeneralSans-Regular.woff2   GeneralSans-Medium.woff2   GeneralSans-Semibold.woff2
```

Without them the build prints one warning and makes the site with the system
sans instead (no `@font-face` rules, no font preload), so a fresh clone and CI
still build.

### Embedding

One line puts an animal on any page:

```html
<script async src="https://critters-iota.vercel.app/embed.js" data-animal="frogs"></script>
```

Each animal's page has an Embed button beside its name that opens this line
for that animal, with a choice of edge (`shell.ts`, `startEmbedLine`). The script (`studies/site/embed.ts`, built to `dist/site/embed.js`)
puts a frame where the tag is, as wide as its parent, showing the animal's
page with `?embed`: the picture alone on a clear page (`page.html` sets
`data-embed`, `site.css` does the rest), so the border fades into the host
page. Options: `data-edge="none"` for no border (the scene fills the frame, for
a hero or a background), with `data-ratio="16/9"` for its shape (kept within
9:16 and 2.2:1, the shapes the scenes are painted for); `data-credit="off"`
hides the small "Critters" link in the corner. A plain
`<iframe src="…/frogs/?embed&edge=none">` works too. The scenes pause off
screen and in a hidden tab, and the frame loads lazily. Embeds on other
people's pages point at the site's address, so settle the address
(`SITE_URL`) before sharing the line widely.

### Deploying

The site is on Vercel: <https://critters-iota.vercel.app>. It is deployed by
building on this machine (`npm run build:site`, with the fonts in place) and
uploading the built `dist/site` folder; Vercel does not build from git. The
build writes `dist/site/vercel.json` (`trailingSlash: true`, because the pages
link to their neighbours with `../`). There is no GitHub Pages site.

Dev helpers (never shipped): `?renderer=canvas`, `?dpr=fixed`, `?frogs=1`,
and in the console `__critterWorld`, `__critterAdvance(s)`, `__critterTap(x, y)`,
`__critterCheck()`, `__critterMode()`, `__critterLoseContext()`,
`__critterResolution(step)`. They exist on the frog page only; the vendored
animals are production builds.

## Scripts

| Script               | Does                                                                                                                    |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `npm run build`      | the package (`packages/frog-pond/dist`), the demo site (`dist/site`) and the single file (`dist/standalone/frogs.html`) |
| `npm run build:site` | the site only (`dist/site`)                                                                                             |
| `npm run preview`    | serves `dist/site` at http://127.0.0.1:4173/                                                                            |
| `npm run check`      | typecheck, oxlint, oxfmt `--check`, docs check, build and the Node QA checks (what CI runs)                             |
| `npm run format`     | oxfmt                                                                                                                   |
| `npm run docs:write` | regenerates the field manual's generated regions from the spec                                                          |
| `npm run qa:node`    | soak, swims, motion, alloc, gait, swim, size (soak and motion also run for the cockroach example)                       |
| `npm run qa:browser` | the browser checks (Playwright's headless shell: `npx playwright install chromium-headless-shell` once)                 |
| `npm run qa:<check>` | one check; see `qa/README.md`                                                                                           |

## Layout

```
packages/critter-kit/     the kit every study is built from (maths and seeded randomness, easing, limb chains (rig), foot pins and steps (contact), containment, hit distances, the gait clock, the spine swimmer, WebGL helpers and the scene controller)
packages/frog-pond/       the frog pond study (world, scene, renderers, picture edge, theme)
packages/cockroach-floor/ kit example and QA fixture: a cockroach walking a measured tripod gait (see below)
packages/koi/             kit example and QA fixture: a koi on the spine swimmer (see below)
packages/snake/           kit example and QA fixture: a grass snake in lateral undulation (see below)
studies/site/             the site shell every animal page shares (template, CSS, border, loading sketch, font licence, badges, stills) and the one-line embed
studies/frogs/            the frog page's script and first-frame stills (its index.html and page.css are the single file's page)
studies/vendor/           the seven external studies' built scripts (scripts/sync-studies.mjs)
studies/index.html        the site's root (redirects to /frogs/)
standalone/frogs/         the single-file build's entry (the page is studies/frogs with its CSS inlined)
scripts/                  builds (esbuild only), GLSL minifier, static server, dev server, docs check, sync-studies, trace-sketches
qa/                       the checks, thresholds, CDP driver, footage tools; qa/scratch holds a few old frame scripts
skills/critter/           the Claude Code skill and its team playbook
social/                   the social-clip renderers and the approved border settings (no media in git)
docs/                     the spec, the field manual, the frog's board and guides, footage logs, plans, the handoff
```

### The three example packages

`packages/cockroach-floor`, `packages/koi` and `packages/snake` are the first
Specimens built from the kit (October 2026). They are **not site pages**: the
cockroach, koi and snake on the site are later rebuilds in the grainy flat
style, vendored from their own projects. These three stay as the kit's worked
examples and test fixtures: `npm run qa:node` builds all three worlds, soaks
and measures the cockroach, and soaks the koi (`qa:swim`); the snake's footage
tools record its world; and the skill points to the cockroach and the koi as
examples to copy from. Their look is superseded; their motion code and
measurements are the point.

## The single file

`dist/standalone/frogs.html` is the frog pond as one self-contained page
(Day Chorus, with its caption) that works offline from disk and inside a
sandboxed frame. Everything is painted on the page, in slices; it starts no
worker and makes no requests. `qa:standalone` checks it.

## Licence

Code: MIT ([`LICENSE`](LICENSE)). Docs (`docs/`, `llms.txt`): CC BY 4.0
([`docs/LICENSE`](docs/LICENSE)). General Sans: ITF Free Font License
(`studies/site/fonts/LICENSE-FFL.txt`), not redistributed here.
