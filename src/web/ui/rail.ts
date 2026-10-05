import type { SemanticEvent } from '../../shared/protocol.js'
import type { ClusterView } from '../clusterView.js'
import type { NamespaceFocus } from '../state/focus.js'
import type { ActiveLens, LensName } from '../state/lens.js'
import type { NamespacePalette } from '../state/namespacePalette.js'
import { clusterTotals, rollupNamespaces, type NamespaceRow } from '../state/namespaceRollup.js'

/** A list the rail shows under the namespaces while its lens is on. */
export interface LensList {
  readonly title: string
  readonly element: HTMLElement
  refresh(): void
}

const MAX_EVENTS = 8

/** Short, past-tense labels. The ticker has one line and no room to explain. */
const VERBS: Partial<Record<SemanticEvent['kind'], string>> = {
  'pod.scheduled': 'sched',
  'pod.pulling': 'pull',
  'pod.ready': 'ready',
  'pod.restart': 'restart',
  'pod.crashloop': 'crash',
  'pod.oomkilled': 'oom',
  'pod.terminating': 'gone',
  'pod.migrated': 'moved',
  'node.joined': 'joined',
  'node.notready': 'notready',
  'node.recovered': 'back',
  'node.pressure': 'pressure',
  'node.cordoned': 'cordon',
  'node.uncordoned': 'uncordon',
}

/** Heartbeats are deliberately absent: eight a minute would drown everything. */
const BAD = new Set<SemanticEvent['kind']>([
  'pod.crashloop',
  'pod.oomkilled',
  'pod.restart',
  'node.notready',
])

const escape = (s: string): string =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c)

const hex = (c: number): string => `#${c.toString(16).padStart(6, '0')}`

function listHeading(title: string): HTMLElement {
  const heading = document.createElement('div')
  heading.className = 'aurora-rail__heading'
  const label = document.createElement('span')
  label.textContent = title
  heading.append(label)
  return heading
}

const LENSES: readonly LensName[] = ['nodes', 'workloads', 'network']

export interface RailOptions {
  clusters: () => readonly ClusterView[]
  palette: NamespacePalette
  focus: NamespaceFocus
  lens: ActiveLens
  lists: Partial<Record<LensName, LensList>>
  /** the cluster row the user clicked, to fly the camera there */
  onClusterClick: (id: string) => void
}

/**
 * The left rail: which clusters are there, what is running, what colour it
 * is, and what just happened, for the whole fleet. Read-only, like the rest
 * of Aurora, and desktop-only, because on a phone it would cover the thing it
 * describes.
 */
export class Rail {
  readonly #clusters: () => readonly ClusterView[]
  readonly #palette: NamespacePalette
  readonly #focus: NamespaceFocus
  readonly #lens: ActiveLens
  readonly #lists: Partial<Record<LensName, LensList>>
  readonly #onClusterClick: (id: string) => void

  readonly #root = document.createElement('aside')
  readonly #totals = document.createElement('div')
  readonly #clusterList = document.createElement('div')
  readonly #list = document.createElement('div')
  readonly #ticker = document.createElement('div')
  readonly #clear = document.createElement('span')
  readonly #lensButtons = document.createElement('div')

  constructor(host: HTMLElement, { clusters, palette, focus, lens, lists, onClusterClick }: RailOptions) {
    this.#clusters = clusters
    this.#palette = palette
    this.#focus = focus
    this.#lens = lens
    this.#lists = lists
    this.#onClusterClick = onClusterClick

    this.#root.className = 'aurora-rail'

    const title = document.createElement('div')
    title.className = 'aurora-rail__title'
    title.textContent = 'aurora'

    this.#lensButtons.className = 'aurora-rail__lenses'
    this.#lensButtons.append(
      ...LENSES.map((name) => {
        const button = document.createElement('button')
        button.type = 'button'
        button.textContent = name
        button.dataset['lens'] = name
        button.addEventListener('click', () => lens.set(name))
        return button
      }),
    )

    this.#totals.className = 'aurora-rail__totals'

    const clustersHeading = document.createElement('div')
    clustersHeading.className = 'aurora-rail__heading'
    const clustersLabel = document.createElement('span')
    clustersLabel.textContent = 'clusters'
    clustersHeading.append(clustersLabel)

    this.#clusterList.className = 'aurora-rail__clusters'

