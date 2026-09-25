// The two lights the frog pond is painted in, and everything else both
// renderers must agree on (the frogs' looks, the copy). The WebGL shader is
// generated from these values and the Canvas 2D fallback reads them directly,
// so the two stay the same picture.
//
// night: the last of a sunset beyond the top-right of the pond; dark, peaty
//   water that mostly reflects the sky, the riverbed only a suggestion.
// day: a high sun from the upper right; clear, green, shallow-looking water
//   with the bed, its stones and moving caustics plainly visible, and the
//   pads throwing shadows down onto it (mean luma 85–90; night 35–40).

export type FrogTheme = 'night' | 'day';
export const FROG_THEMES: readonly FrogTheme[] = ['night', 'day'];

type RGB = readonly [number, number, number];
type RGBA = readonly [number, number, number, number];

export interface FrogPalette {
  /** Colour of the key light (sheens, rim light, ripple crests). */
  light: RGB;
  /** Direction the light comes from, in the pond plane (unit-ish, y up). */
  sun: readonly [number, number];
  /** How far a floating thing's shadow falls on the bed, per unit depth. */
  bedShadowReach: number;
  /** Water colour over shallow and deep bed. */
  waterShallow: RGB;
  waterDeep: RGB;
  /** How quickly the water column hides the bed with depth. */
  turbidity: number;
  /** Sky seen reflected in the surface, and how much of it. */
  sky: RGB;
  skyReflect: number;
  /** Riverbed materials. */
  mudDark: RGB;
  mud: RGB;
  sand: RGB;
  stoneDark: RGB;
  stoneLight: RGB;
  /** Light reaching the bed, and caustic strength (0 at night). */
  bedLight: number;
  caustics: number;
  /** Lily pad leaf colours: base range, aged, and a young bronze rim. */
  padA: RGB;
  padB: RGB;
  padAged: RGB;
  padYoung: RGB;
  /** How dark a pad's contact shadow on the water is. */
  padShadow: number;
  /** Reed blades: nearest, and hazier far ones; the lit edge. */
  reedNear: RGB;
  reedFar: RGB;
  reedEdge: RGB;
  /** The reeds' seed heads, and the light caught along their rim. */
  reedHead: RGB;
  reedHeadRim: RGB;
  /** The bank: dry earth up the slope, earth, and dark wet earth at the water. */
  soilDry: RGB;
  soil: RGB;
  soilDamp: RGB;
  /** Grass on the bank (shaded blades … sunlit blades), and moss by the water. */
  grassDark: RGB;
  grassLight: RGB;
  moss: RGB;
  /** Small flowers in the grass (none at night). */
  flowers: readonly RGB[];
  /** Fireflies' glow (night) or the light on midges' wings (day), and a midge's body. */
  flyGlow: RGB;
  flyBody: RGB;
  /** Ripple rings in the Canvas renderer: the lit crest and the darker trough behind it (alpha last). */
  rippleCrest: RGBA;
  rippleTrough: RGBA;
  /** Strength of cast shadows (frogs, pads). */
  shadow: number;
  /** Vignette floor (1 = none). */
  vignette: number;
}

