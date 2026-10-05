export const MIN_DISTANCE = 1.6
/** The least room to zoom out; a large fleet gets more, see `CameraRig`. */
export const MAX_DISTANCE = 120

/** How far the look target may wander from the origin before it is reined in, at least. */
export const PAN_LIMIT = 60

/**
 * Ring radius plus a typical pod shell. Deliberately a little under the
 * true extent: the outermost pods may grow past the frame edge, which
 * reads as the cluster overflowing rather than floating in dead space.
 */
export const CONTENT_RADIUS = 3.0

const POLE_MARGIN = 0.08
const DRAG_SPEED = 0.005

export interface OrbitState {
  theta: number
  phi: number
  distance: number
}

export interface Point {
  x: number
  y: number
}

export const clampDistance = (d: number, max = MAX_DISTANCE): number => Math.min(Math.max(d, MIN_DISTANCE), max)

export function applyDrag(state: OrbitState, dx: number, dy: number): OrbitState {
  return {
    theta: state.theta - dx * DRAG_SPEED,
    phi: Math.min(Math.max(state.phi - dy * DRAG_SPEED, POLE_MARGIN), Math.PI - POLE_MARGIN),
    distance: state.distance,
  }
}

/** Multiply the distance and clamp, used by both the wheel and pinch. */
export const dollyBy = (distance: number, ratio: number, max = MAX_DISTANCE): number =>
  clampDistance(distance * ratio, max)

export const pinchGap = (a: Point, b: Point): number => Math.hypot(a.x - b.x, a.y - b.y)

export const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 })

/**
 * Distance at which a sphere of `radius` fits the frame. On a portrait phone
 * the horizontal field of view is the binding constraint, and it is much
 * tighter than the vertical one, so the camera has to sit a long way back or
 * the ring runs off both edges.
 */
export function fitDistance(aspect: number, fovDegrees: number, radius = CONTENT_RADIUS): number {
  const halfVertical = Math.tan((fovDegrees * Math.PI) / 360)
  const halfHorizontal = halfVertical * Math.max(aspect, 0.0001)
  // no upper clamp: a fleet that needs more room to fit gets it
  return Math.max(radius / Math.min(halfVertical, halfHorizontal), MIN_DISTANCE)
}

/** Keep the look target within reach of the cluster so it cannot be lost. */
export function clampPan(x: number, y: number, z: number, limit = PAN_LIMIT): Point & { z: number } {
  const length = Math.hypot(x, y, z)
  if (length <= limit) return { x, y, z }
  const k = limit / length
  return { x: x * k, y: y * k, z: z * k }
}