    const heading = document.createElement('div')
    heading.className = 'aurora-rail__heading'
    this.#clear.className = 'aurora-rail__clear'
    this.#clear.textContent = 'clear'
    this.#clear.dataset['shown'] = 'false'
    this.#clear.addEventListener('click', () => this.#focus.clear())
    const label = document.createElement('span')
    label.textContent = 'namespaces'
    heading.append(label, this.#clear)

    this.#list.className = 'aurora-rail__list'

    const activity = document.createElement('div')
    activity.className = 'aurora-rail__heading'
    const activityLabel = document.createElement('span')
    activityLabel.textContent = 'activity'
    activity.append(activityLabel)

    this.#ticker.className = 'aurora-rail__ticker'
    this.#markQuiet()

    this.#root.append(
      title,
      this.#lensButtons,
      this.#totals,
      clustersHeading,
      this.#clusterList,
      heading,
      this.#list,
      ...Object.values(lists).flatMap((list) => [listHeading(list.title), list.element]),
      activity,
      this.#ticker,
    )
    host.append(this.#root)

    // leaving the rail entirely must drop any hover preview
    this.#root.addEventListener('pointerleave', () => this.#focus.preview(null))
    focus.onChange(() => this.#paintRows())
    lens.onChange(() => this.#showLens())
    this.#showLens()
  }

  /** A lens may add its own list under the namespaces, which work in every lens. */
  #showLens(): void {
    const name = this.#lens.name
    for (const button of this.#lensButtons.children) {
      ;(button as HTMLElement).dataset['on'] = String((button as HTMLElement).dataset['lens'] === name)
    }
    for (const [lens, list] of Object.entries(this.#lists)) {
      const shown = lens === name
      list.element.hidden = !shown
      ;(list.element.previousElementSibling as HTMLElement).hidden = !shown
    }
    this.#lists[name]?.refresh()
  }

  dispose(): void {
    this.#root.remove()
  }

  /** A healthy cluster emits almost nothing, so say so rather than look broken. */
  #markQuiet(): void {
    if (this.#ticker.childElementCount > 0) return
    const quiet = document.createElement('div')
    quiet.className = 'aurora-rail__quiet'
    quiet.textContent = 'all quiet'
    this.#ticker.append(quiet)
  }

  refresh(): void {
    const clusters = this.#clusters()
    const t = clusterTotals(clusters.map((c) => c.state))
    this.#totals.innerHTML =
      `<div><b>${t.nodes}</b> nodes &middot; <b>${t.pods}</b> pods</div>` +
      `<div><b>${t.cpuPercent}%</b> cpu &middot; <b>${t.memPercent}%</b> mem</div>`
    this.#clusterList.replaceChildren(...clusters.map((c) => this.#buildClusterRow(c)))
    this.#paintRows()
    this.#lists[this.#lens.name]?.refresh()
  }

  #paintRows(): void {
    this.#clear.dataset['shown'] = String(this.#focus.active)
    const states = this.#clusters().map((c) => c.state)
    this.#list.replaceChildren(...rollupNamespaces(states).map((row) => this.#buildRow(row)))
  }

  #buildClusterRow(cluster: ClusterView): HTMLElement {
    const el = document.createElement('div')
    el.className = 'aurora-rail__row'
    el.title = `${cluster.name} — fly to it`

    const name = document.createElement('span')
    name.className = 'aurora-rail__name'
    name.textContent = cluster.name

    const count = document.createElement('span')
    count.className = 'aurora-rail__count'
    count.textContent = `${cluster.state.nodes.size} · ${cluster.state.pods.size}`

    el.append(name, count)
    el.addEventListener('click', () => this.#onClusterClick(cluster.id))
    return el
  }

  #buildRow(row: NamespaceRow): HTMLElement {
    const el = document.createElement('div')
    el.className = 'aurora-rail__row'
    el.dataset['on'] = String(this.#focus.isSelected(row.name))
    el.title = `${row.name} — ${row.pods} pods`

    const dot = document.createElement('span')
    dot.className = 'aurora-rail__dot'
    dot.style.background = hex(this.#palette.colorOf(row.name))

    const name = document.createElement('span')
    name.className = 'aurora-rail__name'
    name.textContent = row.name

    const count = document.createElement('span')
    count.className = 'aurora-rail__count'
    count.textContent = String(row.pods)

    el.append(dot, name, count)
    el.addEventListener('click', () => this.#focus.toggle(row.name))
    el.addEventListener('pointerenter', () => this.#focus.preview(row.name))
    return el
  }

  push(event: SemanticEvent, cluster: ClusterView): void {
    const verb = VERBS[event.kind]
    if (verb === undefined) return

    const pod = 'uid' in event ? cluster.state.pods.get(event.uid) : undefined
    const label = 'uid' in event ? (pod?.name ?? 'pod') : event.name
    const where = `${'uid' in event ? (pod?.namespace ?? '') : 'node'} on ${cluster.name}`

    const line = document.createElement('div')
    line.className = 'aurora-rail__event'
    line.dataset['bad'] = String(BAD.has(event.kind))
    line.title = `${verb} ${label} ${where}`.trim()
    line.innerHTML = `<i>${escape(verb)}</i><span>${escape(label)}</span>`

    this.#ticker.querySelector('.aurora-rail__quiet')?.remove()
    this.#ticker.prepend(line)
    while (this.#ticker.childElementCount > MAX_EVENTS) this.#ticker.lastElementChild?.remove()
  }
}
