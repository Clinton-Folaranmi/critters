# Cockroach footage log

The evidence for the cockroach Specimen (roster animal 1,
`docs/CRITTER_KIT_PLAN.md`; _Nauphoeta cinerea_, chosen over the planned
ground beetle on 2026-10-13 because every measurement here is of it), in the format of spec section 13.1 (P-11).
Observations say only what is visible or measured; inferences are labelled
and kept apart. Both entries are laboratory footage of the same species.

Clips are in `footage/1-cockroach/` (not committed); screening verdicts are in
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

Method (Claude, 2026-10-13, with `qa/tools/footage`, described in
`qa/README.md`): `track.mjs` follows the dorsal markers; `footfalls.mjs` (run with
`--min-pixels 10`) fits the body outline per frame from the dark pixels and finds planted feet
as pixels that stay dark for 5+ frames outside it, grouped into footfalls;
footfalls were assigned to legs by where they land relative to the body at
touch-down and by successive footholds of one leg lying one body displacement
apart, and every assignment was checked on sheets with the legs' boxes drawn
on (`sheet.mjs --boxes --stances`). The reviewed stances, with footfall ids,
are `docs/footage/weihmann2017-file3.stances.json`; `gait.mjs` computes the
numbers below from it. Coordinates are file pixels, x to the right; the
animal walks toward −x. "Upper" and "lower" are sides in the image; which is
the animal's left is not established (a mirrored top view would swap them).

Two cautions shape what this clip can give. First, a top view can't see
height: a foot hovering just over its footprint as it lifts or lands looks
planted, so a stance measured from above lasts longer than ground contact.
That is the right number for a top-down animation (how long a foot stays
still on the floor) but not the biologist's duty factor, which the authors
measured from the side view. Second, the antennae rest on the floor ahead of
the head and look like footfalls (five such were excluded, checked by eye),
and the lower front foot lands under the head, so it isn't measured.

Observation:

- Body, measured on frame 60 against a 10 px grid at three times the size:
  195 px from the front of the pronotum to the tip of the abdomen, about
  77 px wide (0.40 of the length); the head is hidden under the pronotum
  from above, and the pronotum is about 0.23 of the length. Beyond the body's
  edge the upper hind leg reaches about 75 px, the middle leg 45 px and the
  front leg 33 px. For the 27 mm animals that is 7.2 px per mm.
- Speed: the body centre moves 3.23 px per frame over frames 20–80 and
  4.61 px per frame over frames 80–120, i.e. 0.112 m/s and 0.160 m/s
  (4.1 and 5.9 body lengths per second); the caption gives 0.10 m/s rising
  toward 0.16 m/s from frame 80.
- All six legs separated (R = upper side, L = lower; stances in
  `docs/footage/weihmann2017-file3.stances.json`, gait diagram
  `docs/footage/weihmann2017-file3-gait.png`):

  |                                                          | Before frame 80                      | From frame 80           |
  | -------------------------------------------------------- | ------------------------------------ | ----------------------- |
  | Stride period (touch-down to touch-down), all legs       | 101–110 ms (strides of 22–32 frames) | 80–88 ms (17–24 frames) |
  | Stride length (footholds of one foot)                    | 11.0–12.3 mm (0.43 body lengths)     | 12.6–14.2 mm            |
  | Middle and hind feet still on the floor, seen from above | 0.61–0.68 of the stride              | 0.42–0.59               |

  Stride length ÷ period gives 0.113 m/s and 0.155 m/s, agreeing with the
  body's speed.

- Phases (where one foot's touch-down falls in another foot's stride; 0 or 1
  together, 0.5 alternating), circular means with the single values:

  |                                       | Before frame 80         | From frame 80     |
  | ------------------------------------- | ----------------------- | ----------------- |
  | Upper front in upper hind's stride    | 0.95 (0.06, 0.91, 0.88) | 0.86              |
  | Upper front in upper middle's stride  | 0.52 (0.54, 0.54, 0.50) | 0.39 (0.42, 0.37) |
  | Upper middle in upper hind's stride   | 0.44 (0.45, 0.44, 0.42) | 0.38              |
  | Lower hind in upper hind's stride     | 0.46 (0.59, 0.50, 0.25) | 0.57              |
  | Lower middle in upper middle's stride | 0.48 (0.42, 0.54)       | 0.42 (0.42, 0.42) |

  The lower side's own phases are noisier (lower middle in lower hind's
  stride 0.32 and 0.59) because the lower front foot is partly hidden.

