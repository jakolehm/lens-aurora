import { coreV1, ingressKind, networkingV1, podKind, serviceKind, type KubeResources } from '@k8slens/kubernetes-contracts'
import { reaction } from 'mobx'
import type { NetworkView } from '../../shared/network.js'
import { gatewayKind, gatewayV1, httpRouteKind, istioV1, virtualServiceKind } from './kinds.js'
import { buildNetwork } from './network.js'
import { Watches } from './watches.js'

/** A rollout touches every pod behind a service in a burst; trace once it settles. */
const SETTLE_MS = 400

/** Feeds the network lens, only while the lens is on, as the workload source does for its lens. */
export class NetworkSource {
  readonly #watches: Watches
  #stopReacting: (() => void) | null = null
  #stopped = false

  constructor(kubeResources: KubeResources, clusterId: string) {
    this.#watches = new Watches(kubeResources, clusterId)
  }

  async start(onChange: (network: NetworkView) => void): Promise<void> {
    // a cluster without Gateway API or Istio, or without access to one kind, still has the others
    const [pods, services, ingresses, gateways, routes, istioGateways, virtualServices] = await Promise.all([
      this.#watches.watch(podKind, coreV1).value,
      this.#watches.watch(serviceKind, coreV1).value.catch(() => null),
      this.#watches.watch(ingressKind, networkingV1).value.catch(() => null),
      this.#watches.watch(gatewayKind, gatewayV1).value.catch(() => null),
      this.#watches.watch(httpRouteKind, gatewayV1).value.catch(() => null),
      this.#watches.watch(gatewayKind, istioV1).value.catch(() => null),
      this.#watches.watch(virtualServiceKind, istioV1).value.catch(() => null),
    ])
    if (this.#stopped) return

    this.#stopReacting = reaction(
      () =>
        buildNetwork({
          pods: pods.get(),
          services: services?.get() ?? [],
          ingresses: ingresses?.get() ?? [],
          gateways: gateways?.get() ?? [],
          routes: routes?.get() ?? [],
          istioGateways: istioGateways?.get() ?? [],
          virtualServices: virtualServices?.get() ?? [],
        }),
      onChange,
      { fireImmediately: true, delay: SETTLE_MS },
    )
  }

  stop(): void {
    this.#stopped = true
    this.#stopReacting?.()
    this.#watches.dispose()
  }
}
