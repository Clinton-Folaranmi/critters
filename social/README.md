# Ladybug and frog social clips

This directory holds the two separate silent videos and the live slider preview used to choose their shared frame. The owner chose these values on 2026-10-28:

| Setting        | Value |
| -------------- | ----: |
| Artwork size   |   90% |
| Corner radius  |   15% |
| Fade width     |    5% |
| Fade strength  |   30% |
| Edge roughness |   30% |
| Edge noise     |  100% |

The exact values live in `approved-settings.json`. `edge-mask.js` is shared by `live.html` and `render-approved.mjs`, so the preview and exports use the same edge calculation. The browser also saves subsequent slider changes to local storage; those are experiments until the JSON values are updated.

## Files

- `ladybug-post-15s.mp4` and `frogs-post-15s.mp4`: finished 15-second, silent, 1080 × 1080 H.264 posts at 30 fps.
- `ladybug-fullbleed-15s.mp4` and `frog-fullbleed-15s.mp4`: scene sources for the sliders and repeatable exports.
- `live.html`: shared slider preview. Serve this directory over HTTP, for example `python3 -m http.server 5175 --directory social`, then open `http://127.0.0.1:5175/live.html`.
- `render-approved.mjs`: run `node social/render-approved.mjs` from the repository root to remake the two posts. Requires `ffmpeg` on the machine.

The artwork in both posts is 972 × 972, centered on warm paper with 54 px of padding on each side. The edge fades into the paper. These edits use renderer output and do not change either study composition. The ladybug source is the round-5 desktop scene in the separate `critter-test` repository; the frog source is the Day Chorus renderer, captured with its existing tap response. The full scene sources are included here so a separate checkout can adjust the edit without needing the other repository.

The ladybug handoff still lists three owner decisions: phone framing, brick run speed and full bleed. Those study decisions are separate from this social edit.

## Site clips for X (2026-11-01, redone the same day)

`site-clips/` holds silent 15-second clips of each animal page of the site (`dist/site/<animal>/`), redone to the owner's notes: the picture alone in its ragged border on the page's paper (no name, no badges), framed tight with an even paper margin, and a visible pointer that glides in like a hand, clicks an animal (a soft ring shows the press) and the animal reacts. Two clicks per clip, on different individuals where that reads well. 1920 px wide, about 3:2 (1920 × 1320), 30 fps, H.264 High, yuv420p, `+faststart`, no audio track.

- `<animal>-x-15s.mp4`: the live scene from 4 s in; clicks at 5 s and 10 s. `<animal>-sheet.jpg`: the start, the frame before each click, 0.3 s and 1.3 s after it, the end.
- `<animal>-x-15s-intro.mp4`: opens on blank paper; the pencil sketch draws in, the colour washes, the live scene arrives (the scene's first frame is held to 2 s, as on a first visit), then the clicks (timed from the scene's arrival, nominally 2 s, since real loading moves it a little run to run). `<animal>-intro-sheet.jpg`.
- Remake: `npm run build:site`, then `node social/site-clips/render.mjs <animal>` and `node social/site-clips/render.mjs --intro <animal>`, one at a time (several minutes each).
- Place the clicks: `node social/site-clips/render.mjs --probe [--intro] <animal> 5,10` writes the clip's own frames at those times to `site-clips/probe/` (ignored scratch), with the clicks set so far. A point at pixel (X, Y) of a probe frame is picture fraction ((X − 36) / 1848, (Y − 36) / (height − 72)); set it as `on` in `CLIPS` at the top of `render.mjs`, then probe the next click. Re-probe after a scene changes.
- Time is stepped, not recorded. `clock-shim.js` is injected before the page's own scripts and gives it a virtual clock (`performance.now`, `Date.now`, `requestAnimationFrame`, seeded `Math.random`; on the intro page also timers, CSS animations and the sketch worker's clock) that moves only when the script steps it, 1/60 s per frame callback, two per video frame. Every clip is real-speed motion however loaded the machine is, and replays the same way: once the scene is in, the page is hidden for an instant and the clock set to a fixed reading. The pointer and ring are an overlay drawn by the script above the picture; real mouse events go to the scene at the same place. The framing and the hidden name and badges are capture-time CSS: nothing in the scenes or the site changes.
- Every DevTools call, page evaluation and ffmpeg write has a deadline, so a stuck render fails loudly (and stops its browser and ffmpeg) instead of waiting.
