import * as THREE from 'three'
import { IVORY, LINK_GRAY } from '../theme.js'
import type { FrameContext } from './world.js'

const CAPACITY = 96

/**
 * A one-shot mote travelling a link. Nothing rides the links by default:
 * every mote means something, and it despawns when it lands.
 */
interface Mote {
  node: string
  /** 0 at the core, 1 at the node */
  t: number
  dir: 1 | -1
  speed: number
}

interface Link {
  line: THREE.Line
  geo: THREE.BufferGeometry
  mat: THREE.LineBasicMaterial
}

/** Lines from the core to each node, with ivory motes riding them. */
export class LinkField {
  readonly #rig: THREE.Group
  readonly #links = new Map<string, Link>()
  readonly #motes: Mote[] = []
  readonly #mesh: THREE.InstancedMesh
  readonly #dummy = new THREE.Object3D()
  readonly #a = new THREE.Vector3()

  constructor(rig: THREE.Group) {
    this.#rig = rig
    this.#mesh = new THREE.InstancedMesh(
      new THREE.SphereGeometry(0.035, 6, 6),
      new THREE.MeshBasicMaterial({ color: IVORY }),
      CAPACITY,
    )
    this.#mesh.frustumCulled = false
    rig.add(this.#mesh)
  }

  /** Add and remove links so they match current node membership. */
  sync(names: string[]): void {
    const wanted = new Set(names)

    for (const [name, link] of this.#links) {
      if (wanted.has(name)) continue
      link.line.removeFromParent()
      link.geo.dispose()
      link.mat.dispose()
      this.#links.delete(name)
    }

    for (const name of names) {
      if (this.#links.has(name)) continue
      const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()])
      const mat = new THREE.LineBasicMaterial({ color: LINK_GRAY, transparent: true, opacity: 0 })
      const line = new THREE.Line(geo, mat)
      line.frustumCulled = false
      this.#rig.add(line)
      this.#links.set(name, { line, geo, mat })
    }

    for (let i = this.#motes.length - 1; i >= 0; i--) {
      if (!wanted.has(this.#motes[i]!.node)) this.#motes.splice(i, 1)
    }
  }

  /** Hide the links entirely, for showcase clips about a single node. */
  setVisible(visible: boolean): void {
    this.#mesh.visible = visible
    for (const link of this.#links.values()) link.line.visible = visible
  }

  /** A scheduling decision leaving the control plane: core to node, fast. */
  dispatch(node: string): void {
    if (!this.#links.has(node) || this.#motes.length >= CAPACITY) return
    this.#motes.push({ node, t: 0, dir: 1, speed: 1.5 })
  }

  /**
   * A kubelet reporting in: node to core, unhurried. This is the cluster's
   * pulse, so when a node dies its link simply falls silent.
   */
  heartbeat(node: string): void {
    if (!this.#links.has(node) || this.#motes.length >= CAPACITY) return
    this.#motes.push({ node, t: 1, dir: -1, speed: 0.5 })
  }

  update(
    ctx: FrameContext,
    positions: Map<string, THREE.Vector3>,
    joins: Map<string, number>,
    dim: number,
  ): void {
    for (const [name, link] of this.#links) {
      const p = positions.get(name)
      if (p === undefined) continue
      const attr = link.geo.attributes['position'] as THREE.BufferAttribute
      attr.setXYZ(0, 0, 0, 0)
      attr.setXYZ(1, p.x, p.y, p.z)
      attr.needsUpdate = true
      link.mat.opacity = 0.85 * (joins.get(name) ?? 0) * (1 - dim)
    }

    let i = 0
    for (let k = this.#motes.length - 1; k >= 0; k--) {
      const mote = this.#motes[k]!
      mote.t += mote.speed * ctx.dt * mote.dir
      if (mote.t > 1 || mote.t < 0) {
        this.#motes.splice(k, 1)
        continue
      }

      const target = positions.get(mote.node)
      if (target === undefined || i >= CAPACITY) continue

      this.#a.set(0, 0, 0).lerp(target, mote.t)
      this.#a.z += Math.sin(mote.t * Math.PI) * 0.25
      this.#dummy.position.copy(this.#a)
      // fade in and out at the ends so motes arrive and depart, never blink
      const s = (0.35 + Math.sin(mote.t * Math.PI) * 0.95) * (joins.get(mote.node) ?? 0)
      this.#dummy.scale.setScalar(Math.max(s, 0.001))
      this.#dummy.updateMatrix()
      this.#mesh.setMatrixAt(i++, this.#dummy.matrix)
    }

    // park unused instances
    this.#dummy.scale.setScalar(0.0001)
    this.#dummy.updateMatrix()
    for (; i < CAPACITY; i++) this.#mesh.setMatrixAt(i, this.#dummy.matrix)

    this.#mesh.instanceMatrix.needsUpdate = true
  }
}
