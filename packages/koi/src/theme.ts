// Every colour and every visible word of the koi study (spec A-6). Both
// renderers read these: the shared atlas and floor (koi-paint.ts) are
// painted from them, and the shaders take their few colours from here.

type Rgb = readonly [number, number, number];

export interface KoiPalette {
  /** Pond floor, seen through murky water: deep, mid and the silt blotches. */
  deep: Rgb;
  water: Rgb;
  silt: Rgb;
  /** Pale sky on the surface, very faint. */
  sheen: Rgb;
  /** Ripple highlight. */
  ripple: Rgb;
  /** Koi (kohaku): white skin, its shade at the flanks, the red (hi), its deeper edge, the pink of the snout. */
  skin: Rgb;
  skinShade: Rgb;
  red: Rgb;
  redDeep: Rgb;
  blush: Rgb;
  eye: Rgb;
  fin: Rgb;
  /** Floating leaves and food pellets. */
  leaf: Rgb;
  leafDark: Rgb;
  pellet: Rgb;
  pelletDark: Rgb;
  /** Shadows on the pond floor (alpha is the painter's). */
  shadow: Rgb;
}

export const KOI_PALETTE: KoiPalette = {
  deep: [0.13, 0.16, 0.1],
  water: [0.27, 0.3, 0.19],
  silt: [0.2, 0.22, 0.13],
  sheen: [0.55, 0.6, 0.52],
  ripple: [0.78, 0.82, 0.7],
  skin: [0.95, 0.93, 0.87],
  skinShade: [0.7, 0.71, 0.63],
  red: [0.82, 0.25, 0.11],
  redDeep: [0.6, 0.14, 0.07],
  blush: [0.93, 0.74, 0.66],
  eye: [0.09, 0.08, 0.07],
  fin: [0.93, 0.92, 0.86],
  leaf: [0.7, 0.47, 0.2],
  leafDark: [0.45, 0.27, 0.1],
  pellet: [0.66, 0.47, 0.26],
  pelletDark: [0.42, 0.28, 0.14],
  shadow: [0.04, 0.05, 0.02],
};

export const KOI_COPY = {
  eyebrow: 'Creature specimen',
  title: 'Koi',
  lede: 'A kohaku cruises a murky pond in beats and glides, and comes up for food when you drop some.',
  motionLabel: 'A koi swimming in a pond. Tap the water to drop food; tap the koi to startle it.',
  stillLabel: 'A red and white koi in a murky green pond, under a few floating leaves.',
} as const;

export const KOI_INSTRUCTIONS = {
  steps: ['Tap the water to drop food.', 'Tap the koi to startle it.', 'Enter or Space drops food in the middle.'],
} as const;
