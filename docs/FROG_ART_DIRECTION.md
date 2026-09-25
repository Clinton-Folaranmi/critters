# Night Chorus / Day Chorus — art and motion sheet

What each pose and scene element in `/play/frogs` is meant to communicate, so
tuning stays anchored to intent rather than parameter nudging. All values live
in `components/frogs/frog-world.ts` (motion), `frog-theme.ts` (palettes and
looks), `frog-bank.ts` and `frog-bank-paint.ts` (the shore), `frog-shaders.ts`
(WebGL art) and `frog-canvas.ts` (the Canvas 2D interpretation). Original work
throughout.

## Body plan (top-down, body lengths, snout toward +x)

```
            eye mounds (0.27, ±0.155)
                 o   o
      hips    ___/‾‾‾‾‾\___  snout (0.41–0.5)
  (-0.3) ====(  back  | head )
      thigh  ‾‾‾\_____/‾‾‾   vocal sacs behind the jaw (0.17, ±0.2)
     knee → shin → ankle → five-toe webbed fan (hind), four toes (fore)
```

- Broad rear torso and hips, narrower head, rounded snout; raised eye mounds.
- Hind leg: thigh 0.40, shin 0.42, tarsus 0.30, toes 0.30. Thigh is the thickest
  part of the silhouette after the body; the foot must read as a fan, never a
  line.
- Forelegs short (0.20 + 0.26), four splayed fingers, no webbing.

## Jump — six keys

| Key                 | Timing                                         | Reads as                                                                                                                                                                                                                                                                                         |
| ------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Sit                 | rest                                           | Knees out beside the hips, feet forward, breathing, eyes following fireflies.                                                                                                                                                                                                                    |
| Loading crouch      | 190 ms calm, 75 ms startled, 160 ms from water | Weight back over the hips (lean), legs folded tight, toes spread, squaring up only slightly (≤ 2.2 rad/s) to the target. The pad dips. A calm hop more than ~26° off the current heading is preceded by a pad shift (below). In water the crouch holds its line; the heading changes in the air. |
| Launch              | first ~100 ms of air                           | Outside-of-turn hind leg drives back first, the other ~28 ms later; webs fully spread; forelegs stay tucked; slight stretch; the pad is shoved back.                                                                                                                                             |
| Apex                | mid-flight                                     | Legs still long but relaxing; body barely larger (lift 0.35/unit height); shadow at its furthest, softest, faintest.                                                                                                                                                                             |
| Landing compression | 0–100 ms after touchdown                       | Forefeet reached forward before contact; body squashes (0.81); hind legs fold beneath; the pad recoils and dimples.                                                                                                                                                                              |
| Recovery            | 100–300 ms                                     | One small after-bounce (≈1.03) and settle into sit — never a snap.                                                                                                                                                                                                                               |

The shadow always keeps the ground-sized footprint; height only offsets it
along the light, blurs it and fades it.

## Feet on the leaf

A foot on a pad is **anchored**: pinned to a pad-local point, with the limb
aimed and its reach adjusted each frame (`pose()` in frog-world.ts) so the
body can move over it without the foot sliding. A settled frog's four feet
stay anchored while it breathes; they are re-set by each turn step and let go
over the first frames of a push-off, as the body is driven away from them.
In the crouch the forefeet ease off (the weight goes onto the hips); the hind
feet keep gripping. Measured: planted feet hold within ~0.06 body lengths.

## On-pad shift

Not a behaviour of its own. A settled frog reorients only to set up a hop or
swim it has already chosen, or to bring a nearby firefly into view. At most
~43° (0.5–0.8 s); a hop further round finishes its heading change in the
crouch (easing up to 2.2 rad/s, 5 when startled) and spread across the
flight. Calm hops favour pads roughly ahead. No turns on page load.

It stays low (squashed 0.95) and swings about a point between the middle of
the back and the inside hip, so the rear barely moves. Every foot stays
anchored except while stepping; a step lifts the foot slightly (it draws in
toward the body, toes closing) and sets it down where it will rest relative
to the body when that step ends. Because a forearm only reaches 0.32–0.46
body lengths, the forefeet patter: two short alternating steps each, inside
first. Each hind foot steps once: the outside one mid-swing, so the leg never
trails out straight, and the inside one last.

