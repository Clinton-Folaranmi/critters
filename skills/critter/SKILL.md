---
name: critter
description: Build a living, interactive creature study for the web, an animal (frog, beetle, koi, robin, snake, gecko…) in a small habitat that moves the way the real animal moves. Its motion is tuned against footage of the real animal, tracked into curves and measured the same way as the build, and shown side by side with the reference at real speed. Feet stay planted, poses ease, every action has a motive, taps and keys work, and checks measure all of it. Use this whenever someone wants an animated animal, a creature scene, a living hero or background, a pond, aquarium, terrarium or bird table on a page, a canvas or WebGL animal, or believable animal locomotion (walking, hopping, swimming, flying, perching, slithering, burrowing), even if they never say "study". Framework-free TypeScript, WebGL2 with a Canvas 2D fallback.
---

# Critter

Work inside the `critters` repository. The rules are those of
`docs/CREATURE_STUDY_SPEC.md`; rule IDs (`P-18`, `C-3`, …) point there, and
the spec wins where the two differ. The kit is `packages/critter-kit`; the
examples are the frog pond (a Study), the cockroach (a Specimen, measured at
250 fps) and the koi (a Specimen, tuned against tracked footage).

This skill makes small living scenes: three frogs on lily pads that breathe,
blink, hop and swim, a cockroach walking its tripod to a crumb, a koi
cruising a murky pond. A visitor believes the animal because it moves the
way the real one does, and does things for reasons they can see.

## The one idea that matters

**It moves the way the real one moves, because it wants something.** Every
pose, timing and contact comes from the real animal, and every action has a
motive in the world: food, a threat, rest, a destination (P-1, P-2).

**And you can't tell whether it does by looking at your own work.** An agent
can't judge whether motion looks alive from stills, contact sheets or its own
numbers. Two koi were built that way, every check passing, and both looked
dead: one swung its tail 2.7 times too far, the next held its body curled for
seconds, did laps of its pond and jumped when touched. What fixed it was the
loop below: track the real animal in footage, measure the build the same way,
compare the numbers, and show a person both side by side at real speed. The
first round of that loop made the koi "clearly more alive" in an afternoon.

A study fails in three ways:

- **Invented.** The motion is a stack of plausible guesses. Nothing is
  wrong that a check can name; it just isn't how the animal moves. Cure: the
  reference loop (P-17 to P-19).
- **Puppet.** A foot slides while the body turns, the animal spins on the
  spot, a pose pops in one frame, it moves because a timer fired. Cure:
  pins, eased poses, the motion checks.
- **Lost.** Every measurement passes and a visitor can't find the animal.
  Cure: a creature-first composition, reviewed as a full scene before crops
  (P-14, E-33).

What the footage shows is often not what people guess:

| Animal and action       | What gets guessed                      | What the real one does                                                                                                              |
| ----------------------- | -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Frog swimming straight  | The hind legs alternate                | Both kick at once; alternating kicks swim measurably slower (Nauwelaerts and Aerts)                                                 |
| Beetle or roach walking | Legs move one at a time, or feet slide | A tripod: three legs down, three swinging (the cockroach, measured at 250 fps)                                                      |
| Lizard walking          | It walks like a dog                    | The forefoot lags the hind foot by 40–50 % of the stride; dogs and cats about 25 % (Usherwood and Self Davies 2017)                 |
| Koi cruising            | Slow, lazy, with long glides           | Tail beating about 1.1 times a second most of the time, short coasts, wide turns of 1–2 body lengths; it banks into turns (tracked) |
| Koi touched             | A lab C-start                          | A pond koi swishes away along a curve; a snapped C reads as a jump                                                                  |
| Songbird in flight      | It flaps steadily, or glides           | It flap-bounds: bursts of wingbeats with the wings folded between them                                                              |
| Snake moving            | It picks a mode by speed               | The surface picks the mode; in undulation the body follows the head's path (Jayne 1986)                                             |

Sources and caveats: `docs/CRITTER_PRIOR_WORK.md`, the footage logs, and
`docs/MOVEMENT_LIBRARY.md`.

## Workflow: the reference loop

Steps 2 to 7 are the core and come before habitat, polish or paperwork.

1. **Size it** (P-15). Tell the user the size and a time estimate first.
   **Specimen**: one animal, an idle and one locomotion mode, plain ground,
   one variant; about half a day including the loop. **Vignette**: one to
   three individuals, two or more modes, a small habitat whose one
   affordance is the motive; one to two days. **Study**: the frog pond's
   scale; propose a Vignette instead and build the Study only if the user
   chooses it. Run `date` at each step; if a step runs past twice its share,
   say where it stands.

