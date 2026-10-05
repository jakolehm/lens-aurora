import { coordinationV1, coreV1, leaseKind, nodeKind, podKind, type KubeResources } from '@k8slens/kubernetes-contracts'
import { reaction, type IComputedValue } from 'mobx'
import type { SourceSink } from '../model/types.js'
import { adaptNode, adaptPod, inferNode } from './adapt.js'
import { metricsV1beta1, nodeMetricsKind, podMetricsKind, type LeaseResource, type NodeResource, type PodResource } from './kinds.js'
import { collectMetrics, parseCpu, parseMemory, type Capacity } from './metrics.js'
import { Watches } from './watches.js'

const METRICS_MS = 5000
const LEASE_NAMESPACE = 'kube-node-lease'

interface Versioned {
  metadata: { uid: string; name: string; namespace?: string; resourceVersion?: string }
}

/** Feeds the store from the watches Lens keeps for a cluster. */
export class LensCluster {
  readonly #watches: Watches
  readonly #capacity = new Map<string, Capacity>()
  /** `namespace/name` to uid; metrics-server omits uids, so we map them back */
  readonly #podUids = new Map<string, string>()
  /** last seen renewTime per node, so a re-list is not a burst of beats */
  readonly #renewals = new Map<string, string>()
  readonly #disposers: (() => void)[] = []
  /** the tile can unmount while the first lists are still loading */
  #stopped = false

  constructor(kubeResources: KubeResources, clusterId: string) {
    this.#watches = new Watches(kubeResources, clusterId)
  }

  async start(sink: SourceSink): Promise<void> {
    const [nodes, pods] = await Promise.all([
      // reading nodes needs a cluster-wide permission that many users lack
      this.#watches.watch(nodeKind, coreV1).value.catch(() => null),
      this.#watches.watch(podKind, coreV1).value,
    ])
    if (this.#stopped) return

    if (nodes === null) {
      this.#inferNodes(pods, sink)
    } else {
      this.#follow<NodeResource>(nodes, {
        upsert: (n) => {
          this.#rememberCapacity(n)
          sink.upsertNode(adaptNode(n))
        },
        remove: (n) => {
          this.#capacity.delete(n.metadata.name)
          sink.removeNode(n.metadata.name)
        },
      })
    }

    this.#follow<PodResource>(pods, {
      upsert: (p) => {
        this.#podUids.set(`${p.metadata.namespace}/${p.metadata.name}`, p.metadata.uid)
        sink.upsertPod(adaptPod(p))
      },
      remove: (p) => {
        this.#podUids.delete(`${p.metadata.namespace}/${p.metadata.name}`)
        sink.removePod(p.metadata.uid)
      },
    })

    await this.#followLeases(sink)
    if (this.#stopped) return
    sink.synced()

    await this.#followMetrics(sink)
  }

  stop(): void {
    this.#stopped = true
    for (const dispose of this.#disposers) dispose()
    this.#watches.dispose()
  }

  /** Without access to nodes, the nodes are the ones the pods are scheduled on. */
  #inferNodes(pods: IComputedValue<readonly PodResource[]>, sink: SourceSink): void {
    let known = new Set<string>()

    this.#disposers.push(
      reaction(
        () => new Set(pods.get().flatMap((p) => (p.spec.nodeName === undefined ? [] : [p.spec.nodeName]))),
        (names) => {
          for (const name of names) if (!known.has(name)) sink.upsertNode(inferNode(name))
          for (const name of known) if (!names.has(name)) sink.removeNode(name)
          known = names
        },
        { fireImmediately: true },
      ),
    )
  }

  /**
   * kubelet leases: the cluster's pulse. A node stops renewing the moment its
   * kubelet dies, which is well before the Ready condition flips. Optional:
   * without the right to read leases the scene simply has no heartbeat.
   */
  async #followLeases(sink: SourceSink): Promise<void> {
    const leases = await this.#watches.watch(leaseKind, coordinationV1, LEASE_NAMESPACE).value.catch(() => null)
    if (leases === null || this.#stopped) return

    this.#follow<LeaseResource>(leases, {
      upsert: (l) => {
        const renew = l.spec?.renewTime
        if (renew === undefined) return
        const at = new Date(renew).toISOString()
        if (this.#renewals.get(l.metadata.name) === at) return
        this.#renewals.set(l.metadata.name, at)
        sink.heartbeat(l.metadata.name)
      },
      remove: (l) => this.#renewals.delete(l.metadata.name),
    })
  }

  /** Optional too: a cluster without metrics-server still has a shape. */
  async #followMetrics(sink: SourceSink): Promise<void> {
    const nodeSubscription = this.#watches.watch(nodeMetricsKind, metricsV1beta1)
    const podSubscription = this.#watches.watch(podMetricsKind, metricsV1beta1)
    const watched = await Promise.all([nodeSubscription.value, podSubscription.value]).catch(() => null)
    if (watched === null || this.#stopped) return

    const [nodeMetrics, podMetrics] = watched
    this.#disposers.push(
      reaction(
        () => [nodeMetrics.get(), podMetrics.get()] as const,
        ([nodes, pods]) =>
          sink.metrics(
            collectMetrics(nodes, pods, this.#capacity, (ns, name) => this.#podUids.get(`${ns}/${name}`)),
          ),
        { fireImmediately: true },
      ),
    )

    // the metrics API cannot be watched, so it is listed again on a beat
    const poll = setInterval(() => {
      nodeSubscription.refresh()
      podSubscription.refresh()
    }, METRICS_MS)
    this.#disposers.push(() => clearInterval(poll))
  }

  /** Turns a list Lens keeps current into the upserts and removals the store expects. */
  #follow<T extends Versioned>(
    list: IComputedValue<readonly T[]>,
    on: { upsert: (item: T) => void; remove: (item: T) => void },
  ): void {
    let seen = new Map<string, T>()

    this.#disposers.push(
      reaction(
        () => list.get(),
        (items) => {
          const next = new Map<string, T>()
          for (const item of items) {
            next.set(item.metadata.uid, item)
            const prev = seen.get(item.metadata.uid)
            if (prev === undefined || prev.metadata.resourceVersion !== item.metadata.resourceVersion) on.upsert(item)
          }
          for (const [uid, item] of seen) if (!next.has(uid)) on.remove(item)
          seen = next
        },
        { fireImmediately: true },
      ),
    )
  }

  #rememberCapacity(n: NodeResource): void {
    const alloc = n.status?.allocatable
    if (alloc === undefined) return
    this.#capacity.set(n.metadata.name, {
      cpuMillis: parseCpu(alloc['cpu'] ?? '0'),
      memBytes: parseMemory(alloc['memory'] ?? '0'),
    })
  }
}
