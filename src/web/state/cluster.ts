import type { MetricsView, NodeView, PodView, SemanticEvent, ServerMessage } from '../../shared/protocol.js'
import { EMPTY_METRICS } from '../../shared/protocol.js'

export interface StateChange {
  addedNodes: string[]
  removedNodes: string[]
  addedPods: string[]
  removedPods: string[]
  /** pods whose node assignment changed, so the scene must move the instance */
  movedPods: string[]
}

const emptyChange = (): StateChange => ({
  addedNodes: [],
  removedNodes: [],
  addedPods: [],
  removedPods: [],
  movedPods: [],
})

const isEmpty = (c: StateChange): boolean =>
  c.addedNodes.length + c.removedNodes.length + c.addedPods.length + c.removedPods.length + c.movedPods.length === 0

/** The scene's mirror of the cluster. Knows nothing about three.js. */
export class ClusterState {
  readonly #nodes = new Map<string, NodeView>()
  readonly #pods = new Map<string, PodView>()
  readonly #listeners: ((change: StateChange) => void)[] = []
  #metrics: MetricsView = EMPTY_METRICS

  get nodes(): ReadonlyMap<string, NodeView> {
    return this.#nodes
  }

  get pods(): ReadonlyMap<string, PodView> {
    return this.#pods
  }

  get metrics(): MetricsView {
    return this.#metrics
  }

  onChange(fn: (change: StateChange) => void): void {
    this.#listeners.push(fn)
  }

  podsOn(node: string): PodView[] {
    return [...this.#pods.values()].filter((p) => p.node === node)
  }

  apply(message: ServerMessage): SemanticEvent[] {
    switch (message.type) {
      case 'delta':
        return this.#applyDelta(message)
      case 'metrics':
        this.#metrics = message.metrics
        return []
      case 'event':
        return message.events
      default:
        return []
    }
  }

  #applyDelta(m: Extract<ServerMessage, { type: 'delta' }>): SemanticEvent[] {
    const change = emptyChange()

    for (const n of m.nodes) {
      if (!this.#nodes.has(n.name)) change.addedNodes.push(n.name)
      this.#nodes.set(n.name, n)
    }
    for (const name of m.removedNodes) {
      if (this.#nodes.delete(name)) change.removedNodes.push(name)
    }
    for (const p of m.pods) {
      const prev = this.#pods.get(p.uid)
      if (prev === undefined) change.addedPods.push(p.uid)
      else if (prev.node !== p.node) change.movedPods.push(p.uid)
      this.#pods.set(p.uid, p)
    }
    for (const uid of m.removedPods) {
      if (this.#pods.delete(uid)) change.removedPods.push(uid)
    }

    this.#emit(change)
    return []
  }

  #emit(change: StateChange): void {
    if (isEmpty(change)) return
    for (const fn of this.#listeners) fn(change)
  }
}
