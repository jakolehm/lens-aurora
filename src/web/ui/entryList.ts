import type { EntryView } from '../../shared/network.js'
import type { ClusterView } from '../clusterView.js'
import { ENTRY_HUES } from '../theme.js'
import type { LensList } from './rail.js'

const hex = (c: number): string => `#${c.toString(16).padStart(6, '0')}`

export interface EntryRef {
  cluster: string
  key: string
}

interface Row {
  ref: EntryRef
  entry: EntryView
  cluster: string
}

export interface EntryListOptions {
  clusters: () => readonly ClusterView[]
  selected: () => EntryRef | null
  onEntryClick: (ref: EntryRef) => void
}

/** Every way into the fleet from outside, the ones that reach no service first. */
export class EntryList implements LensList {
  readonly title = 'ways in'
  readonly element = document.createElement('div')
  readonly #clusters: () => readonly ClusterView[]
  readonly #selected: () => EntryRef | null
  readonly #onEntryClick: (ref: EntryRef) => void

  constructor({ clusters, selected, onEntryClick }: EntryListOptions) {
    this.#clusters = clusters
    this.#selected = selected
    this.#onEntryClick = onEntryClick
    this.element.className = 'aurora-rail__list'
  }

  refresh(): void {
    const rows = this.#rows()
    if (rows.length === 0) {
      const quiet = document.createElement('div')
      quiet.className = 'aurora-rail__quiet'
      quiet.textContent = 'no way in from outside'
      this.element.replaceChildren(quiet)
      return
    }
    this.element.replaceChildren(...rows.map((row) => this.#build(row)))
  }

  #rows(): Row[] {
    return this.#clusters()
      .flatMap((cluster) =>
        [...cluster.network.entries].map((entry) => ({ ref: { cluster: cluster.id, key: entry.key }, entry, cluster: cluster.name })),
      )
      .sort(
        (a, b) =>
          Number(a.entry.services.length > 0) - Number(b.entry.services.length > 0) ||
          a.entry.name.localeCompare(b.entry.name),
      )
  }

  #build({ ref, entry, cluster }: Row): HTMLElement {
    const selected = this.#selected()
    const el = document.createElement('div')
    el.className = 'aurora-rail__row'
    el.dataset['on'] = String(selected?.cluster === ref.cluster && selected.key === ref.key)
    el.title = `${entry.kind} ${entry.namespace}/${entry.name} on ${cluster}`

    const dot = document.createElement('span')
    dot.className = 'aurora-rail__dot'
    dot.style.background = hex(ENTRY_HUES[entry.kind])

    const name = document.createElement('span')
    name.className = 'aurora-rail__name'
    name.textContent = entry.name

    const count = document.createElement('span')
    count.className = 'aurora-rail__count'
    count.dataset['short'] = String(entry.services.length === 0)
    count.textContent = `→ ${entry.services.length}`

    el.append(dot, name, count)
    el.addEventListener('click', () => this.#onEntryClick(ref))
    return el
  }
}
