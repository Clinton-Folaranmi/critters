---
name: critter
description: Build a living, interactive creature study for the web, an animal (frog, beetle, koi, robin, snake, gecko…) in a small habitat that moves the way the real animal moves, with poses and timings taken from slow-motion footage, feet that stay planted, eased poses, a motive for every action, taps and keys, and checks that measure all of it. Use this whenever someone wants an animated animal, a creature scene, a living hero or background, a pond, aquarium, terrarium or bird table on a page, a canvas or WebGL animal, or believable animal locomotion (walking, hopping, swimming, flying, perching, slithering, burrowing), even if they never say "study". Framework-free TypeScript, WebGL2 with a Canvas 2D fallback, and a single offline HTML file.
---

# Critter

> **Draft.** The kit and the small examples this file describes don't exist
> yet; `docs/CRITTER_KIT_PLAN.md` says what will be extracted from the frog
> pond and in what order. Until then, work inside the `critters` repository
> and copy from `packages/frog-pond` (the table under Setup says where each
> piece lives today). The rules are those of `docs/CREATURE_STUDY_SPEC.md`;
> rule IDs (`C-3`, `L-11`, …) point there, and the spec wins where the two
> differ.

This skill makes small living scenes: three frogs on lily pads that breathe,
blink, hop, swim and climb out, or a beetle crossing leaf litter toward the
shade of a log. A visitor believes the animal because it moves the way the
real one does, and it does things for reasons they can see. Every rule below
is a check on one of those two things.

## The one idea that matters

**It moves the way the real one moves, because it wants something.** Don't
invent motion. Every pose, timing and contact comes from footage of the real
animal, and every action has a motive in the world: food, a threat, rest, a
destination. Nothing moves to fill time or because the page loaded (P-1, P-2).

What the footage shows is often not what people guess:

| Animal and action      | What gets guessed                      | What the real one does                                                                                                                            |
| ---------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frog swimming straight | The hind legs alternate                | Both kick at once; alternating kicks swim measurably slower (Nauwelaerts and Aerts)                                                               |
| Toad or frog landing   | It lands on all fours at once          | The forelimbs take the landing, aimed along the flight path well before touchdown (Cox and Gillis 2017)                                           |
| Beetle walking         | Legs move one at a time, or feet slide | A tripod at speed: three legs down, three swinging; slow insects drift toward tetrapod and wave patterns (Full and Tu 1991; Wosnitza et al. 2013) |
| Lizard walking         | It walks like a dog                    | A slow walk with the forefoot lagging the hind foot by 40–50 % of the stride; dogs and cats lag about 25 % (Usherwood and Self Davies 2017)       |
| Koi swimming           | The whole body wiggles evenly          | The front fifth barely moves; the sideways sweep grows to about 0.10 body lengths at the tail, one wave per body length (carangiform)             |
| Songbird in flight     | It flaps steadily, or glides           | It flap-bounds: bursts of wingbeats with the wings folded between them (zebra finch about 28.5 beats/s)                                           |
| Snake moving           | It picks a mode by speed               | The surface picks the mode (undulation, concertina, rectilinear, sidewinding); in undulation the body follows the head's path (Jayne 1986)        |

Sources, links and caveats are in `docs/CRITTER_PRIOR_WORK.md`. Most of these
come from abstracts and surveys; confirm them against footage for each new
study. The frog pond's own timings (its crouch, its push, the 52 ms between
its hind legs) are design values that no source backs yet (spec section 15):
don't copy them as facts.

A study fails in two ways, both seen in practice:

- **Puppet.** A foot slides while the body turns, the animal spins on the
  spot, a pose changes in one frame, paired limbs fall out of step for no
  reason, it moves because a timer fired. A visitor can't say what's wrong,
  only that it looks fake.
- **Lost.** Every measurement passes and a visitor can't find the animal. The
  habitat outshines it, and close-up crops hide the problem because each crop
  is already centred on the animal (P-14, E-33).

The cure for a puppet is footage and pins. The cure for lost is a
creature-first composition, reviewed as a full scene before any crop.

**Small signs of life carry it.** A throat pulse, a blink, eyes that follow a
firefly, a weight shift add more than any large action (B-8). Individuals
differ in size, colouring, markings and breathing rate, so no two move in
sync (B-7, H-2). Idle behaviour is small; larger actions are irregular and
individual (P-9).

## Workflow

Work in this order. Write the evidence, the act and the rig before any scene
code: most of the quality is decided there.

