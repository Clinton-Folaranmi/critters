# Grass snake — footage log

Evidence for the grass snake Specimen (`packages/snake`), under spec P-11 and
P-17. Observations state only what is visible in the footage; inferences and
literature values are labelled separately. Every constant in the motion sheet
(`packages/snake/src/snake-motion.ts`) cites these entries or marks a value as
a guess.

## Grass snake (_Natrix natrix_) on wooden planks

Source: Forza1000, `20260520_180515-grass-snake.webm`, filmed 20 May 2020.
[Wikimedia Commons](https://commons.wikimedia.org/wiki/File:20260520_180515-grass-snake.webm).

- **Licence:** CC BY-SA 4.0 (Forza1000). Reference footage is used only for
  local measurement and side-by-side verification (`footage/5-snake/`,
  git-ignored); no video frames or derivatives are shipped in the repository
  or built site (`LICENSE`, `docs/LICENSE`). The file has no audio track (and
  no sound is used anywhere in Critters).
- **Clip:** 3840 × 2160, 60 fps, 136.85 s, real time, handheld from above
  looking down at a grass snake moving across weathered wooden jetty/bridge
  planks.
- **Screened (2026-10-20):**
  - Full-clip overview contact sheet (`footage/5-snake/work/screen-full.png`,
    36 frames across 0–136 s) and 45 s working clip at 960 × 540, 30 fps
    (`footage/5-snake/work/clip-45s.mp4`, contact sheet `sheet-45s.png`).
  - Dense 30-tile contact sheets of the two cleanest slithering windows:
    `0.0–9.7 s` (`footage/5-snake/work/sheet-0-10s.png`, frames 0–290) and
    `27.0–43.8 s` (`footage/5-snake/work/sheet-27-44s.png`, frames 810–1314).
    Between `10 s` and `24 s` the snake rests with its head tucked into a gap
    between planks; after `45 s` it nose-dives into a deep gap between beams.

### Observation, body, markings and tongue (all frames)

- **Scale unit (`BW`):** the camera follows the anterior quarter to third of
  the snake (`8–12` body widths visible in frame; the rear trunk and tail tip
  lie outside the frame edge). All direct pixel measurements are therefore in
  **anterior body widths (`BW`)**, converted to **body lengths (`BL`)** using
  standard _Natrix natrix_ slenderness of **1 BL = 34 BW** (mid-anterior width
  `= 0.0294 BL`; Hailey & Davies 1986).
- **Head and collar:** the head is oval-triangular with a rounded snout,
  slightly wider than the neck constriction (`head length ≈ 1.42 BW = 0.042 BL`,
  `head width ≈ 1.12 BW = 0.033 BL`, `neck width ≈ 0.86 BW = 0.025 BL`).
  Immediately behind the head (`u ≈ 0.038–0.052 BL`) sit two bright pale-yellow
  crescent patches (`rgb ≈ [235, 225, 115]`) separated at the dorsal midline,
  followed immediately (`u ≈ 0.052–0.068 BL`) by two jet-black triangular
  collar bars (`rgb ≈ [18, 20, 16]`).
- **Dorsal skin and scales:** olive-green to bronze-olive dorsum
  (`rgb ≈ [78..112, 96..132, 48..68]`) with keeled overlapping scales, two
  alternating rows of short dark-charcoal lateral bars along the flanks, and a
  narrow pale greenish-cream ventral edge visible where the body curves.
- **Eyes:** large dark circular eyes set forward on the sides of the head
  (`u ≈ 0.016 BL`) with a thin warm-gold iris ring and a crisp upper-right
  sunlight glint.
- **Forked tongue flicks:** visible in `sheet-0-10s.png` (tiles 17, 28) and
  `sheet-27-44s.png` (tiles 10, 12, 17, 22). During pauses and slow probing
  the black forked tongue extends `0.9–1.1 BW` (`~0.030 BL`, ~70% of head
  length) ahead of the snout, with the two tines diverging at `~35°` over the
  outer third of the tongue. Each flick burst lasts `0.25–0.45 s`.

### Observation, habitat and 3D lighting (`P-17`)

- **Substrate:** weathered warm-grey wooden planks running horizontally across
  the frame (`rgb ≈ [148..178, 142..168, 134..158]`), separated by dark
  recessed gaps (`~0.35 BW` wide, `rgb ≈ [22..38, 22..36, 20..34]`) with fine
  longitudinal wood grain and knots.
- **3D motion (`P-17`):** the snake is not glued flat to the planks. When
  pausing, scenting or crossing a plank gap (e.g. `0.8–1.8 s`, `27.5–31.0 s`),
  it raises its head and anterior neck `~0.3–0.6 BW` off the wood. Direct
  sunlight from the upper-right casts a crisp dark shadow down-left under the
  lifted head and neck, while the planted trunk casts a much tighter contact
  shadow along its lower-left rim.

## Tracked spine and kinematics (2026-10-20)

`qa/tools/footage/snake-spine.mjs` segments the olive body and yellow collar,
bridges the shadowed neck behind the collar, thins the ribbon to a 1-px
skeleton, orientates the head end by the yellow collar and frame-exit penalty,
and tracks background wood patches outside the snake mask to subtract handheld
camera motion (`camX`, `camY`). Verified on overlay contact sheets
`footage/5-snake/work/snake-check-0-10s.png` and
`footage/5-snake/work/snake-check-27-44s.png` (spec Step 3).

`qa/tools/footage/snake-measure.mjs` measures the tracked spine and the
simulation's recorded spine identically (`stepBW = 0.5` along the anterior
`12 BW`).

