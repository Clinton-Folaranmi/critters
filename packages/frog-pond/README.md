# @animal-farm/frog-pond

An interactive, top-down frog pond: three frogs on lily pads, fireflies by
night and midges by day, reeds, a bank and water you can see into. WebGL2
with a Canvas 2D fallback, no framework, no runtime dependencies. The worked
example of `docs/CREATURE_STUDY_SPEC.md`.

```ts
import { mountFrogScene } from '@animal-farm/frog-pond';

const scene = mountFrogScene(document.getElementById('pond')!, {
  reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
  theme: 'night', // or 'day'
  describedBy: 'instructions', // id of the element that explains the controls
});
// later
scene.dispose();
```

The container is masked to the picture's ragged edge and should have an
aspect ratio (1.48 wide, 0.91 on a phone). Its parent gets `--pond-ring` and
`--pond-ring-halo`, mask images for a focus ring that follows the edge (see
`studies/frogs/page.css`). The canvas is hidden until its first frame; show a
still underneath until then (`studies/frogs/stills`).

| Entry                          | What                                                                                                      |
| ------------------------------ | --------------------------------------------------------------------------------------------------------- |
| `@animal-farm/frog-pond`       | `mountFrogScene()`, `FROG_COPY`, `FROG_INSTRUCTIONS`, `FROG_PALETTES`, `FROG_LOOKS`, `FROG_THEMES`, types |
| `@animal-farm/frog-pond/theme` | the palettes, looks and copy alone (small; for a page's caption before the scene loads)                   |
| `@animal-farm/frog-pond/world` | `FrogWorld`, the simulation (no DOM; runs in Node)                                                        |
| `@animal-farm/frog-pond/bank`  | the shore maths: `shoreDistance`, `pictureEdge`, `reedAt`, … (no DOM)                                     |
| `@animal-farm/frog-pond/paint` | `serveBankRequests()`, for a build that starts its own script as the bank worker                          |

The built package (`npm run build:package` at the repo root →
`dist/`) is ESM with split chunks; the bank painter's worker is
`frog-bank-worker.js`, next to the chunk that starts it, and must be served
with the rest. Bundling from source (the `source` export condition, as the
demo does) needs the same arrangement: see `scripts/build.mjs`.

Private for now; not published to npm.