1. **Size it before you start** (P-15). Tell the user which size the request is and
   roughly how long it will take, before any other work.
   - **Specimen**: one animal, an idle and one locomotion mode, on a plain
     ground with one key light; taps on the animal and the ground; one
     variant. About 1–2 hours. Build it without asking.
   - **Vignette**: one to three individuals, two or more modes and the
     transitions between them, a small habitat whose one affordance supplies
     the motive (a perch, food, cover, water), one variant. About 3–6 hours.
     Say so, then build it unless the user asked for something quick.
   - **Study**: the frog pond's scale: several modes, a habitat with
     occluders, depth and ambient life, two variants, both renderers, the
     single file and every check in the spec's QA table. Days, not hours. Do
     not start it. Give the estimate, propose a Vignette that keeps the core,
     list what the Study would add, and build the Study only when the user
     chooses it.
   - Whatever the size, have a page that opens in the browser within the
     first hour, and deepen it from there. Run `date` at the start and at each
     step; when a step runs past twice its share, tell the user where it
     stands and what is left.
2. **Evidence first.** Find slow-motion footage and locomotion papers for the
   species and write `docs/<ANIMAL>_FOOTAGE_LOG.md`: for each source a stable
   URL, the time range watched, an **Observation** of only what is visible,
   and a separate **Inference** (P-11). You can't watch a video in a browser:
   extract frames with `ffmpeg` from a clip the user provides, or rely on
   papers and frame-by-frame studies with published timings, and record which.
   Mark touchdown and lift-off on a contact sheet of frames, or track the feet
   with DeepLabCut or SLEAP after labelling a few dozen frames. Record the
   capture frame rate and the slow-motion factor: ratios such as duty factor
   and phase survive an unknown factor, but absolute times don't, and a 75 ms
   event needs at least 120 fps (240 for insect steps and wingbeats). Use
   clips the user supplies or that carry a Creative Commons licence (YouTube's
   terms forbid downloading), and keep measurements, URLs and time ranges in
   the log rather than the frames.
   Then write the motion sheet as a small pure module, `<animal>-motion.ts`:
   body dimensions in body lengths, and for each mode its key poses with
   timings, its contact rule and its turning rule. The world and the motion
   checks both read it, so the animal and the check can't disagree. A number
   with no source is marked as a guess. A generated image is never evidence
   (P-13).
3. **Name the act.** In one sentence: which animal, doing what, for what
   motive, the way the real one does it. "A ground beetle walks a tripod gait
   across damp litter toward the shade under a log, stops to sweep its
   antennae, and runs when tapped." Pick its locomotion modes from the
   catalogue (`references/locomotion.md`). If you can't name a motive, the
   animal doesn't move.
4. **Rig list.** Write the body before you draw it (B-1 to B-5): blended
   ellipses for the body; each limb a chain of tapered capsules, with segment
   lengths in body lengths, a root at the hip or shoulder, and joint angles
   at the folded and extended keys; spines as 8–13 points with a width
   profile; toe or feather fans. Each limb gets one extension value that bends
   every joint, a yaw about its root and a spread; the body gets stretch, lean
   and slip. List the signs of life and how each individual differs.
5. **Plan the ground.** A Specimen stands on the kit's plain ground. Anything
   larger plans its habitat (`references/environment.md`): one signed
   distance function for where animals may go, shared by the world, every
   renderer and the hit test (E-1); the affordances that supply motives
   (E-20); a behavioural job for every prominent element, quieted near the
   animal (E-34, E-35); what is drawn over what in each state (E-6); one key
   light per variant (P-7); a designed picture edge (E-11); layouts from a
   phone at aspect 0.91 to a wide screen at 1.48 (E-15, E-16).
6. **Build the world first, in Node.** Pure, seeded, no DOM or timers (A-1,
   A-3); `step(dt)` with dt clamped to 50 ms (A-4); exactly one named state
   per animal, each authoring its own pose curves (H-1); jittered timers so
   individuals never move in sync (H-2); no temporary state without an end
   and a way home (H-6); `check()` listing every broken rule it can detect
   (A-11). Step it in Node from the first day and run the soak.
