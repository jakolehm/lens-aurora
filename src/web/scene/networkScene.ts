import * as THREE from 'three'
import type { EntryKind } from '../../shared/network.js'
import type { ClusterState } from '../state/cluster.js'
import type { NetworkIndex } from '../state/network.js'
import { ENTRY_HUES, LINK_GRAY, ORBIT_RATE, REDUCED_MOTION, RELATED_HUES, RING_RADIUS } from '../theme.js'
import { GAP, layOnCircle } from './circleLayout.js'
import { FlowField } from './flow.js'
import type { Picked } from './picking.js'
import { PodField } from './podField.js'
import type { PodLook } from './podLook.js'
import { Segments } from './segments.js'
import type { Tag } from './tag.js'
import type { FrameContext } from './world.js'

/** A shape per kind of entry, so where traffic comes in reads before any name does. */
const ENTRY_GLYPHS: Record<EntryKind, () => THREE.BufferGeometry> = {
  Gateway: () => new THREE.CylinderGeometry(0.13, 0.13, 0.13, 6),
  Ingress: () => new THREE.ConeGeometry(0.11, 0.22, 4),
  LoadBalancer: () => new THREE.TorusGeometry(0.11, 0.035, 6, 6),
  NodePort: () => new THREE.SphereGeometry(0.08, 10, 8),
}

const SERVICE_GLYPH_REACH = 0.12
/** room each entry takes on its ring */
const ENTRY_SPACING = 0.6
/** from the outer edge of the service clouds out to the entries */
const ENTRY_GAP = 1.2
/** how far outside its entry traffic is first seen arriving */
const INBOUND = 1.8
/** seconds between requests on one route, before jitter */
const FLOW_EVERY = 1.4
const DIM = 0.6
const SPREAD_PASSES = 32

interface Glyph {
  object: THREE.Group
  material: THREE.MeshBasicMaterial
}

interface Service extends Glyph {
  pods: PodField
}

interface Entry extends Glyph {
  /** the point outside the cluster its traffic comes from */
  inbound: THREE.Vector3
  nextAt: number
  /** which of its services the next request goes to */
  turn: number
}

function makeGlyph(parent: THREE.Object3D, geometry: THREE.BufferGeometry, color: number, pick: Picked): Glyph {
  const material = new THREE.MeshBasicMaterial({ color, transparent: true })
  const mesh = new THREE.Mesh(geometry, material)
  mesh.userData['pick'] = pick
  const object = new THREE.Group()
  object.add(mesh)
  parent.add(object)
  return { object, material }
}

function disposeGlyph({ object }: Glyph): void {
  object.removeFromParent()
  object.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return
    o.geometry.dispose()
    ;(o.material as THREE.Material).dispose()
  })
}

/** Pushes angles apart, keeping their order around the circle, until neighbours are at least `gap` apart. */
function spread(desired: ReadonlyMap<string, number>, gap: number): Map<string, number> {
  const sorted = [...desired].sort((a, b) => a[1] - b[1])
  const values = sorted.map(([, angle]) => angle)
  const n = values.length
  for (let pass = 0; n > 1 && pass < SPREAD_PASSES; pass++) {
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n
      const next = values[j]! + (j === 0 ? Math.PI * 2 : 0)
      const short = gap - (next - values[i]!)
      if (short <= 0) continue
      values[i]! -= short / 2
      values[j]! += short / 2
    }
  }
  return new Map(sorted.map(([key], i) => [key, values[i]!]))
}

const meanAngle = (angles: readonly number[]): number | null =>
  angles.length === 0
    ? null
    : Math.atan2(
        angles.reduce((sum, a) => sum + Math.sin(a), 0),
        angles.reduce((sum, a) => sum + Math.cos(a), 0),
      )

/**
 * The network lens: the services that traffic from outside reaches on a ring
 * around the control plane, their pods around them, and the entries it comes
 * in through on an outer ring, each placed in front of the services it feeds.
 */
export class NetworkScene {
  readonly group = new THREE.Group()

