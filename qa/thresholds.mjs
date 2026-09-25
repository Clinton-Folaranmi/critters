// Every pass/fail limit the checks use, in one place, with where it comes
// from. docs/CREATURE_STUDY_SPEC.md (section QA) lists the same numbers;
// npm run docs:check fails if the two disagree.
//
//   art   docs/FROG_ART_DIRECTION.md       spec   docs/CREATURE_STUDY_SPEC.md
//   p1    the Phase 1 measurements (portfolio HANDOFF.md, 2026-09-25), with headroom

export const THRESHOLDS = {
  soak: {
    // spec: check() stays empty through 10 min untouched and 5 min tapped, at both aspects.
    aspects: [1.48, 0.91],
    idleMinutes: 10,
    tapMinutes: 5,
    resizeMinutes: 10,
    checkIssues: { equals: 0 },
    nanFrames: { equals: 0 },
    padUnderBankFrames: { equals: 0 },
    // A swimmer (drawn under the bank): body and every limb stay on the water.
    swimmerOverBank: { equals: 0, unit: 'samples' },
    // A frog on a pad (drawn over the bank) may put a toe on the grass (measured ≤ 0.0031 tapped).
    // A leap may pass right over it: that is reported, not limited.
    drawnOverToe: { max: 0.02, unit: 'world units' },
    // Getting stuck: no temporary state lasts longer than this (p1: longest swim 25 s in 2 h).
    longestTemporaryState: { max: 40, unit: 's' },
  },
  swims: {
    // art: "A swim lasts 3–7 s before the frog heads out", measured over 2 h untouched.
    hours: 2,
    median: { min: 3, max: 8, unit: 's' },
    p90: { max: 12, unit: 's' },
    longest: { max: 30, unit: 's' },
    // art: about 2.7 pad jumps per frog per minute; 26–31 % end in the water.
    padJumpsPerFrogPerMinute: { min: 2, max: 3.5 },
    intoWaterShare: { min: 0.2, max: 0.36 },
  },
  motion: {
    // spec (manual QA table): a planted foot holds within 0.06 body lengths. Not met yet: a
    // forefoot pinned beyond a compact reach sits off its pin and moves with each breath
    // (measured 2026-09-25: slide per stretch p95 0.11–0.18, from-pin p95 0.08–0.13 sitting).
    plantedSlideP95: {
      max: 0.06,
      unit: 'body lengths',
      known: 'feet pinned out of reach move with each breath (docs/CREATURE_STUDY_SPEC.md, known issues)',
    },
    plantedFoot: {
      median: { max: 0.01, unit: 'body lengths' },
      p95: { max: 0.06, unit: 'body lengths', known: 'feet pinned out of reach (see the slide above)' },
    },
    // "About 0": foot travel in the second after an on-pad turn ends (measured ≤ 0.02).
    settleSlide: { max: 0.03, unit: 'body lengths' },
    // In water, heading changes only while moving (a stroke pushing off the bank counts as moving).
    turnWhileStill: { max: 0.05, unit: 'rad' },
    // Straight strokes are mirrored (measured ≤ 0.002 a second into straight swimming).
    mirroring: { max: 0.01 },
    // art: curvature 3–20 per unit distance; dives and pushes off the bank go past it (measured ≤ 26.5).
    curvatureP99: { max: 30, unit: 'per unit distance' },
    // One-frame pose changes: large only in deliberate pushes and kicks.
    poseJump: {
      air: { max: 0.4 },
      crouch: { max: 0.4 },
      swim: { max: 0.4 },
      dive: { max: 0.4 },
      other: { max: 0.1 },
    },
    // No unexplained spins (a take-off once measured 1600 rad/s² before the fix; now ≤ 300).
    angularAcceleration: { max: 400, unit: 'rad/s²' },
  },
  alloc: {
    // p1: world.step ~470 B/frame, reedBlades() ~100 B/call.
    stepBytesPerFrame: { max: 1024, unit: 'B' },
    reedBytesPerCall: { max: 256, unit: 'B' },
  },
  size: {
    // p1: standalone 97.1 / 37.7 KB; the demo's scene on approach ≈ 66 / 26 KB.
    standaloneMin: { max: 100, unit: 'KB' },
    standaloneGzip: { max: 40, unit: 'KB' },
    demoFirstLoadMin: { max: 8, unit: 'KB' },
    demoOnApproachMin: { max: 70, unit: 'KB' },
    demoOnApproachGzip: { max: 28, unit: 'KB' },
    workerMin: { max: 14, unit: 'KB' },
    stillKB: { max: 60, unit: 'KB' },
  },
  parity: {
    // JS and GLSL agree on the shore to float precision (p1: 4.4e-7, 0 sign flips).
    shoreAbs: { max: 1e-5 },
    signFlips: { equals: 0 },
    // The bed pass's depth vs shelfDepth() (p1: mean 0.018).
    depthMeanAbs: { max: 0.03 },
  },
  luma: {
    // art/spec: mean luma inside the visible picture, bank included.
    night: { min: 35, max: 40 },
    day: { min: 85, max: 90 },
    // spec: the 2D renderer is within about 5 of the GPU renderer.
    rendererGap: { max: 5 },
  },
  hit: {
    // Nothing outside the visible picture takes a tap (p1: 0 accepted where the mask is under 0.2).
    acceptedWhereFaint: { max: 0, unit: '%' },
    // The ragged edge: a little of the clearly visible picture is outside the tap rule (p1: 0.26–0.31 %).
    visibleRejected: { max: 0.5, unit: '%' },
    // Grass drawn over the water counts as bank (p1: 91–93 %).
    overhangCounted: { min: 85, unit: '%' },
  },
  a11y: {
    // WCAG 2.1 AA: text 4.5:1, non-text (the switch's outline) 3:1.
    text: { min: 4.5 },
    nonText: { min: 3 },
    phoneOverflow: { max: 0, unit: 'px' },
  },
  first: {
    // No main-thread task over this from navigation to 4 s (p1: none over 50 ms, 2× Retina).
    worstLongTask: { max: 80, unit: 'ms' },
    runs: 3,
  },
  gpu: {
    // spec: frame cost ≲ 15 ms at 1520 px wide (p1 on an M1: GPU 10.3 night, 11.4–13.0 day).
    gpuMs: { max: 15, unit: 'ms' },
    // CPU + GPU with a readback each frame: fits a 60 Hz frame (p1: 11.5–14.6 ms).
    syncedMs: { max: 16.7, unit: 'ms' },
    rounds: 3,
  },
  bake: {
    // A drag-resize asks for at most one bake while dragging (a true debounce), with no long tasks.
    bakesDuringDrag: { max: 1 },
    longTasksDuringDrag: { equals: 0 },
  },
  reshuffle: {
    // How much of the bank changes when the canvas grows (p1: 0 / 0.8 / 9.3 %).
    sameSize: { equals: 0, unit: '%' },
    plus1px: { max: 2, unit: '%' },
    plus10px: { max: 15, unit: '%' },
  },
  lifecycle: {
    switches: 80,
    // The heap levels off (p1: 8.5 → 11.0 MB over 80 switches, flat after the first 20).
    heapGrowthAfterWarmup: { max: 2, unit: 'MB' },
  },
  offscreen: {
    // The loop runs on screen and stops off screen. (Running, not a frame rate: a busy GPU
    // slows it, and headless frames are capped at 60.)
    inView: { min: 20, unit: 'rAF/s' },
    away: { equals: 0, unit: 'rAF/s' },
  },
  midge: {
    // Shadows fall down-left (+x right, +y down), and the renderers agree.
    rendererGapPx: { max: 3, unit: 'px' },
  },
};
