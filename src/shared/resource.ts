// How Aurora and Lens point at one Kubernetes resource for each other.

export interface ResourceKind {
  kind: string
  apiVersion: string
}

export interface ResourceRef extends ResourceKind {
  cluster: string
  name: string
  /** absent for a cluster-scoped kind */
  namespace?: string
}

/** The built-in kinds Aurora shows, in the version Lens reads them in. */
const API_VERSIONS: Readonly<Record<string, string>> = {
  Pod: 'v1',
  Node: 'v1',
  Namespace: 'v1',
  Service: 'v1',
  ConfigMap: 'v1',
  Secret: 'v1',
  ServiceAccount: 'v1',
  PersistentVolumeClaim: 'v1',
  ReplicationController: 'v1',
  Deployment: 'apps/v1',
  StatefulSet: 'apps/v1',
  DaemonSet: 'apps/v1',
  ReplicaSet: 'apps/v1',
  Job: 'batch/v1',
  CronJob: 'batch/v1',
  Ingress: 'networking.k8s.io/v1',
}

/** Null for a kind Aurora does not know the version of, such as a custom owner of pods. */
export function builtInRef(cluster: string, kind: string, name: string, namespace?: string): ResourceRef | null {
  const apiVersion = API_VERSIONS[kind]
  return apiVersion === undefined ? null : { cluster, kind, apiVersion, name, ...(namespace === undefined ? {} : { namespace }) }
}
