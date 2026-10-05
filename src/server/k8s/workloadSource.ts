import {
  coreV1,
  ingressKind,
  networkingV1,
  persistentVolumeClaimKind,
  podKind,
  serviceKind,
  type KubeResources,
} from '@k8slens/kubernetes-contracts'
import { reaction } from 'mobx'
import type { WorkloadView } from '../../shared/workloads.js'
import { Watches } from './watches.js'
import { buildWorkloads } from './workloads.js'

/** A rollout touches every pod of a workload in a burst; group once it settles. */
const SETTLE_MS = 400

/**
 * Feeds the workloads lens. Started only while the lens is on, so a cluster
 * pays for the extra watches only while someone looks at them.
 */
export class WorkloadSource {
  readonly #watches: Watches
  #stopReacting: (() => void) | null = null
  #stopped = false

  constructor(kubeResources: KubeResources, clusterId: string) {
    this.#watches = new Watches(kubeResources, clusterId)
  }

  async start(onChange: (workloads: WorkloadView[]) => void): Promise<void> {
    // each related kind is optional: without access, the workload just lists less
    const [pods, services, ingresses, claims] = await Promise.all([
      this.#watches.watch(podKind, coreV1).value,
      this.#watches.watch(serviceKind, coreV1).value.catch(() => null),
      this.#watches.watch(ingressKind, networkingV1).value.catch(() => null),
      this.#watches.watch(persistentVolumeClaimKind, coreV1).value.catch(() => null),
    ])
    if (this.#stopped) return

    this.#stopReacting = reaction(
      () =>
        buildWorkloads({
          pods: pods.get(),
          services: services?.get() ?? [],
          ingresses: ingresses?.get() ?? [],
          claims: claims?.get() ?? [],
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
