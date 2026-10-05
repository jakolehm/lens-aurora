/**
 * Which namespaces are lit.
 *
 * Kept out of the rail because the scene asks `isGhosted` for every pod on
 * every frame, and that question should not require reaching into a DOM
 * component.
 */
export class NamespaceFocus {
  readonly #selected = new Set<string>()
  readonly #listeners: (() => void)[] = []
  #hovered: string | null = null

  onChange(fn: () => void): void {
    this.#listeners.push(fn)
  }

  toggle(namespace: string): void {
    if (!this.#selected.delete(namespace)) this.#selected.add(namespace)
    this.#emit()
  }

  clear(): void {
    this.#selected.clear()
    this.#hovered = null
    this.#emit()
  }

  /** Hovering shows what focusing would look like, without committing. */
  preview(namespace: string | null): void {
    if (this.#hovered === namespace) return
    this.#hovered = namespace
    this.#emit()
  }

  isSelected(namespace: string): boolean {
    return this.#selected.has(namespace)
  }

  get active(): boolean {
    return this.#hovered !== null || this.#selected.size > 0
  }

  isGhosted(namespace: string): boolean {
    if (this.#hovered !== null) return namespace !== this.#hovered
    if (this.#selected.size === 0) return false
    return !this.#selected.has(namespace)
  }

  #emit(): void {
    for (const fn of this.#listeners) fn()
  }
}
