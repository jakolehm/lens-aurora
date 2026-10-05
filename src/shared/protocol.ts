// The contract between the cluster feed and the scene.
//
// The scene never sees a Kubernetes object. The feed translates raw API
// churn into the small closed vocabulary of semantic events below, and the
// scene maps each one to an animation.

export type NodeRole = 'control-plane' | 'worker'
export type PodPhase = 'Pending' | 'Running' | 'Succeeded' | 'Failed' | 'Unknown'
export type PressureKind = 'memory' | 'disk' | 'pid'

export interface NodeView {
  name: string
  role: NodeRole
  ready: boolean
  schedulable: boolean
  pressure: PressureKind[]
  version: string
  createdAt: string
  /** known only from the pods scheduled on it, because the node itself cannot be read */
  inferred: boolean
}

export interface PodView {
  uid: string
  name: string
  namespace: string
  node: string | null
  phase: PodPhase
  ready: boolean
  containersReady: [number, number]
  restarts: number
  /** controller uid, used to correlate migrations */
  ownerKey: string | null
  /** summed across containers; null if any container is unbounded */
  cpuLimitMillis: number | null
  memLimitBytes: number | null
  createdAt: string
}

export interface NodeMetrics {
  cpuMillis: number
  cpuPercent: number
  memBytes: number
  memPercent: number
}

export interface PodMetrics {
  cpuMillis: number
  memBytes: number
}

export interface MetricsView {
  nodes: Record<string, NodeMetrics>
  pods: Record<string, PodMetrics>
}

export type SemanticEvent =
  | { kind: 'pod.scheduled'; uid: string; node: string }
  | { kind: 'pod.pulling'; uid: string }
  | { kind: 'pod.ready'; uid: string }
  | { kind: 'pod.restart'; uid: string; count: number }
  | { kind: 'pod.crashloop'; uid: string }
  | { kind: 'pod.crashloop.cleared'; uid: string }
  | { kind: 'pod.oomkilled'; uid: string }
  | { kind: 'pod.terminating'; uid: string }
  | { kind: 'pod.migrated'; uid: string; from: string; to: string }
  /** the node's kubelet renewed its lease: proof of life, ~every 10s */
  | { kind: 'node.heartbeat'; name: string }
  | { kind: 'node.joined'; name: string }
  | { kind: 'node.notready'; name: string }
  | { kind: 'node.recovered'; name: string }
  | { kind: 'node.pressure'; name: string; kinds: PressureKind[] }
  | { kind: 'node.pressure.cleared'; name: string }
  | { kind: 'node.cordoned'; name: string }
  | { kind: 'node.uncordoned'; name: string }

export type ServerMessage =
  | { type: 'delta'; nodes: NodeView[]; pods: PodView[]; removedNodes: string[]; removedPods: string[] }
  | { type: 'metrics'; metrics: MetricsView }
  | { type: 'event'; events: SemanticEvent[] }

export const EMPTY_METRICS: MetricsView = { nodes: {}, pods: {} }
