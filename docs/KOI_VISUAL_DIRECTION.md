# Koi — visual direction board

The koi is a **Specimen** (spec P-15): one fish, one swimming mode (beat
and glide) with a hover, a feeding action and an escape, one pond, one
variant. Under P-16 its first build is the board: this file records that
build's full-scene frames for a person's decision. Until a revision here is
approved, nothing in it is approved; an agent drafted it and may not sign it
(P-12).

History: an earlier build (a pale fish circling a fixed orbit in a pale
green oval) was rejected by the owner as not reading as a fish. It was
replaced entirely on 2026-10-18; nothing of its composition carries over.

## Revision 1 — drafted 2026-10-18, awaiting the owner's decision

```text
Revision: r1 (branch critter-skill, uncommitted rebuild of 2026-10-18)  Approval: PENDING — not yet reviewed by a person
Reviewer and date: [owner, date]  Approved revision/link: [—]
Intended creature: one kohaku koi (white with red patches), adult, seen from directly above, just under the surface
Intended action: patrols the pond in beats and glides, hovering now and then; turns to food, slows, takes it at the surface; darts off in a C-start when touched
Environmental motive: food pellets floating on the surface (two at the start; a tap on the water or Enter/Space drops more); a touch is a threat
Camera and normal page sizes: top-down, orthographic; desktop 1400 × 1000; phone 375 × 800
```

| Variant             | Aspect / page size                              | Creature read location                                         | Separation from ground                                                                                                          | Action cue                                                                                                    | Motive cue                                                      | Subordinate habitat layers and how                                                                                  |
| ------------------- | ----------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Pond (only variant) | desktop 1400 × 1000, picture about 870 × 590 px | starts left of centre, about 0.31 of the picture's height long | white and red body on dark olive water (the largest value step in the picture); soft shadow on the floor, down and to the right | the tail's travelling wave while beating; the body straight in a glide; fins spread to brake; a C then a dash | pellets on the surface, rings where they land and where it eats | murky floor (silt, faint stones) low contrast; caustics faint; four floating leaves small, warm, away from the fish |
| Pond (only variant) | phone 375 × 800, picture about 345 × 380 px     | same, about 0.23 of the picture's height long                  | same                                                                                                                            | same, smaller                                                                                                 | pellets are small (≈ 6 px); the rings carry the cue             | same                                                                                                                |

| Prominent habitat element | Behavioural job                                                                  | Treatment                                                                       |
| ------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Murky water and floor     | ground and depth: the fish is under the surface, its shadow on the floor below   | keep, quiet: dark, low contrast, so the white fish is the brightest thing       |
| Food pellets              | motive (food); also the tap's answer                                             | keep; small, warm; a ring when they land and when eaten                         |
| Floating leaves           | depth (they're on the surface, above the fish, with their own shadows) and scale | keep, quiet: four, small, drifting slowly; never placed at the start position   |
| Ripples                   | the answer to a tap, a mouthful and a startle (I-1)                              | keep; faint rings that fade in 2.4 s                                            |
| Soft picture edge         | boundary (the pond ends)                                                         | keep; the koi turns well before it, and food is kept where the koi can reach it |

References: `docs/KOI_FOOTAGE_LOG.md` (The Nature Box, "Koi carp in a park",
CC BY 4.0: body outline measured at 27.9 s, surface feeding with rings at
3.5 s, murky olive water with floating leaves throughout). Kohaku patterning
is a design choice; the filmed fish are mostly plain white.

Reference frames at normal page size (`docs/koi-board/r1/`):

- desktop, WebGL2: `desktop-webgl2-0.jpg` (going for food), `desktop-webgl2-3.jpg` (a mouthful), `desktop-webgl2-14.jpg` (cruising)
- desktop, Canvas 2D: `desktop-canvas-0.jpg`, `desktop-canvas-3.jpg`
- phone, WebGL2: `phone-webgl2-0.jpg`, `phone-webgl2-3.jpg`; Canvas 2D: `phone-canvas-3.jpg`
- the fish close up, beside each: `…-fish.jpg` (crops: for the crop review, after this board's decision)

Generated images: none.

## Creature-first hierarchy (P-14)

The koi is the only bright, saturated thing in the picture: a white body
with red patches on dark olive water. It reads by its outline (blunt snout,
widest a third back, slim tail stalk, forked translucent tail), its paired
fins and its patches. The tail wave, glides and the fins' spread carry the
action; pellets and their rings carry the motive. The floor, caustics and
leaves stay dark, faint or small.

## Open questions for the owner

1. **Pattern.** Kohaku (white with red) was chosen because it reads at
   once; the filmed fish are mostly plain white. Keep kohaku, or another
   variety?
2. **Size.** The fish is about 0.31 of the picture's height on desktop and
   0.23 on a phone. Bigger reads better; smaller leaves more water to swim.
3. **Leaves.** Four small floating leaves give the surface a plane and a
   scale. Keep, reduce, or remove?
4. **Pond edge.** The picture fades into the page (as the cockroach's
   does). A drawn pond edge (stones, a bank) would be a new habitat layer.

Decision: [owner: approve r1 as is / approve with changes (which) / changes requested]
