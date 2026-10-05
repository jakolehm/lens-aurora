import * as THREE from 'three'
import type { NodeView } from '../../shared/protocol.js'
import type { ClusterState } from '../state/cluster.js'
import { HUES, ORBIT_RATE, REDUCED_MOTION, RING_RADIUS, clamp01, smooth } from '../theme.js'
import { LinkField } from './links.js'
import { NodeObject } from './nodeObject.js'
import { PodField } from './podField.js'
import type { PodLook } from './podLook.js'
import { nodeBreathFromCpu, nodeFillFromMemory } from './metricsVisual.js'
import type { FrameContext, Space } from './world.js'

const ringSlots = (count: number): number[] =>
  Array.from({ length: count }, (_, i) => (i / Math.max(count, 1)) * Math.PI * 2)

/** Clear air between one node's pod cloud and the next. */
const CLOUD_GAP = 0.55

/** Coprime with the 8-hue palette, so successive nodes land far apart on it. */
const HUE_STRIDE = 3

const JOIN_DELAY = 0.75
const JOIN_STAGGER = 0.24
const JOIN_DURATION = 0.85

/**
 * Reconciles cluster node membership into NodeObjects and drives their
 * layout. The only module that knows nodes live on a ring.
 */
export class Ring {
  readonly nodes = new Map<string, NodeObject>()
  readonly #podFields = new Map<string, PodField>()

  readonly #world: Space
  readonly #state: ClusterState
  readonly #look: PodLook
  readonly #links: LinkField
  readonly #positions = new Map<string, THREE.Vector3>()
  readonly #joins = new Map<string, number>()
  /** when each node's join animation should start, in scene seconds */
  readonly #joinAt = new Map<string, number>()
  #order: string[] = []
  #orbit = 0
  /** how far the control plane's own cloud reaches, set by main each frame */
  coreReach = 0
  #radius = RING_RADIUS
  #hueCursor = 0
  #now = 0

  constructor(
    world: Space,
    state: ClusterState,
    look: PodLook,
  ) {
    this.#world = world
    this.#state = state
    this.#look = look
    this.#links = new LinkField(world.rig)
    state.onChange(() => this.reconcile())
  }

  get links(): LinkField {
    return this.#links
  }

  get podFields(): ReadonlyMap<string, PodField> {
    return this.#podFields
  }

  /**
   * Ring radius, widened so no node's pod cloud reaches another's. Heat flings
   * pods outward, which made neighbouring clouds merge and left it ambiguous
   * which node a pod belonged to.
   */
  get radius(): number {
    return this.#radius
  }

  positionOf(name: string): THREE.Vector3 | null {
    return this.#positions.get(name) ?? null
  }

  /** Worker nodes only; the control plane is the core, not a ring slot. */
  #workers(): NodeView[] {
    return [...this.#state.nodes.values()]
      .filter((n) => n.role !== 'control-plane')
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  reconcile(): void {
    const workers = this.#workers()
    const wanted = new Set(workers.map((n) => n.name))

    for (const [name, obj] of this.nodes) {
      if (wanted.has(name)) continue
      obj.dispose()
      this.#podFields.get(name)?.dispose()
      this.#podFields.delete(name)
      this.nodes.delete(name)
      this.#positions.delete(name)
      this.#joins.delete(name)
      this.#joinAt.delete(name)
    }

    for (const [i, view] of workers.entries()) {
      const existing = this.nodes.get(view.name)
      if (existing !== undefined) {
        existing.setView(view)
        continue
      }
      // stride across the palette so a small cluster gets distinct hues
      // rather than three neighbouring shades of orange
      const hue = HUES[(this.#hueCursor++ * HUE_STRIDE) % HUES.length]!
      const obj = new NodeObject(view, hue)
      this.#world.rig.add(obj.object)
      this.nodes.set(view.name, obj)
      this.#positions.set(view.name, new THREE.Vector3())
      this.#joinAt.set(view.name, this.#now + JOIN_DELAY + i * JOIN_STAGGER)
      this.#podFields.set(view.name, new PodField(obj.object, this.#world.rig, this.#state, this.#look))
    }

    this.#order = workers.map((n) => n.name)
    this.#links.sync(this.#order)

    for (const [name, field] of this.#podFields) {
      field.sync(this.#state.podsOn(name).map((p) => p.uid))
    }
  }

  update(ctx: FrameContext): void {
    this.#now = ctx.t
    const slots = ringSlots(this.#order.length)
    if (!REDUCED_MOTION) this.#orbit += ctx.dt * ORBIT_RATE * this.#world.ambient.level

    let widest = 0
    for (const field of this.#podFields.values()) widest = Math.max(widest, field.reach())
    // the vertical squash pulls opposite nodes closer, so clear the gap
    // against the tighter of the two axes
    const needed = (this.coreReach + widest + CLOUD_GAP) / 0.72
    this.#radius += (Math.max(RING_RADIUS, needed) - this.#radius) * ctx.ease(0.04)

    let focusBlend = 0
    for (const obj of this.nodes.values()) focusBlend = Math.max(focusBlend, obj.focus)

    for (const [i, name] of this.#order.entries()) {
      const obj = this.nodes.get(name)
      if (obj === undefined) continue

      const startAt = this.#joinAt.get(name) ?? ctx.t
      obj.join = REDUCED_MOTION ? 1 : smooth(clamp01((ctx.t - startAt) / JOIN_DURATION))

      const m = this.#state.metrics.nodes[name]
      obj.update(ctx, {
        angle: slots[i]! + this.#orbit,
        radius: this.#radius,
        dim: focusBlend * 0.65 * (1 - obj.focus),
        breath: nodeBreathFromCpu(m?.cpuPercent ?? 0),
        memory: nodeFillFromMemory(m?.memPercent ?? 0),
      })

      this.#podFields.get(name)?.update(ctx, focusBlend * 0.65 * (1 - obj.focus), this.#world.ambient.level)
      this.#positions.get(name)?.copy(obj.object.position)
      this.#joins.set(name, obj.join * (1 - obj.fray * 0.92))
    }

    this.#links.update(ctx, this.#positions, this.#joins, focusBlend * 0.65)
  }
}