2. **Find the reference and grade it** (P-11, P-17). Look in
   `docs/MOVEMENT_LIBRARY.md` and `docs/<ANIMAL>_FOOTAGE_LOG.md` first and
   reuse what applies. Otherwise find footage: clips the user supplies,
   Creative Commons clips (Wikimedia Commons), journal supplementary videos.
   Downloading needs the user's OK each time. Then grade it and say the
   grade:

   | Grade | Footage                                                                                                       | What you may call measured                                                                                                                   |
   | ----- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
   | A     | From the view you render (within ~10°), steady, fast enough (120 fps for a 75 ms event; 240 for insect steps) | Everything: shapes, bends, swings, timing                                                                                                    |
   | B     | Trackable, but another angle or handheld                                                                      | Timing (rates, rhythms, durations, shares of time, order of events) as measured; shapes as ranges, with the camera's tilt estimated and said |
   | C     | None usable                                                                                                   | Shapes and kinematics from papers (often filmed in your view); behaviour labelled a guess                                                    |

   A lower grade never stops the work; it changes what you may claim. Check
   these before trusting a clip:
   - **The whole file is there.** Run `ffprobe`, then count the frames.
   - **The camera's tilt.** A body's width-to-length ratio shouldn't change
     with its heading in a true top view. If it does, the view is tilted:
     about 30° for the koi clip (0.16 across the frame, 0.22 up it).
   - **The animal's own 3D motion.** Note rolling, pitching or a flank
     showing. If the animal does it, the renderer has to draw it (step 5).

3. **Track it into curves** (P-18). Extract frames with ffmpeg; never trust a
   tracker you haven't checked on overlays by eye.
   - **Pale fish or another contrasty body from above:**
     `qa/tools/footage/spine.mjs` (midline per frame), checked with an
     overlay sheet.
   - **Legged animals:** `track.mjs` and `footfalls.mjs`, checked with
     `sheet.mjs --stances` (the cockroach).
   - **Measure:** `qa/tools/footage/spine-measure.mjs` for swimmers. For
     walkers, the gait measures in `qa/gait.mjs`.
   - **Record it:** write what was measured, its grade, its noise and its
     limits in the footage log. One example: the koi's measured "turn rate"
     turned out to be mostly its head wagging with each beat.

4. **Name the act, write the motion sheet.** One sentence: which animal,
   doing what, for what motive. Then `<animal>-motion.ts`: every number the
   world moves by, each tagged **measured**, **tracked** (grade B),
   **literature**, **inferred** or **guess**. The world and the checks both
   read it.

5. **Build the smallest thing that moves.** One animal, plain ground, the
   kit's primitives: `gait.ts` for legs, `swim.ts` for spines,
   `contact.ts` for pins. The world is pure and seeded, stepped in Node from
   the first hour (A-1 to A-4), with `check()` for every rule it can detect.
   Draw it with one renderer, roughly; looks come later.

   If the footage showed roll or pitch, give the renderer a way to show it
   now. The koi slides its skin across its outline to bank, and foreshortens
   its head to lift it.

6. **Compare** (P-18). Record the model's same parts at the footage's frame
   rate, run the same measurement code on it, and print both side by side.
   When a number disagrees, **find the cause before changing a number**:
   - **Break it down by state.** The koi's excess bend was all in cruising.
   - **Check the sign.** A mean _signed_ bend of +0.47 meant laps of the
     pond, not weaving.
   - **Run a controlled case.** A dead-straight swim showed the wave itself
     was fine and the steering wasn't.
   - **Match conditions.** Compare unfed with unfed: food every 10 s hid
     every glide.

   Some causes aren't motion at all: the koi circled because its pond was
   only five body lengths across. A size or habitat fix is the user's call
   (P-12).

7. **Show the side-by-side** (P-19). Make a real-speed video: the reference,
   the build and, after a round of changes, the previous build, all framed
   alike (`qa/tools/footage/follow-koi.mjs` for the koi). Send it to the user in the
   first build and after every round of step 6. Their eye is the final check
   and catches what the numbers can't. The koi's tilted camera was spotted
   this way. Repeat steps 6 and 7 until they say it moves like the real one.

8. **Then the rest**, in this order:
   - **Ground** (`references/environment.md`): one boundary shared by world,
     renderers and hit test (E-1); affordances that supply motives (E-20); a
     job for every habitat element, quiet near the animal (E-34, E-35).
   - **Pose and contact:** pinned feet (C-1 to C-5); eased poses (P-5,
     B-4); heading changes only along a curve in water or air (P-4).
   - **Render:** WebGL2 and Canvas 2D drawing the same world (A-7, A-8),
     one theme (A-6). Shared geometry written once. The koi draws every
     part as textured triangles from one painted atlas, so both renderers
     use the same pixels.
   - **Make it live:** taps tested against the drawn shapes (B-2, I-2); a
     visible answer to every tap (I-1); a committed animal only flinches
     (H-3); Enter or Space (I-3); reduced motion gets a still (I-5).