  readonly #rig: THREE.Group
  readonly #state: ClusterState
  readonly #index: NetworkIndex
  readonly #look: PodLook
  readonly #services = new Map<string, Service>()
  readonly #entries = new Map<string, Entry>()
  readonly #routes = new Segments(LINK_GRAY, 0.85)
  readonly #inbound = new Segments(LINK_GRAY, 0.45)
  readonly #flow: FlowField
  readonly #target = new THREE.Vector3()
  #radius = RING_RADIUS
  #outer = RING_RADIUS + ENTRY_GAP
  #orbit = 0
  /** how far the control plane's body reaches, set each frame */
  coreReach = 0

  constructor(rig: THREE.Group, state: ClusterState, index: NetworkIndex, look: PodLook) {
    this.#rig = rig
    this.#state = state
    this.#index = index
    this.#look = look
    this.#flow = new FlowField(this.group)
    this.group.add(this.#routes.lines, this.#inbound.lines)
    rig.add(this.group)
    state.onChange(() => this.reconcile())
    index.onChange(() => this.reconcile())
  }

  /** How far the layout reaches, the start of the inbound lines included. */
  radius(): number {
    return this.#outer + INBOUND / 2
  }

  podFieldFor(uid: string): PodField | null {
    for (const service of this.#services.values()) if (service.pods.has(uid)) return service.pods
    return null
  }

  entryObject(key: string): THREE.Object3D | null {
    return this.#entries.get(key)?.object ?? null
  }

  serviceObject(key: string): THREE.Object3D | null {
    return this.#services.get(key)?.object ?? null
  }

  serviceReach(key: string): number | null {
    return this.#services.get(key)?.pods.reach() ?? null
  }

  /** Entries first: where traffic comes in is what this lens is about. */
  tags(): Tag[] {
    const entries = [...this.#entries].map(([key, entry]) => ({
      text: this.#index.entry(key)?.name ?? key,
      at: entry.object.getWorldPosition(new THREE.Vector3()),
      place: 'beside' as const,
    }))
    const services = [...this.#services].map(([key, service]) => {
      const at = service.object.getWorldPosition(new THREE.Vector3())
      at.y -= service.pods.restingReach()
      return { text: this.#index.service(key)?.name ?? key, at, place: 'below' as const }
    })
    return [...entries, ...services]
  }

