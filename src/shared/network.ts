// What the network lens shows: where traffic enters a cluster from outside,
// and the services it is sent on to.

export type EntryKind = 'Gateway' | 'Ingress' | 'LoadBalancer' | 'NodePort'

export interface EntryView {
  /** `kind/namespace/name`, unique within one cluster */
  key: string
  kind: EntryKind
  name: string
  namespace: string
  /** hosts, addresses and ports, as far as the cluster knows them */
  detail: string
  /** keys of the services it sends traffic to */
  services: string[]
}

export interface ServiceHop {
  /** `namespace/name` */
  key: string
  name: string
  namespace: string
  /** type and ports */
  detail: string
  pods: string[]
}

export interface NetworkView {
  entries: EntryView[]
  /** only the services some entry reaches: this lens follows traffic from outside */
  services: ServiceHop[]
}

export const EMPTY_NETWORK: NetworkView = { entries: [], services: [] }