## Swim — three keys, straight strokes mirrored

| Key      | Reads as                                                                                                                                                                          |
| -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Recovery | Last ~340 ms before a kick: both knees draw in under the body together, toes closed, forelegs tucked.                                                                             |
| Kick     | 120 ms bilateral, mirrored drive back with webs open; all the speed arrives here, with a small wake ripple behind the feet.                                                       |
| Glide    | 1.15–1.85 s (a steering stroke comes sooner, up to 40 % sooner at full steer). Legs ease to a long, bent trail and hold it together; toes closed; forelegs tucked. Visibly still. |

Straight strokes have no left/right offset at all. A **steering stroke**
(wanted heading more than ~15° off) is the only asymmetric one: the outside
leg recovers further and drives fully, the inside leg kicks up to 40 ms later
and ~30 % shorter. Heading changes only in proportion to swimming speed
(curvature 3–20 per unit distance), so a frog curves while translating and
never yaws in place in water (against the bank, the stroke's push still
counts, so a frog can come round off the edge). While turning, the legs
trail to the outside of the curve (hip yaw up to ~0.4 rad) and the body lags
its path slightly, so a turn reads as a bend. The same trailing applies in
the air. A dive (tap in water) is a very short recovery, then a harder
steering stroke away from the tap; it sinks darker. Entering the water from
a jump, the frog is briefly deeper, then rises to swim at the surface.

A swim lasts 3–7 s before the frog heads out. Over its last 2 s it comes
round toward the nearest free stage, keeps to that one, swims round any pad in
the way rather than circling it, and climbs onto it (or any free stage it
meets). After a dive it heads out within 1.5–3 s. Measured over 2 h untouched
(`tools/frog-qa/swims.mjs`): at aspect 1.48 median 6.6 s, 90 % within 10.7 s,
longest 25 s; at 0.91 median 5.4 s, 90 % within 6.8 s, longest 14.5 s.

A swimmer's trailing legs never go under the bank: containment keeps the body
off the shore, and every knee, ankle and toe is checked too (the frog is eased
clear). Frogs on pads and in the air are drawn over the bank.

## Individuals

| Frog                    | Skin         | Marking                                                       | Belly edge   | Eye        |
| ----------------------- | ------------ | ------------------------------------------------------------- | ------------ | ---------- |
| 0 (largest stage, left) | leaf green   | round dark blotches with pale halos; strong leg bars          | pale cream   | olive gold |
| 1                       | bronze-olive | pale mid-back stripe, dark mask through the eye, fine speckle | warm cream   | copper     |
| 2                       | bright green | gold ridges down each side, a few spots, faint bars           | yellow cream | pale gold  |

Wet skin: one soft sheen along the spine toward the light and a few crisp
catch-lights — never full-body noise.

## Water and bed

Both lights use one model (frog-theme.ts holds the numbers; the shader and
the Canvas fallback read the same palette):

- A depth field: shallow at the bank, deepest in the middle, on an uneven
  floor. The water column tints the bed more with depth.
- The bed: silt, sandy patches toward the shallows, darker organic patches,
  fine grain, and irregular stones (sparse larger ones, pebbles toward the
  bank), many part-sunk, algae-greened in patches, domed and lit from the
  key light. It never moves, so WebGL paints it once per size into a texture.
- Seen through the surface it wobbles slightly (more over deep water and
  under ripples).
- Pads and swimming frogs shade the bed, offset away from the light and
  further and softer over deeper water. That offset is the main depth cue.
- All cast shadows (bed, contact, frog) fall away from the key light, which
  is up and to the right: down and to the left.

**Night** (`/play/frogs`, Night Chorus): the last of a sunset as night
falls; dark, peaty water that mostly reflects a violet sky; the bed a
suggestion, lit a little on the sunset side, stone tops catching warm light;
fireflies and their reflections. Mean luma inside the visible picture, bank
included: 35–40 (measured 39.2 WebGL, 36.7 Canvas).

