# Koi — footage log

Evidence for the koi Specimen (`packages/koi`), under spec P-11. Observations
say only what is visible; inferences are labelled. The motion sheet
(`packages/koi/src/koi-motion.ts`) cites these entries or marks a value as a
guess.

## Koi carp in a park

Source: The Nature Box, "Koi carp in a park", filmed at Shinjuku Gyoen,
Tokyo, 21 November 2015.
[Wikimedia Commons](https://commons.wikimedia.org/wiki/File:Koi_carp_in_a_park.webm).

- **Licence:** CC BY 4.0. Credit The Nature Box and link the licence if any
  frame is redistributed. The file has an audio track; it is ignored (no
  sound anywhere in Critters).
- **Clip:** 1920 × 1080, 23.976 fps, real time, handheld from above. The
  published file is 1:44.63. **The local copy
  (`footage/4-koi/Koi_carp_in_a_park.webm`) is truncated:** it ends after
  986 frames (about 41 s; ffmpeg reports "File ended prematurely"). Only
  0–41 s has been seen. An earlier version of this log said the full file
  was present; that was wrong.
- **Screened:** a contact sheet of 12 frames across 0–38 s
  (`qa/tools/footage/sheet.mjs`), and full frames at 3.5, 24.4, 27.9 and
  38.3 s, on 2026-10-18.

**Observation, body (27.9 s, one white koi, whole body in frame):** seen from
above the body is slender and torpedo-shaped, with a blunt, rounded snout.
Measured by eye on that frame (±15 %): length snout to tail tip about 350 px;
widest about 70 px (0.20 of the length), roughly a third of the way back;
caudal peduncle about 22 px (0.06); tail fin about the last fifth; pectoral
fins about 30 px long (0.09), just behind the head, angled back and out.
The fins are white and translucent; the tail fin's tips fade into the water.

**Observation, colour and water (all frames):** the water is murky olive to
grey-green and hides the floor. Leaves and specks float on the surface, and
pale sky reflections lie on it. The fish swim just below the surface: the
head and back are crisp, the tail and fins fade toward the water's colour.

**Observation, feeding (3.5 s):** a koi with its head at the surface, a food
pellet beside its mouth, and two or three concentric rings spreading from its
head.

**Observation, swimming (0–38 s):** the fish change heading in broad curves,
the body bending laterally, the bend largest toward the tail. Pans and the
frame rate make individual tail beats hard to follow; none were counted.

**Inference:** the outline numbers above set the drawn shape (motion sheet
`OUTLINE`). A top-down fish is drawn as a bending chain with a tail-growing
wave; the clip supports that shape but gives no tail-beat frequency, wave
speed or timing. Surface feeding makes rings, so a mouthful emits a ripple.
The murky water, floating leaves and fading tail are what the scene's
habitat and the skin's underwater tint are drawn from.

## Tracked spine (2026-10-19)

`qa/tools/footage/spine.mjs` tracked the white koi's midline in 866 of the
986 frames; checked by eye on overlays. `qa/tools/footage/spine-measure.mjs`
measured 26 s of it (and measures our model's recorded spine the same way).

- **Measured (grade B: tilted, handheld camera):** tail beats about 1.1 Hz
  (interquartile 0.9–1.3; tracking noise is near the beat's size); beating
  77 % of the time; body bend at 40–60 % of its length median 0.26 rad, 90th
  percentile 0.59.
- **Limits:** the camera is about 30° off vertical (the fish's width-to-length
  ratio changes from 0.16 to 0.22 with its heading), so bends and swings are
  distorted by up to about 15 %; the fish's own roll and pitch distort them
  further. Timing doesn't depend on the view. The "turn rate" the tool reports
  is mostly the head wagging with each beat, so it isn't used. The tail tip is
  often lost, so measurements stop at 60 % of body length.
- **Observed:** the koi banks into turns (a flank shows) and lifts its head to
  feed.
- **Used for:** the motion sheet's tail-beat rate, beat-and-glide share,
  stride, turn radius and straightening (`koi-motion.ts`, tagged "tracked"),
  and the drawn roll and head lift.

## Literature (no footage)

`docs/CRITTER_PRIOR_WORK.md` cites the carangiform pattern used for the wave:
little lateral movement over the front of the body, about 0.10 BL at the
tail, wavelength about 1.05 BL; Bainbridge's U = L(0.75f − 1) above 5 Hz;
C-start stage 1 of 11–18 ms in a sunfish (Jayne and Lauder 1993). The motion
sheet labels values taken or extrapolated from these as literature or
inferred, and everything else (speeds, beat-and-glide counts, turning,
feeding timings) as guesses.

## Evidence still needed

- Re-download the full clip (the local copy stops at 41 s) and track one
  unobstructed koi through a steady swim and a turn, to replace the cruise
  speed, turn rate and beat-and-glide guesses.
- A stable or high-speed recording of a carp-sized fish to count tail beats
  and time a fast start; until then the startle's stage times are inferred
  from a much smaller fish.
