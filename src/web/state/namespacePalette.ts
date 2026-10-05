import { NAMESPACE_SWATCHES } from '../../shared/palette.js'

/** Same FNV-1a the old hueFor used, so a namespace lands where it used to. */
function hashSlot(namespace: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < namespace.length; i++) {
    h ^= namespace.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h % NAMESPACE_SWATCHES.length
}

/**
 * Assigns each namespace a colour the first time it is seen, preferring its
 * hashed slot and taking the next free one if that is occupied.
 *
 * Stateful on purpose. A pure hash into sixteen slots collides constantly
 * once a cluster has a dozen namespaces, and the rail's legend is only
 * useful if two rows never share a dot.
 */
export class NamespacePalette {
  readonly #assigned = new Map<string, number>()
  readonly #taken = new Set<number>()

  sync(names: Iterable<string>): void {
    for (const name of names) this.#assign(name)
  }

  colorOf(namespace: string): number {
    return NAMESPACE_SWATCHES[this.#assign(namespace)]!
  }

  known(): string[] {
    return [...this.#assigned.keys()]
  }

  #assign(namespace: string): number {
    const existing = this.#assigned.get(namespace)
    if (existing !== undefined) return existing

    const total = NAMESPACE_SWATCHES.length
    const preferred = hashSlot(namespace)
    let slot = preferred

    // walk to the next free slot; past sixteen namespaces every slot is
    // taken and we fall back to the hashed one, sharing a colour
    for (let i = 0; i < total; i++) {
      const candidate = (preferred + i) % total
      if (!this.#taken.has(candidate)) {
        slot = candidate
        break
      }
    }

    this.#assigned.set(namespace, slot)
    this.#taken.add(slot)
    return slot
  }
}
