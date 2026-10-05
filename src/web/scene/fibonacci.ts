import type * as THREE from 'three'

const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))

/** Evenly distributed point on the unit sphere: no clumping at the poles. */
export function fibonacciPoint(index: number, count: number, out: THREE.Vector3): THREE.Vector3 {
  const n = Math.max(count, 1)
  const y = n === 1 ? 0 : 1 - (index / (n - 1)) * 2
  const r = Math.sqrt(Math.max(1 - y * y, 0))
  const theta = GOLDEN_ANGLE * index
  return out.set(Math.cos(theta) * r, y, Math.sin(theta) * r).normalize()
}

/**
 * Dense nodes get a wider shell, sublinearly so a busy node does not swallow the
 * ring. Tuned so a typical node sits near the 0.62 orbit of the luisg.me
 * reference, and a 50-pod node still stays clear of its neighbours.
 */
export function shellRadius(count: number): number {
  return 0.42 + 0.05 * Math.sqrt(count)
}
