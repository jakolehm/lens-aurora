export const linear = (t: number): number => t
export const easeOutCubic = (t: number): number => 1 - (1 - t) ** 3
export const easeInCubic = (t: number): number => t ** 3
export const easeInOutCubic = (t: number): number =>
  t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2

/** Overshoots past 1 before settling: for things snapping into place. */
export const easeOutBack = (t: number): number => {
  const c1 = 1.70158
  const c3 = c1 + 1
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2
}

/** Springy overshoot with a couple of decaying bounces. */
export const easeOutElastic = (t: number): number => {
  if (t === 0 || t === 1) return t
  const c4 = (2 * Math.PI) / 3
  return 2 ** (-10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1
}

/** 0 at both ends, 1 in the middle. */
export const pulse = (t: number): number => Math.sin(t * Math.PI)

/** Irregular strobe for crashloop: two beats that never quite line up. */
export const arrhythmic = (t: number): number => {
  const fast = Math.sin(t * 11.3)
  const slow = Math.sin(t * 3.7 + 1.1)
  return Math.max(0, fast * 0.6 + slow * 0.5)
}
