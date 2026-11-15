# Frog pond — visual direction

The frog pond's board (spec P-12, section 13.1). Until a revision here is
approved by a person, nothing in it is approved. The approved board is
[`docs/frog-board/board-r2.jpg`](frog-board/board-r2.jpg) (board r2, half
size), and the painter that drew it, the reference for every value in
`packages/frog-pond/src/frog-theme.ts`, is
[`docs/frog-board/painter-r2.js`](frog-board/painter-r2.js). The other working
files (boards r0 and r1, the r2 loop, briefs and reports) are in
`reports/frogs/style-board/` (gitignored).

## r0 (2026-10-27) — APPROVED: Day Chorus in the grainy flat meadow style, water only

Shown, in order: three third-party style references (kept privately; not
shipped); board r0 (`board.png`, the meadow style with the bank); board r1
(`board-r1.png`, water only); board r2 (`board-r2.png` and `loop-r2.mp4`,
stylised caustics and drifting shade at two strengths).

The owner's words, verbatim:

- On the references: "i really like this visual style. Can we explore making
  the ladybug , frogs int his style as well?" … "The Grainy Flats Meadow is
  closer to what I want. … Let's only do a [day version]. Let's not stress
  ourselves, and let's, of course, do the board first."
- On r0: "lets do onlu water no grass for this".
- Asked whether caustics and shadows work in this style: "okie lets run".
- On r2: "okay this works".
- Asked what happens to Night: "no night. just day for now. optio n 1".

Approved:

- **Style:** grainy flat meadow: flat colour fields with slight drift, one fine
  grain over everything, soft edges cut against it, flat offset shadow bands
  from one key light, sparse small details, a small palette.
- **Scene:** water only. No bank, grass, reeds, pebbles, bed or land flowers;
  the water runs out on every side; pads frame the edges and the middle stays
  open. Same camera and frog scale as before. Sparse water details: a white
  water lily on one pad, a few petals, ripple marks.
- **Light:** stylised caustics (the existing caustics pattern posterised into
  two flat tones, grain-cut, open water only), at the **soft** strength (the
  look agent's pick; the owner didn't name one), and drifting flat shade from
  foliage out of frame, with leaf-shaped edges rather than disc clusters.
- **Day only.** Night is dropped (AGENTS.md updated).
- **Brightness:** the Day target moves from mean luma 85–90 to the board's
  level, about 130–140 (measured on r2: 138.0 desktop, 132.3 phone); the spec
  and `qa/thresholds.mjs` change to match when the build lands.

Supersedes the habitat and look sections of `docs/FROG_ART_DIRECTION.md`
(bank, grass, flowers, reeds, bed, fireflies and the night palette); its body
plan, jump, feet, shift and swim sections still hold.
