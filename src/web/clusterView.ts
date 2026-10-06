import * as THREE from 'three'
import type { SemanticEvent, ServerMessage } from '../shared/protocol.js'
import type { ResourceRef } from '../shared/resource.js'
import { Effects } from './scene/anim/effects.js'
import { Ambient, type MotionGate } from './scene/ambient.js'
import { dispatchNodeEvent } from './scene/anim/node/index.js'
import { dispatchPodEvent } from './scene/anim/pod/index.js'
import { AnimQueue } from './scene/anim/queue.js'
import type { AnimContext } from './scene/anim/types.js'
import { CorePlane } from './scene/corePlane.js'
import { NetworkScene } from './scene/networkScene.js'
import { CLUSTER_TAG, type Picked } from './scene/picking.js'
import type { PodField } from './scene/podField.js'
import type { PodLook } from './scene/podLook.js'
import { Ring } from './scene/ring.js'
import type { Tag } from './scene/tag.js'
import { WorkloadOverlay } from './scene/workloadOverlay.js'
import { WorkloadScene } from './scene/workloadScene.js'
import type { FrameContext, Space } from './scene/world.js'
import { ClusterState } from './state/cluster.js'
import type { ActiveLens, LensName } from './state/lens.js'
import type { NamespacePalette } from './state/namespacePalette.js'
import type { NetworkIndex } from './state/network.js'
import type { WorkloadIndex } from './state/workloads.js'
import { REDUCED_MOTION, RIG_SPIN_RATE, clamp01, smooth } from './theme.js'

const ENTRY_FOCUS_REACH = 1.5

const found = new THREE.Vector3()

const groupOf = (apiVersion: string): string => apiVersion.split('/')[0] ?? ''

export interface ClusterViewDeps {
  workloads: WorkloadIndex
  network: NetworkIndex
  look: PodLook
  lens: ActiveLens
  palette: NamespacePalette
}

/**
 * One cluster inside the shared space: its own state, control plane and
 * animations, hung on a group of its own so the fleet can place it. Three
 * layouts share the control plane, one per lens: nodes on the ring,
 * namespaces with their workloads, or the paths in from outside.
 */
export class ClusterView {
  readonly state = new ClusterState()
  /** where the fleet places this cluster; the spin happens inside it */
  readonly anchor = new THREE.Group()
  readonly workloads: WorkloadIndex
  readonly network: NetworkIndex

  readonly #space: Space
  /** held while the pointer is over this cluster */
  readonly #still = new Ambient()
  /** the fleet's gate and this cluster's own: either one stops it */
  readonly #gate: MotionGate
  readonly #lens: ActiveLens
  readonly #rig = new THREE.Group()
  /** the nodes lens's ring, folded away while another lens is on */
  readonly #nodesLayout = new THREE.Group()
  readonly #cores: CorePlane
  readonly #ring: Ring
  readonly #workloadScene: WorkloadScene
  readonly #networkScene: NetworkScene
  readonly #queue = new AnimQueue()
  readonly #effects: Effects
  readonly #overlay = new WorkloadOverlay()
  readonly #animCtx: AnimContext
  /** eased 0..1 per lens, how far its layout is unfolded */
  readonly #presence: Record<LensName, number> = { nodes: 1, workloads: 0, network: 0 }

  constructor(
    readonly id: string,
    readonly name: string,
    space: Space,
    { workloads, network, look, lens, palette }: ClusterViewDeps,
  ) {
    this.#space = space
    const still = this.#still
    this.#gate = { get level() { return Math.min(space.ambient.level, still.level) } }
    this.#lens = lens
    this.workloads = workloads
    this.network = network
    this.anchor.userData[CLUSTER_TAG] = id
    this.anchor.add(this.#rig)
    this.#rig.add(this.#nodesLayout)
    space.rig.add(this.anchor)

    this.#cores = new CorePlane(this.#rig, this.state, look)
    this.#ring = new Ring({ rig: this.#nodesLayout, ambient: this.#gate }, this.state, look)
    this.#workloadScene = new WorkloadScene(this.#rig, this.state, workloads, look, palette)
    this.#networkScene = new NetworkScene(this.#rig, this.state, network, look)
    this.#effects = new Effects(this.#rig)

    this.#animCtx = {
      queue: this.#queue,
      ring: this.#ring,
      core: this.#cores,
      state: this.state,
      effects: this.#effects,
      fieldFor: (uid) => this.#fieldFor(uid),
      nodePosition: (name) => this.#cores.positionOf(name) ?? this.#ring.positionOf(name),
    }
  }

