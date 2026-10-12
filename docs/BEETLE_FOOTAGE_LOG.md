# Beetle footage log

The evidence for the ground-beetle Specimen (roster animal 1,
`docs/CRITTER_KIT_PLAN.md`), in the format of spec section 13.1 (P-11).
Observations say only what is visible or measured; inferences are labelled
and kept apart. No beetle clip with visible legs and a known frame rate has
been found yet, so the first entries are a cockroach, the stand-in the spec
and the prior-work survey name for six-legged walking (both are insects
walking an alternating tripod at these speeds).

Clips are in `footage/1-beetle/` (not committed); screening verdicts are in
`docs/FOOTAGE_SCREENING.md`.

## Cockroach walking, then speeding up (Weihmann et al. 2017, Additional file 3)

URL: https://doi.org/10.1186/s12983-017-0232-y (Additional file 3; file
https://media.springernature.com/original/springer-static/esm/art%3A10.1186%2Fs12983-017-0232-y/MediaObjects/12983_2017_232_MOESM3_ESM.avi).
Licence CC BY 4.0. Weihmann, Brun and Pycroft 2017, "Speed dependent phase
shifts and gait changes in cockroaches running on substrates of different
slipperiness", _Frontiers in Zoology_ 14:54.

Observed range: frames 0–154 (the whole file; 0.62 s of real time).

Kind: high-speed lab footage. 250 fps capture (Methods); the file plays at
25 fps, 1/10 of recording speed (caption), so one file frame is one captured
frame, **4 ms**. Top view from a camera perpendicular to the walkway, with a
45° mirror giving a side view above it (Methods). _Nauphoeta cinerea_, adult
males 27 ± 1.3 mm long (Methods). File 668 × 506 px.

Method (Claude, 2026-10-12): the three dorsal markers were tracked per frame
by their saturated pixels. Planted feet were found as pixels that stay dark
for at least 5 consecutive frames outside the body, whose outline was fitted
per frame from the dark pixels' second moments; such pixels were grouped
into footfalls by touching in space and overlapping in time. Every footfall
used below was checked by eye on frames with the detections drawn on
(frames 10–128). Coordinates are file pixels, x to the right; the animal
walks toward −x. "Upper" and "lower" are sides in the image; which is the
animal's left is not established (a mirrored top view would swap them).

Observation:

- Speed: the marker centroid moves 2.0 px per frame over frames 0–75 and
  3.4 px per frame over frames 80–120, a ratio of 1.65. The caption gives
  0.10 m/s rising to 0.16 m/s from frame 80 (ratio 1.6); together they put
  the scale at about 5.2 px per mm.
- Upper front foot: planted at x = 411 px from frame 20 to 34 (60 ms), then
  at x = 326 px from frame 65. Between the two touch-downs: 45 frames
  (180 ms) and 85 px (about 16 mm, 0.6 body lengths), i.e. 1.9 px per frame,
  matching the body's speed over the same frames.
- Upper middle foot: touches down at x = 413 px at frame 38, 4 frames (16 ms)
  after the front foot lifted from x = 411 px; it touches down again at
  x = 338 px at frame 82, 12 px behind the front foot's next foothold
  (x = 326 px). Its touch-downs are 44 frames (176 ms) apart.
- Footholds are reused: the same patch of floor is planted by the front foot
  and then by the middle foot (seen twice), so a planted patch can last
  longer than any one foot's stance.

Published measurements of this same sequence (authors' caption, not
re-measured here): before frame 80, mean ipsilateral phase shift 0.9 and mean
duty factor 0.52; after the speed-up, 0.82 and 0.45. Across the study's runs
on non-slippery ground (Results): ipsilateral phases about 0.5 at low and
intermediate speeds (front leg in the middle legs' stride, 0.49, CI
0.47–0.51; middle in the rear legs', 0.45, CI 0.42–0.47; contralateral rear
legs, about 0.5); duty factors falling from about 0.7 at low speed to about
0.5 and below at the highest speeds.

Inference:

- At about 3.7 body lengths per second (0.10 m/s ÷ 27 mm) this insect walks
  a stride of about 180 ms (5.6 Hz) and 0.6 body lengths, with each foot down
  for about half the stride, the alternating tripod of spec section 7.1.
- **Follow-the-leader foot placement:** a middle foot lands within about
  2 mm of where the front foot on the same side stood, shortly after it
  lifts. A beetle Specimen should aim each swinging middle (and, by the same
  rule, hind) foot at the foothold its front neighbour is leaving, rather
  than at a fixed offset from the body. To confirm on a beetle clip.
- Faster walking shortens stance more than swing (duty 0.52 → 0.45 as speed
  rises 1.6×), so a gait primitive should vary duty factor with speed rather
  than only the cycle rate.

Supporting source: Weihmann et al. 2017 (above), Methods and Results; the
caption numbers are the authors' measurements of this clip.

Used in: the beetle's motion sheet (gait row, foot placement) and the
`gait.ts` primitive's first test (stride period, stride length, duty factor
at a given speed).

Not measured yet: per-leg duty factors and phases from this clip. Reused
footholds merge successive feet into one planted patch, and the front feet
are partly hidden under the head, so separating every stance needs more
work than this pass did. The authors' values stand in until it is done.

## Cockroach running fast (Weihmann et al. 2017, Additional file 2)

URL: as above, Additional file 2 (file `12983_2017_232_MOESM2_ESM.avi`).

Observed range: frames 0–60 (0.24 s of real time).

Kind: the same rig and frame time (4 ms).

Observation: not measured yet. Caption (authors' measurements): mean speed
0.2 m/s (about 7.4 body lengths per second), metachronal coordination, mean
ipsilateral phase shift 0.77, mean duty factor 0.42.

Inference: at high speed the tripod loosens into a metachronal pattern (the
legs of a set touching down one after another). A beetle Specimen that walks
should stay in the tripod range; this clip marks where that range ends.

Used in: the upper bound of the beetle gait's speed range.
