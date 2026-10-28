// Every colour and every visible word of the grass snake study (spec A-6).
// Both renderers read these: the shared atlas and sunlit meadow-bank floor
// (snake-paint.ts) are painted from them, and the WebGL2 shaders take their
// canopy-dapple sunlight and tap-rustle colours from here.

type Rgb = readonly [number, number, number];

export interface SnakePalette {
  /** Sun-warmed woodland loam & mossy bank: deep crevice humus, warm loam, sunlit earth, and moss cushions. */
  soilDark: Rgb;
  soil: Rgb;
  soilLight: Rgb;
  mossDark: Rgb;
  moss: Rgb;
  mossLight: Rgb;
  /** Embedded weathered limestone/sandstone cobbles that the snake braces its S-bends against. */
  stoneDark: Rgb;
  stone: Rgb;
  stoneLight: Rgb;
  /** Overhanging meadow grass blades arching from the bank and crossing over the snake. */
  grassDark: Rgb;
  grass: Rgb;
  grassLight: Rgb;
  /** Warm directional sunlight from the upper right. */
  sun: Rgb;
  /** Faint sunlit dust/rustle ring when a visitor taps the grassy bank. */
  ring: Rgb;
  /** Grass snake (Natrix natrix): olive-green scales, sunlit ridge, shaded flank, pale ventral rim. */
  olive: Rgb;
  oliveLight: Rgb;
  oliveDark: Rgb;
  belly: Rgb;
  /** The characteristic bright yellow crescent collar and jet-black posterior collar/flank bars. */
  collarYellow: Rgb;
  collarBlack: Rgb;
  /** Eye and forked tongue. */
  eyeGold: Rgb;
  eyeDark: Rgb;
  tongue: Rgb;
  tongueBase: Rgb;
  /** Fallen dry oak/willow leaves resting on the loam and warm scent markers. */
  leaf: Rgb;
  leafDark: Rgb;
  scent: Rgb;
  /** Cast shadows on the soil and stones (alpha is the painter's). */
  shadow: Rgb;
}

export const SNAKE_PALETTE: SnakePalette = {
  soilDark: [0.16, 0.13, 0.09],
  soil: [0.34, 0.27, 0.18],
  soilLight: [0.49, 0.4, 0.28],
  mossDark: [0.16, 0.24, 0.1],
  moss: [0.27, 0.38, 0.13],
  mossLight: [0.38, 0.49, 0.19],
  stoneDark: [0.22, 0.22, 0.17],
  stone: [0.4, 0.38, 0.31],
  stoneLight: [0.56, 0.53, 0.44],
  grassDark: [0.18, 0.3, 0.09],
  grass: [0.34, 0.48, 0.17],
  grassLight: [0.52, 0.66, 0.25],
  sun: [1.0, 0.96, 0.84],
  ring: [0.92, 0.88, 0.7],
  olive: [0.42, 0.52, 0.25],
  oliveLight: [0.6, 0.69, 0.36],
  oliveDark: [0.17, 0.23, 0.1],
  belly: [0.84, 0.87, 0.68],
  collarYellow: [0.98, 0.92, 0.42],
  collarBlack: [0.06, 0.07, 0.05],
  eyeGold: [0.9, 0.75, 0.3],
  eyeDark: [0.06, 0.06, 0.05],
  tongue: [0.09, 0.08, 0.09],
  tongueBase: [0.44, 0.18, 0.18],
  leaf: [0.56, 0.46, 0.22],
  leafDark: [0.35, 0.27, 0.13],
  scent: [0.88, 0.78, 0.46],
  shadow: [0.04, 0.04, 0.03],
};

export const SNAKE_COPY = {
  eyebrow: 'Creature specimen',
  title: 'Grass Snake',
  lede: 'A grass snake weaves through stones and overhanging grass on a sunlit bank, pausing to flick its forked tongue and investigate where you tap.',
  motionLabel:
    'A grass snake slithering across a sunlit mossy bank with stones and grass. Tap the bank to rustle the grass and draw its tongue; tap the snake to startle it.',
  stillLabel:
    'An olive-green grass snake with a bright yellow and black collar coiled among stones and grass blades on a sunlit bank.',
} as const;

export const SNAKE_INSTRUCTIONS = {
  steps: [
    'Tap the bank to rustle the grass and draw the snake over.',
    'Tap the snake to startle it.',
    'Enter or Space rustles the grass in the middle.',
  ],
} as const;
