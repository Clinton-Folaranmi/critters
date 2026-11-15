# @critters/frog-pond

An interactive, top-down frog pond (Day Chorus): three frogs on lily pads on
open water, with midges, drifting leaf shade and soft caustics, in a grainy
flat style. Day only, water only. WebGL2 with a Canvas 2D fallback, no
framework, no runtime dependencies beyond `@critters/critter-kit`. The worked
example of `docs/CREATURE_STUDY_SPEC.md`; its approved board is
`docs/FROG_VISUAL_DIRECTION.md`.

```ts
import { mountFrogScene } from '@critters/frog-pond';

const scene = mountFrogScene(document.getElementById('pond')!, {
  reducedMotion: matchMedia('(prefers-reduced-motion: reduce)').matches,
  describedBy: 'instructions', // id of the element that explains the controls
  // ownEdge: false,            // the page draws the picture's border itself (the site does)
});
// later
scene.dispose();
```

The container is masked to the picture's edge, the whole canvas with softly
rounded corners, and should have an aspect ratio (1.48 wide, 0.91 on a
phone). Its parent gets `--pond-ring` and `--pond-ring-halo`, mask images for
a focus ring that follows the edge (see `studies/frogs/page.css`). With
`ownEdge: false` neither is set. The canvas is hidden until its first frame;
show a still underneath until then (`studies/frogs/stills`).

| Entry                       | What                                                                                                   |
| --------------------------- | ------------------------------------------------------------------------------------------------------ |
| `@critters/frog-pond`       | `mountFrogScene()`, `FROG_COPY`, `FROG_INSTRUCTIONS`, `FROG_PALETTE`, `FROG_LOOKS`, types              |
| `@critters/frog-pond/theme` | the palette, looks and copy alone (small; for a page's caption before the scene loads)                 |
| `@critters/frog-pond/world` | `FrogWorld`, the simulation (no DOM; runs in Node)                                                     |
| `@critters/frog-pond/bank`  | the picture's maths: `openDistance`, `pictureDistance`, `pictureEdge`, `WATER_CX`, `WATER_CY` (no DOM) |

(The `bank` entry and `frog-bank.ts` keep their names from when the pond had a
bank; they now hold where the open water is and the picture's edge.)

The built package (`npm run build:package` at the repo root → `dist/`) is ESM
with split chunks; the Canvas 2D renderer is a chunk fetched only when WebGL
can't be used. Everything is painted on the page, in slices: there is no
worker. Bundling from source uses the `source` export condition, as the site
does: see `scripts/build.mjs`.

Private for now; not published to npm.
