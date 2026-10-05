import { RELATED_KINDS, type RelatedKind, type RelatedView } from '../../shared/workloads.js'
import { MANAGED_CORE } from '../scene/corePlane.js'
import type { Picked } from '../scene/picking.js'
import type { ClusterState } from '../state/cluster.js'
import type { NetworkIndex } from '../state/network.js'
import type { WorkloadIndex } from '../state/workloads.js'
import { ENTRY_HUES, RELATED_HUES, hueFor, workloadHue } from '../theme.js'
import { formatAge, formatBytes, formatCpu } from './format.js'

const GREEN = '#4ecb71'
const AMBER = '#ffb020'
const RED = '#ff4b3a'

const escape = (s: string): string =>
  s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c)

const row = (label: string, value: string): string =>
  `<div class="aurora-panel__row"><span>${label}</span><span>${value}</span></div>`

const bar = (percent: number): string =>
  `<div class="aurora-panel__bar${percent > 85 ? ' aurora-panel__bar--hot' : ''}"><i style="width:${Math.min(percent, 100)}%"></i></div>`

const hex = (c: number): string => `#${c.toString(16).padStart(6, '0')}`

const dot = (color: string): string => `<span class="aurora-panel__dot" style="background:${color}"></span>`

const RELATED_HEADINGS: Record<RelatedKind, string> = {
  Ingress: 'ingresses',
  Service: 'services',
  PersistentVolumeClaim: 'volumes',
  ConfigMap: 'config maps',
  Secret: 'secrets',
  ServiceAccount: 'service account',
}

const relatedRow = (r: RelatedView): string =>
  `<div class="aurora-panel__related">${dot(hex(RELATED_HUES[r.kind]))}<span>${escape(r.name)}</span>` +
  `<span>${escape(r.via === null ? r.detail : `${r.detail} → ${r.via}`.trim())}</span></div>`

/** What the panel reads a cluster's details from. */
export interface PanelSource {
  readonly state: ClusterState
  readonly workloads: WorkloadIndex
  readonly network: NetworkIndex
}

/** The one piece of UI. Charcoal glass, mono type, and only a button to close it. */
export class InfoPanel {
  readonly #host: HTMLElement
  #source: PanelSource | null = null
  readonly #el: HTMLDivElement
  readonly #content: HTMLDivElement
  readonly #leader: HTMLDivElement
  #target: Picked | null = null
  #anchorX = 0
  #anchorY = 0

