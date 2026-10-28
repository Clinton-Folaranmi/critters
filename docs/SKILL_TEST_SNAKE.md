# Skill test: grass snake (_Natrix natrix_) on wooden planks

A start-to-finish run of `skills/critter/SKILL.md`, building the grass snake
Specimen (`packages/snake/`, `studies/snake/`, roster animal #5 in
`docs/CRITTER_KIT_PLAN.md` and recommended in `docs/HANDOFF.md` item 4).
Notes record what happened at each step of the skill, where the skill helped,
and where tools or instructions had gaps.

Started 2026-10-20 00:18 BST.

## Step-by-step notes

1. **Step 1 (Size it): worked cleanly.** Sized as a **Specimen** (one grass
   snake on weathered wooden planks, idle pause with tongue flicks + one
   locomotion mode: terrestrial lateral undulation / path-following slithering
   per spec `L-26`, `L-27`, one variant, ~half a day including the reference
   loop).
2. **Step 2 (Footage screening & 3D/tilt checks): caught two critical facts
   early.**
   - _Performance trap not warned in the skill:_ `footage/5-snake/20260520_180515-grass-snake.webm`
     is a 334 MB 4K (3840 × 2160) 60 fps VP9 file (136.85 s). Running
     `qa/tools/footage/sheet.mjs` across the full 4K file decodes 8,211 4K frames
     and takes minutes. Downscaling the active 0–45 s window once to a working
     960 × 540, 30 fps clip (`footage/5-snake/work/clip-45s.mp4`) made every
     subsequent contact sheet and tracker run take ~5–10 seconds. **Suggestion
     for `SKILL.md` Step 2:** advise creating a 540p/480p working proxy clip
     first whenever the source footage is 4K.
   - _Scale unit when the animal isn't fully in frame:_ the skill says "Work in
     body lengths (`BL`, snout to tail tip, or shell length) and seconds, never
     pixels." In the grass snake clip, the camera follows the anterior quarter
     to third of the snake (`8–12` body widths visible; the tail tip is never in
     frame). All direct pixel measurements therefore had to be taken in
     **anterior body widths (`BW`)** and converted to `BL` using _Natrix natrix_
     morphometrics (`1 BL = 34 BW`, Hailey & Davies 1986). **Suggestion for
     `SKILL.md` Step 3:** note that when a close-up clip shows only part of a
     long animal, track in body widths (`BW`) or head lengths (`HL`) and record
     the literature conversion ratio to `BL` in the footage log.
   - _Camera tilt and 3D motion (`P-17`):_ checking apparent body width against
     heading (`horizMedian = 36.0 px`, `vertMedian = 28.0 px`) flagged a ~20°
     camera tilt plus foreshortening when the snake lifts its head and neck off
     the planks (`0.3–0.6 BW`), casting a wider dark shadow down-left. That
     observation directly drove the `headLift` shadow shift in `snake-shape.ts`.
3. **Step 3 (Track and measure — and verify on overlays): the overlay check
   saved the tracker twice.**
   - Existing `qa/tools/footage/spine.mjs` could not track the grass snake: it
     hardcodes a pale grey closed blob (`lo >= median + 60 && spread < 70`,
     `length / chord <= 1.45`) for the white koi.
   - Wrote `qa/tools/footage/snake-spine.mjs` (segments the olive body and
     bright yellow _Natrix_ collar, thins to a 1-px skeleton, scores which end
     is the head by penalising the frame-border exit and rewarding the yellow
     collar + temporal continuity, and block-matches wood patches outside the
     snake mask to subtract handheld camera pan) and
     `qa/tools/footage/snake-measure.mjs`.
   - **Overlay verification (`snake-check-0-10s.png`, `snake-check-27-44s.png`)
     caught three real bugs:**
     1. Iteration 1 looked for the yellow collar first by colour alone and
        jumped onto a sunlit olive flank in the middle of the body (`[255, 254, 210]`).
     2. Iteration 2 segmented the full body ribbon first and scored the two
        skeleton ends, which fixed `27–44 s` completely (100% of tiles on
        `snake-check-27-44s.png`), but in frames 110–220 of `0–10 s` (when the
        lifted neck crossed the dark plank gap in shadow) the morphological
        opening pinched the shadowed neck off from the yellow collar.
     3. Bridging dark pixels (`gray < 90`) near the collar accidentally merged
        the neutral-grey plank gap into the snake mask (inflating `bodyWidthPx`
        from `36 px` to `56 px`), whereas bridging only **olive-tinted** shadowed
        neck pixels (`g - b >= 8`) near the collar raised tracking to **90.3 %**
        (`1,219 / 1,350` frames) and locked the snout on `0–10 s` as well.