  /** Applies a message and hands back the events it carried, for the rail. */
  apply(message: ServerMessage): SemanticEvent[] {
    const events = this.state.apply(message)
    this.#animate(events)
    return events
  }

  /** How far this cluster reaches from its centre, pods included, in the layout the lens shows. */
  radius(): number {
    if (this.#lens.name === 'workloads') return this.#workloadScene.radius()
    if (this.#lens.name === 'network') return this.#networkScene.radius()
    return this.#ring.radius + this.#cores.reach() * 0.5
  }

  /** How far a target and what circles it reach, for the camera to fit; null for a fixed close-up. */
  reachOf(target: Picked): number | null {
    // outside the nodes lens the control plane is the hub of everything, so it is seen with all of it
    if (target.kind === 'core' && this.#lens.name !== 'nodes') return this.radius()
    if (target.kind === 'service') return this.#networkScene.serviceReach(target.key)
    // an entry is small, but what matters is the traffic arriving at it, so leave room around it
    if (target.kind === 'entry') return ENTRY_FOCUS_REACH
    if (target.kind === 'namespace') return this.#workloadScene.namespaceReach(target.name)
    if (target.kind !== 'workload') return null
    const pods = this.#workloadScene.workloadReach(target.key)
    return pods === null ? null : WorkloadOverlay.reach(pods)
  }

  /** Names to show, most wanted first: what the selected workload uses, then the layout's own. */
  tags(): Tag[] {
    return [
      ...this.#overlay.tags(),
      ...(this.#presence.workloads > 0.5 ? this.#workloadScene.tags() : []),
      ...(this.#presence.network > 0.5 ? this.#networkScene.tags() : []),
    ]
  }

  /** World position of a picked object of this cluster, or false once it is gone. */
  positionOf(picked: Picked, out: THREE.Vector3): boolean {
    if (picked.kind === 'core') {
      const member = this.#cores.cores.get(picked.name)
      if (member === undefined) return false
      member.object.getWorldPosition(out)
      return true
    }

    if (picked.kind === 'node') {
      const node = this.#ring.nodes.get(picked.name)
      if (node === undefined) return false
      node.object.getWorldPosition(out)
      return true
    }

    if (picked.kind !== 'pod') {
      const object =
        picked.kind === 'namespace'
          ? this.#workloadScene.namespaceObject(picked.name)
          : picked.kind === 'workload'
            ? this.#workloadScene.workloadObject(picked.key)
            : picked.kind === 'entry'
              ? this.#networkScene.entryObject(picked.key)
              : this.#networkScene.serviceObject(picked.key)
      if (object === null) return false
      object.getWorldPosition(out)
      return true
    }

    const field = this.#fieldFor(picked.uid)
    if (field === null || !field.rigPositionOf(picked.uid, out)) return false
    this.#rig.localToWorld(out)
    return true
  }

  /** What stands for a resource in this cluster, once it is there to be shown. */
  find(ref: ResourceRef): Picked | null {
    const target = this.#targetOf(ref)
    return target !== null && this.positionOf(target, found) ? target : null
  }

  #targetOf({ kind, apiVersion, namespace = '', name }: ResourceRef): Picked | null {
    switch (kind) {
      case 'Pod': {
        const pod = [...this.state.pods.values()].find((p) => p.namespace === namespace && p.name === name)
        return pod === undefined ? null : { kind: 'pod', uid: pod.uid }
      }
      case 'Node':
        return { kind: this.#cores.cores.has(name) ? 'core' : 'node', name }
      case 'Namespace':
        return { kind: 'namespace', name }
      case 'Service':
      case 'Ingress':
      case 'Gateway': {
        const entry = [...this.network.entries].find(
          (e) => e.resource.kind === kind && groupOf(e.resource.apiVersion) === groupOf(apiVersion) && e.namespace === namespace && e.name === name,
        )
        if (entry !== undefined) return { kind: 'entry', key: entry.key }
        return kind === 'Service' ? { kind: 'service', key: `${namespace}/${name}` } : null
      }
      default:
        return { kind: 'workload', key: `${namespace}/${kind}/${name}` }
    }
  }

  setHovered(hovered: boolean): void {
    this.#still.setHovered(hovered)
  }

  update(ctx: FrameContext, focused: Picked | null): void {
    const boot = REDUCED_MOTION ? 1 : smooth(clamp01(ctx.t / 0.55))
    this.#still.update(ctx)
    const ambient = this.#gate.level

    // the slow drift that keeps the cluster feeling alive
    if (!REDUCED_MOTION) this.#rig.rotation.z += ctx.dt * RIG_SPIN_RATE * ambient

    // one layout folds into the control plane as the next unfolds out of it
    for (const name of Object.keys(this.#presence) as LensName[]) {
      const want = this.#lens.name === name ? 1 : 0
      this.#presence[name] = REDUCED_MOTION ? want : this.#presence[name] + (want - this.#presence[name]) * ctx.ease(0.06)
    }
    this.#fold(this.#nodesLayout, this.#presence.nodes)
    this.#fold(this.#workloadScene.group, this.#presence.workloads)
    this.#fold(this.#networkScene.group, this.#presence.network)
    this.#cores.podsShown = this.#presence.nodes > 0.5

    // ease the focus blend so the chosen object grows and its peers dim
    for (const [name, node] of this.#ring.nodes) {
      const want = focused?.kind === 'node' && focused.name === name ? 1 : 0
      node.focus += (want - node.focus) * ctx.ease(0.06)
    }
    this.#cores.setFocus(focused?.kind === 'core' ? focused.name : null)

    // keep the rings wide enough that pod clouds never merge; the workloads
    // lens hides the control plane's pods, so only its body needs room there
    this.#ring.coreReach = this.#cores.reach()
    this.#workloadScene.coreReach = this.#cores.bodyReach()
    this.#networkScene.coreReach = this.#cores.bodyReach()

    this.#cores.update(ctx, boot, ambient)
    // a folded layout is not drawn, so it need not move either
    if (this.#nodesLayout.visible) this.#ring.update(ctx)
    if (this.#workloadScene.group.visible) this.#workloadScene.update(ctx, this.#litNamespace(focused), ambient)
    if (this.#networkScene.group.visible) this.#networkScene.update(ctx, focused, ambient)
    this.#queue.update(ctx)
    this.#effects.update(ctx)

    const workload = focused?.kind === 'workload' ? (this.workloads.get(focused.key) ?? null) : null
    this.#overlay.show(
      workload,
      workload === null ? null : this.#workloadScene.workloadObject(workload.key),
      workload === null ? 0 : (this.#workloadScene.workloadReach(workload.key) ?? 0),
    )
    this.#overlay.update(ctx)
  }

  #litNamespace(focused: Picked | null): string | null {
    if (focused?.kind === 'namespace') return focused.name
    if (focused?.kind === 'workload') return this.workloads.get(focused.key)?.namespace ?? null
    return null
  }

  /** Shrinks a layout into the cluster's centre, and hides it once it is gone. */
  #fold(group: THREE.Group, presence: number): void {
    group.visible = presence > 0.01
    group.scale.setScalar(Math.max(presence, 0.001))
  }

  /** The space's GPU context outlives this cluster, so its buffers are freed here. */
  dispose(): void {
    this.anchor.removeFromParent()
    this.anchor.traverse((object) => {
      if (!(object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Points)) return
      object.geometry.dispose()
      for (const material of [object.material].flat()) material.dispose()
    })
  }

  #fieldFor(uid: string): PodField | null {
    if (this.#lens.name === 'workloads') return this.#workloadScene.podFieldFor(uid)
    if (this.#lens.name === 'network') return this.#networkScene.podFieldFor(uid)
    const node = this.state.pods.get(uid)?.node
    if (node === undefined || node === null) return null
    return this.#cores.podFieldFor(node) ?? this.#ring.podFields.get(node) ?? null
  }

  /** Events arrive in batches; stagger them so a rollout reads as a wave. */
  #animate(all: SemanticEvent[]): void {
    if (REDUCED_MOTION || all.length === 0) return

    // heartbeats are already spaced ten seconds apart; staggering them behind
    // a burst of pod churn would misreport when the cluster actually beat
    const events: SemanticEvent[] = []
    for (const event of all) {
      if (event.kind === 'node.heartbeat') dispatchNodeEvent(event, this.#animCtx)
      else events.push(event)
    }
    if (events.length === 0) return

    this.#queue.addStaggered(
      events.map((event) => ({
        duration: 0,
        onUpdate: () => {},
        onDone: () => {
          if (!dispatchPodEvent(event, this.#animCtx)) dispatchNodeEvent(event, this.#animCtx)
        },
      })),
      45,
      900,
    )
  }
}
