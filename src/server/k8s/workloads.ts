import { RELATED_KINDS, type RelatedKind, type RelatedView, type WorkloadView } from '../../shared/workloads.js'
import type { ClaimResource, IngressResource, PodResource, ServiceResource } from './kinds.js'

/** Every pod mounts this one; listing it on each workload says nothing. */
const IMPLICIT_CONFIG_MAPS = new Set(['kube-root-ca.crt'])
const IMPLICIT_SERVICE_ACCOUNTS = new Set(['default'])
/** the cronjob controller names its jobs `<cronjob>-<scheduled minute>` */
const CRONJOB_JOB = /^(.+)-\d{8,}$/

export interface WorkloadInputs {
  pods: readonly PodResource[]
  services: readonly ServiceResource[]
  ingresses: readonly IngressResource[]
  claims: readonly ClaimResource[]
}

interface Owner {
  kind: string
  name: string
}

interface Group {
  view: WorkloadView
  related: Map<string, RelatedView>
}

const relatedKey = (kind: RelatedKind, name: string): string => `${kind}/${name}`

/**
 * The controller a person thinks of as owning the pod. Read from the pod
 * alone, so the lens needs no access to replica sets or jobs.
 */
export function ownerOf(pod: PodResource): Owner {
  const refs = pod.metadata.ownerReferences ?? []
  const ref = refs.find((r) => r.controller === true) ?? refs[0]
  if (ref === undefined) return { kind: 'Pod', name: pod.metadata.name }

  // the deployment controller names a replica set `<deployment>-<pod-template-hash>`
  const hash = pod.metadata.labels?.['pod-template-hash']
  if (ref.kind === 'ReplicaSet' && hash !== undefined && ref.name.endsWith(`-${hash}`)) {
    return { kind: 'Deployment', name: ref.name.slice(0, -hash.length - 1) }
  }

  const cron = ref.kind === 'Job' ? CRONJOB_JOB.exec(ref.name) : null
  if (cron !== null) return { kind: 'CronJob', name: cron[1]! }

  return { kind: ref.kind, name: ref.name }
}

/** Names only: secrets and config maps are never read, so their contents never reach Aurora. */
export function referencesOf(pod: PodResource): RelatedView[] {
  const spec = pod.spec
  const found: RelatedView[] = []
  const add = (kind: RelatedKind, name: string | undefined): void => {
    if (name !== undefined && name !== '') found.push({ kind, name, detail: '', via: null })
  }

  for (const volume of spec.volumes ?? []) {
    add('ConfigMap', volume.configMap?.name)
    add('Secret', volume.secret?.secretName)
    add('PersistentVolumeClaim', volume.persistentVolumeClaim?.claimName)
    for (const source of volume.projected?.sources ?? []) {
      add('ConfigMap', source.configMap?.name)
      add('Secret', source.secret?.name)
    }
  }
  for (const container of [...(spec.initContainers ?? []), ...spec.containers]) {
    for (const env of container.env ?? []) {
      add('ConfigMap', env.valueFrom?.configMapKeyRef?.name)
      add('Secret', env.valueFrom?.secretKeyRef?.name)
    }
    for (const env of container.envFrom ?? []) {
      add('ConfigMap', env.configMapRef?.name)
      add('Secret', env.secretRef?.name)
    }
  }
  for (const secret of spec.imagePullSecrets ?? []) add('Secret', secret.name)
  if (!IMPLICIT_SERVICE_ACCOUNTS.has(spec.serviceAccountName ?? 'default')) add('ServiceAccount', spec.serviceAccountName)

  return found.filter((r) => !(r.kind === 'ConfigMap' && IMPLICIT_CONFIG_MAPS.has(r.name)))
}

export function selects(service: ServiceResource, pod: PodResource): boolean {
  const selector = Object.entries(service.spec.selector ?? {})
  const labels = pod.metadata.labels ?? {}
  return selector.length > 0 && selector.every(([key, value]) => labels[key] === value)
}

export function backendsOf(ingress: IngressResource): string[] {
  const spec = ingress.spec
  return [
    spec?.defaultBackend?.service?.name,
    ...(spec?.rules ?? []).flatMap((rule) => (rule.http?.paths ?? []).map((path) => path.backend.service?.name)),
  ].filter((name): name is string => name !== undefined)
}

export const serviceDetail = (service: ServiceResource): string =>
  [service.spec.type ?? 'ClusterIP', ...(service.spec.ports ?? []).map((p) => `${p.port}/${p.protocol ?? 'TCP'}`)].join(
    ' ',
  )

const ingressDetail = (ingress: IngressResource): string =>
  (ingress.spec?.rules ?? []).flatMap((rule) => (rule.host === undefined ? [] : [rule.host])).join(' ')

const claimDetail = (claim: ClaimResource | undefined): string =>
  claim === undefined
    ? ''
    : [
        claim.status?.phase,
        claim.status?.capacity?.['storage'] ?? claim.spec.resources?.requests?.['storage'],
        claim.spec.storageClassName,
      ]
        .filter((part) => part !== undefined)
        .join(' ')

const byNamespace = <T extends { metadata: { namespace?: string } }>(items: readonly T[]): Map<string, T[]> => {
  const out = new Map<string, T[]>()
  for (const item of items) {
    const namespace = item.metadata.namespace ?? ''
    out.set(namespace, [...(out.get(namespace) ?? []), item])
  }
  return out
}

const rank = (r: RelatedView): number => RELATED_KINDS.indexOf(r.kind)

/** Groups pods by owner and finds what each owner's pods are reached by and depend on. */
export function buildWorkloads({ pods, services, ingresses, claims }: WorkloadInputs): WorkloadView[] {
  const servicesIn = byNamespace(services)
  const ingressesIn = byNamespace(ingresses)
  const claimsByName = new Map(claims.map((c) => [`${c.metadata.namespace}/${c.metadata.name}`, c]))
  const groups = new Map<string, Group>()

  for (const pod of pods) {
    const namespace = pod.metadata.namespace
    const owner = ownerOf(pod)
    const key = `${namespace}/${owner.kind}/${owner.name}`
    let group = groups.get(key)
    if (group === undefined) {
      group = { view: { key, ...owner, namespace, pods: [], related: [] }, related: new Map() }
      groups.set(key, group)
    }

    group.view.pods.push(pod.metadata.uid)
    for (const ref of referencesOf(pod)) group.related.set(relatedKey(ref.kind, ref.name), ref)
    for (const service of servicesIn.get(namespace) ?? []) {
      if (!selects(service, pod)) continue
      const name = service.metadata.name
      group.related.set(relatedKey('Service', name), { kind: 'Service', name, detail: serviceDetail(service), via: null })
    }
  }

  for (const { view, related } of groups.values()) {
    for (const ingress of ingressesIn.get(view.namespace) ?? []) {
      const via = backendsOf(ingress).find((service) => related.has(relatedKey('Service', service)))
      if (via === undefined) continue
      const name = ingress.metadata.name
      related.set(relatedKey('Ingress', name), { kind: 'Ingress', name, detail: ingressDetail(ingress), via })
    }
    view.related = [...related.values()]
      .map((r) =>
        r.kind === 'PersistentVolumeClaim' ? { ...r, detail: claimDetail(claimsByName.get(`${view.namespace}/${r.name}`)) } : r,
      )
      .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))
  }

  return [...groups.values()].map((g) => g.view).sort((a, b) => a.key.localeCompare(b.key))
}
