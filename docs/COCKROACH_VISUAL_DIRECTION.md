# Cockroach — visual direction board

The cockroach is a **Specimen** (spec P-15): one animal, an idle and one
locomotion mode (plus an escape run), a plain floor, one key light, one
variant. Under P-16 its first build is the board: this file records that
build's full-scene frames for a person's decision. Until a revision here is
approved, nothing in it is approved; an agent drafted it and may not sign it
(P-12).

## Revision 1 — drafted 2026-10-13, awaiting the owner's decision

```text
Revision: r1 (branch critter-skill, commit after b7efc91)  Approval: PENDING — not yet reviewed by a person
Reviewer and date: [owner, date]  Approved revision/link: [—]
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
| Crumb                          | motive (food); also the tap's answer                                               | keep; **see open questions 1 and 2**: it is small and hidden while eaten               |
| Vignette and soft picture edge | boundary (the floor ends)                                                          | keep, quiet; **see open question 3** (the animal can stand in the fade on a phone)     |

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

### Open questions for the owner (found in the full-scene review)

1. **The motive is hard to see.** The crumb is about 13 px across on desktop
   and 7 px on a phone, pale on a pale floor. Proposal: crumbs about twice
   the size, a little darker and warmer, so food reads before you search
   for it.
2. **The motive disappears while it eats.** It stops with the crumb under its
   pronotum, so in most of a session the picture shows a cockroach standing
   still with no visible reason. Proposal: it stops with the crumb just ahead
   of its head, antennae and front legs on it, the crumb shrinking as it eats.
3. **On a phone it can stand in the faded edge.** A crumb dropped near the
   edge draws it into the soft border (live frames 18–30 s on the phone).
   Proposal: a dropped crumb is moved inside the clearly visible part of the
   floor, as targets already are.
4. **Little action in 30 seconds.** It reaches the first crumb within 3 s,
   then eats (3–6 s) and rests (4–9 s); a search starts only after 12–22 s
   without food. A visitor who doesn't tap sees about 1.5 s of walking.
   These timings are guesses (motion sheet, BEHAVIOUR). Proposal: start it
   further from the crumb and shorten the wait before a search, so an
   untouched page shows walking every few seconds.

None of these is changed in this revision: they change the habitat's
elements or where the animal goes, which needs this board's approval.

Decision: [owner: approve r1 as is / approve with the proposals above (which) / changes requested]
