import * as THREE from 'three'
import { IVORY } from '../theme.js'
import type { FrameContext } from './world.js'

const CAPACITY = 240
/** world units a request travels per second: slow enough to follow by eye */
const SPEED = 1.6
const PARKED = new THREE.Matrix4().makeScale(0.0001, 0.0001, 0.0001)

/** A route a mote follows, read again every frame because the points it passes keep moving. */
export type Route = () => readonly THREE.Vector3[] | null

interface Mote {
  route: Route
  /** distance travelled along the route */
  along: number
}

/** Motes riding routes from outside into the cluster, one draw call for all of them. */
export class FlowField {
  readonly #mesh: THREE.InstancedMesh
  readonly #motes: Mote[] = []
  readonly #dummy = new THREE.Object3D()
  readonly #at = new THREE.Vector3()

  constructor(parent: THREE.Object3D) {
    this.#mesh = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.03, 6, 6),
      new THREE.MeshBasicMaterial({ color: IVORY }),
      CAPACITY,
    )
    this.#mesh.frustumCulled = false
    for (let i = 0; i < CAPACITY; i++) this.#mesh.setMatrixAt(i, PARKED)
    parent.add(this.#mesh)
  }

  send(route: Route): void {
    if (this.#motes.length < CAPACITY) this.#motes.push({ route, along: 0 })
  }

  update(ctx: FrameContext): void {
    let i = 0
    for (let k = this.#motes.length - 1; k >= 0; k--) {
      const mote = this.#motes[k]!
      const points = mote.route()
      mote.along += ctx.dt * SPEED
      if (points === null || !this.#place(points, mote.along)) {
        this.#motes.splice(k, 1)
        continue
      }
      this.#dummy.position.copy(this.#at)
      this.#dummy.updateMatrix()
      this.#mesh.setMatrixAt(i++, this.#dummy.matrix)
    }
    for (; i < CAPACITY; i++) this.#mesh.setMatrixAt(i, PARKED)
    this.#mesh.instanceMatrix.needsUpdate = true
  }

  /** Puts the mote `along` units down the polyline; false once it has arrived. */
  #place(points: readonly THREE.Vector3[], along: number): boolean {
    let left = along
    for (let i = 1; i < points.length; i++) {
      const from = points[i - 1]!
      const to = points[i]!
      const length = from.distanceTo(to)
      if (left <= length) {
        this.#at.lerpVectors(from, to, length === 0 ? 1 : left / length)
        return true
      }
      left -= length
    }
    return false
  }
}
