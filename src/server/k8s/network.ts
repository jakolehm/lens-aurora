import type { EntryView, NetworkView, ServiceHop } from '../../shared/network.js'
import type { ResourceKind } from '../../shared/resource.js'
import {
  gatewayV1,
  istioV1,
  type GatewayResource,
  type HttpRouteResource,
  type IngressResource,
  type IstioGatewayResource,
  type PodResource,
  type ServiceResource,
  type VirtualServiceResource,
} from './kinds.js'
import { backendsOf, selects, serviceDetail } from './workloads.js'

export interface NetworkInputs {
  pods: readonly PodResource[]
  services: readonly ServiceResource[]
  ingresses: readonly IngressResource[]
  gateways: readonly GatewayResource[]
  routes: readonly HttpRouteResource[]
  istioGateways: readonly IstioGatewayResource[]
  virtualServices: readonly VirtualServiceResource[]
}

interface LoadBalancerStatus {
  ingress?: { ip?: string; hostname?: string }[]
}

/** An entry that runs on proxies of its own, and how to tell the service in front of those proxies. */
interface Router {
  entry: EntryView
  fronts: (service: ServiceResource) => boolean
}

/** Gateway API implementations, Istio among them, label the service they make for a gateway with its name. */
const GATEWAY_NAME_LABEL = 'gateway.networking.k8s.io/gateway-name'
/** A virtual service with no gateways named routes only inside the mesh. */
const MESH = 'mesh'

const SERVICE: ResourceKind = { kind: 'Service', apiVersion: 'v1' }
const INGRESS: ResourceKind = { kind: 'Ingress', apiVersion: 'networking.k8s.io/v1' }
const GATEWAY: ResourceKind = { kind: 'Gateway', apiVersion: gatewayV1 }
const ISTIO_GATEWAY: ResourceKind = { kind: 'Gateway', apiVersion: istioV1 }

const serviceKey = (namespace: string, name: string): string => `${namespace}/${name}`

const addressesOf = (status: LoadBalancerStatus | undefined): string[] =>
  (status?.ingress ?? []).flatMap((i) => {
    const address = i.hostname ?? i.ip
    return address === undefined ? [] : [address]
  })

const unique = (items: readonly string[]): string[] => [...new Set(items)]

const detailOf = (parts: readonly string[]): string => unique(parts.filter((p) => p !== '')).join(' ')

const isExposed = (service: ServiceResource): boolean =>
  service.spec.type === 'LoadBalancer' || service.spec.type === 'NodePort'

const portsOf = (service: ServiceResource): string[] =>
  (service.spec.ports ?? []).map((p) => (service.spec.type === 'NodePort' ? `:${p.nodePort}` : String(p.port)))

const sharesAddress = (addresses: readonly string[]) => (service: ServiceResource): boolean =>
  addressesOf(service.status?.loadBalancer).some((address) => addresses.includes(address))

/** `reviews`, `reviews.shop` and `reviews.shop.svc.cluster.local` all name one service. */
function serviceOfHost(host: string, namespace: string): string {
  const [name = host, inNamespace = namespace] = host.split('.')
  return serviceKey(inNamespace, name)
}

/** A service of type LoadBalancer or NodePort is an entry of its own: traffic reaches it without any router in front. */
function exposedEntry(service: ServiceResource): EntryView {
  const { name, namespace } = service.metadata
  const type = service.spec.type as 'LoadBalancer' | 'NodePort'
  return {
    key: `${type}/${namespace}/${name}`,
    kind: type,
    resource: SERVICE,
    name,
    namespace,
    detail: detailOf([...addressesOf(service.status?.loadBalancer), ...portsOf(service)]),
    services: [serviceKey(namespace, name)],
  }
}

function ingressRouters(ingresses: readonly IngressResource[]): Router[] {
  return ingresses.map((ingress) => {
    const { name, namespace } = ingress.metadata
    const rules = ingress.spec?.rules ?? []
    const addresses = addressesOf(ingress.status?.loadBalancer)
    return {
      entry: {
        key: `Ingress/${namespace}/${name}`,
        kind: 'Ingress',
        resource: INGRESS,
        name,
        namespace,
        detail: detailOf([...rules.map((rule) => rule.host ?? ''), ...addresses]),
        services: unique(backendsOf(ingress).map((backend) => serviceKey(namespace, backend))),
      },
      fronts: sharesAddress(addresses),
    }
  })
}

