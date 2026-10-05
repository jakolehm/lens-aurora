import type { MetricsView } from '../../shared/protocol.js'
import type { NodeMetricsResource, PodMetricsResource } from './kinds.js'

const MEM_UNITS: Record<string, number> = {
  Ki: 1024,
  Mi: 1024 ** 2,
  Gi: 1024 ** 3,
  Ti: 1024 ** 4,
  Pi: 1024 ** 5,
  Ei: 1024 ** 6,
  k: 1e3,
  M: 1e6,
  G: 1e9,
  T: 1e12,
  P: 1e15,
  E: 1e18,
}

const QUANTITY = /^(\d+(?:\.\d+)?)([a-zA-Z]*)$/

export function parseCpu(quantity: string): number {
  const m = QUANTITY.exec(quantity.trim())
  if (m === null) return 0
  const value = Number(m[1])
  switch (m[2]) {
    case 'n':
      return Math.round(value / 1e6)
    case 'u':
      return Math.round(value / 1e3)
    case 'm':
      return Math.round(value)
    case '':
      return Math.round(value * 1000)
    default:
      return 0
  }
}

export function parseMemory(quantity: string): number {
  const m = QUANTITY.exec(quantity.trim())
  if (m === null) return 0
  const value = Number(m[1])
  const unit = m[2] ?? ''
  if (unit === '') return Math.round(value)
  const factor = MEM_UNITS[unit]
  return factor === undefined ? 0 : Math.round(value * factor)
}

/** Node allocatable capacity, needed to turn raw usage into a percentage. */
export interface Capacity {
  cpuMillis: number
  memBytes: number
}

export function collectMetrics(
  nodes: readonly NodeMetricsResource[],
  pods: readonly PodMetricsResource[],
  capacity: ReadonlyMap<string, Capacity>,
  /** metrics-server does not return uids */
  resolveUid: (namespace: string, name: string) => string | undefined,
): MetricsView {
  const view: MetricsView = { nodes: {}, pods: {} }

  for (const item of nodes) {
    const name = item.metadata.name
    const cap = capacity.get(name) ?? { cpuMillis: 0, memBytes: 0 }
    const cpuMillis = parseCpu(item.usage.cpu)
    const memBytes = parseMemory(item.usage.memory)
    view.nodes[name] = {
      cpuMillis,
      cpuPercent: cap.cpuMillis > 0 ? Math.round((cpuMillis / cap.cpuMillis) * 100) : 0,
      memBytes,
      memPercent: cap.memBytes > 0 ? Math.round((memBytes / cap.memBytes) * 100) : 0,
    }
  }

  for (const item of pods) {
    // metrics-server returns no uid, so the caller maps namespace/name back
    const uid = resolveUid(item.metadata.namespace, item.metadata.name)
    if (uid === undefined) continue
    let cpuMillis = 0
    let memBytes = 0
    for (const c of item.containers) {
      cpuMillis += parseCpu(c.usage.cpu)
      memBytes += parseMemory(c.usage.memory)
    }
    view.pods[uid] = { cpuMillis, memBytes }
  }

  return view
}