- Two sets touch down together: upper front, upper hind and lower middle
  (frames 11/13/9, 37/35/34, 64/67/64, 88/91/–, 109/112/109); and lower
  front, lower hind and upper middle (25/26/23, –/51/49, 80/73/77, 97/103/99,
  120/125/123).
- The upper middle foot touches down 1–5 frames (4–20 ms) after the upper
  front foot lifts (lift-off → touch-down: 19→23, 44→49, 76→77, 98→99,
  122→123, 140→142), 4–6 px (under 1 mm) behind the front foot's foothold
  along the path and about 20 px (2.6 mm) further out from the body.
- The hind feet land behind the middle foot of their side while it is still
  planted: the lower hind foot 16–37 px (2–5 mm) behind the lower middle
  foot's foothold, the upper hind foot about 44 px (6 mm) behind the upper
  middle foot's.
- The front feet's measured stances (5–15 frames) are shorter than the
  others': they land close beside the head, where part of each is hidden, so
  only their touch-downs are used.

Published measurements of this same sequence (authors' caption, not
re-measured here): before frame 80, mean ipsilateral phase shift 0.9 and mean
duty factor 0.52; after the speed-up, 0.82 and 0.45. Across the study's runs
on non-slippery ground (Results): the front leg's touch-down in the middle
leg's stride 0.49 (CI 0.47–0.51) at low and intermediate speeds and 0.32
(CI 0.29–0.34) at high speed; the middle in the rear legs' stride 0.45 (CI
0.42–0.47); contralateral rear legs about 0.5; duty factors falling from
about 0.7 at low speed to about 0.5 and below at the highest speeds.

Inference:

- An alternating tripod at about 4 body lengths per second: a stride of
  about 105 ms and 0.43 body lengths, the front and hind feet of one side
  with the middle foot of the other, half a stride from the opposite set.
  The measured phases agree with the authors': front in hind 0.95 → 0.86
  against their 0.9 → 0.82 for this sequence; middle in hind 0.44 against
  0.45; front in middle 0.52 against 0.49, shifting to 0.39 as the animal
  speeds up (they report 0.32 at high speed). Faster walking shortens the
  stride period (105 → 85 ms) and lengthens the stride (11.7 → 13.2 mm).
- For a top-down animation, each middle and hind foot stays visibly still
  for about two-thirds of the stride at a walk and about half at a fast walk; true
  contact (the authors' 0.52 and 0.45) is shorter, so a foot should begin and
  end its stance with a short near-vertical lift that the camera doesn't see
  as movement.
- **Follow-the-leader foot placement:** a middle foot lands where the front
  foot on the same side has just left, within 20 ms, less than 1 mm behind it
  along the path and a little further out. The Specimen should aim each
  swinging middle foot at the foothold its front neighbour is leaving, not at
  a fixed offset from the body (seen six times here). The hind feet don't
  follow as closely: they land a few millimetres behind the middle foot of
  their side while it is still down. To confirm on other clips.

Supporting source: Weihmann et al. 2017 (above), Methods and Results; the
caption numbers are the authors' measurements of this clip.

Used in: the cockroach's motion sheet (`packages/cockroach-floor/src/cockroach-motion.ts`) (gait row, foot placement) and the first
test of the `gait.ts` primitive (stride period, stride length, phase and the
still fraction at a given speed).

Not measured: the lower front foot's stance lengths (hidden by the head; its
touch-downs are used), and a few stances near the clip's start and end and
near frames 50 and 86 that the detector missed (marked in the stances file).

## Cockroach running fast (Weihmann et al. 2017, Additional file 2)

URL: as above, Additional file 2 (file `12983_2017_232_MOESM2_ESM.avi`).

Observed range: frames 0–60 (0.24 s of real time).

Kind: the same rig and frame time (4 ms).

Observation: not measured yet. Caption (authors' measurements): mean speed
0.2 m/s (about 7.4 body lengths per second), metachronal coordination, mean
ipsilateral phase shift 0.77, mean duty factor 0.42.

Inference: at high speed the tripod loosens into a metachronal pattern (the
legs of a set touching down one after another). A Specimen that walks
should stay in the tripod range; this clip marks where that range ends.

Used in: the upper bound of the walking gait's speed range.
