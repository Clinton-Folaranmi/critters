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

Method (Claude, 2026-10-13, with `qa/tools/footage`, described in
`qa/README.md`): `track.mjs` follows the dorsal markers; `footfalls.mjs`
fits the body outline per frame from the dark pixels and finds planted feet
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

- Scale and speed: the fitted body outline is about 206 px long, which for
  the 27 mm animals gives 7.6 px per mm. The body centre moves 3.23 px per
  frame over frames 20–80 and 4.61 px per frame over frames 80–120, i.e.
  0.106 m/s and 0.152 m/s; the caption gives 0.10 m/s rising toward
  0.16 m/s from frame 80.
- Three legs separated over the whole clip (upper front, upper middle, lower
  middle; the table's "R" is upper, "L" lower):

  |                                                                 | Before frame 80                          | From frame 80           |
  | --------------------------------------------------------------- | ---------------------------------------- | ----------------------- |
  | Stride period (touch-down to touch-down)                        | 101–110 ms (strides of 22–30 frames)     | 84–88 ms (19–24 frames) |
  | Stride length (footholds of one foot)                           | 10.4–11.4 mm (0.4 body lengths)          | 12.0–12.6 mm            |
  | Middle feet still on the floor, seen from above                 | 0.66 (lower), 0.68 (upper) of the stride | 0.59, 0.52              |
  | Upper front foot's touch-down in the upper middle foot's stride | 0.54, 0.54, 0.50 (mean 0.52)             | 0.42, 0.37 (mean 0.39)  |
  | Lower middle in upper middle's stride                           | 0.42, 0.54                               | 0.42, 0.42              |

  Stride length ÷ period gives 0.106 m/s and 0.144 m/s, agreeing with the
  body's speed.

- The upper front and lower middle feet touch down together (frames 11/9,
  37/34, 64/64, 109/109, 130/131), half a stride away from the upper middle
  foot.
- The upper middle foot touches down 1–5 frames (4–20 ms) after the upper
  front foot lifts (lift-off → touch-down: 19→23, 44→49, 76→77, 98→99,
  122→123, 140→142), 4–6 px (under 1 mm) behind the front foot's foothold
  along the path and about 20 px (2.6 mm) further out from the body.
- The upper front foot's measured stances (8–14 frames) are shorter than the
  middle feet's; it lands close beside the head, where part of it is hidden.

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
  about 105 ms and 0.4 body lengths; the front foot of one side lands with the
  middle foot of the other, half a stride from the opposite set. Faster
  walking shortens the stride period (105 → 86 ms) and lengthens the stride
  (11 → 12.4 mm), and the front foot lands earlier in the middle foot's
  stride (0.52 → 0.39), the same shift the authors report (0.49 → 0.32).
- For a top-down animation, each middle foot stays visibly still for about
  two-thirds of the stride at a walk and about half at a fast walk; true
  contact (the authors' 0.52 and 0.45) is shorter, so a foot should begin and
  end its stance with a short near-vertical lift that the camera doesn't see
  as movement.
- **Follow-the-leader foot placement:** a middle foot lands where the front
  foot on the same side has just left, within 20 ms, less than 1 mm behind it
  along the path and a little further out. A beetle Specimen should aim each
  swinging middle foot at the foothold its front neighbour is leaving, not at
  a fixed offset from the body (seen six times here; whether the hind foot
  does the same with the middle foot is not yet measured). To confirm on a
  beetle clip.

Supporting source: Weihmann et al. 2017 (above), Methods and Results; the
caption numbers are the authors' measurements of this clip.

Used in: the beetle's motion sheet (gait row, foot placement) and the first
test of the `gait.ts` primitive (stride period, stride length, phase and the
still fraction at a given speed).

Not measured yet: the upper hind foot and the lower front and hind feet. The
hind feet often land in the middle feet's footprints, the lower front foot
under the head, and several of their footfalls fall below the size cut; they
need a closer pass with the same tools.

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
