import type { WorkloadView } from '../../shared/workloads.js'
import type { ClusterView } from '../clusterView.js'
import type { WorkloadFocus, WorkloadRef } from '../state/workloadFocus.js'
import { workloadHue } from '../theme.js'
import type { LensList } from './rail.js'

const hex = (c: number): string => `#${c.toString(16).padStart(6, '0')}`

interface Row {
  ref: WorkloadRef
  workload: WorkloadView
  cluster: string
  ready: number
}

export interface WorkloadListOptions {
  clusters: () => readonly ClusterView[]
  focus: WorkloadFocus
  onWorkloadClick: (ref: WorkloadRef) => void
}

/** Every workload of the fleet, the ones short of ready first. */
export class WorkloadList implements LensList {
  readonly title = 'workloads'
  readonly element = document.createElement('div')
  readonly #clusters: () => readonly ClusterView[]
  readonly #focus: WorkloadFocus
  readonly #onWorkloadClick: (ref: WorkloadRef) => void

  constructor({ clusters, focus, onWorkloadClick }: WorkloadListOptions) {
    this.#clusters = clusters
    this.#focus = focus
    this.#onWorkloadClick = onWorkloadClick
    this.element.className = 'aurora-rail__list'
    this.element.addEventListener('pointerleave', () => focus.preview(null))
    focus.onChange(() => this.refresh())
  }

  refresh(): void {
    const rows = this.#rows()
    if (rows.length === 0) {
      const quiet = document.createElement('div')
      quiet.className = 'aurora-rail__quiet'
      quiet.textContent = 'looking for workloads…'
      this.element.replaceChildren(quiet)
      return
    }
    this.element.replaceChildren(...rows.map((row) => this.#build(row)))
  }

  #rows(): Row[] {
    return this.#clusters()
      .flatMap((cluster) =>
        [...cluster.workloads.all].map((workload) => ({
          ref: { cluster: cluster.id, key: workload.key },
          workload,
          cluster: cluster.name,
          ready: workload.pods.filter((uid) => cluster.state.pods.get(uid)?.ready === true).length,
        })),
      )
      .sort(
        (a, b) =>
          Number(b.ready < b.workload.pods.length) - Number(a.ready < a.workload.pods.length) ||
          a.workload.name.localeCompare(b.workload.name),
      )
  }

  #build({ ref, workload, cluster, ready }: Row): HTMLElement {
    const el = document.createElement('div')
    el.className = 'aurora-rail__row'
    el.dataset['on'] = String(this.#focus.isSelected(ref))
    el.title = `${workload.kind} ${workload.namespace}/${workload.name} on ${cluster}`

    const dot = document.createElement('span')
    dot.className = 'aurora-rail__dot'
    dot.style.background = hex(workloadHue(workload.kind))

    const name = document.createElement('span')
    name.className = 'aurora-rail__name'
    name.textContent = workload.name

    const count = document.createElement('span')
    count.className = 'aurora-rail__count'
    count.dataset['short'] = String(ready < workload.pods.length)
    count.textContent = `${ready}/${workload.pods.length}`

    el.append(dot, name, count)
    el.addEventListener('click', () => this.#onWorkloadClick(ref))
    el.addEventListener('pointerenter', () => this.#focus.preview(ref))
    return el
  }
}
