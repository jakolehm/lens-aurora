import * as THREE from 'three'
import type { NodeView } from '../../shared/protocol.js'
import type { ClusterState } from '../state/cluster.js'
import { CORE_BODY_REACH, CoreObject, type CoreLoad } from './coreObject.js'
import { PodField } from './podField.js'
import type { PodLook } from './podLook.js'
import { shareOfAllocatable } from './metricsVisual.js'
import type { FrameContext } from './world.js'

/** How far apart stacked control planes sit, before pod clouds are counted. */
const SPREAD = 0.66

/**
 * The core of a cluster whose control plane is not among its nodes, as on
 * EKS, GKE and AKS. No node has this name, so it carries no pods and no
 * conditions; it is there so the ring has its centre and scheduling its source.
 */
export const MANAGED_CORE = ''

/**
 * The control plane, however many machines it happens to be.
 *
 * A single-master cluster is one octahedron at the origin, exactly as before.
 * An HA cluster is three, held in a tight constellation at the centre, because
 * a highly available control plane is still one logical thing and should read
 * as one. Rendering only the first and dropping the rest, which is what the
 * scene used to do, quietly lied about most production clusters.
 */
export class CorePlane {
  readonly group = new THREE.Group()
  readonly cores = new Map<string, CoreObject>()

  readonly #pods = new Map<string, PodField>()
  readonly #rig: THREE.Group
  readonly #state: ClusterState
  readonly #look: PodLook

  constructor(
    rig: THREE.Group,
    state: ClusterState,
    look: PodLook,
  ) {
    this.#rig = rig
    this.#state = state
    this.#look = look
    rig.add(this.group)
    state.onChange(() => this.reconcile())
  }

  #members(): NodeView[] {
    return [...this.#state.nodes.values()]
      .filter((n) => n.role === 'control-plane')
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  /** The one the camera and the scheduling animations treat as "the core". */
  get primary(): CoreObject | null {
    return this.cores.values().next().value ?? null
  }

  names(): string[] {
    return [...this.cores.keys()]
  }

  has(name: string): boolean {
    return this.cores.has(name)
  }

  podFieldFor(name: string): PodField | null {
    return this.#pods.get(name) ?? null
  }

  positionOf(name: string): THREE.Vector3 | null {
    const core = this.cores.get(name)
    return core === undefined ? null : core.object.position
  }

  /** Widest distance any control-plane body reaches from the group centre, pods left out. */
  bodyReach(): number {
    let widest = 0
    for (const core of this.cores.values()) widest = Math.max(widest, core.object.position.length() + CORE_BODY_REACH)
    return widest
  }

  /** Widest distance any control-plane pod sits from the group centre. */
  reach(): number {
    let widest = 0
    for (const [name, field] of this.#pods) {
      const offset = this.cores.get(name)?.object.position.length() ?? 0
      widest = Math.max(widest, offset + field.reach())
    }
    return widest
  }

  reconcile(): void {
    const members = this.#members()
    const managed = members.length === 0 && this.#state.nodes.size > 0
    const wanted = new Set(managed ? [MANAGED_CORE] : members.map((n) => n.name))

    for (const [name, core] of this.cores) {
      if (wanted.has(name)) continue
      core.object.removeFromParent()
      this.#pods.get(name)?.dispose()
      this.#pods.delete(name)
      this.cores.delete(name)
    }

    for (const name of wanted) {
      if (this.cores.has(name)) continue
      const core = new CoreObject(this.group, name)
      this.cores.set(name, core)
      if (name === MANAGED_CORE) continue
      this.#pods.set(name, new PodField(core.object, this.#rig, this.#state, this.#look))
    }

    // one core sits dead centre; several form a ring small enough to still
    // read as a single mass
    const total = this.cores.size
    const radius = total === 1 ? 0 : SPREAD + total * 0.05
    for (const [i, [name, core]] of [...this.cores].entries()) {
      const a = (i / Math.max(total, 1)) * Math.PI * 2
      core.object.position.set(Math.cos(a) * radius, Math.sin(a) * radius * 0.72, 0)
      this.#pods.get(name)?.sync(this.#state.podsOn(name).map((p) => p.uid))
    }
  }

  update(ctx: FrameContext, boot: number, ambient: number): void {
    for (const [name, core] of this.cores) {
      const m = this.#state.metrics.nodes[name]
      const load: CoreLoad = {
        cpu: shareOfAllocatable(m?.cpuPercent ?? 0),
        memory: shareOfAllocatable(m?.memPercent ?? 0),
      }
      core.setView(this.#state.nodes.get(name) ?? null)
      core.update(ctx, boot, load)
      this.#pods.get(name)?.update(ctx, 0, ambient)
    }
  }

  /** A scheduling decision came from the control plane as a whole. */
  pulse(strength = 1): void {
    for (const core of this.cores.values()) core.pulse(strength)
  }

  /** One member beat; the others did not. */
  pulseNode(name: string, strength = 1): void {
    this.cores.get(name)?.pulse(strength)
  }

  /** The workloads lens puts these pods around their workloads instead. */
  set podsShown(shown: boolean) {
    for (const field of this.#pods.values()) field.shown = shown
  }

  setFocus(name: string | null): void {
    for (const [n, core] of this.cores) core.setFocus(n === name ? 1 : 0)
  }
}
