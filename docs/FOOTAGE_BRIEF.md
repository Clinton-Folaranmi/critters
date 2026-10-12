# Footage brief

How to source slow-motion footage for the critters test roster
(`docs/CRITTER_KIT_PLAN.md`, "Test roster") with ChatGPT, and what to do with
what it finds. Every animal needs a footage log before its motion is designed
(spec P-11); this brief gets the candidates for those logs.

## How to use it

1. Paste the prompt below into ChatGPT with web search on (Deep Research mode
   is best: it opens pages instead of guessing from titles).
2. Ask for one batch at a time if it runs short: animals 0–4 first, then 5–8,
   then 9–10.
3. Save its answer as `footage/candidates.md` in this repository.
4. Download the clips you're happy with into `footage/<animal>/`, keeping the
   original file names. `footage/` is git-ignored: clips are never committed,
   only the measurements taken from them.
5. Tell Claude which ones are in. It reads each clip's real frame rate with
   `ffprobe`, cuts the time range into frames, lays them out as numbered
   contact sheets, marks when each foot touches down and lifts off, and writes
   the footage log and the measured numbers (duty factor, phase, stroke and
   beat timings) with frame references you can check.

## The prompt

```text
I need openly licensed, real (not animated, not AI-generated) video of animals
moving, to measure their locomotion frame by frame for an animation project.
Find candidate clips for each animal below. Open every page you cite and
check it yourself: never guess a URL, a licence or a frame rate. If you can't
verify something, say "not verified" instead of filling it in. Three to five
good candidates per animal beats ten weak ones.

WHAT MAKES A CLIP USABLE (in priority order)
1. Licence that allows reuse: CC0, public domain, CC BY or CC BY-SA. Say the
   exact licence and where the page states it. Good places: supplementary
   videos of open-access papers (eLife, PLOS, Royal Society Open Science,
   Scientific Reports, Biology Letters and Journal of Experimental Biology
   open-access articles), Wikimedia Commons, Internet Archive, government and
   museum archives. YouTube only if the video is marked "Creative Commons
   Attribution" in its description, and flag it as YouTube. Stock sites
   (Pexels, Pixabay) are a last resort: list them, but say they rarely state
   the capture frame rate.
2. Slow motion with a known capture frame rate. A paper's methods section
   often says "filmed at 250 fps" or "500 fps": quote it. For other clips,
   say whether the page states the capture rate or the slow-motion factor; if
   neither is stated, write "capture rate unknown". (Real-time footage is
   still useful for step order and ratios, so include it, marked as such.)
3. The animal doing the behaviour steadily: several complete strides,
   strokes or wingbeats in a row, ideally in a straight line, with the feet,
   fins or wings clearly visible and not hidden by grass, water glare or
   other animals.
4. Camera view: from directly above is best (our scenes are top-down); from
   the side is next best (good for timing); oblique is acceptable. Say which.
5. A single individual, a steady camera, no speed ramps, cuts or effects.

REJECT: animation, CGI, AI-generated or "AI-enhanced" video, compilations
with music and cuts, clips where the animal is being handled, and anything
whose licence forbids reuse.

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
Licence: [exact licence, and the sentence or label on the page that states it]
Credit: [author or owner, as the licence requires]
Source type: [paper supplement / Wikimedia Commons / archive / YouTube CC / stock]
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

AFTER THE CANDIDATES
- List, per animal, any open-access papers that report measured numbers we
  could cross-check (duty factor, stride frequency, tail-beat frequency,
  wingbeat frequency, stance and swing durations), with DOI and the table or
  figure that has them.
- Say plainly which animals you found nothing usable for.
```

## Why these rules

- **Licence:** YouTube's terms forbid downloading except where YouTube allows
  it, and most footage online can't be reused. Openly licensed clips can be
  downloaded and measured, and the log credits them.
- **Capture frame rate:** a ratio such as how long a foot stays down per
  stride survives an unknown slow-motion factor; a duration in milliseconds
  doesn't. A 75 ms event needs at least 120 fps to measure, insect steps and
  wingbeats about 240 fps (`docs/CRITTER_PRIOR_WORK.md`).
- **Real footage only:** generated images and video are never evidence
  (spec P-13).
