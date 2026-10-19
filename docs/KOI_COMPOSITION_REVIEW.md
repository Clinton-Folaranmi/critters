# Koi — composition review

Full-scene review under P-16 and Q-R4 to Q-R7. This is the builder's
review; the owner's cold review and decision are still required.

## Review 1 — 2026-10-18, the rebuild

```text
Build/revision: board r1 (rebuild of 2026-10-18, uncommitted)  Reviewer/date: Claude (builder), 2026-10-18
Renderer: WebGL2 and Canvas 2D  Variant and viewport: pond; desktop 1400 × 1000 and phone 375 × 800, device scale 2
Full-scene frames: docs/koi-board/r1/*.jpg
Cold review (Q-R7): no — the reviewer built the scene. Owner review is pending.
Before crops, I identify — creature: a red and white koi; action: swimming in beats and glides to floating food and taking it; motive: the pellets on the surface (and a tap drops more).
Matches the board's intent: yes in the saved frames: the fish is the brightest thing in the picture, the pellets sit ahead of it, rings show where food landed and where it was eaten.
Full-scene result: not signed off (builder's review only). No composition defect found by the builder; open questions are on the board.
Real-time session: the dev build in the app's browser pane, desktop, about 15 s with one tap on the water (food dropped with a ring; the koi turned to it). In the headless shell (stepped, not wall-clock): phone 30 s sampled every 2 s with a tap on the water at 10 s and on the fish at 20 s (it went for the food, startled, and patrolled the whole pond inside the clear water); desktop 2.5 s of approach at 10 fps; a startle at 30 fps (C, sweep, burst, glide; no kinks or folding). No console errors.
Known issue or follow-up: the Canvas fallback has no caustics and no refraction (allowed: surface detail only). The phone session was stepped in the headless shell, not watched in real time on a device. Speeds and timings are guesses (motion sheet).
Crop review: not done; after the owner's full-scene decision.
```