  reconcile(): void {
    const services = [...this.#index.services]
    const entries = [...this.#index.entries]
    const serviceKeys = new Set(services.map((s) => s.key))
    const entryKeys = new Set(entries.map((e) => e.key))

    for (const [key, service] of this.#services) {
      if (serviceKeys.has(key)) continue
      service.pods.dispose()
      disposeGlyph(service)
      this.#services.delete(key)
    }
    for (const [key, entry] of this.#entries) {
      if (entryKeys.has(key)) continue
      disposeGlyph(entry)
      this.#entries.delete(key)
    }

    for (const hop of services) {
      let service = this.#services.get(hop.key)
      if (service === undefined) {
        const glyph = makeGlyph(this.group, new THREE.TorusGeometry(0.1, 0.026, 8, 24), RELATED_HUES.Service, {
          kind: 'service',
          key: hop.key,
        })
        service = { ...glyph, pods: new PodField(glyph.object, this.#rig, this.#state, this.#look) }
        this.#services.set(hop.key, service)
      }
      service.pods.sync(hop.pods.filter((uid) => this.#state.pods.has(uid)))
    }
    for (const view of entries) {
      if (this.#entries.has(view.key)) continue
      const glyph = makeGlyph(this.group, ENTRY_GLYPHS[view.kind](), ENTRY_HUES[view.kind], { kind: 'entry', key: view.key })
      this.#entries.set(view.key, { ...glyph, inbound: new THREE.Vector3(), nextAt: Math.random() * FLOW_EVERY, turn: 0 })
    }
  }

  /** `lit` is what is selected; whatever is not on a route through it steps back. */
  update(ctx: FrameContext, lit: Picked | null, ambient: number): void {
    if (!REDUCED_MOTION) this.#orbit += ctx.dt * ORBIT_RATE * ambient
    const follow = ctx.ease(0.08)

    const keys = [...this.#services.keys()].sort()
    const placed = keys.map((key) => ({ key, reach: this.#services.get(key)!.pods.restingReach() + SERVICE_GLYPH_REACH }))
    const widest = Math.max(0, ...placed.map((p) => p.reach))
    const ring = layOnCircle(placed, Math.max(RING_RADIUS, this.coreReach + widest + GAP))
    this.#radius += (ring.radius - this.#radius) * ctx.ease(0.04)

    // each entry faces the services it feeds, so its routes stay short
    const desired = new Map<string, number>()
    for (const [key, entry] of this.#entries) {
      const angles = (this.#index.entry(key)?.services ?? []).flatMap((s) => ring.angles.get(s) ?? [])
      desired.set(key, meanAngle(angles) ?? Math.atan2(entry.object.position.y, entry.object.position.x) - this.#orbit)
    }
    const outer = Math.max(this.#radius + widest + ENTRY_GAP, (this.#entries.size * ENTRY_SPACING) / (Math.PI * 2))
    this.#outer += (outer - this.#outer) * ctx.ease(0.04)
    const angles = spread(desired, ENTRY_SPACING / this.#outer)

    const { entries: litEntries, services: litServices } = this.#lit(lit)

    for (const [key, service] of this.#services) {
      const a = (ring.angles.get(key) ?? 0) + this.#orbit
      service.object.position.lerp(this.#target.set(Math.cos(a) * this.#radius, Math.sin(a) * this.#radius, 0), follow)
      const dim = litServices === null || litServices.has(key) ? 0 : DIM
      service.material.opacity = 1 - dim
      service.pods.update(ctx, dim, ambient)
    }

    const routes: [THREE.Vector3, THREE.Vector3][] = []
    const inbound: [THREE.Vector3, THREE.Vector3][] = []
    for (const [key, entry] of this.#entries) {
      const a = (angles.get(key) ?? 0) + this.#orbit
      entry.object.position.lerp(this.#target.set(Math.cos(a) * this.#outer, Math.sin(a) * this.#outer, 0), follow)
      entry.inbound.copy(entry.object.position).setLength(this.#outer + INBOUND)
      entry.material.opacity = litEntries === null || litEntries.has(key) ? 1 : 1 - DIM
      inbound.push([entry.inbound, entry.object.position])

      const targets = (this.#index.entry(key)?.services ?? []).flatMap((s) => this.#services.get(s) ?? [])
      for (const service of targets) routes.push([entry.object.position, service.object.position])
      if (!REDUCED_MOTION && targets.length > 0 && ctx.t >= entry.nextAt) this.#send(entry, targets, ctx.t)
    }

    this.#routes.draw(routes)
    this.#inbound.draw(inbound)
    this.#flow.update(ctx)
  }

  /** One request in from outside, through the entry, on to the next of its services in turn, and to one of its pods. */
  #send(entry: Entry, targets: readonly Service[], now: number): void {
    const service = targets[entry.turn++ % targets.length]!
    const uids = service.pods.uids()
    const uid = uids[Math.floor(Math.random() * uids.length)]
    const pod = new THREE.Vector3()
    this.#flow.send(() => {
      if (entry.object.parent === null || service.object.parent === null) return null
      const hops = [entry.inbound, entry.object.position, service.object.position]
      if (uid === undefined || !service.pods.rigPositionOf(uid, pod)) return hops
      return [...hops, this.group.worldToLocal(this.#rig.localToWorld(pod))]
    })
    entry.nextAt = now + FLOW_EVERY * (0.7 + Math.random() * 0.6)
  }

  /** What stays lit around a selection: an entry with its services, or a service with its entries. */
  #lit(lit: Picked | null): { entries: Set<string> | null; services: Set<string> | null } {
    if (lit?.kind === 'entry') {
      return { entries: new Set([lit.key]), services: new Set(this.#index.entry(lit.key)?.services ?? []) }
    }
    if (lit?.kind === 'service') {
      return { entries: new Set(this.#index.entriesOf(lit.key).map((e) => e.key)), services: new Set([lit.key]) }
    }
    return { entries: null, services: null }
  }
}
