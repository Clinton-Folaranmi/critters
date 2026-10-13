# Cockroach — composition review

Full-scene reviews under spec Q-R4 to Q-R7, newest first. Crops come only
after a full-scene sign-off (Q-R6).

## Review 1 — 2026-10-13, builder's review (not cold)

```text
Build/revision: board r1 (branch critter-skill, after commit b7efc91)  Reviewer/date: Claude (builder), 2026-10-13  Renderer: WebGL2 and Canvas 2D (?renderer=canvas)
Variant and viewport: floor (only variant); desktop 1400 × 1000 and phone 375 × 800, device scale 2
Full-scene frame: docs/cockroach-board/r1-*.jpg
Cold review (Q-R7): no — the reviewer built the scene. A cold review by a person is still to do.
Before crops, I identify — creature: a cockroach, dark and glossy, top-down, on a pale floor ; action: walking toward a crumb in the walk frames; standing still in the feed frames ; environmental motive: a crumb — visible in the walk frames only after looking for it (small, pale); not visible in the feed frames (under the head)
Matches the board's intent: creature yes; action yes while walking, but most of a session it stands; motive no — not identifiable without searching the frame
Full-scene result: COMPOSITION DEFECT (E-33): the motive cue (the crumb) can't be identified without searching at desktop or phone size, and is hidden while the animal eats. Board r1, open questions 1–3. Not signed off.
Real-time session: 33 s at desktop 1400 × 1000 and 33 s at phone 375 × 800 (touch), on the shipped build (dist/site, no dev hooks, no frame stepping), headless Chromium, about 67 frames per second; a tap on the floor at 12 s. It walked to the first crumb in under 3 s, ate, rested; walked to the dropped crumb in under 3 s, ate and rested to the end. About 1.5 s of walking in 33 s (board r1, open question 4). On the phone it ended standing in the picture's faded edge (open question 3). No errors; it never left the floor.
Known issue or follow-up: carried to the owner as board r1's open questions; none accepted yet.
Crop review (only after the entries above): not done (blocked by the defect above).
```

Also seen, not a composition defect: the Canvas fallback draws the pronotum's
pale margin more strongly than WebGL2 does (same shape and pose on the same
frame otherwise).
