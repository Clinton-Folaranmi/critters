# Cockroach — visual direction board

The cockroach is a **Specimen** (spec P-15): one animal, an idle and one
locomotion mode (plus an escape run), a plain floor, one key light, one
variant. Under P-16 its first build is the board: this file records that
build's full-scene frames for a person's decision. Until a revision here is
approved, nothing in it is approved; an agent drafted it and may not sign it
(P-12).

## Revision 1 — approved 2026-10-17, with selected changes

```text
Revision: r1 (branch critter-skill, commit after b7efc91)  Approval: APPROVED WITH CHANGES
Reviewer and date: owner, 2026-10-17  Approved revision/link: this entry
Intended creature: one lobster cockroach (Nauphoeta cinerea), adult, seen from directly above
Intended action: walks its measured alternating tripod to food, eats, rests with antennae sweeping; runs when touched
Environmental motive: a crumb on the floor (one at the start; a tap or Enter/Space drops more); a touch is a threat
Camera and normal page sizes: top-down, orthographic; desktop 1400 × 1000; phone 375 × 800 (qa:shots defaults)
```

| Variant              | Aspect / page size                              | Creature read location                                                    | Separation from ground                                                                                                                 | Action cue                                                                               | Motive cue                                                              | Subordinate habitat layers and how                                                                        |
| -------------------- | ----------------------------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Floor (only variant) | desktop 1400 × 1000, picture about 900 × 600 px | starts left of centre, about 0.19 of the picture's height long (≈ 115 px) | dark glossy brown body on a pale warm grey floor (large value step), soft shadow down-left from an upper-left key light, thin dark rim | six legs splayed, knees out; legs change places in tripods while walking; antennae ahead | a pale crumb (≈ 13 px across) across the floor; it walks straight to it | floor mottle: soft, low-contrast, large-scale (no detail near the animal); vignette and soft picture edge |
| Floor (only variant) | phone 375 × 800, picture about 330 × 330 px     | same, ≈ 60 px long                                                        | same                                                                                                                                   | same, smaller; leg zigzag still reads                                                    | crumb ≈ 7 px across                                                     | same                                                                                                      |

| Prominent habitat element      | Behavioural job                                                                    | Treatment                                                                              |
| ------------------------------ | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Floor (pale, softly mottled)   | boundary and ground: what the feet pin to; its soft edge is where the animal stops | keep, quiet: mottle at low contrast and large scale so it never competes with the legs |
| Crumb                          | motive (food); also the tap's answer                                               | keep at the current study size and colour; visible ahead of the head while eating      |
| Vignette and soft picture edge | boundary (the floor ends)                                                          | keep, quiet; dropped food and search targets stay inside the clearly visible floor     |

References: `docs/COCKROACH_FOOTAGE_LOG.md` (Weihmann, Brun and Pycroft 2017,
Additional file 3, 250 fps: gait, footholds, body outline, leg reach); frame 58
of that clip on a 10 px grid for the leg tips and the outline (2026-10-13).

Reference frames (the build at this revision; full pages at normal size):

- `docs/cockroach-board/r1-desktop-webgl2-walk.jpg` — desktop, WebGL2, walking to the crumb
- `docs/cockroach-board/r1-desktop-webgl2-feed.jpg` — desktop, WebGL2, eating (the crumb is under its head)
- `docs/cockroach-board/r1-desktop-canvas-feed.jpg` — desktop, Canvas fallback, eating
- `docs/cockroach-board/r1-phone-webgl2-walk.jpg`, `r1-phone-webgl2-feed.jpg`, `r1-phone-canvas-walk.jpg` — phone
- `docs/cockroach-board/r1-live-desktop.jpg`, `r1-live-phone.jpg` — the 30 s real-time session on the
  shipped build, one frame every 3 s, a tap on the floor at 12 s

Generated images: none.

### Creature-first hierarchy (P-14), from the build

The cockroach is the darkest, glossiest, highest-contrast thing in the
picture and reads at once at both sizes; nothing covers it. The floor is
pale and quiet. The action reads while it walks (legs alternate, the body
travels) and in the escape; at rest only the antennae move.

### Findings from the r1 full-scene review and their disposition

1. **Crumb size and colour.** The owner says the crumbs look fine for this
   stage; their final design can be decided later. Keep the current size and
   palette in this revision.
2. **Resolved in r2: the motive disappeared while it ate.** R1 stopped with
   the crumb under its pronotum. It now stops with the crumb just ahead of its
   head, reaches toward it with the front feet, and the crumb shrinks as it eats.
3. **Resolved in r2: a phone tap could draw it into the faded edge.** Dropped
   crumbs are now moved inside the clearly visible part of the floor, as
   targets already are.
4. **Resolved in r2: little action in 30 seconds.** It reached the first crumb within 3 s,
   then eats (3–6 s) and rests (4–9 s); a search starts only after 12–22 s
   without food. A visitor who doesn't tap sees about 1.5 s of walking.
   These timings are guesses (motion sheet, BEHAVIOUR). R2 starts it farther
   from the crumb and shortens the search interval to 6–10 s. Timing remains
   labelled as a guess in the motion sheet.

**Owner decision (2026-10-17):** approve the existing crumb size and colour
for this stage. Approve proposals 2–4: stop with the crumb ahead of the head
and reach toward it while eating; keep dropped crumbs within the clearly
visible floor; start farther from the initial crumb and shorten the search
wait. These approved changes are implemented in revision 2 below. Final
crumb design remains open.

## Revision 2 — implemented under the owner's approval

```text
Revision: r2 (implementation of the r1 decision above)  Approval: covered by the owner's explicit r1 decision
Reviewer and date: owner, 2026-10-17  Approved revision/link: r1 decision above
```

Reference frames at normal page size:

- `docs/cockroach-board/r2/desktop-webgl2-rest.jpg`, `desktop-webgl2-walk.jpg`, `desktop-webgl2-feed.jpg`
- `docs/cockroach-board/r2/desktop-canvas-feed.jpg`
- `docs/cockroach-board/r2/phone-webgl2-rest.jpg`, `phone-webgl2-walk.jpg`, `phone-webgl2-feed.jpg`
- `docs/cockroach-board/r2/phone-canvas-walk.jpg`

The r2 full-scene frames show the same crumb size and palette as r1. In the
feed frames the crumb stays ahead of the head, with the front pair reaching
to either side. The initial walk starts farther from the crumb. A dropped
crumb is clamped to the clearly visible floor. The unprompted search interval
is now 6–10 seconds (still a design guess; see `cockroach-motion.ts`).

Human review of the r2 frames: approved by the owner on 2026-10-17. The
owner's cold full-scene review and the builder's real-time sessions are
recorded in `docs/COCKROACH_COMPOSITION_REVIEW.md`. Detail crop review is now
unblocked under Q-R6.
