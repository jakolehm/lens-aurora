import type { MetricsView, NodeView, PodView } from '../../shared/protocol.js'

export interface NodeObservation {
  view: NodeView
}

export interface PodObservation {
  view: PodView
  /** deletionTimestamp is set */
  deleting: boolean
  pulling: boolean
  /** any container is waiting on CrashLoopBackOff */
  crashloop: boolean
  /** finishedAt of the newest OOMKilled termination, or null */
  lastOomAt: string | null
}

export interface SourceSink {
  upsertNode(obs: NodeObservation): void
  removeNode(name: string): void
  upsertPod(obs: PodObservation): void
  removePod(uid: string): void
  /** a node's kubelet renewed its lease */
  heartbeat(node: string): void
  /** called once the initial list is applied; events are suppressed until then */
  synced(): void
  metrics(view: MetricsView): void
}