- **Evidence grade:** **Grade B** (single handheld camera with pan/tilt and
  head-lift foreshortening).
- **Camera tilt check (`P-17`):** in `27–44 s` (frames 850–1330), apparent
  median body width is `36.0 px` when the snake heads horizontally (`|cos θ| > 0.7`)
  and `28.0 px` when heading vertically (`|cos θ| < 0.7`), indicating a camera
  tilt of `~18–25°` off vertical combined with foreshortening when the neck
  lifts toward the lens.
- **Measured kinematics (active exploration window `27.0–44.3 s`, 396 measured frames with ≥16 spine points, and full `0–45 s` clip, 1,219 tracked frames / 1,063 with ≥16 spine points):**

| Quantity                                               | Active window (`27–44 s`)               | Full clip (`0–45 s`, incl. gap rest)    | Notes                                                          |
| ------------------------------------------------------ | --------------------------------------- | --------------------------------------- | -------------------------------------------------------------- |
| Tracked frames                                         | 435 / 481 (90.4 %, 396 ≥8 BW)           | 1,219 / 1,350 (90.3 %, 1,063 ≥8 BW)     | Verified on `snake-check-0-10s.png` & `snake-check-27-44s.png` |
| Body width `BW` (at 480×270)                           | 38.0 px median                          | 34.6 px median                          | `horizMedian = 36.0 px`, `vertMedian = 28.0 px`                |
| Share of time advancing (`> 0.85 BW/s`)                | **52.6 %** (`0.526`)                    | **38.1 %** (`0.381`)                    | Alternating 1.8–4.5 s crawls and 0.8–3.0 s pauses              |
| Forward speed while advancing (`BW/s`)                 | **3.21** median, **6.57** p90           | **3.05** median, **6.57** p90           | Slow exploratory slither on planks                             |
| Forward speed while advancing (`BL/s`, `1 BL = 34 BW`) | **0.094** median, **0.193** p90         | **0.090** median, **0.193** p90         | Burst up to ~0.35 BL/s when crossing a plank                   |
| Overall speed including pauses (`BL/s`)                | **0.032** median, **0.175** p90         | **0.009** median, **0.124** p90         | Reflects frequent tongue-flick pauses                          |
| Anterior bend at `4 BW` (`0.12 BL`) behind snout       | **0.281 rad** median, **1.401 rad** p90 | **0.158 rad** median, **0.709 rad** p90 | Head/neck weave + sharp plank-edge turns                       |
| Anterior bend at `7.5 BW` (`0.22 BL`) behind snout     | **0.453 rad** median, **1.284 rad** p90 | **0.634 rad** median, **1.099 rad** p90 | S-curve loop along the anterior trunk                          |
| Head turn rate while advancing (`rad/s`)               | **0.687** median, **3.453** p90         | **0.553** median, **3.426** p90         | Combines head weave and course turns                           |
| Lateral slip while advancing (`BL/frame` at 60 fps)    | **0.0004** (`1.02 BW/s`)                | **0.0006** (`1.54 BW/s`)                | Well below spec `L-26` threshold (`≤ 0.02 BL/frame`)           |

- **Key biomechanical finding (`L-26`, `L-27`):** unlike an aquatic swimmer
  whose lateral wave slips backward faster than the body advances (`swim.ts`),
  the grass snake on wooden planks exhibits **near-zero lateral slip
  (`0.0004 BL/frame`)**: the trunk follows the exact S-curve traced by the head
  like a train on a track, and when the head pauses to flick its tongue, the
  S-loops remain frozen on the planks rather than straightening out.

## Literature (where the clip is silent)

- **Total body proportions and tail taper:** Hailey & Davies (1986),
  _Lifestyle, latitude and activity metabolism of natricine snakes_, and
  standard European _Natrix natrix_ morphometrics give a total-length to
  midbody-width ratio of `32–36` (`1 BL = 34 BW` used here) and a tail occupying
  the posterior `20–22 %` of total length (`u = 0.78..1.00`), tapering smoothly
  to a fine point.
- **Terrestrial lateral undulation kinematics:** Jayne (1986), _Kinematics of
  terrestrial snake locomotion_, _Copeia_ 1986(4):915–927, documents that in
  terrestrial lateral undulation every point along the trunk follows the path
  established by the head/neck weave, with 1.5–2.5 waves along the body and a
  startle/escape speed of `0.6–1.2 BL/s`.

## Evidence still needed

- A full-body overhead recording (camera high enough to keep the entire snake
  from snout to tail tip in frame across multiple wavelengths) to measure the
  posterior trunk and tail taper directly rather than inferring `1 BL = 34 BW`
  from _Natrix natrix_ morphometrics.
- A high-speed or startled-escape clip on the same substrate to replace the
  inferred startle recoil and burst speed constants in `snake-motion.ts`.