  constructor(host: HTMLElement, onClose: () => void) {
    this.#host = host

    this.#el = document.createElement('div')
    this.#el.className = 'aurora-panel'
    this.#el.dataset['open'] = 'false'

    const close = document.createElement('button')
    close.type = 'button'
    close.className = 'aurora-panel__close'
    close.title = 'Close'
    close.setAttribute('aria-label', 'Close')
    close.textContent = '×'
    close.addEventListener('click', onClose)

    this.#content = document.createElement('div')
    this.#el.append(close, this.#content)

    this.#leader = document.createElement('div')
    this.#leader.className = 'aurora-panel__leader'
    this.#leader.dataset['open'] = 'false'

    host.append(this.#leader, this.#el)
  }

  show(target: Picked, source: PanelSource): void {
    this.#target = target
    this.#source = source
    this.#el.dataset['open'] = 'true'
    this.#leader.dataset['open'] = 'true'
    this.refresh()
  }

  hide(): void {
    this.#target = null
    this.#source = null
    this.#el.dataset['open'] = 'false'
    this.#leader.dataset['open'] = 'false'
  }

  /** Anchor the panel beside the object's projected position, in host pixels. */
  track(screenX: number, screenY: number): void {
    this.#anchorX = screenX
    this.#anchorY = screenY
    if (this.#target === null) return

    const width = this.#el.offsetWidth || 280
    const height = this.#el.offsetHeight || 200
    // flip to the other side when the object drifts toward the right edge
    const hostWidth = this.#host.clientWidth
    const hostHeight = this.#host.clientHeight
    const flip = screenX > hostWidth * 0.55
    const gap = 130
    const rawLeft = flip ? screenX - gap - width : screenX + gap
    const left = Math.min(Math.max(rawLeft, 16), hostWidth - width - 16)
    const top = Math.min(Math.max(screenY - height / 2, 16), hostHeight - height - 16)

    this.#el.style.left = `${left}px`
    this.#el.style.top = `${top}px`

    const edgeX = flip ? left + width : left
    const edgeY = top + height / 2
    const dx = screenX - edgeX
    const dy = screenY - edgeY
    this.#leader.style.left = `${edgeX}px`
    this.#leader.style.top = `${edgeY}px`
    this.#leader.style.width = `${Math.hypot(dx, dy)}px`
    this.#leader.style.transform = `rotate(${Math.atan2(dy, dx)}rad)`
  }

  dispose(): void {
    this.#el.remove()
    this.#leader.remove()
  }

  refresh(): void {
    const target = this.#target
    const source = this.#source
    if (target === null || source === null) return
    const html = this.#render(source, target)
    if (html === '') {
      this.hide()
      return
    }
    this.#content.innerHTML = html
    this.track(this.#anchorX, this.#anchorY)
  }

  #render(source: PanelSource, target: Picked): string {
    switch (target.kind) {
      case 'workload':
        return this.#workload(source, target.key)
      case 'namespace':
        return this.#namespace(source, target.name)
      case 'entry':
        return this.#entry(source, target.key)
      case 'service':
        return this.#service(source, target.key)
      case 'pod':
        return this.#pod(source.state, target.uid)
      default:
        return this.#node(source.state, target)
    }
  }

  #entry({ network }: PanelSource, key: string): string {
    const entry = network.entry(key)
    if (entry === undefined) return ''
    const services = entry.services.flatMap((s) => network.service(s) ?? [])
    return [
      `<div class="aurora-panel__name">${escape(entry.name)}</div>`,
      `<div class="aurora-panel__kind">${dot(hex(ENTRY_HUES[entry.kind]))}${escape(entry.kind)} · ${escape(entry.namespace)}</div>`,
      entry.detail === '' ? '' : row('from', escape(entry.detail)),
      `<div class="aurora-panel__heading">sends to</div>`,
      ...(services.length === 0
        ? [row('services', 'none that exist')]
        : services.map(
            (s) =>
              `<div class="aurora-panel__related">${dot(hex(RELATED_HUES.Service))}<span>${escape(s.name)}</span><span>${escape(s.detail)}</span></div>`,
          )),
    ].join('')
  }

  #service({ state, network }: PanelSource, key: string): string {
    const service = network.service(key)
    if (service === undefined) return ''
    const pods = service.pods.flatMap((uid) => state.pods.get(uid) ?? [])
    const ready = pods.filter((p) => p.ready).length
    const entries = network.entriesOf(key)
    return [
      `<div class="aurora-panel__name">${escape(service.name)}</div>`,
      `<div class="aurora-panel__kind">${dot(hex(RELATED_HUES.Service))}service · ${escape(service.namespace)}</div>`,
      row('ports', escape(service.detail)),
      row('pods', `${dot(pods.length > 0 && ready === pods.length ? GREEN : pods.length === 0 ? RED : AMBER)}${ready}/${pods.length} ready`),
      `<div class="aurora-panel__heading">reached through</div>`,
      ...entries.map(
        (e) =>
          `<div class="aurora-panel__related">${dot(hex(ENTRY_HUES[e.kind]))}<span>${escape(e.name)}</span><span>${escape(e.kind)}</span></div>`,
      ),
    ].join('')
  }

  #node(state: ClusterState, picked: Extract<Picked, { kind: 'core' | 'node' }>): string {
    if (picked.kind === 'core' && picked.name === MANAGED_CORE) {
      return [
        `<div class="aurora-panel__name">control plane</div>`,
        `<div class="aurora-panel__kind">managed by the provider</div>`,
        row('nodes', 'not listed in the cluster'),
        row('workers', String(state.nodes.size)),
      ].join('')
    }

    const name = picked.name
    const view = name === undefined ? undefined : state.nodes.get(name)
    if (view === undefined) return ''

    const m = state.metrics.nodes[view.name]
    const pods = state.podsOn(view.name).length
    const status = !view.ready ? 'NotReady' : view.schedulable ? 'Ready' : 'Ready,Cordoned'
    const color = !view.ready ? RED : view.pressure.length > 0 ? AMBER : GREEN

    if (view.inferred) {
      return [
        `<div class="aurora-panel__name">${escape(view.name)}</div>`,
        `<div class="aurora-panel__kind">node, known from its pods</div>`,
        row('status', 'unknown: no access to nodes'),
        row('pods', String(pods)),
      ].join('')
    }