9. **Verify like a critic.**
   - **Motion checks and soaks to zero**, reported as numbers:
     `qa:motion`, `qa:soak`, `qa:swim`, `qa:gait`.
   - **Motion at real speed only** (Q-R8): stepped sheets find detail
     faults, never prove the motion right. A jump, a held curl or a fish
     doing laps blocks sign-off whatever the checks say. When one is found,
     add a check that would have caught it (the koi's `koiJump`).
   - **Full scene before crops:** at desktop and phone size, write down the
     creature, its action and its motive before opening anything closer
     (Q-R4, Q-R5).

## Approval

A **Specimen** or **Vignette** is built first; its first full-scene frames
and its side-by-side go to the user, whose decision is recorded as the first
revision of `docs/<ANIMAL>_VISUAL_DIRECTION.md` (P-16). After that, a
composition change (habitat, palette, camera, scale, where the animal sits)
needs their OK. A **Study** needs an approved board before production scene
code (P-12). An agent prepares boards and reviews; it never signs one off.

## Craft rules (short form)

- **Pinned feet stay put**, within 0.06 body lengths of the pin; an
  out-of-reach foot takes a small settling step (C-5).
- **Turns on a surface are steps**, never a rotation of the rig (C-4, L-6).
- **Nothing jumps.** No drawn part moves further in one frame than its
  fastest real motion allows (the koi: 0.08 body lengths at 60 fps). A rigid
  rotation of a whole body in a few frames reads as a teleport.
- **Bodies don't hold a curve.** A slowing swimmer straightens within about
  a second (`relaxSwimBody`); a held curl reads as dead.
- **Mirrored means mirrored.** Paired limbs split only for steering, loading
  or a stumble (P-6, L-11).
- **No rotation spikes:** angular acceleration under 400 rad/s² (Q-21).
- **Trailing parts show the turn.** Fins and unplanted limbs lag through
  springs (`secondary.ts`), and the body banks into it (L-13).
- **Every drawn part respects the boundary** (L-16, E-2). **Draw and
  hit-test the same shapes** (B-2).
- **Size the world to the animal's real speed.** A fish swimming at its
  measured speed in a pond five body lengths across does laps.
- **One key light**; every shadow falls away from it (P-7, V-5).
- **The habitat serves the animal** (E-34, E-35).
- **A good neighbour on the page:** lazy loading, a still until the first
  frame, nothing allocated per frame, everything released on dispose
  (section 10).

## Setup

| Piece                                                                                  | Where                                                                  |
| -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Maths, seeded random, easing, angle deltas                                             | `critter-kit/src/math.ts`, `motion.ts`                                 |
| Limb chains, pins and steps                                                            | `critter-kit/src/rig.ts`, `contact.ts`                                 |
| Footfall clock: phases, stride, duty, advanced by distance                             | `critter-kit/src/gait.ts` (`qa:gait`)                                  |
| Spine swimmer: body on the head's path, tail-growing wave, beat and glide, relax, bank | `critter-kit/src/swim.ts`, `chain.ts`, `wave.ts` (`qa:swim`)           |
| Passive springs for fins, antennae                                                     | `critter-kit/src/secondary.ts`                                         |
| Hit test, containment                                                                  | `critter-kit/src/hit.ts`, `contain.ts`                                 |
| Scene controller, picture edge, shader compile                                         | `critter-kit/src/scene.ts`, `edge.ts`, `gl.ts`                         |
| Footage: contact sheets, marker tracking, footfalls, gait                              | `qa/tools/footage/sheet.mjs`, `track.mjs`, `footfalls.mjs`, `gait.mjs` |
| Footage: a fish's midline, and the same measures on footage and model                  | `qa/tools/footage/spine.mjs`, `spine-measure.mjs`                      |
| Headless Chrome driver and shots                                                       | `qa/lib/chrome.mjs`, `qa/browser/shots.mjs`                            |

Examples to copy from: the cockroach (`packages/cockroach-floor`: measured
gait, pinned feet, footfall clock) and the koi (`packages/koi`: tracked
evidence, the swim primitive, one atlas for both renderers, roll and head
lift). The frog pond is the large example, built before the footage and
review rules. Take its mechanics, not its numbers (spec section 15).

## References

- `docs/CREATURE_STUDY_SPEC.md`: every rule; section 7 (locomotion), 8
  (environment), 12 (QA), 13.1 (review artifact templates).
- `docs/MOVEMENT_LIBRARY.md`: which animals and modes already have evidence.
- `docs/KOI_FOOTAGE_LOG.md`: a worked grade-B log, tracked and measured.
- `docs/COCKROACH_FOOTAGE_LOG.md`: a worked grade-A log, measured frame by
  frame.
