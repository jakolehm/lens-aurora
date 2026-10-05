// What the workloads lens shows: pods grouped by the controller that owns
// them, and the resources that controller's pods reach.

export type RelatedKind = 'Ingress' | 'Service' | 'PersistentVolumeClaim' | 'ConfigMap' | 'Secret' | 'ServiceAccount'

export const RELATED_KINDS: readonly RelatedKind[] = [
  'Ingress',
  'Service',
  'PersistentVolumeClaim',
  'ConfigMap',
  'Secret',
  'ServiceAccount',
]

export interface RelatedView {
  kind: RelatedKind
  name: string
  /** one short line, such as ports, hosts or size; empty when only the name is known */
  detail: string
  /** the service an ingress reaches the workload through; null when it is direct */
  via: string | null
}

export interface WorkloadView {
  /** `namespace/kind/name`, unique within one cluster */
  key: string
  kind: string
  name: string
  namespace: string
  pods: string[]
  related: RelatedView[]
}
