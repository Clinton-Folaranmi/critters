# Footage brief

How to source motion-reference footage for the critters test roster
(`docs/CRITTER_KIT_PLAN.md`, "Test roster") with ChatGPT, and what to do with
what it finds. Every animal needs a footage log before its motion is designed
(spec P-11); this brief gets the candidates for those logs.

## How to use it

1. Paste the prompt below into ChatGPT with web search on (Deep Research mode
   is best: it opens pages instead of guessing from titles).
2. Keep every previously found candidate in the working list. Maintain at least
   three candidate clips for each animal; replace none silently, and keep
   searching when a candidate fails visual screening. Search for
   stronger footage in batches (animals 0–4, then 5–8, then 9–10) and append
   new finds to `footage/candidates.md`; do not replace earlier entries just
   because a better clip is found. Mark the best reference for each behaviour.
3. Review the source page and video before choosing a clip. A licence is
   recorded for future reuse decisions; it does not determine whether footage
   is useful for observing motion.
4. Save clips that you can obtain for frame analysis into `footage/<animal>/`,
   keeping the original file names. For clips you cannot save, retain the page
   URL and timestamp and study them in the source player. `footage/` is
   git-ignored: clips are never committed, only the measurements taken from
   them.
5. Tell Claude which files are in. With the footage tools (`qa/tools/footage`,
   described in `qa/README.md`) it reads each clip's actual file frame rate
   with `ffprobe`, cuts the time range into frames, lays them out as numbered
   contact sheets, marks when each foot touches down and lifts off, and writes
   the footage log and the measured numbers (duty factor, phase, stroke and
   beat timings) with frame references you can check. Keep capture frame rate
   and file playback frame rate separate: the latter alone does not establish
   the real-world duration of a slow-motion event.

## The prompt

```text
I need real (not animated, not AI-generated) video of animals
moving, to measure their locomotion frame by frame for an animation project.
Find candidate clips for each animal below. Open every page you cite and
check it yourself: never guess a URL, a licence or a frame rate. If you can't
verify something, say "not verified" instead of filling it in. Keep every
candidate already found; this is an additive quality pass, not a replacement.
At least three candidates per animal are required. Three to five good
candidates per animal beats ten weak new ones. A source
description alone does not establish a usable behaviour range: play the clip
and give a time range only for motion you actually saw.

WHAT MAKES A CLIP USABLE (in priority order)
1. Slow motion with a known capture frame rate. A paper's methods section
   often says "filmed at 250 fps" or "500 fps": quote it. For other clips,
   say whether the page states the capture rate or the slow-motion factor; if
   neither is stated, write "capture rate unknown". (Real-time footage is
   still useful for step order and ratios, so include it, marked as such.)
2. The animal doing the behaviour steadily: several complete strides,
   strokes or wingbeats in a row, ideally in a straight line, with the feet,
   fins or wings clearly visible and not hidden by grass, water glare or
   other animals.
3. Camera view: from directly above is best (our scenes are top-down); from
   the side is next best (good for timing); oblique is acceptable. Say which.
4. A single individual, a steady camera, no speed ramps, cuts or effects.
5. Licence is information, not a filter. Record the exact licence or rights
   notice and where the page states it; if absent, write "not verified".
   Include strong research-group and YouTube footage even when it is not
   Creative Commons, and flag YouTube as the source. Open-access paper
   supplements, Wikimedia Commons and archives remain useful sources. Stock
   sites can be included when the footage is good; capture rate is often
   unstated, so verify rather than assume it.

REJECT: animation, CGI, AI-generated or "AI-enhanced" video, compilations
with music and cuts, and clips where the animal is being handled. Do not
discard a motion reference because its licence does not allow reuse; record
the restriction so it is not mistaken for reusable material.

THE ANIMALS AND WHAT TO FIND FOR EACH
0. Frog or toad: jumping (the crouch, take-off and landing), and swimming
   with both legs kicking.
1. Ground beetle or other beetle (cockroaches and darkling beetles are fine
   substitutes): walking on flat ground, ideally both slow walking and
   running; a turn if possible.
2. Spider (wolf spider, jumping spider or house spider): walking on flat
   ground; all eight legs visible.
3. Millipede (and a centipede for comparison): walking, with the wave of
   leg movements visible along the body.
4. Koi or goldfish: cruising straight, turning, and a fast escape start
   ("C-start"); from above if at all possible.
5. Grass snake or other small snake: lateral undulation on the ground;
   concertina or sidewinding as extras.
6. Gecko, small lizard, newt or salamander: walking slowly on flat ground,
   with the spine bending.
7. Small songbird (robin, sparrow, finch): hopping on the ground, taking off,
   flap-bounding flight, landing on a perch.
8. Dragonfly or damselfly: perched (legs gripping a stem), take-off, hovering.
9. Turtle (box turtle or tortoise): walking; and a freshwater turtle
   swimming.
10. Earthworm: crawling on a surface (peristalsis), and burrowing if any
    exists.

FOR EVERY CANDIDATE, GIVE THIS BLOCK

Animal: [roster number and name]
Species: [scientific name, as stated by the source; "not stated" otherwise]
Title: [as on the page]
Page URL: [the page you opened]
File URL: [a direct link to the video file if the page offers one]
Licence: [exact licence or rights notice, with the sentence or label on the
  page that states it; "not verified" if absent]
Credit: [author or owner, as the licence requires]
Source type: [paper supplement / Wikimedia Commons / archive / YouTube / stock]
Paper: [if a supplement: authors, year, title, journal, DOI]
Capture frame rate: [e.g. "250 fps, stated in Methods: '...'" or "unknown"]
Playback: [e.g. "30 fps, so 8.3x slow" or "real time" or "unknown"]
Duration and resolution: [e.g. 0:42, 1920x1080]
Camera view: [top / side / oblique / mixed]
Time range with the behaviour: [start–end, e.g. 0:12–0:20]
What happens in that range: [plain description of what is visible: how many
  strides or beats, straight or turning, any occlusion]
Usefulness: [high / medium / low, and why in one line]
Verified by opening the page: [yes / no]
Verified by playing the clip: [yes / no; if no, visual details and time range
  must say "not verified"]

AFTER THE CANDIDATES
- List, per animal, any open-access papers that report measured numbers we
  could cross-check (duty factor, stride frequency, tail-beat frequency,
  wingbeat frequency, stance and swing durations), with DOI and the table or
  figure that has them.
- Say plainly which animals you found nothing usable for.
```

## Why these rules

- **Licence:** Rights information matters when footage might be reused or
  shared. It does not change whether the animal's motion can be studied. Keep
  the source and credit with every entry, and distinguish a reusable clip
  from one that is only a motion reference.
- **Capture frame rate:** a ratio such as how long a foot stays down per
  stride survives an unknown slow-motion factor; a duration in milliseconds
  doesn't. A 75 ms event needs at least 120 fps to measure, insect steps and
  wingbeats about 240 fps (`docs/CRITTER_PRIOR_WORK.md`).
- **Real footage only:** generated images and video are never evidence
  (spec P-13).
