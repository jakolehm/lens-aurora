import * as THREE from 'three'
import { HUES, IVORY, MUTED, REDUCED_MOTION } from '../theme.js'
import type { FrameContext } from './world.js'
import type { MotionGate } from './ambient.js'

interface Layer {
  readonly count: number
  /** shell around the look point, in view distances, so the dust fills the view at every zoom */
  readonly inner: number
  readonly outer: number
  /** screen pixels, the same however far the camera sits */
  readonly size: number
  readonly opacity: number
}

// far to near: the layers turn past each other as the camera orbits, which is what reads as depth.
// The view shows about a twentieth of a shell, hence the counts.
const LAYERS: readonly Layer[] = [
  { count: 2400, inner: 2.2, outer: 2.8, size: 2, opacity: 0.35 },
  { count: 900, inner: 1.6, outer: 2.1, size: 3, opacity: 0.45 },
  { count: 240, inner: 1.2, outer: 1.5, size: 4, opacity: 0.5 },
]
const SMALL_SHARE = 0.45

/** the aurora of the icon: green, teal, blue */
const TINTS = [HUES[3], HUES[4], HUES[6]]
const TINTED_SHARE = 0.3

const DRIFT_RATE = 0.004

const unitShellPoint = (inner: number, outer: number): THREE.Vector3 =>
  new THREE.Vector3().randomDirection().multiplyScalar(inner + Math.random() * (outer - inner))

function dustColor(): THREE.Color {
  if (Math.random() < TINTED_SHARE) return new THREE.Color(TINTS[Math.floor(Math.random() * TINTS.length)]!)
  return new THREE.Color(Math.random() < 0.5 ? IVORY : MUTED)
}

function softDot(): THREE.Texture {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 32
  const context = canvas.getContext('2d')!
  const glow = context.createRadialGradient(16, 16, 0, 16, 16, 16)
  glow.addColorStop(0, 'rgba(255,255,255,1)')
  glow.addColorStop(0.35, 'rgba(255,255,255,0.6)')
  glow.addColorStop(1, 'rgba(255,255,255,0)')
  context.fillStyle = glow
  context.fillRect(0, 0, 32, 32)
  return new THREE.CanvasTexture(canvas)
}

function makeLayer(layer: Layer, count: number, pixelRatio: number, sprite: THREE.Texture): THREE.Points {
  const positions = new Float32Array(count * 3)
  const colors = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    unitShellPoint(layer.inner, layer.outer).toArray(positions, i * 3)
    dustColor().toArray(colors, i * 3)
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3))
  return new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      size: layer.size * pixelRatio,
      sizeAttenuation: false,
      map: sprite,
      vertexColors: true,
      transparent: true,
      opacity: layer.opacity,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      fog: false,
    }),
  )
}

/** Space dust in shells around what the camera looks at: background only, never brighter or bigger than a pod. */
export class Dust {
  readonly object = new THREE.Group()
  readonly #ambient: MotionGate
  readonly #sprite = softDot()

  constructor(ambient: MotionGate, { small, pixelRatio }: { small: boolean; pixelRatio: number }) {
    this.#ambient = ambient
    for (const layer of LAYERS) {
      const count = Math.round(layer.count * (small ? SMALL_SHARE : 1))
      this.object.add(makeLayer(layer, count, pixelRatio, this.#sprite))
    }
  }

  update(ctx: FrameContext, lookPoint: THREE.Vector3, viewDistance: number): void {
    this.object.position.copy(lookPoint)
    this.object.scale.setScalar(viewDistance)
    if (!REDUCED_MOTION) this.object.rotation.y += ctx.dt * DRIFT_RATE * this.#ambient.level
  }

  dispose(): void {
    this.#sprite.dispose()
    for (const layer of this.object.children as THREE.Points[]) {
      layer.geometry.dispose()
      ;(layer.material as THREE.Material).dispose()
    }
  }
}
