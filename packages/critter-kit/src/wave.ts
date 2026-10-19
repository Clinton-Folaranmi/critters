import { TAU } from './math';

/**
 * The shape of a travelling body wave. Lengths are in body lengths (BL).
 * `envelope` is a quadratic amplitude envelope e(u) = c0 + c1·u + c2·u²
 * along the body (u = 0 at the snout, 1 at the tail tip), scaled so the
 * tail's half-amplitude is `tailAmplitude`. The carangiform default
 * (0.2, −0.8, 1.6) gives a small head yaw, a quiet point near a quarter of
 * the body and the largest swing at the tail (the form of the envelopes
 * fitted to swimming fish; Videler 1993, ch. 7).
 */
export interface WaveShape {
  /** Wavelength of the body wave, BL. */
  wavelength: number;
  /** Half-amplitude of the tail tip at a full beat, BL. */
  tailAmplitude: number;
  /** Quadratic envelope coefficients, normalised so e(1) is the tail's share (usually 1). */
  envelope: readonly [number, number, number];
}

export const CARANGIFORM_ENVELOPE = [0.2, -0.8, 1.6] as const;

/** The envelope at u (0 snout, 1 tail), never negative. */
export function waveEnvelope(u: number, envelope: readonly [number, number, number]) {
  return Math.max(0, envelope[0] + envelope[1] * u + envelope[2] * u * u);
}

/**
 * Sideways displacement (BL) at u along the body, `phase` in cycles. The
 * wave travels from head to tail: a crest at u reaches u + wavelength one
 * cycle later.
 */
export function travellingWave(u: number, phase: number, shape: WaveShape) {
  return shape.tailAmplitude * waveEnvelope(u, shape.envelope) * Math.sin(TAU * (phase - u / shape.wavelength));
}