7. **Pose and contact.** `pose()` turns channels into capsules every frame
   (B-3). A foot touching a surface is pinned in the surface's own frame; each
   frame the leg is re-aimed at its pin and its reach solved (C-1). A settled
   animal keeps every foot pinned while it breathes (C-2). A foot moves only by
   stepping (C-3), and turning on a surface is a sequence of steps pivoting
   near the hips, never a rotation of the rig (C-4, L-6). Values ease with
   `v += (target − v) · (1 − e^(−rate·dt))` or follow an authored curve;
   legged gaits run on the kit's footfall clock (`gait.ts`), filled with the
   phases, stride lengths and duty factors from the footage log (L-30);
   nothing snaps in one frame except inside a push or a kick (P-5, B-4). In
   water or air, heading changes only while moving, along a curve (P-4). The
   frog's on-pad turn (`turnOnPad` in `frog-world.ts`) is the worked example.
8. **Render.** A WebGL2 renderer and a Canvas 2D fallback draw the same world
   (A-7, A-8); every colour lives in one theme module (A-6); shared geometry
   is written once in TypeScript and the GLSL generated from it or checked
   against it. A shadow keeps the ground-sized footprint and height only
   offsets it along the light, blurs and fades it (L-10). Every shadow falls
   away from the key light; every highlight faces it (V-5).
9. **Make it live.** Taps are tested against the drawn shapes, with a larger
   target for touch (B-2, I-2); every tap gets a visible response (I-1); a
   committed animal only flinches, and a short cooldown stops repeated taps
   resetting it (H-3); Enter or Space triggers a central action (I-3). A still
   shows until the first frame (F-2), the loop stops off screen (F-5), and
   reduced motion gets one described still and no loop (I-5).
10. **Verify like a critic.** The owner finds faults by watching, so you watch
    first. Read every PNG you make.
    - **Run the motion checks to zero.** Planted-foot slide, turning while
      still, mirroring, curvature, one-frame pose jumps and rotation spikes
      (`qa:motion`), then the soaks: `check()` empty, no non-finite poses, no
      state held past 40 s (`qa:soak`). Report the numbers, not PASS. A
      failure is fixed in the world or the renderer that causes it, never
      hidden in another layer (Q-R2).
    - **Full scene before crops.** At desktop and phone page size, at 100 %,
      write down the creature you see, its action and its motive before
      opening anything closer. If you can't name all three without searching,
      that's a composition defect, whatever the numbers say (Q-R4, Q-R5).
      Then watch at least 30 seconds live.
    - **Contact sheets of every key moment**, slowed: a turn, a take-off, a
      landing, a stroke, a steering turn. A foot that slides or a pose that
      pops shows between two frames of a sheet long before it shows at speed.
    - **Then crops**, in both renderers and every variant (Q-R6).

## Approval

A **Study** needs an approved board before any production scene code:
`docs/<ANIMAL>_VISUAL_DIRECTION.md`, signed off by a person (P-12). A
**Specimen** or a **Vignette** is built first, after the footage log: its
first build is the board (P-16). Stop after the first full-scene review, show
the user the desktop and phone frames with the creature, action and motive you
wrote down, and record their decision in `docs/<ANIMAL>_VISUAL_DIRECTION.md` as
its first revision. After that, a composition change (habitat, palette,
camera, scale, where the animals sit), or growing into a Study, needs the
user's OK. An agent may prepare a board or a review; it never signs one off.

## Craft rules (short form)

The rules that separate a living animal from an animated drawing. Each was a
real fault in the frog study, and most are measured.

- **Pinned feet stay put.** A planted foot holds within 0.06 body lengths of
  its pin. The frog meets this for the median and not yet for the tail: when
  the body settles after a landing, a pin can end up beyond the leg's compact
  reach and the foot gives (spec section 15). Re-pin an out-of-reach foot with
  a small settling step rather than hauling the leg straight (C-5).
- **Turns on a surface are steps.** The frog turns at most about 43° on the
  spot; the rest of a larger turn happens in the crouch and is spread across
  the flight (H-4, L-9).
- **Mirrored means mirrored.** Paired limbs split only for steering, loading
  or a stumble (P-6). A steering stroke is the only asymmetric one: the
  outside leg drives fully, the inside one up to 40 ms later and about 30 %
  shorter (L-11).
- **No rotation spikes.** Angular acceleration stays under 400 rad/s²; a frog
  take-off once measured 1,600 before its fix (Q-21). The limit is hand-tuned,
  not from the literature.
- **Bent, not straight.** Keep joints visibly bent from the camera; a straight
  chain reads as a stick figure. Full extension belongs to the push (B-6).
- **Trailing limbs show the turn.** Limbs that aren't planted swing to the
  outside of a turn from a smoothed turn rate, and the body lags its path, so
  a turn reads as a bend (L-13).
