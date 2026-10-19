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

## Review 2 — 2026-10-17, full-scene review and owner sign-off

```text
Build/revision: board r2 (approved changes from the r1 decision)  Reviewer/date: Claude (builder), 2026-10-17
Renderer: WebGL2 and Canvas 2D  Variant and viewport: floor; desktop 1400 × 1000 and phone 375 × 800, device scale 2
Full-scene frames: docs/cockroach-board/r2/*.jpg
Cold review (Q-R7): yes — owner, 2026-10-17; owner did not build the scene.
Before crops, I identify — creature: a lobster cockroach; action: tripod walking toward food, feeding, resting, then searching; motive: the visible crumb is food and the tap drops more.
Matches the approved intent: yes in the deterministic rest, walk and feed frames at desktop and phone sizes. In feed, the crumb remains ahead of the head and the front pair reaches to either side. The live session shows food-directed walking after the tap; the tapped crumb and animal stay within the clearly visible floor.
Full-scene result: owner approves the frames; no E-33 composition defect identified. Signed off for full-scene composition.
Real-time session: shipped build, no dev hooks, headless Chromium; 33 s at desktop and 33 s at phone. Sampled at 3 s intervals; tap on the floor at 12 s. About 2,127 desktop and 2,119 phone animation frames over the session; no page errors observed.
Known issue or follow-up: final crumb scale and colour remain open by the owner's choice; timing values remain guesses in the motion sheet.
Crop review: now unblocked by the owner's full-scene approval; sample detail crops reviewed, full Q-R6 crop set remains.
```

Sample detail review, 2026-10-17: enlarged crops from r2 were checked for the
desktop WebGL2 walk and feed, desktop Canvas feed, phone WebGL2 feed and phone
Canvas walk. The body outline, segment marks, leg placement, antennae and
crumb remain coherent in these samples. The phone food cue is small but
visible; the owner has accepted the crumb's current size for this stage. Canvas
is visibly flatter than WebGL2 in body shading, consistent with the renderer
difference noted after review 1; it preserves the silhouette and pose. No new
defect was found in the sampled crops. The full Q-R6 set (every key moment in
both renderers) remains to be reviewed before the cockroach review is complete.
