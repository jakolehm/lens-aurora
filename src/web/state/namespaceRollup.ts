import type { ClusterState } from './cluster.js'

export interface NamespaceRow {
  name: string
  pods: number
  cpuMillis: number
  memBytes: number
}

export interface ClusterTotals {
  nodes: number
  pods: number
  cpuPercent: number
  memPercent: number
}

/** Per-namespace counts and load across clusters, ordered for display. */
export function rollupNamespaces(states: readonly ClusterState[]): NamespaceRow[] {
  const rows = new Map<string, NamespaceRow>()

  for (const state of states) for (const view of state.pods.values()) {
    let row = rows.get(view.namespace)
    if (row === undefined) {
      row = { name: view.namespace, pods: 0, cpuMillis: 0, memBytes: 0 }
      rows.set(view.namespace, row)
    }
    row.pods++
    const m = state.metrics.pods[view.uid]
    if (m === undefined) continue
    row.cpuMillis += m.cpuMillis
    row.memBytes += m.memBytes
  }

  // count first, then name, so equal-sized namespaces hold a stable order
  return [...rows.values()].sort((a, b) => b.pods - a.pods || a.name.localeCompare(b.name))
}

export function clusterTotals(states: readonly ClusterState[]): ClusterTotals {
  const reporting = states.flatMap((state) =>
    [...state.nodes.keys()].flatMap((name) => {
      const m = state.metrics.nodes[name]
      return m === undefined ? [] : [m]
    }),
  )

  const mean = (pick: (m: (typeof reporting)[number]) => number): number =>
    reporting.length === 0
      ? 0
      : Math.round(reporting.reduce((sum, m) => sum + pick(m), 0) / reporting.length)

  return {
    nodes: states.reduce((sum, state) => sum + state.nodes.size, 0),
    pods: states.reduce((sum, state) => sum + state.pods.size, 0),
    cpuPercent: mean((m) => m.cpuPercent),
    memPercent: mean((m) => m.memPercent),
  }
}