export const FROG_PALETTES: Record<FrogTheme, FrogPalette> = {
  night: {
    light: [0.95, 0.58, 0.38],
    sun: [0.53, 0.85],
    bedShadowReach: 0.035,
    waterShallow: [0.07, 0.1, 0.095],
    waterDeep: [0.03, 0.065, 0.085],
    turbidity: 0.95,
    sky: [0.15, 0.14, 0.22],
    skyReflect: 0.36,
    mudDark: [0.06, 0.075, 0.055],
    mud: [0.15, 0.14, 0.095],
    sand: [0.24, 0.2, 0.13],
    stoneDark: [0.08, 0.085, 0.07],
    stoneLight: [0.26, 0.23, 0.18],
    bedLight: 0.72,
    caustics: 0,
    padA: [0.075, 0.15, 0.075],
    padB: [0.13, 0.21, 0.095],
    padAged: [0.27, 0.22, 0.1],
    padYoung: [0.26, 0.12, 0.07],
    padShadow: 0.45,
    reedNear: [0.016, 0.026, 0.028],
    reedFar: [0.15, 0.15, 0.15],
    reedEdge: [0.62, 0.36, 0.2],
    reedHead: [0.08, 0.045, 0.028],
    reedHeadRim: [0.24, 0.13, 0.06],
    soilDry: [0.3, 0.23, 0.16],
    soil: [0.19, 0.145, 0.1],
    soilDamp: [0.075, 0.063, 0.05],
    grassDark: [0.06, 0.09, 0.05],
    grassLight: [0.2, 0.25, 0.11],
    moss: [0.11, 0.16, 0.07],
    flowers: [],
    flyGlow: [1.0, 0.95, 0.55],
    flyBody: [0.06, 0.05, 0.04],
    rippleCrest: [0.96, 0.75, 0.59, 0.42],
    rippleTrough: [0.016, 0.03, 0.055, 0.35],
    shadow: 0.5,
    vignette: 0.7,
  },
  day: {
    light: [1.0, 0.96, 0.84],
    sun: [0.45, 0.89],
    bedShadowReach: 0.06,
    waterShallow: [0.29, 0.51, 0.29],
    waterDeep: [0.1, 0.31, 0.21],
    turbidity: 0.4,
    sky: [0.74, 0.84, 0.86],
    skyReflect: 0.07,
    mudDark: [0.13, 0.17, 0.09],
    mud: [0.3, 0.32, 0.18],
    sand: [0.62, 0.57, 0.4],
    stoneDark: [0.2, 0.21, 0.16],
    stoneLight: [0.54, 0.51, 0.42],
    bedLight: 1.04,
    caustics: 1.3,
    padA: [0.19, 0.37, 0.12],
    padB: [0.31, 0.5, 0.17],
    padAged: [0.58, 0.5, 0.22],
    padYoung: [0.52, 0.24, 0.13],
    padShadow: 0.3,
    reedNear: [0.1, 0.19, 0.07],
    reedFar: [0.36, 0.45, 0.27],
    reedEdge: [0.95, 0.9, 0.62],
    reedHead: [0.29, 0.2, 0.1],
    reedHeadRim: [0.3, 0.2, 0.09],
    soilDry: [0.62, 0.52, 0.36],
    soil: [0.45, 0.36, 0.24],
    soilDamp: [0.2, 0.17, 0.11],
    grassDark: [0.2, 0.32, 0.1],
    grassLight: [0.52, 0.66, 0.25],
    moss: [0.3, 0.42, 0.14],
    flowers: [
      [0.96, 0.84, 0.28],
      [0.98, 0.96, 0.91],
    ],
    flyGlow: [0.97, 0.96, 0.9],
    flyBody: [0.06, 0.05, 0.04],
    rippleCrest: [1.0, 0.99, 0.92, 0.5],
    rippleTrough: [0.04, 0.16, 0.12, 0.25],
    shadow: 0.58,
    vignette: 0.86,
  },
};

/**
 * Where the light is reflected in the water: a point just beyond the top
 * right of the picture (share of width, share of height), the same in both lights.
 */
export const SUN_GLOW = [0.84, 1.02] as const;

/** Each frog is an individual: skin, markings, belly, eye, and how strong its leg bars are. */
interface FrogLook {
  skin: RGB;
  mark: RGB;
  belly: RGB;
  iris: RGB;
  bars: number;
}
export const FROG_LOOKS: readonly FrogLook[] = [
  { skin: [0.35, 0.53, 0.22], mark: [0.09, 0.17, 0.08], belly: [0.8, 0.8, 0.62], iris: [0.74, 0.58, 0.24], bars: 0.55 },
  { skin: [0.5, 0.42, 0.23], mark: [0.22, 0.15, 0.08], belly: [0.84, 0.74, 0.55], iris: [0.78, 0.42, 0.18], bars: 0.4 },
  { skin: [0.45, 0.63, 0.2], mark: [0.2, 0.32, 0.09], belly: [0.86, 0.84, 0.56], iris: [0.86, 0.74, 0.36], bars: 0.2 },
];
export const FROG_TONGUE: RGB = [0.76, 0.38, 0.4];

/** Visible copy for each version of the study. */
export const FROG_COPY: Record<
  FrogTheme,
  {
    /** The switch's label for this light. */
    light: string;
    eyebrow: string;
    title: string;
    lede: string;
    /** For the page's description meta tag. */
    description: string;
    motionLabel: string;
    stillLabel: string;
  }
> = {
  night: {
    light: 'Night',
    eyebrow: 'An interactive night study',
    title: 'Night Chorus',
    lede: 'Three frogs, a scatter of pads, the last of the light.',
    description: 'A small interactive study of frogs on lily pads as night falls.',
    motionLabel: 'Night Chorus: an interactive pond where three frogs sit on lily pads as night falls.',
    stillLabel:
      'A still illustration of three frogs on lily pads in a dark pond as night falls, with fireflies and reeds.',
  },
  day: {
    light: 'Day',
    eyebrow: 'An interactive day study',
    title: 'Day Chorus',
    lede: 'Three frogs, a scatter of pads, clear water and a high sun.',
    description: 'A small interactive study of frogs on lily pads in a clear, sunlit pond.',
    motionLabel: 'Day Chorus: an interactive sunlit pond where three frogs sit on lily pads over a clear, stony bed.',
    stillLabel:
      'A still illustration of three frogs on lily pads in a clear, sunlit pond, with stones and light on the bed below.',
  },
};

/** How to play, the same in both lights: as one sentence, and as a list. */
export const FROG_INSTRUCTIONS = {
  sentence:
    'Watch a while, or tap a frog to make it leap, a pad to rock it, the water to ripple it, the grass to stir it. Enter or Space drops a pebble in the middle of the pond.',
  steps: [
    'Tap a frog to make it leap',
    'Tap a pad to set it rocking',
    'Tap the water for a ripple',
    'Tap the grass to stir it',
    'Enter or Space drops a pebble in the middle',
  ],
} as const;
