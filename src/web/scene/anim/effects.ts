import * as THREE from 'three'
import type { FrameContext } from '../world.js'
import { easeOutCubic, pulse } from './ease.js'

interface Hoop {
  mesh: THREE.Mesh
  age: number
  life: number
  radius: number
}

interface Spray {
  points: THREE.Points
  velocities: Float32Array
  age: number
  life: number
}

interface Ghost {
  mesh: THREE.Mesh
  from: THREE.Vector3
  to: THREE.Vector3
  age: number
  life: number
  onArrive: () => void
}

/**
 * Short-lived visual props that outlive the object that spawned them.
 * Everything here lives in rig-local space, the same space PodField
 * reports positions in.
 */
export class Effects {
  readonly #root: THREE.Object3D
  readonly #hoops: Hoop[] = []
  readonly #sprays: Spray[] = []
  readonly #ghosts: Ghost[] = []

  constructor(root: THREE.Object3D) {
    this.#root = root
  }

  /** An expanding hoop, for readiness and shockwaves. */
  pulseRing(at: THREE.Vector3, color: number, radius = 0.35, life = 0.7): void {
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(0.9, 1, 32),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide }),
    )
    mesh.position.copy(at)
    mesh.scale.setScalar(0.0001)
    this.#root.add(mesh)
    this.#hoops.push({ mesh, age: 0, life, radius })
  }

  /** A puff of motes drifting outward, for dissolution. */
  spray(at: THREE.Vector3, color: number, count = 24, life = 1.1): void {
    const geo = new THREE.BufferGeometry()
    const pos = new Float32Array(count * 3)
    const vel = new Float32Array(count * 3)
    const dir = new THREE.Vector3()
    for (let i = 0; i < count; i++) {
      pos[i * 3] = at.x
      pos[i * 3 + 1] = at.y
      pos[i * 3 + 2] = at.z
      dir
        .set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)
        .normalize()
        .multiplyScalar(0.25 + Math.random() * 0.55)
      vel[i * 3] = dir.x
      vel[i * 3 + 1] = dir.y
      vel[i * 3 + 2] = dir.z
    }
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    const points = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ color, size: 0.035, transparent: true, opacity: 1 }),
    )
    this.#root.add(points)
    this.#sprays.push({ points, velocities: vel, age: 0, life })
  }

  /** A wireframe cube arcing between two nodes, for migration. */
  ghostTrail(from: THREE.Vector3, to: THREE.Vector3, color: number, onArrive: () => void, life = 1.2): void {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.09, 0.09, 0.09),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, wireframe: true }),
    )
    mesh.position.copy(from)
    this.#root.add(mesh)
    this.#ghosts.push({ mesh, from: from.clone(), to: to.clone(), age: 0, life, onArrive })
  }

  update(ctx: FrameContext): void {
    this.#updateHoops(ctx)
    this.#updateSprays(ctx)
    this.#updateGhosts(ctx)
  }

  #updateHoops(ctx: FrameContext): void {
    for (let i = this.#hoops.length - 1; i >= 0; i--) {
      const h = this.#hoops[i]!
      h.age += ctx.dt
      const p = Math.min(h.age / h.life, 1)
      h.mesh.scale.setScalar(Math.max(easeOutCubic(p) * h.radius, 0.0001))
      ;(h.mesh.material as THREE.MeshBasicMaterial).opacity = (1 - p) * 0.9
      if (p < 1) continue
      this.#discard(h.mesh)
      this.#hoops.splice(i, 1)
    }
  }

  #updateSprays(ctx: FrameContext): void {
    for (let i = this.#sprays.length - 1; i >= 0; i--) {
      const s = this.#sprays[i]!
      s.age += ctx.dt
      const p = Math.min(s.age / s.life, 1)
      const attr = s.points.geometry.attributes['position'] as THREE.BufferAttribute
      const arr = attr.array as Float32Array
      for (let k = 0; k < arr.length; k++) arr[k] = arr[k]! + s.velocities[k]! * ctx.dt
      attr.needsUpdate = true
      ;(s.points.material as THREE.PointsMaterial).opacity = 1 - p
      if (p < 1) continue
      this.#discard(s.points)
      this.#sprays.splice(i, 1)
    }
  }

  #updateGhosts(ctx: FrameContext): void {
    for (let i = this.#ghosts.length - 1; i >= 0; i--) {
      const g = this.#ghosts[i]!
      g.age += ctx.dt
      const p = Math.min(g.age / g.life, 1)
      g.mesh.position.lerpVectors(g.from, g.to, easeOutCubic(p))
      // bow the path outward so it arcs across the ring instead of cutting
      // straight through the core
      g.mesh.position.multiplyScalar(1 + pulse(p) * 0.35)
      g.mesh.rotation.set(p * 7, p * 5, 0)
      ;(g.mesh.material as THREE.MeshBasicMaterial).opacity = 0.85 * (1 - p * 0.4)
      if (p < 1) continue
      g.onArrive()
      this.#discard(g.mesh)
      this.#ghosts.splice(i, 1)
    }
  }

  #discard(o: THREE.Mesh | THREE.Points): void {
    o.removeFromParent()
    o.geometry.dispose()
    ;(o.material as THREE.Material).dispose()
  }
}
