# QA harness

Measures the frog pond against the numbers in `docs/CREATURE_STUDY_SPEC.md`
(section 10, QA). Every check prints a table of PASS / FAIL / info rows and
exits non-zero if anything fails. The limits live in `qa/thresholds.mjs`,
each with where it comes from; `npm run docs:check` fails if the spec's QA
table and that file disagree.

These scripts began as the 2026-09-25 audit harness (`tools/frog-qa` in the
portfolio; the audit itself is `docs/audit-report.html`).

## What you need

- Node 22.18 or later (built-in `fetch`, `WebSocket` and TypeScript type
  stripping). No other dependencies beyond the repo's own `esbuild`.
- For the browser checks, Playwright's **headless shell** (the browser only,
  not Playwright): `npx playwright install chromium-headless-shell` once per
  machine. It's found in `~/Library/Caches/ms-playwright` (macOS) or
  `~/.cache/ms-playwright` (Linux); set `QA_CHROME` to use another Chrome
  binary. On macOS it runs with `--use-angle=metal`, so WebGL uses the real
  GPU.

Rows read PASS, FAIL, info (a number with no limit) or KNOWN: a design
target the study doesn't meet yet and that is recorded as a known issue
(`known` in `thresholds.mjs`). KNOWN rows don't fail the run, so CI stays
useful, but they're printed with the target and the note.

Everything the checks build or write goes to `qa/.out/` (git-ignored) and
`dist/`.

## Running

```bash
npm run qa:node        # soak, swims, motion, alloc, size: Node only, a few minutes (CI runs this)
npm run qa:browser     # every pass/fail browser check (a few minutes)
npm run qa             # both
npm run qa:luma        # any one check
```

`node qa/run.mjs browser --skip=first,gpu,bake` leaves out the timing checks,
which depend on the machine (see below). `QA_CONSOLE=1` prints the page's
console after a browser check.

## Node checks (frame-stepped world, seeded, exact repeats)

| Script      | Measures                                                                                                                                                                                                                                            | Fails when                                                                                                                 |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `qa:soak`   | 10 min untouched, 5 min tapped and 10 min resizing, at aspect 1.48 and 0.91: `check()` issues, non-finite poses, pads under the bank, a swimmer's body or limbs over the bank, a toe on the grass from a frog on a pad, the longest temporary state | any issue, NaN, pad under the bank, swimmer over the bank; toe > 0.02; a state lasting > 40 s                              |
| `qa:swims`  | swim lengths and hop rate over 2 h untouched, both aspects                                                                                                                                                                                          | median outside 3–8 s, p90 > 12 s, longest > 30 s, pad jumps outside 2–3.5 per frog per minute, water share outside 20–36 % |
| `qa:motion` | planted feet (slide per stretch, distance from the pin), settling after a turn, turning while still in water, mirrored straight strokes, curvature, one-frame pose jumps and angular acceleration by state                                          | over the limits in `thresholds.mjs`; the planted-foot target (0.06 body lengths) is a KNOWN issue: reported, not failing   |
| `qa:alloc`  | bytes allocated per `world.step()` and per `reedBlades()`                                                                                                                                                                                           | > 1024 B per frame, > 256 B per call                                                                                       |
| `qa:size`   | standalone script, the demo split by when it loads, the worker, the stills                                                                                                                                                                          | over the budgets in `thresholds.mjs`                                                                                       |

Options: `npm run qa:soak -- --aspect=0.91 --mode=tap --minutes=30 --seed=3`,
`npm run qa:swims -- --hours=6`.

## Browser checks (headless shell over the DevTools protocol)

They build and serve the demo twice, with the dev helpers (`dist/site-dev`,
which has `?renderer=canvas`, `?dpr=fixed` and the `__frog*` hooks) and as
shipped (`dist/site`), and build the standalone page with and without the
helpers into `qa/.out/pages`.

| Script          | Measures                                                                                                                                 |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `qa:smoke`      | both lights × both renderers load, get ready, are labelled from `FROG_COPY`, log nothing; the shipped build has no hooks                 |
| `qa:parity`     | JS vs GLSL `shoreDistance` / `openDistance` (float target), bed depth vs `shelfDepth()`                                                  |
| `qa:luma`       | mean luma inside the visible picture per light × renderer, and the renderer gap                                                          |
| `qa:hit`        | the picture's mask vs the tap rule, grass over water counted as bank, real clicks (corners, bank, reed), cooldown, keyboard              |
| `qa:tol`        | a finger gets a bigger target than the mouse                                                                                             |
| `qa:a11y`       | tab order, `aria-pressed`, text and outline contrast, 375 px layout, both lights                                                         |
| `qa:rm`         | reduced motion: a described still, no loop, no instructions                                                                              |
| `qa:midge`      | midge shadows fall down-left in both renderers, at the same place                                                                        |
| `qa:standalone` | the shipped single file from `file://`: page head, no hooks, no requests, worker, Night \| Day by click / key / `#day`, sandboxed iframe |
| `qa:lifecycle`  | 80 Night \| Day switches, then taking the pond off the page: canvases, loop, observers, listeners, workers, heap                         |
| `qa:offscreen`  | the loop runs in view and stops scrolled away                                                                                            |
| `qa:loss`       | WebGL context loss → Canvas at once, WebGL retried twice, then Canvas stays; focus kept                                                  |
| `qa:reshuffle`  | how much the bank changes after a 1 px and a 10 px resize                                                                                |
| `qa:bake`       | bank paint time; a drag-resize's bake requests and long tasks                                                                            |
| `qa:first`      | long tasks from navigation to 4 s, shipped demo and standalone, 2×                                                                       |
| `qa:gpu`        | GPU ms per frame (timer queries) and CPU + GPU synced ms at 1520 × 1027, both lights                                                     |

Not pass/fail (tools that write files):

| Script                                        | Does                                                                                                                                   |
| --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `qa:stills`                                   | regenerates `studies/frogs/stills/*.webp` (the first frame each light, wide and narrow); run after any visual change                   |
| `qa:shots`                                    | enlarged crops for review by eye (focus ring, reeds, motes, midge, caustics), both lights × renderers, with `qa/.out/shots/sheet.html` |
| `node qa/browser.mjs replay`                  | draws a world saved by `node qa/tools/dump.mjs <aspect> <seed> <frame>`                                                                |
| `node qa/tools/swimtrace.mjs <aspect>`        | the longest swim in 2 h, second by second                                                                                              |
| `node qa/tools/baseline.mjs <git-ref> [name]` | builds the standalone page from another commit for side-by-side timing                                                                 |

## Timing checks and a busy machine

`qa:first`, `qa:gpu` and `qa:bake` measure time, so they depend on the GPU,
the power source and what else is running. A slow run proves little on its
own: compare with a baseline built from another commit in the same session,

```bash
node qa/tools/baseline.mjs main base-frogs
npm run qa:gpu -- --pages=dev-frogs,base-frogs
npm run qa:first -- --compare=base-frogs-prod
```

and report the load average (`qa:gpu` prints it). Close other WebGL pages
(including an in-app browser pane showing the pond) before measuring.
