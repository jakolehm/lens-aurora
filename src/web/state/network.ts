import { EMPTY_NETWORK, type EntryView, type NetworkView, type ServiceHop } from '../../shared/network.js'

/** One cluster's paths in from outside, findable by entry and by service. */
export class NetworkIndex {
  readonly #entries = new Map<string, EntryView>()
  readonly #services = new Map<string, ServiceHop>()
  readonly #listeners: (() => void)[] = []

  get entries(): Iterable<EntryView> {
    return this.#entries.values()
  }

  get services(): Iterable<ServiceHop> {
    return this.#services.values()
  }

  entry(key: string): EntryView | undefined {
    return this.#entries.get(key)
  }

  service(key: string): ServiceHop | undefined {
    return this.#services.get(key)
  }

  /** The entries that send traffic to a service. */
  entriesOf(serviceKey: string): EntryView[] {
    return [...this.#entries.values()].filter((entry) => entry.services.includes(serviceKey))
  }

  set(view: NetworkView = EMPTY_NETWORK): void {
    this.#entries.clear()
    this.#services.clear()
    for (const entry of view.entries) this.#entries.set(entry.key, entry)
    for (const service of view.services) this.#services.set(service.key, service)
    for (const fn of this.#listeners) fn()
  }

  onChange(fn: () => void): void {
    this.#listeners.push(fn)
  }
}
