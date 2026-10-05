import * as THREE from 'three'
import type { Ambient } from './ambient.js'
import {
  type OrbitState,
  type Point,
  applyDrag,
  clampDistance,
  MAX_DISTANCE,
  PAN_LIMIT,
  clampPan,
  dollyBy,
  fitDistance,
  midpoint,
  pinchGap,
} from './cameraMath.js'
import { FLEET_PLANE } from './fleetPlane.js'
import type { FrameContext } from './world.js'

export * from './cameraMath.js'

/**
 * The sway rides on top of whatever azimuth the user left the camera at, so
 * it stays bounded and never brings the ring edge-on.
 */
const AMBIENT_RATE = 0.06
const AMBIENT_SWAY = 0.28

const PAN_SPEED = 0.0016
/** Orbit inertia: how much of the throw survives, per frame. */
const SPIN_FRICTION = 0.88
const SPIN_CUTOFF = 1e-4

type Gesture = 'orbit' | 'pan' | 'pinch' | null

/**
 * Pointer capture throws InvalidPointerId if the pointer is already gone,
 * which happens on fast touch sequences. Losing capture is survivable;
 * losing the rest of the handler is not.
 */
function capture(dom: HTMLElement, id: number): void {
  try {
    dom.setPointerCapture(id)
  } catch {
    /* capture is a nicety, not a requirement */
  }
}

function release(dom: HTMLElement, id: number): void {
  try {
    if (dom.hasPointerCapture(id)) dom.releasePointerCapture(id)
  } catch {
    /* already released */
  }
}

/**
 * Damped orbit camera with panning, pinch-zoom and a little throw.
 *
 * Input writes a target; the frame loop eases the live values toward it, so
 * nothing ever snaps. Pointer handling is unified: mouse, pen and touch all
 * arrive as pointer events, and two simultaneous pointers become a pinch.
 */
export class CameraRig {
  readonly #camera: THREE.PerspectiveCamera
  readonly #ambient: Ambient

  /** where the camera is looking right now, and where it is heading */
  readonly #look = new THREE.Vector3()
  readonly #lookTarget = new THREE.Vector3()
  /** the centre the user panned to; focus returns here when released */
  readonly #home = new THREE.Vector3()
  readonly #offset = new THREE.Vector3()
  readonly #raycaster = new THREE.Raycaster()
  #dom: HTMLElement | null = null

  #target: OrbitState
  #live: OrbitState
  #focused = false

  readonly #pointers = new Map<number, Point>()
  #gesture: Gesture = null
  #last: Point = { x: 0, y: 0 }
  #pinchGap = 0
  #pinchMid: Point = { x: 0, y: 0 }

  /** leftover orbit velocity after a throw */
  #spin = { theta: 0, phi: 0 }
  #ambientPhase = 0
  #contentRadius = 3

  constructor(camera: THREE.PerspectiveCamera, dom: HTMLElement, ambient: Ambient) {
    this.#camera = camera
    this.#ambient = ambient
    const distance = this.homeDistance()
    this.#target = { theta: 0, phi: 1.25, distance }
    this.#live = { theta: 0, phi: 1.25, distance }
    this.#attach(dom)
  }

  /** Where the camera actually is right now, for depth cues. */
  get distance(): number {
    return this.#live.distance
  }

  /** How wide the cluster currently is, so framing follows it. */
  setContentRadius(radius: number): void {
    this.#contentRadius = Math.max(radius, 1)
  }

  /** Distance at which the whole cluster fits the current viewport. */
  homeDistance(): number {
    return fitDistance(this.#camera.aspect, this.#camera.fov, this.#contentRadius)
  }

  /** Room to zoom out past the whole fleet, however large it grows. */
  #maxDistance(): number {
    return Math.max(MAX_DISTANCE, this.homeDistance() * 2)
  }

  focusOn(target: THREE.Vector3, distance: number): void {
    this.#focused = true
    this.#lookTarget.copy(target)
    this.#target.distance = clampDistance(distance, this.#maxDistance())
  }

  /** Return to the overview, keeping wherever the user had panned to. */
  release(): void {
    this.#focused = false
    this.#lookTarget.copy(this.#home)
    this.#target.distance = this.homeDistance()
  }

  /** Snap all the way back: centred, framed, level. */
  recenter(): void {
    this.#focused = false
    this.#home.set(0, 0, 0)
    this.#lookTarget.set(0, 0, 0)
    this.#target = { theta: 0, phi: 1.25, distance: this.homeDistance() }
    this.#spin.theta = 0
    this.#spin.phi = 0
    this.#ambient.note()
  }

