export { BG, ENTRY_HUES, HOT, HUES, IVORY, LINK_GRAY, MUTED, RED, RELATED_HUES, WARM, hueFor, workloadHue } from '../shared/palette.js'

/**
 * Fog is measured from the camera, so a fixed range would swallow the
 * cluster as soon as the camera pulls back to fit a narrow screen or a
 * whole fleet. Both ends scale with the viewing distance instead, keeping
 * the depth cue identical at every zoom level: 13 units deep at the 9 units
 * one cluster is seen from.
 */
export const FOG_NEAR_SCALE = 1
export const FOG_SPAN_SCALE = 13 / 9

/** Ring geometry, matching luisg.me Cluster3D. */
export const RING_RADIUS = 2.5
export const ORBIT_RATE = 0.155
export const RIG_SPIN_RATE = 0.05

export const REDUCED_MOTION =
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

/** Time-based easing: same feel at 60fps, still converges when throttled. */
export function easeFactor(k: number, rawDt: number): number {
  return Math.min(k * Math.min(rawDt * 60, 12), 0.7)
}

export const clamp01 = (a: number): number => Math.min(Math.max(a, 0), 1)
export const smooth = (a: number): number => a * a * (3 - 2 * a)
