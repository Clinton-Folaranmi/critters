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
