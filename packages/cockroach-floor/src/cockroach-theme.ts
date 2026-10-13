// Every colour and every visible word of the cockroach study (spec A-6): one
// variant for now, a pale floor under a single warm key light from the upper
// left. Colours are linear-ish RGB 0 … 1. The insect's colours are drawing
// choices (the footage is greyscale): Nauphoeta cinerea is a mottled
// grey-brown with a paler-edged pronotum.

type RGB = readonly [number, number, number];

export interface CockroachPalette {
  /** Where the key light comes from (y up), and its colour. */
  sun: readonly [number, number];
  light: RGB;
  floor: RGB;
  /** The floor's fine grain and its larger mottling. */
  floorGrain: RGB;
  floorMottle: RGB;
  shadow: number;
  vignette: number;
  pronotum: RGB;
  pronotumEdge: RGB;
  tegmina: RGB;
  abdomen: RGB;
  segmentLine: RGB;
  leg: RGB;
  antenna: RGB;
  /** Strength of the sheen facing the light. */
  sheen: number;
  crumb: RGB;
  crumbShade: RGB;
}

export const COCKROACH_PALETTE: CockroachPalette = {
  sun: [-0.55, 0.83],
  light: [1, 0.97, 0.9],
  floor: [0.79, 0.77, 0.73],
  floorGrain: [0.7, 0.68, 0.64],
  floorMottle: [0.75, 0.72, 0.67],
  shadow: 0.34,
  vignette: 0.9,
  pronotum: [0.27, 0.22, 0.18],
  pronotumEdge: [0.55, 0.49, 0.42],
  tegmina: [0.3, 0.22, 0.15],
  abdomen: [0.15, 0.11, 0.08],
  segmentLine: [0.3, 0.23, 0.17],
  leg: [0.33, 0.24, 0.17],
  antenna: [0.2, 0.15, 0.11],
  sheen: 0.55,
  crumb: [0.87, 0.75, 0.53],
  crumbShade: [0.63, 0.5, 0.33],
};

export const COCKROACH_COPY = {
  eyebrow: 'Creature study',
  title: 'Cockroach',
  lede: 'A lobster cockroach walks the tripod it was filmed walking, feet planted where the footage put them.',
  description:
    'A cockroach on a pale floor walks to a crumb, eats it, rests with its antennae sweeping, and runs if you touch it.',
  motionLabel: 'A cockroach on a floor. Tap the floor to drop a crumb; tap the cockroach to startle it.',
  stillLabel: 'A cockroach standing on a pale floor, antennae forward.',
} as const;

export const COCKROACH_INSTRUCTIONS = {
  heading: 'Try',
  steps: [
    'Tap the floor to drop a crumb: it walks over and eats.',
    'Tap the cockroach: it runs.',
    'Enter or Space drops a crumb in the middle.',
  ],
} as const;
