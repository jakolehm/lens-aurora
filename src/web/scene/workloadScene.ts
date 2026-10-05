import * as THREE from 'three'
import type { ClusterState } from '../state/cluster.js'
import type { NamespacePalette } from '../state/namespacePalette.js'
import type { WorkloadIndex } from '../state/workloads.js'
import { LINK_GRAY, ORBIT_RATE, REDUCED_MOTION, RING_RADIUS } from '../theme.js'
import { GAP, layOnCircle } from './circleLayout.js'
import { LinkField } from './links.js'
import { NamespaceObject } from './namespaceObject.js'
import { PodField } from './podField.js'
import type { PodLook } from './podLook.js'
import { Segments } from './segments.js'
import type { Tag } from './tag.js'
import { WorkloadObject } from './workloadObject.js'
import type { FrameContext } from './world.js'

const SPIN_RATE = 0.06
/** the balloon turns about the vertical, so its depth shows as it goes round */
const SPIN_AXIS = new THREE.Vector3(0, 1, 0)
const DIM = 0.6

interface Member {
  object: WorkloadObject
  pods: PodField
  namespace: string
}


const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))
/** Measured: with this, no two of up to 150 seeds on the sphere come closer than one seed size. */
const SEED_SPACING = 0.33

/**
 * Packs equal things over a sphere, a balloon around the namespace. A sphere
 * has four times the surface of a disc of the same radius, so a namespace of
 * sixty one-pod workloads stays small; its centre stays free for the
 * namespace itself. The half-step offset keeps seeds from crowding the poles.
 */
function packSphere(keys: readonly string[], size: number): { radius: number; seeds: Map<string, THREE.Vector3> } {
  const n = keys.length
  const seeds = new Map(
    keys.map((key, i) => {
      const y = 1 - (2 * i + 1) / n
      const r = Math.sqrt(Math.max(1 - y * y, 0))
      return [key, new THREE.Vector3(Math.cos(i * GOLDEN_ANGLE) * r, y, Math.sin(i * GOLDEN_ANGLE) * r)]
    }),
  )
  return { radius: Math.max(SEED_SPACING * size * Math.sqrt(n), size / 2), seeds }
}

/**
 * The workloads lens: namespaces on the ring around the control plane, each
 * namespace's workloads around it, and each workload's pods around that.
 */
export class WorkloadScene {
  readonly group = new THREE.Group()

  readonly #rig: THREE.Group
  readonly #state: ClusterState
  readonly #index: WorkloadIndex
  readonly #look: PodLook
  readonly #palette: NamespacePalette
  readonly #namespaces = new Map<string, NamespaceObject>()
  readonly #members = new Map<string, Member>()
  readonly #reaches = new Map<string, number>()
  readonly #links: LinkField
  readonly #ties = new Segments(LINK_GRAY, 0.85)
  readonly #target = new THREE.Vector3()
  #radius = RING_RADIUS
  #widest = 0
  #orbit = 0
  #spin = 0
  /** how far the control plane's own reach extends, set each frame */
  coreReach = 0

