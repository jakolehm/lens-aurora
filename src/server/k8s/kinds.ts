import {
  coordinationV1,
  coreV1,
  getKubeResourceKind,
  getKubernetesApiVersion,
  type ingressKind,
  type KubeResource,
  type leaseKind,
  type networkingV1,
  type nodeKind,
  type persistentVolumeClaimKind,
  type podKind,
  type serviceKind,
} from '@k8slens/kubernetes-contracts'

export type NodeResource = KubeResource<typeof nodeKind, typeof coreV1>
export type PodResource = KubeResource<typeof podKind, typeof coreV1>
export type LeaseResource = KubeResource<typeof leaseKind, typeof coordinationV1>
export type ServiceResource = KubeResource<typeof serviceKind, typeof coreV1>
export type IngressResource = KubeResource<typeof ingressKind, typeof networkingV1>
export type ClaimResource = KubeResource<typeof persistentVolumeClaimKind, typeof coreV1>

interface Usage {
  cpu: string
  memory: string
}

export const metricsV1beta1 = getKubernetesApiVersion('metrics.k8s.io/v1beta1')

export const nodeMetricsKind = getKubeResourceKind<{
  'metrics.k8s.io/v1beta1': {
    kind: 'NodeMetrics'
    metadata: { name: string }
    usage: Usage
  }
}>('NodeMetrics')

export const podMetricsKind = getKubeResourceKind<{
  'metrics.k8s.io/v1beta1': {
    kind: 'PodMetrics'
    metadata: { name: string; namespace: string }
    containers: { name: string; usage: Usage }[]
  }
}>('PodMetrics')

export type NodeMetricsResource = KubeResource<typeof nodeMetricsKind, typeof metricsV1beta1>
export type PodMetricsResource = KubeResource<typeof podMetricsKind, typeof metricsV1beta1>

/** Gateway API and Istio are not built into Lens, so their kinds are declared here, as far as the network lens reads them. */
export const gatewayV1 = getKubernetesApiVersion('gateway.networking.k8s.io/v1')
export const istioV1 = getKubernetesApiVersion('networking.istio.io/v1')

interface ParentRef {
  name: string
  namespace?: string
  kind?: string
}

interface BackendRef {
  name: string
  namespace?: string
  kind?: string
}

export const gatewayKind = getKubeResourceKind<{
  'gateway.networking.k8s.io/v1': {
    kind: 'Gateway'
    metadata: { name: string; namespace: string; uid: string; resourceVersion?: string }
    spec: { gatewayClassName: string; listeners?: { name: string; hostname?: string; port: number; protocol: string }[] }
    status?: { addresses?: { value: string }[] }
  }
  'networking.istio.io/v1': {
    kind: 'Gateway'
    metadata: { name: string; namespace: string; uid: string; resourceVersion?: string }
    spec: {
      selector?: Record<string, string>
      servers?: { port: { number: number; protocol: string }; hosts?: string[] }[]
    }
  }
}>('Gateway')

interface IstioRoute {
  route?: { destination: { host: string } }[]
}

export const virtualServiceKind = getKubeResourceKind<{
  'networking.istio.io/v1': {
    kind: 'VirtualService'
    metadata: { name: string; namespace: string; uid: string; resourceVersion?: string }
    spec: { hosts?: string[]; gateways?: string[]; http?: IstioRoute[]; tcp?: IstioRoute[]; tls?: IstioRoute[] }
  }
}>('VirtualService')

export const httpRouteKind = getKubeResourceKind<{
  'gateway.networking.k8s.io/v1': {
    kind: 'HTTPRoute'
    metadata: { name: string; namespace: string; uid: string; resourceVersion?: string }
    spec: { parentRefs?: ParentRef[]; hostnames?: string[]; rules?: { backendRefs?: BackendRef[] }[] }
  }
}>('HTTPRoute')

export type GatewayResource = KubeResource<typeof gatewayKind, typeof gatewayV1>
export type HttpRouteResource = KubeResource<typeof httpRouteKind, typeof gatewayV1>
export type IstioGatewayResource = KubeResource<typeof gatewayKind, typeof istioV1>
export type VirtualServiceResource = KubeResource<typeof virtualServiceKind, typeof istioV1>
