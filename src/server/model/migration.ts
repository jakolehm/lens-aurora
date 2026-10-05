import type { PodView } from '../../shared/protocol.js'

export interface MigratedFrom {
  uid: string
  node: string
}

interface Pending extends MigratedFrom {
  at: number
}

/**
 * Correlates a pod dying on one node with its controller-spawned replacement
 * appearing on another, so the scene can arc a ghost across the ring instead
 * of dissolving one cube and blooming an unrelated one somewhere else.
 */
export class MigrationTracker {
  readonly #window: number
  readonly #pending = new Map<string, Pending[]>()

  constructor(windowMs = 30_000) {
    this.#window = windowMs
  }

  noteTermination(view: PodView, now: number): void {
    if (view.ownerKey === null || view.node === null) return
    const list = this.#pending.get(view.ownerKey) ?? []
    list.push({ uid: view.uid, node: view.node, at: now })
    this.#pending.set(view.ownerKey, list)
  }

  matchSchedule(view: PodView, now: number): MigratedFrom | null {
    if (view.ownerKey === null || view.node === null) return null
    const list = this.#pending.get(view.ownerKey)
    if (list === undefined) return null

    const idx = list.findIndex(
      (p) => now - p.at <= this.#window && p.node !== view.node && p.uid !== view.uid,
    )
    if (idx === -1) return null

    const [hit] = list.splice(idx, 1)
    if (list.length === 0) this.#pending.delete(view.ownerKey)
    return { uid: hit!.uid, node: hit!.node }
  }

  prune(now: number): void {
    for (const [owner, list] of this.#pending) {
      const kept = list.filter((p) => now - p.at <= this.#window)
      if (kept.length === 0) this.#pending.delete(owner)
      else this.#pending.set(owner, kept)
    }
  }
}