4. **Step 4 & Step 5 (Motion sheet & kit vs terrestrial slithering `L-26`):**
   - _Crucial distinction between `swim.ts` and terrestrial slithering (`L-26`,
     `L-27`):_ `@critters/critter-kit` has `swim.ts` (where a travelling wave
     pushes spine points laterally off the path and `relaxSwimBody` straightens
     the spine when stopped) and `chain.ts` (`Trail`: `createTrail`,
     `recordTrail`, `sampleTrail`). On wooden planks, the tracked grass snake's
     lateral slip is **0.0004 BL/frame** (well under `L-26`'s `≤ 0.02 BL/frame`),
     and when it pauses to flick its tongue its S-loops stay frozen on the wood!
   - Using `swim.ts` would have violated `L-26` (sideways wave slip + body
     straightening on pause). Instead, `SnakeWorld` drives the neck along a
     distance-coupled sinusoidal weave (`weavePhase += ds / wavelength * 2π`),
     records every substep into `Trail`, and samples `spine[1..34]` strictly
     along the `Trail` by arc-length while allowing only `spine[0]` (the head)
     to pivot slightly (`±0.20 rad`) and flick its forked tongue during pauses.
     **Suggestion for `packages/critter-kit`:** extract a reusable
     `slither.ts` helper (distance-driven head weave + `Trail` sampling +
     stationary head probe) alongside `swim.ts` and `gait.ts`.
5. **Step 6 & Step 7 (Record, compare across rounds, and side-by-side video):
   worked exactly as designed.**
   - Wrote `qa/tools/footage/record-snake.mjs` to emit the exact same JSON
     schema (`25` points spaced by `0.5 BW` along the anterior `12 BW`) as
     `snake-spine.mjs`, so `snake-measure.mjs` measured both identically:

| Metric (`snake-measure.mjs`)              | Tracked clip (`27–44 s` active) | Tracked clip (`0–45 s` all) | Model Round 1 | Model Round 2 | Model Round 3 (final) |
| ----------------------------------------- | ------------------------------- | --------------------------- | ------------- | ------------- | --------------------- |
| `shareMoving` (`> 0.85 BW/s`)             | **0.526**                       | **0.381**                   | 0.595         | 0.557         | **0.452**             |
| `speedMovingBW` median / p90 (`BW/s`)     | **3.21 / 6.57**                 | **3.05 / 6.57**             | 3.66 / 5.12   | 3.93 / 5.61   | **3.04 / 6.12**       |
| `speedMovingBL` median / p90 (`BL/s`)     | **0.094 / 0.193**               | **0.090 / 0.193**           | 0.108 / 0.151 | 0.116 / 0.165 | **0.089 / 0.180**     |
| `speedAllBL` median / p90 (`BL/s`)        | **0.032 / 0.175**               | **0.009 / 0.124**           | 0.081 / 0.147 | 0.055 / 0.154 | **0.009 / 0.136**     |
| `bendAt4BW` median (`rad`)                | **0.281**                       | **0.158**                   | 0.391         | 0.361         | **0.186**             |
| `bendAt75BW` median (`rad`)               | **0.453**                       | **0.634**                   | 0.760         | 0.687         | **0.507**             |
| `lateralSlipMoving` (`BL/frame` @ 60 fps) | **0.0004**                      | **0.0006**                  | 0.0000        | 0.0000        | **0.0000**            |

- **What Round 1 -> Round 3 caught:**
  1.  In Round 1, `speedMovingBW` had a higher median (`3.66` vs `3.21`) but a
      lower p90 (`5.12` vs `6.57`) because each crawl bout used a flat target
      speed. Adding a peaked within-bout surge profile (`surge = 0.48 + 0.98 * sin(π * progress)^2.1`)
      matched both the median (`3.04 BW/s`) and the p90 (`6.12 BW/s`)!
  2.  In Round 1 and Round 2, `bendAt4BW` (`0.391 rad`) and `bendAt75BW`
      (`0.760 rad`) were 39% and 68% higher than the active clip (`0.281` and
      `0.453 rad`), both because `WEAVE.wavelength = 0.36 BL` was too short
      and because `pickWanderGoal()` drove the `0.70 BL` snake into tight
      U-turns against the arena wall — reproducing the exact Koi arena-size
      finding described in `SKILL.md` Step 6! Lengthening `WEAVE.wavelength`
      to `0.54 BL`, lowering `WEAVE.amplitude` to `0.24 rad`, and steering
      wander goals toward the open half of the deck brought `bendAt4BW` median
      to `0.186 rad` and `bendAt75BW` median to `0.507 rad`.

6. **Step 8 (Look — shared atlas and non-linear UV resolution for slender
   animals):**
   - For a slender animal (`1 BL = 34 BW`), the head is only `3.8 %` of total
     body length (`39 px` in a linear 1024-px atlas), which made the eyes and
     yellow-black collar blurry in Round 1 (`build-1/0020.png`).
   - Mapping the head and collar (`u <= 0.08`) to the first `28 %` (`286 px`) of
     the 1024-px skin strip via `uToSkinS(u)` / `skinSToU(s)` (and disabling
     isotropic mipmapping on the non-linear atlas in `webgl.ts`) gave **7.3×
     higher texel resolution** on the head shields, golden-ringed eyes, and
     yellow-black _Natrix_ collar (`build-2/0020.png`) while keeping a single
     1024 × 1024 atlas shared by WebGL2 and Canvas 2D (`spec A-7`).
