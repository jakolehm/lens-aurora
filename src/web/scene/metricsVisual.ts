/**
 * How load becomes motion.
 *
 * One rule, applied to nodes and pods alike, so the cluster reads without a
 * legend: **CPU is how fast a thing moves, memory is how much space it
 * takes**. A busy node breathes quickly; a full one is filled to the rim. A
 * busy pod tumbles; a fat one is visibly bigger than its neighbours.
 */

const clamp01 = (v: number): number => Math.min(Math.max(v, 0), 1)

/** Pod memory spans three orders of magnitude, so the ramp has to be log. */
const MEM_FLOOR = 8 * 1024 ** 2
const MEM_CEIL = 1024 ** 3
const POD_SCALE_MIN = 0.72
const POD_SCALE_MAX = 1.6

/** Most pods idle near zero and a few spike; log again. */
const CPU_FLOOR = 1
const CPU_CEIL = 500
const POD_SPIN_MIN = 0.45
const POD_SPIN_MAX = 3.2

const logRamp = (value: number, floor: number, ceil: number): number => {
  if (!Number.isFinite(value) || value <= floor) return 0
  return clamp01(Math.log(value / floor) / Math.log(ceil / floor))
}

/** Cube size from working set: a memory-hungry pod is physically larger. */
export function podScaleFromMemory(bytes: number): number {
  return POD_SCALE_MIN + logRamp(bytes, MEM_FLOOR, MEM_CEIL) * (POD_SCALE_MAX - POD_SCALE_MIN)
}

/** Tumble rate from CPU: a busy pod visibly works. */
export function podSpinFromCpu(millis: number): number {
  return POD_SPIN_MIN + logRamp(millis, CPU_FLOOR, CPU_CEIL) * (POD_SPIN_MAX - POD_SPIN_MIN)
}

/**
 * How close a pod is to its own ceiling, 0 to 1.
 *
 * Absolute usage is the wrong question: 860Mi is comfortable for a pod
 * allowed 2Gi and fatal for one allowed 1Gi. Whichever of CPU and memory sits
 * closest to its limit wins, because that is the one that bites first.
 *
 * Roughly half a real cluster declares no limits. An unbounded pod has no
 * ceiling to be near, so it falls back to the absolute ramp and heat means
 * "large compared to a typical pod" instead. That is a weaker claim, and
 * deliberately so: inventing a ceiling would be worse than admitting there
 * is not one.
 */
export function podHeat(
  usage: { cpuMillis: number; memBytes: number },
  limits: { cpuLimitMillis: number | null; memLimitBytes: number | null },
): number {
  const share = (used: number, limit: number | null): number | null =>
    limit === null || limit <= 0 ? null : clamp01(used / limit)

  const cpu = share(usage.cpuMillis, limits.cpuLimitMillis)
  const mem = share(usage.memBytes, limits.memLimitBytes)

  if (cpu === null && mem === null) {
    // unbounded: fall back to size relative to a typical pod
    return logRamp(usage.memBytes, MEM_FLOOR, MEM_CEIL)
  }
  return Math.max(cpu ?? 0, mem ?? 0)
}

/** Brightness breath in Hz. Smooth, unlike the arrhythmic crashloop strobe. */
export function podPulseFromHeat(heat: number): number {
  return clamp01(heat) * 2
}

/** Node metrics already arrive as a share of allocatable; just bound them. */
export function shareOfAllocatable(percent: number): number {
  return clamp01(percent / 100)
}

/**
 * How far the node's inner hex reaches toward the rim, 0 to 1. Linear,
 * because the prism is a vessel and it simply fills.
 */
export function nodeFillFromMemory(percent: number): number {
  return shareOfAllocatable(percent)
}

/** Breathing frequency in Hz, from the node's share of allocatable CPU. */
export function nodeBreathFromCpu(percent: number): number {
  return 0.3 + clamp01(percent / 100) * 0.9
}