- **Every drawn part respects the boundary.** Containment holds the body's
  centre, but trailing legs reach behind it: the frog's slipped under the bank
  as it turned back from the shore until every knee, ankle and toe was
  checked (L-16, E-2).
- **Draw and hit-test the same shapes.** A toe, a fin or a wingtip counts as
  the animal (B-2). A tap on scenery drawn over the animal goes to the
  scenery (E-7).
- **Motives you can see.** Ambient life has a source and a place, and animals
  notice it: eyes follow the fireflies, a tongue strikes when one drifts
  within reach (E-23, E-25). Only usable things are affordances (E-21).
- **One light.** One key light per variant; a time of day is a palette on the
  same scene, geometry and behaviour (P-7, E-30).
- **The habitat serves the animal.** Where the animal sits or moves, the
  habitat's contrast, saturation, fine detail and movement stay below the
  animal's own. Keep an element that has a job and quiet it; remove one that
  has none (E-34, E-35).
- **A good neighbour on the page.** Lazy load near the viewport, a still until
  the first frame, shaders compiled in parallel, static layers painted once in
  a worker, adaptive resolution, nothing allocated per frame, everything
  released on dispose (section 10).

## Setup

Until the kit is extracted, most pieces live in the frog pond (paths under
`packages/frog-pond/src` unless marked); extracted ones are in
`packages/critter-kit/src`:

| Piece                                                                                  | Today                                           | Kit module (planned)             |
| -------------------------------------------------------------------------------------- | ----------------------------------------------- | -------------------------------- |
| Clamp, smoothstep, seeded random, per-item seeds, GLSL floats                          | `critter-kit/src/math.ts` (extracted)           | `kit/math.ts`                    |
| Easing, angle deltas, springs                                                          | `critter-kit/src/motion.ts` (extracted)         | `kit/motion.ts`                  |
| Limb chains: end point, reach, capsules from channels                                  | `critter-kit/src/rig.ts` (extracted)            | `kit/rig.ts`                     |
| Pins and steps: anchor, re-aim and solve reach, step on an arc                         | `critter-kit/src/contact.ts` (extracted)        | `kit/contact.ts`                 |
| Footfall timing: each leg's phase, stride and duty against speed, advanced by distance | `critter-kit/src/gait.ts` (new; `qa:gait`)      | `kit/gait.ts`                    |
| Hit test against drawn capsules and ellipses                                           | `frogDistance` in `frog-world.ts`               | `kit/hit.ts`                     |
| Containment and boundary clearance for every drawn part                                | `contain`, `keepLegsOffBank` in `frog-world.ts` | `kit/contain.ts`                 |
| Scene controller: canvas, loop, input, fallback, resolution                            | `frog-scene.ts`                                 | `kit/scene.ts`                   |
| Shader compile without stalling                                                        | `critter-kit/src/gl.ts` (extracted)             | `kit/gl.ts`                      |
| Static layers painted in a worker, cached and debounced                                | `frog-bank-layer.ts`, `frog-bank-worker*.ts`    | `kit/bake.ts`                    |
| Picture edge, its mask and focus ring                                                  | `pictureEdge`, `bankMaskUrl`, `pictureRingUrl`  | `kit/edge.ts`                    |
| Motion and soak checks                                                                 | `qa/motion.mjs`, `qa/soak.mjs` (frog-specific)  | `scripts/motion.mjs`, `soak.mjs` |
| Headless Chrome driver, shots and contact sheets                                       | `qa/lib/chrome.mjs`, `qa/browser/shots.mjs`     | `scripts/drive.mjs`              |

The frog pond is the large example: a Study. It was built before the footage
log, board and full-scene review rules, so it has none of those artifacts yet,
and its planted-foot tail is a known issue (spec section 15). Take its
mechanics, not its paperwork.

## References

Read these as you need them (planned; each is drawn from a spec section):

- `references/locomotion.md`: the eight modes, their pose keys, contact and
  turning rules and checks (spec section 7).
- `references/environment.md`: boundaries, occluders and taps, the picture
  edge, aspect ratios, affordances, ambient life, wind and weather, habitat
  jobs (section 8).
- `references/light.md`: palettes, depth, shadows and variants (section 9).
- `references/performance.md`: loading, workers, resolution, the per-pixel
  loop (section 10).
- `references/verify.md`: every check, its threshold, and the full-scene
  review (sections 12 and 13.1).
- `references/evidence.md`: the footage log, motion sheet, board and review
  templates (section 13.1).
