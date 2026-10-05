import type { MetricsView, SemanticEvent, ServerMessage } from '../../shared/protocol.js'
import { deriveNode, derivePod } from './derive.js'
import { MigrationTracker } from './migration.js'
import type { NodeObservation, PodObservation, SourceSink } from './types.js'

export type DeltaMessage = Extract<ServerMessage, { type: 'delta' }>

export interface StoreListener {
  onDelta(message: DeltaMessage): void
  onEvents(events: SemanticEvent[]): void
  onMetrics(metrics: MetricsView): void
}

/**
 * The authoritative model. Sources push observations in; the store derives
 * events and coalesces everything into one batch per flush, so a rollout
 * arrives as a single coherent wave rather than a hundred small updates.
 */
export class ClusterStore implements SourceSink {
  readonly #listener: StoreListener
  readonly #tracker: MigrationTracker

  readonly #nodes = new Map<string, NodeObservation>()
  readonly #pods = new Map<string, PodObservation>()
  #synced = false
  #now = 0

  #dirtyNodes = new Set<string>()
  #dirtyPods = new Set<string>()
  #removedNodes = new Set<string>()
  #removedPods = new Set<string>()
  #events: SemanticEvent[] = []

  constructor(listener: StoreListener, tracker = new MigrationTracker()) {
    this.#listener = listener
    this.#tracker = tracker
  }

  synced(): void {
    this.#synced = true
  }

  upsertNode(obs: NodeObservation): void {
    const name = obs.view.name
    const prev = this.#nodes.get(name) ?? null
    this.#nodes.set(name, obs)
    this.#removedNodes.delete(name)
    this.#dirtyNodes.add(name)
    if (this.#synced) this.#events.push(...deriveNode(prev, obs))
  }

  removeNode(name: string): void {
    if (!this.#nodes.delete(name)) return
    this.#dirtyNodes.delete(name)
    this.#removedNodes.add(name)
  }

  upsertPod(obs: PodObservation): void {
    const uid = obs.view.uid
    const prev = this.#pods.get(uid) ?? null
    this.#pods.set(uid, obs)
    this.#removedPods.delete(uid)
    this.#dirtyPods.add(uid)
    if (!this.#synced) return

    for (const event of derivePod(prev, obs)) {
      if (event.kind !== 'pod.scheduled') {
        this.#events.push(event)
        continue
      }
      const from = this.#tracker.matchSchedule(obs.view, this.#now)
      if (from === null) {
        this.#events.push(event)
        continue
      }
      // the replacement arrived: drop the sibling's dissolve, arc a ghost instead
      this.#events = this.#events.filter(
        (e) => !(e.kind === 'pod.terminating' && e.uid === from.uid),
      )
      this.#events.push({ kind: 'pod.migrated', uid, from: from.node, to: event.node })
    }
  }

  removePod(uid: string): void {
    const prev = this.#pods.get(uid)
    if (prev === undefined) return
    this.#pods.delete(uid)
    this.#dirtyPods.delete(uid)
    this.#removedPods.add(uid)
    if (!this.#synced) return
    this.#tracker.noteTermination(prev.view, this.#now)
    this.#events.push(...derivePod(prev, null))
  }

  heartbeat(node: string): void {
    // suppressed until sync so the initial lease list is not a burst
    if (!this.#synced || !this.#nodes.has(node)) return
    this.#events.push({ kind: 'node.heartbeat', name: node })
  }

  metrics(view: MetricsView): void {
    this.#listener.onMetrics(view)
  }

  flush(now: number): void {
    this.#now = now
    this.#tracker.prune(now)

    const hasModel =
      this.#dirtyNodes.size + this.#dirtyPods.size + this.#removedNodes.size + this.#removedPods.size > 0

    if (hasModel) {
      this.#listener.onDelta({
        type: 'delta',
        nodes: [...this.#dirtyNodes].flatMap((n) => {
          const obs = this.#nodes.get(n)
          return obs === undefined ? [] : [obs.view]
        }),
        pods: [...this.#dirtyPods].flatMap((u) => {
          const obs = this.#pods.get(u)
          return obs === undefined ? [] : [obs.view]
        }),
        removedNodes: [...this.#removedNodes],
        removedPods: [...this.#removedPods],
      })
      this.#dirtyNodes = new Set()
      this.#dirtyPods = new Set()
      this.#removedNodes = new Set()
      this.#removedPods = new Set()
    }

    if (this.#events.length > 0) {
      this.#listener.onEvents(this.#events)
      this.#events = []
    }
  }
}
