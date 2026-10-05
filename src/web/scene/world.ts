import * as THREE from 'three'
import { BG, FOG_NEAR_SCALE, FOG_SPAN_SCALE, MUTED, easeFactor } from '../theme.js'
import { Ambient, type MotionGate } from './ambient.js'

export interface FrameContext {
  /** seconds since start */
  t: number
  /** clamped delta, safe to integrate with */
  dt: number
  /** unclamped delta, for the easing factor */
  rawDt: number
  ease(k: number): number
}

export type FrameFn = (ctx: FrameContext) => void

/** What a scene part needs from the space it lives in: where to hang, and when to move. */
export interface Space {
  readonly rig: THREE.Group
  readonly ambient: MotionGate
}

const FAR_PLANE = 400
const DUST_COUNT = 320
const DUST_COUNT_SMALL = 140

const isSmall = (canvas: HTMLCanvasElement): boolean => Math.min(canvas.clientWidth, canvas.clientHeight) < 620

/**
 * Owns the renderer, the camera, the fog, the dust and the frame loop.
 * Everything else registers a FrameFn, so the loop lives in exactly one place.
 */
export class World implements Space {
  readonly scene = new THREE.Scene()
  readonly camera = new THREE.PerspectiveCamera(46, 1, 0.1, FAR_PLANE)
  readonly rig = new THREE.Group()
  /** gates every automatic motion in the scene */
  readonly ambient = new Ambient()
  readonly #canvas: HTMLCanvasElement
  readonly #renderer: THREE.WebGLRenderer

  readonly #start = performance.now()
  readonly #frames: FrameFn[] = []
  readonly #resizeHandlers: (() => void)[] = []
  readonly #fog: THREE.Fog
  readonly #resizeObserver: ResizeObserver
  /** pixels on the left that an overlay covers, so the cluster centres in what is left */
  readonly #leftInset: (width: number, height: number) => number
  #lastT = 0
  #viewDistance = 9

  constructor(
    canvas: HTMLCanvasElement,
    opts: { leftInset?: (width: number, height: number) => number; background?: number } = {},
  ) {
    this.#canvas = canvas
    this.#leftInset = opts.leftInset ?? (() => 0)
    this.#renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    this.#renderer.setPixelRatio(Math.min(devicePixelRatio, 2))

    const background = opts.background ?? BG
    this.#fog = new THREE.Fog(background, 9, 22)
    this.scene.fog = this.#fog
    this.#renderer.setClearColor(background, 1)
    this.scene.add(this.rig)
    this.scene.add(this.#makeDust())

    this.camera.position.set(0, 0.8, 9)
    this.camera.lookAt(0, 0, 0)

    this.#resize()
    // a Lens tab resizes with its panes, not only with the window
    this.#resizeObserver = new ResizeObserver(() => this.#resize())
    this.#resizeObserver.observe(canvas)
    this.#renderer.setAnimationLoop(() => this.#frame())
  }

  add(fn: FrameFn): void {
    this.#frames.push(fn)
  }

  /** Called after the camera has been resized. */
  onResize(fn: () => void): void {
    this.#resizeHandlers.push(fn)
  }

  /** How far the camera currently sits, so the fog can track it, and the far plane reach past the fleet. */
  setViewDistance(distance: number): void {
    this.#viewDistance = distance
    const far = Math.max(FAR_PLANE, distance * 3)
    if (Math.abs(far - this.camera.far) < 1) return
    this.camera.far = far
    this.camera.updateProjectionMatrix()
  }

  dispose(): void {
    this.#resizeObserver.disconnect()
    this.#renderer.setAnimationLoop(null)
    this.#renderer.dispose()
    this.#renderer.forceContextLoss()
  }

  #frame(): void {
    const t = (performance.now() - this.#start) / 1000
    const rawDt = t - this.#lastT
    this.#lastT = t

    const ctx: FrameContext = {
      t,
      dt: Math.min(rawDt, 0.05),
      rawDt,
      ease: (k) => easeFactor(k, rawDt),
    }

    // the ambient gate is resolved before anything reads it
    this.ambient.update(ctx)

    for (const fn of this.#frames) fn(ctx)

    // depth cue: what sits behind the look target fades into the dark
    this.#fog.near = this.#viewDistance * FOG_NEAR_SCALE
    this.#fog.far = this.#fog.near + this.#viewDistance * FOG_SPAN_SCALE

    this.#renderer.render(this.scene, this.camera)
  }

  #makeDust(): THREE.Points {
    const count = isSmall(this.#canvas) ? DUST_COUNT_SMALL : DUST_COUNT
    const geo = new THREE.BufferGeometry()
    const pos = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 24
      pos[i * 3 + 1] = (Math.random() - 0.5) * 14
      pos[i * 3 + 2] = -3 - Math.random() * 14
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    return new THREE.Points(
      geo,
      new THREE.PointsMaterial({ color: MUTED, size: 0.02, transparent: true, opacity: 0.55 }),
    )
  }

  #resize(): void {
    const w = this.#canvas.clientWidth
    const h = this.#canvas.clientHeight
    if (w === 0 || h === 0) return
    this.#renderer.setSize(w, h, false)
    // project for the uncovered area only, then widen the view back over the
    // overlay: framing and centring both follow what the user can see
    const inset = Math.min(this.#leftInset(w, h), w / 2)
    this.camera.aspect = (w - inset) / h
    this.camera.setViewOffset(w - inset, h, -inset, 0, w, h)
    this.camera.updateProjectionMatrix()
    for (const fn of this.#resizeHandlers) fn()
  }
}
