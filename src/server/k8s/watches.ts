import type {
  KubeResource,
  KubeResourceApiVersion,
  KubeResourceKind,
  KubeResources,
} from '@k8slens/kubernetes-contracts'
import type { Subscription } from '@k8slens/subscribable'

/** The watches one source holds on one cluster, released together. */
export class Watches {
  readonly #kubeResources: KubeResources
  readonly #clusterId: string
  readonly #subscriptions: Subscription<unknown>[] = []

  constructor(kubeResources: KubeResources, clusterId: string) {
    this.#kubeResources = kubeResources
    this.#clusterId = clusterId
  }

  watch<TKind extends KubeResourceKind, TApiVersion extends KubeResourceApiVersion<TKind>>(
    kind: TKind,
    apiVersion: TApiVersion,
    namespace?: string,
  ): Subscription<readonly KubeResource<TKind, TApiVersion>[]> {
    const subscription = this.#kubeResources(kind, apiVersion, this.#clusterId, namespace).subscribe()
    subscription.claim()
    this.#subscriptions.push(subscription)
    return subscription
  }

  dispose(): void {
    for (const subscription of this.#subscriptions) subscription.dispose()
  }
}