  constructor(rig: THREE.Group, state: ClusterState, index: WorkloadIndex, look: PodLook, palette: NamespacePalette) {
    this.#rig = rig
    this.#state = state
    this.#index = index
    this.#look = look
    this.#palette = palette
    this.#links = new LinkField(this.group)
    this.group.add(this.#ties.lines)
    rig.add(this.group)
    state.onChange(() => this.reconcile())
    index.onChange(() => this.reconcile())
  }

  /** How far the whole layout reaches from the control plane. */
  radius(): number {
    return this.#radius + this.#widest
  }

  podFieldFor(uid: string): PodField | null {
    const key = this.#index.ofPod(uid)?.key
    return key === undefined ? null : (this.#members.get(key)?.pods ?? null)
  }

  workloadObject(key: string): THREE.Object3D | null {
    return this.#members.get(key)?.object.object ?? null
  }

  namespaceObject(name: string): THREE.Object3D | null {
    return this.#namespaces.get(name)?.object ?? null
  }

  workloadReach(key: string): number | null {
    return this.#members.get(key)?.pods.reach() ?? null
  }

  namespaceReach(name: string): number | null {
    return this.#reaches.get(name) ?? null
  }

  /** Largest namespace first, so its name wins where names would collide. */
  tags(): Tag[] {
    const byReach = [...this.#namespaces.values()].sort(
      (a, b) => (this.#reaches.get(b.name) ?? 0) - (this.#reaches.get(a.name) ?? 0),
    )
    return byReach.map((ns) => {
      const at = ns.object.getWorldPosition(new THREE.Vector3())
      at.y -= this.#reaches.get(ns.name) ?? 0
      return { text: ns.name, at, place: 'below' as const }
    })
  }

  reconcile(): void {
    const workloads = [...this.#index.all]
    const keys = new Set(workloads.map((w) => w.key))
    const names = new Set(workloads.map((w) => w.namespace))

    for (const [key, member] of this.#members) {
      if (keys.has(key)) continue
      member.pods.dispose()
      member.object.dispose()
      this.#members.delete(key)
    }
    for (const [name, ns] of this.#namespaces) {
      if (names.has(name)) continue
      ns.dispose()
      this.#namespaces.delete(name)
      this.#reaches.delete(name)
    }

    for (const name of names) {
      if (!this.#namespaces.has(name)) {
        this.#namespaces.set(name, new NamespaceObject(this.group, name, this.#palette.colorOf(name)))
      }
    }
    for (const workload of workloads) {
      let member = this.#members.get(workload.key)
      if (member === undefined) {
        const object = new WorkloadObject(this.group, workload)
        // a new workload grows out of its namespace rather than out of the core
        object.object.position.copy(this.#namespaces.get(workload.namespace)!.object.position)
        member = { object, pods: new PodField(object.object, this.#rig, this.#state, this.#look), namespace: workload.namespace }
        this.#members.set(workload.key, member)
      }
      member.pods.sync(workload.pods.filter((uid) => this.#state.pods.has(uid)))
    }

    this.#links.sync([...names].sort())
  }

  /** `lit` is the namespace in focus, if any; the others step back. */
  update(ctx: FrameContext, lit: string | null, ambient: number): void {
    if (!REDUCED_MOTION) {
      this.#orbit += ctx.dt * ORBIT_RATE * ambient
      this.#spin += ctx.dt * SPIN_RATE * ambient
    }

    // spaced by the pods at rest: reserving room for full heat everywhere
    // doubled every gap for the sake of the odd pod near its limit
    const inner = new Map<string, { radius: number; seeds: Map<string, THREE.Vector3>; keys: string[] }>()
    for (const name of [...this.#namespaces.keys()].sort()) {
      const keys = [...this.#members].filter(([, m]) => m.namespace === name).map(([key]) => key).sort()
      const widest = Math.max(0, ...keys.map((key) => this.#members.get(key)!.pods.restingReach()))
      const balloon = packSphere(keys, 2 * widest + GAP)
      inner.set(name, { ...balloon, keys })
      this.#reaches.set(name, balloon.radius + widest)
    }

    const outer = [...inner.keys()].map((key) => ({ key, reach: this.#reaches.get(key)! }))
    this.#widest = Math.max(0, ...outer.map((p) => p.reach))
    const ring = layOnCircle(outer, Math.max(RING_RADIUS, this.coreReach + this.#widest + GAP))
    this.#radius += (ring.radius - this.#radius) * ctx.ease(0.04)

    const positions = new Map<string, THREE.Vector3>()
    const joins = new Map<string, number>()
    const ties: [THREE.Vector3, THREE.Vector3][] = []
    const follow = ctx.ease(0.08)

    const turn = new THREE.Quaternion().setFromAxisAngle(SPIN_AXIS, this.#spin)
    for (const [name, { radius, seeds, keys }] of inner) {
      const ns = this.#namespaces.get(name)!
      const a = (ring.angles.get(name) ?? 0) + this.#orbit
      ns.object.position.lerp(this.#target.set(Math.cos(a) * this.#radius, Math.sin(a) * this.#radius, 0), follow)
      positions.set(name, ns.object.position)
      joins.set(name, 1)

      const dim = lit !== null && lit !== name ? DIM : 0
      ns.update(ctx.dt, this.#reaches.get(name) ?? 0, dim)

      for (const key of keys) {
        const member = this.#members.get(key)!
        this.#target.copy(seeds.get(key)!).applyQuaternion(turn).multiplyScalar(radius).add(ns.object.position)
        member.object.object.position.lerp(this.#target, follow)
        ties.push([ns.object.position, member.object.object.position])

        const uids = member.pods.uids()
        const ready = uids.filter((uid) => this.#state.pods.get(uid)?.ready === true).length
        member.object.update(ctx.dt, ctx.ease(0.05), uids.length === 0 ? 1 : ready / uids.length)
        member.pods.update(ctx, dim, ambient)
      }
    }

    this.#ties.draw(ties)
    this.#links.update(ctx, positions, joins, 0)
  }
}