  /** Re-frame after a resize, unless the user is holding a focus. */
  reframe(): void {
    if (this.#focused) return
    this.#target.distance = this.homeDistance()
  }

  // ── input ──────────────────────────────────────────────────────────

  #attach(dom: HTMLElement): void {
    this.#dom = dom
    dom.addEventListener('contextmenu', (e) => e.preventDefault())

    dom.addEventListener('pointerdown', (e) => {
      capture(dom, e.pointerId)
      this.#pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      this.#ambient.setHeld(true)
      this.#spin.theta = 0
      this.#spin.phi = 0

      if (this.#pointers.size === 2) {
        this.#beginPinch()
        return
      }
      // middle or right button, or shift held, pans instead of orbiting
      this.#gesture = e.button === 1 || e.button === 2 || e.shiftKey ? 'pan' : 'orbit'
      this.#last = { x: e.clientX, y: e.clientY }
    })

    dom.addEventListener('pointermove', (e) => {
      if (!this.#pointers.has(e.pointerId)) return
      this.#pointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
      this.#ambient.note()

      if (this.#gesture === 'pinch') {
        this.#updatePinch()
        return
      }
      if (this.#gesture === null) return

      const dx = e.clientX - this.#last.x
      const dy = e.clientY - this.#last.y
      this.#last = { x: e.clientX, y: e.clientY }

      if (this.#gesture === 'orbit') {
        const next = applyDrag(this.#target, dx, dy)
        this.#spin.theta = next.theta - this.#target.theta
        this.#spin.phi = next.phi - this.#target.phi
        this.#target = next
        return
      }
      this.#pan(dx, dy)
    })

    const lift = (e: PointerEvent): void => {
      if (!this.#pointers.delete(e.pointerId)) return
      release(dom, e.pointerId)

      if (this.#pointers.size === 0) {
        this.#gesture = null
        this.#ambient.setHeld(false)
        return
      }
      // one finger left after a pinch: hand over to orbit without a jump
      const [remaining] = [...this.#pointers.values()]
      this.#last = { ...remaining! }
      this.#gesture = 'orbit'
    }
    dom.addEventListener('pointerup', lift)
    dom.addEventListener('pointercancel', lift)

    dom.addEventListener(
      'wheel',
      (e) => {
        e.preventDefault()
        this.#ambient.note()
        // trackpad pinch arrives as ctrl+wheel, and wants a finer step
        const step = e.ctrlKey ? 0.02 : 0.12
        this.#dolly(1 + Math.sign(e.deltaY) * step, { x: e.clientX, y: e.clientY })
      },
      { passive: false },
    )

    dom.addEventListener('keydown', (e) => {
      if (e.key === 'r' || e.key === 'R' || e.key === 'Home') this.recenter()
    })
  }

  #beginPinch(): void {
    const [a, b] = [...this.#pointers.values()]
    if (a === undefined || b === undefined) return
    this.#gesture = 'pinch'
    this.#pinchGap = pinchGap(a, b)
    this.#pinchMid = midpoint(a, b)
  }

  /** Two fingers: the gap dollies, the midpoint pans. */
  #updatePinch(): void {
    const [a, b] = [...this.#pointers.values()]
    if (a === undefined || b === undefined) return

    const gap = pinchGap(a, b)
    const mid = midpoint(a, b)

    if (this.#pinchGap > 8 && gap > 8) {
      this.#dolly(this.#pinchGap / gap, mid)
    }
    this.#pan(mid.x - this.#pinchMid.x, mid.y - this.#pinchMid.y)

    this.#pinchGap = gap
    this.#pinchMid = mid
  }

  /**
   * Moves the camera in or out. Away from a focus, the look target moves
   * with it toward the point under the pointer, so that point holds still on
   * the screen.
   */
  #dolly(ratio: number, toward: Point): void {
    const before = this.#target.distance
    this.#target.distance = dollyBy(before, ratio, this.#maxDistance())
    const anchor = this.#focused ? null : this.#onFleetPlane(toward)
    if (anchor === null) return

    const applied = this.#target.distance / before
    this.#lookTarget.sub(anchor).multiplyScalar(applied).add(anchor)
    this.#clampLook()
  }

  #onFleetPlane({ x, y }: Point): THREE.Vector3 | null {
    const rect = this.#dom?.getBoundingClientRect()
    if (rect === undefined) return null
    const ndc = new THREE.Vector2(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1)
    this.#raycaster.setFromCamera(ndc, this.#camera)
    return this.#raycaster.ray.intersectPlane(FLEET_PLANE, new THREE.Vector3())
  }

  /** Slide the look target across the camera's own plane. */
  #pan(dx: number, dy: number): void {
    const scale = this.#live.distance * PAN_SPEED
    this.#offset.set(-dx * scale, dy * scale, 0).applyQuaternion(this.#camera.quaternion)
    this.#lookTarget.add(this.#offset)
    this.#clampLook()
    this.#focused = false
  }

  /** Keeps the look target near the fleet. Moving it redefines "home", so releasing a focus comes back here. */
  #clampLook(): void {
    const { x, y, z } = clampPan(
      this.#lookTarget.x,
      this.#lookTarget.y,
      this.#lookTarget.z,
      Math.max(PAN_LIMIT, this.#contentRadius * 1.5),
    )
    this.#lookTarget.set(x, y, z)
    this.#home.copy(this.#lookTarget)
  }

  // ── frame ──────────────────────────────────────────────────────────

  update(ctx: FrameContext): void {
    // Freezing the phase rather than the offset means the sway resumes from
    // where it stopped instead of snapping back to centre.
    this.#ambientPhase += ctx.dt * AMBIENT_RATE * this.#ambient.level
    const sway = Math.sin(this.#ambientPhase) * AMBIENT_SWAY

    // let a throw coast to a stop
    if (this.#gesture === null && (Math.abs(this.#spin.theta) > SPIN_CUTOFF || Math.abs(this.#spin.phi) > SPIN_CUTOFF)) {
      this.#target = applyDrag(
        this.#target,
        -this.#spin.theta / 0.005,
        this.#spin.phi / 0.005,
      )
      this.#spin.theta *= SPIN_FRICTION
      this.#spin.phi *= SPIN_FRICTION
    }

    const k = ctx.ease(0.08)
    this.#live.theta += (this.#target.theta + sway - this.#live.theta) * k
    this.#live.phi += (this.#target.phi - this.#live.phi) * k
    this.#live.distance += (this.#target.distance - this.#live.distance) * k
    this.#look.lerp(this.#lookTarget, k)

    const { theta, phi, distance } = this.#live
    this.#camera.position.set(
      this.#look.x + distance * Math.sin(phi) * Math.sin(theta),
      this.#look.y + distance * Math.cos(phi),
      this.#look.z + distance * Math.sin(phi) * Math.cos(theta),
    )
    this.#camera.lookAt(this.#look)
  }
}