/** A gateway sends on what the HTTP routes attached to it name as their backends. */
function gatewayRouters(gateways: readonly GatewayResource[], routes: readonly HttpRouteResource[]): Router[] {
  return gateways.map((gateway) => {
    const { name, namespace } = gateway.metadata
    const attached = routes.filter((route) =>
      (route.spec.parentRefs ?? []).some(
        (ref) =>
          (ref.kind ?? 'Gateway') === 'Gateway' && ref.name === name && (ref.namespace ?? route.metadata.namespace) === namespace,
      ),
    )
    const backends = attached.flatMap((route) =>
      (route.spec.rules ?? []).flatMap((rule) =>
        (rule.backendRefs ?? [])
          .filter((ref) => (ref.kind ?? 'Service') === 'Service')
          .map((ref) => serviceKey(ref.namespace ?? route.metadata.namespace, ref.name)),
      ),
    )
    const listeners = gateway.spec.listeners ?? []
    const addresses = (gateway.status?.addresses ?? []).map((a) => a.value)
    const ownLabel = (service: ServiceResource): boolean =>
      service.metadata.namespace === namespace && service.metadata.labels?.[GATEWAY_NAME_LABEL] === name
    return {
      entry: {
        key: `Gateway/${namespace}/${name}`,
        kind: 'Gateway',
        resource: GATEWAY,
        name,
        namespace,
        detail: detailOf([
          ...attached.flatMap((route) => route.spec.hostnames ?? []),
          ...listeners.map((l) => l.hostname ?? ''),
          ...addresses,
          ...listeners.map((l) => `${l.port}/${l.protocol}`),
        ]),
        services: unique(backends),
      },
      fronts: (service) => ownLabel(service) || sharesAddress(addresses)(service),
    }
  })
}

/** An Istio gateway runs on the proxy pods its selector picks, and sends on what the virtual services bound to it route to. */
function istioRouters(
  gateways: readonly IstioGatewayResource[],
  virtualServices: readonly VirtualServiceResource[],
  podsOf: (service: ServiceResource) => readonly PodResource[],
): Router[] {
  return gateways.map((gateway) => {
    const { name, namespace } = gateway.metadata
    const bound = virtualServices.filter((vs) =>
      (vs.spec.gateways ?? [MESH]).some((ref) => ref === `${namespace}/${name}` || (ref === name && vs.metadata.namespace === namespace)),
    )
    const backends = bound.flatMap((vs) =>
      [...(vs.spec.http ?? []), ...(vs.spec.tcp ?? []), ...(vs.spec.tls ?? [])].flatMap((rule) =>
        (rule.route ?? []).map((route) => serviceOfHost(route.destination.host, vs.metadata.namespace)),
      ),
    )
    const servers = gateway.spec.servers ?? []
    const selector = Object.entries(gateway.spec.selector ?? {})
    const isProxy = (pod: PodResource): boolean =>
      selector.length > 0 && selector.every(([key, value]) => pod.metadata.labels?.[key] === value)
    return {
      entry: {
        key: `IstioGateway/${namespace}/${name}`,
        kind: 'Gateway',
        resource: ISTIO_GATEWAY,
        name,
        namespace,
        detail: detailOf([
          ...bound.flatMap((vs) => vs.spec.hosts ?? []),
          ...servers.map((server) => `${server.port.number}/${server.port.protocol}`),
        ]),
        services: unique(backends),
      },
      fronts: (service) => podsOf(service).some(isProxy),
    }
  })
}

/**
 * The paths from outside into the cluster: entries, the services they reach,
 * and those services' pods. A gateway or ingress that runs on proxies of its
 * own takes over the service in front of them, so its traffic is drawn to the
 * services it routes to, not to its proxies.
 */
export function buildNetwork({ pods, services, ingresses, gateways, routes, istioGateways, virtualServices }: NetworkInputs): NetworkView {
  const byKey = new Map(services.map((s) => [serviceKey(s.metadata.namespace, s.metadata.name), s]))
  const podsOf = (service: ServiceResource): PodResource[] =>
    pods.filter((pod) => pod.metadata.namespace === service.metadata.namespace && selects(service, pod))

  const routers = [
    ...gatewayRouters(gateways, routes),
    ...istioRouters(istioGateways, virtualServices, podsOf),
    ...ingressRouters(ingresses),
  ]
  const exposed = services.filter(isExposed)
  const fronted = routers.map(({ entry, fronts }) => {
    const doors = exposed.filter(fronts)
    return { ...entry, detail: detailOf([...entry.detail.split(' '), ...doors.flatMap((door) => addressesOf(door.status?.loadBalancer))]) }
  })
  const bare = exposed.filter((service) => !routers.some(({ fronts }) => fronts(service))).map(exposedEntry)

  // a backend that names no existing service is dropped: no traffic gets through it
  const entries = [...fronted, ...bare]
    .map((entry) => ({ ...entry, services: entry.services.filter((key) => byKey.has(key)) }))
    .sort((a, b) => a.key.localeCompare(b.key))

  const reached = unique(entries.flatMap((entry) => entry.services)).sort()
  const hops: ServiceHop[] = reached.map((key) => {
    const service = byKey.get(key)!
    const { name, namespace } = service.metadata
    return {
      key,
      name,
      namespace,
      detail: serviceDetail(service),
      pods: podsOf(service).map((pod) => pod.metadata.uid),
    }
  })

  return { entries, services: hops }
}
