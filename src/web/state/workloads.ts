import type { WorkloadView } from '../../shared/workloads.js'

/** One cluster's workloads, findable by key and by any of their pods. */
export class WorkloadIndex {
  readonly #byKey = new Map<string, WorkloadView>()
  readonly #byPod = new Map<string, WorkloadView>()
  readonly #listeners: (() => void)[] = []

  get all(): Iterable<WorkloadView> {
    return this.#byKey.values()
  }

  get(key: string): WorkloadView | undefined {
    return this.#byKey.get(key)
  }

  ofPod(uid: string): WorkloadView | undefined {
    return this.#byPod.get(uid)
  }

  set(views: readonly WorkloadView[]): void {
    this.#byKey.clear()
    this.#byPod.clear()
    for (const view of views) {
      this.#byKey.set(view.key, view)
      for (const uid of view.pods) this.#byPod.set(uid, view)
    }
    for (const fn of this.#listeners) fn()
  }

  onChange(fn: () => void): void {
    this.#listeners.push(fn)
  }
}