**Day** (`/play/frogs/day`, Day Chorus): a high sun; clear, green water;
the bed plainly visible, with caustics (a baked cellular web, two copies
sliding past each other; the shader bends them with the surface, the Canvas
fallback turns one copy a little and softens the tile; both fade over deep
water); pale sky reflection and crisp sun glints; midges instead of
fireflies, with tiny shadows on the water. Brightness matched to the koi
study: mean luma 85–90 inside the visible picture, bank included (measured
86.6 WebGL, 86.2 Canvas; koi 90). The two renderers stay within 5 of each
other in both lights (`tools/frog-qa/t-luma.mjs`).

## Pond composition

- The shore: one stretch of it, a near bank along the bottom curving up the
  left side, with a grassy point reaching into the water at about a third of
  the width. The water runs on out of the picture to the top and right. From
  the water: silt in the shallows, dark wet earth, pebbles and moss at the
  waterline, then earth and grass lit where the slope faces the light, tufts
  leaning out over the water, fallen leaves, and by day small flowers.
- The picture's edge: a squarish oval (superellipse), made ragged and soft,
  fading into the page. Only the picture inside that outline takes taps.
- Stages: pads 0–3 (three occupied at start, one spare), all well inside the
  swimmable water (open-water oval and shore). Frogs only sit on stages big
  enough for them. The layout is a blend by aspect of a wide one (1.48) and a
  narrow one (0.91, phones), so the stages never crowd: rim to rim at least
  0.035 apart at 0.91 (0.008 at 1.48, as designed). Pads are nudged back off
  the bank (closest rim measured over soaks: 0.011).
- Scenery: a small bud pad beside the main stage near the left bank; pads
  drifting off the top and right edges. Frogs leave these alone.
- Reeds: two thin, layered clumps rooted on the bank in the bay between the
  left bank and the grassy point; far blades hazier, warm edge catch on the
  sunward side, one seed head each, and soft shadows falling down-left.
- Fireflies: three clusters (near the left stage, right of centre, mid-pond);
  the lower pond stays quiet water.
- Light: the sunset reflected from beyond the top-right; everything sheens
  toward it.

## Behaviour score (≈45 s of watching)

Approximate ranges, not a schedule — each frog runs its own timers:

- Breathing: continuous, each frog at its own rate (1.18 / 1.41 / 1.27 Hz).
- Blinks: every 2–7 s per frog.
- Croak (three throat swells): every 8–22 s per frog.
- Eyes follow fireflies continuously; a pad shift toward one is occasional.
- Tongue strikes: when a lit firefly drifts within reach, then 6–14 s of rest.
- Hops: when a settled frog's idle timer runs out (every 3.5–10 s) it hops
  four times in ten; about a quarter of hops (measured 26–31 %) end in the
  water, for a swim (above) before climbing onto the nearest free stage.

Measured untouched over 2 h: about 2.7 pad jumps per frog per minute. In a
45-second watch expect breathing and blinking throughout, a croak or two,
possibly a catch, and around six hops across the three frogs (a quiet spell
of none is possible), one or two of them into the water.

## Interaction policy

- Frog tap (body or any visible limb/toe) on a sitting or landing frog: leap
  away from the tap. On a swimmer: dive.
- Tap on a crouching frog: hurry the launch and flinch. Tap on an airborne
  frog: flinch (blink, limbs pull in) only. Then 0.35 s of cooldown in which
  further taps on that frog are ignored. No resets, no teleports.
- Pad tap: visible dimple, bob and drift, a small contact ripple; a sitting
  frog blinks and flinches but stays.
- Water tap: a full ripple.
- Bank tap, or a tap on the grass or reeds drawn over the water: a few
  fireflies (midges by day) start up out of the grass and drift off over
  about 1.6 s; within 0.05 of the waterline the water there ripples too. A
  frog on a pad or in the air, drawn over the bank, still takes the tap.
- Taps outside the picture's outline (the faded margin) do nothing.
- Enter / Space: a pebble in the middle — a ripple, nearby pads rock, and the
  frog nearest the centre reacts as if tapped.
