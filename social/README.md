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

## Site clips for X (2026-11-01)

`site-clips/` holds one silent 15-second clip per animal page of the site (`dist/site/<animal>/`), framed for the X timeline: the live page as a visitor sees it (the scene in its border, the name and the badge selector), 1920 × 1080, 30 fps, H.264 High, yuv420p, `+faststart`, no audio track. Each opens a few seconds into a settled scene and has one tap on an animal at 7 s, so the clip shows its reaction. `<animal>-sheet.jpg` is a contact sheet of eight frames (open, quarter, just before the tap, 0.2 s, 0.7 s and 1.5 s after it, 80 %, last).

- Remake: `npm run build:site`, then `node social/site-clips/render.mjs` (all five) or `node social/site-clips/render.mjs snail butterfly`. Each clip takes several minutes; run one render at a time.
- Pick moments: `node social/site-clips/render.mjs --probe <animal> 4,11,15` writes stills at those scene times to `site-clips/probe/` (ignored scratch). The start, tap time and tap place per animal are in `CLIPS` at the top of `render.mjs`; the tap place is a fraction of the picture, so re-probe after a scene changes and move it onto the animal.
- Badge-click opening: `node social/site-clips/render.mjs --intro frogs` makes `<animal>-x-15s-intro.mp4`: a second on the previous animal's page, a click on this animal's badge, the view transition, the pencil sketch, then the live scene and the tap.
- Time is stepped, not recorded. `clock-shim.js` is injected before the page's own scripts and gives it a virtual clock (`performance.now`, `Date.now`, `requestAnimationFrame`, seeded `Math.random`) that moves only when the script steps it: 1/60 s per frame callback, two per video frame. So every clip is real-speed motion however loaded the machine is. Once the scene's first frame is in, the page is hidden for an instant and the clock set to a fixed reading, so every run replays the same way. The 16:9 fit is capture-side CSS (the page's column centred top to bottom in a 1536 × 864 page at device scale 1.25); nothing in the scenes or the site changes.