    return [
      `<div class="aurora-panel__name">${escape(view.name)}</div>`,
      `<div class="aurora-panel__kind">${view.role === 'control-plane' ? 'control plane' : 'worker node'}</div>`,
      row('status', `${dot(color)}${status}`),
      row('version', escape(view.version)),
      row('pods', String(pods)),
      row('age', formatAge(view.createdAt)),
      view.pressure.length > 0 ? row('pressure', view.pressure.join(', ')) : '',
      '<div style="margin-top:12px">',
      row('cpu', m === undefined ? '—' : `${formatCpu(m.cpuMillis)} · ${m.cpuPercent}%`),
      bar(m?.cpuPercent ?? 0),
      row('memory', m === undefined ? '—' : `${formatBytes(m.memBytes)} · ${m.memPercent}%`),
      bar(m?.memPercent ?? 0),
      '</div>',
    ].join('')
  }

  #namespace({ state, workloads }: PanelSource, name: string): string {
    const owned = [...workloads.all].filter((w) => w.namespace === name)
    if (owned.length === 0) return ''

    const pods = owned.flatMap((w) => w.pods.flatMap((uid) => state.pods.get(uid) ?? []))
    const ready = pods.filter((p) => p.ready).length
    const kinds = new Map<string, number>()
    for (const w of owned) kinds.set(w.kind, (kinds.get(w.kind) ?? 0) + 1)
    const short = owned.filter((w) => w.pods.some((uid) => state.pods.get(uid)?.ready !== true))

    return [
      `<div class="aurora-panel__name">${escape(name)}</div>`,
      `<div class="aurora-panel__kind">namespace</div>`,
      row('pods', `${dot(ready === pods.length ? GREEN : AMBER)}${ready}/${pods.length} ready`),
      row('restarts', String(pods.reduce((sum, p) => sum + p.restarts, 0))),
      `<div class="aurora-panel__heading">workloads</div>`,
      ...[...kinds].sort(([a], [b]) => a.localeCompare(b)).map(([kind, count]) => row(escape(kind), String(count))),
      ...(short.length === 0
        ? []
        : [
            `<div class="aurora-panel__heading">not ready</div>`,
            ...short.map((w) => `<div class="aurora-panel__related">${dot(AMBER)}<span>${escape(w.name)}</span></div>`),
          ]),
    ].join('')
  }

  #workload({ state, workloads }: PanelSource, key: string): string {
    const workload = workloads.get(key)
    if (workload === undefined) return ''

    const pods = workload.pods.flatMap((uid) => {
      const pod = state.pods.get(uid)
      return pod === undefined ? [] : [pod]
    })
    const ready = pods.filter((p) => p.ready).length
    const restarts = pods.reduce((sum, p) => sum + p.restarts, 0)

    const sections = RELATED_KINDS.flatMap((kind) => {
      const related = workload.related.filter((r) => r.kind === kind)
      if (related.length === 0) return []
      return [`<div class="aurora-panel__heading">${RELATED_HEADINGS[kind]}</div>`, ...related.map(relatedRow)]
    })

    return [
      `<div class="aurora-panel__name">${escape(workload.name)}</div>`,
      `<div class="aurora-panel__kind">${dot(hex(workloadHue(workload.kind)))}${escape(workload.kind)} · ${escape(workload.namespace)}</div>`,
      row('pods', `${dot(ready === pods.length ? GREEN : AMBER)}${ready}/${pods.length} ready`),
      row('restarts', String(restarts)),
      ...(sections.length === 0 ? [row('related', 'none found')] : sections),
    ].join('')
  }

  #pod(state: ClusterState, uid: string): string {
    const view = state.pods.get(uid)
    if (view === undefined) return ''

    const m = state.metrics.pods[uid]
    const hue = `#${hueFor(view.namespace).toString(16).padStart(6, '0')}`
    const healthy = view.ready && view.phase === 'Running'

    return [
      `<div class="aurora-panel__name">${escape(view.name)}</div>`,
      `<div class="aurora-panel__kind">${dot(hue)}${escape(view.namespace)}</div>`,
      row('phase', `${dot(healthy ? GREEN : RED)}${view.phase}`),
      row('node', escape(view.node ?? 'unscheduled')),
      row('containers', `${view.containersReady[0]}/${view.containersReady[1]}`),
      row('restarts', String(view.restarts)),
      row('age', formatAge(view.createdAt)),
      '<div style="margin-top:12px">',
      // against its limit where there is one: the ceiling is what makes the
      // number mean anything
      row(
        'cpu',
        m === undefined
          ? '—'
          : view.cpuLimitMillis === null
            ? formatCpu(m.cpuMillis)
            : `${formatCpu(m.cpuMillis)} / ${formatCpu(view.cpuLimitMillis)}`,
      ),
      row(
        'memory',
        m === undefined
          ? '—'
          : view.memLimitBytes === null
            ? formatBytes(m.memBytes)
            : `${formatBytes(m.memBytes)} / ${formatBytes(view.memLimitBytes)}`,
      ),
      '</div>',
    ].join('')
  }
}
