export type LensName = 'nodes' | 'workloads' | 'network'

/** Which way the fleet is looked at. One for the whole fleet, so every cluster reads the same. */
export class ActiveLens {
  readonly #listeners: ((name: LensName) => void)[] = []
  #name: LensName = 'nodes'

  get name(): LensName {
    return this.#name
  }

  set(name: LensName): void {
    if (this.#name === name) return
    this.#name = name
    for (const fn of this.#listeners) fn(name)
  }

  onChange(fn: (name: LensName) => void): void {
    this.#listeners.push(fn)
  }
}
