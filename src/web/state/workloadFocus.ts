/** A workload anywhere in the fleet: keys are only unique within one cluster. */
export interface WorkloadRef {
  cluster: string
  key: string
}

const same = (a: WorkloadRef | null, b: WorkloadRef | null): boolean =>
  a?.cluster === b?.cluster && a?.key === b?.key

/** Which workload is lit, the same way NamespaceFocus does it for namespaces. */
export class WorkloadFocus {
  readonly #listeners: (() => void)[] = []
  #selected: WorkloadRef | null = null
  #hovered: WorkloadRef | null = null

  get selected(): WorkloadRef | null {
    return this.#selected
  }

  get active(): boolean {
    return this.#lit() !== null
  }

  select(ref: WorkloadRef | null): void {
    if (same(this.#selected, ref)) return
    this.#selected = ref
    this.#emit()
  }

  /** Hovering a row shows its pods without moving the camera. */
  preview(ref: WorkloadRef | null): void {
    if (same(this.#hovered, ref)) return
    this.#hovered = ref
    this.#emit()
  }

  isSelected(ref: WorkloadRef): boolean {
    return same(this.#selected, ref)
  }

  /** A pod without a known workload has key null, and recedes whenever anything is lit. */
  isGhosted(cluster: string, key: string | null): boolean {
    const lit = this.#lit()
    return lit !== null && !same(lit, key === null ? null : { cluster, key })
  }

  onChange(fn: () => void): void {
    this.#listeners.push(fn)
  }

  #lit(): WorkloadRef | null {
    return this.#hovered ?? this.#selected
  }

  #emit(): void {
    for (const fn of this.#listeners) fn()
  }
}
