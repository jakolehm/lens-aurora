import type { KubeResources } from "@k8slens/kubernetes-contracts";
import { LensCluster } from "../server/k8s/lensCluster";
import { NetworkSource } from "../server/k8s/networkSource";
import { WorkloadSource } from "../server/k8s/workloadSource";
import { ClusterStore } from "../server/model/store";
import { EMPTY_NETWORK, type NetworkView } from "../shared/network";
import type { WorkloadView } from "../shared/workloads";
import type { Aurora } from "../web/aurora";
import type { LensName } from "../web/state/lens";

/** A cluster Lens calls connected can still fail to list: try it again after this long. */
const RETRY_MS = 30_000;

/**
 * What feeds one cluster of the fleet: its nodes and pods always, its
 * workloads and network on demand. The cluster joins the scene only once its first pods
 * arrive, so one that Lens calls connected but that cannot be reached takes
 * no room in the fleet.
 */
export class ClusterFeed {
  readonly store: ClusterStore;
  readonly #kubeResources: KubeResources;
  readonly #id: string;
  readonly #name: string;
  readonly #aurora: Aurora;
  #source: LensCluster | null = null;
  #retry: ReturnType<typeof setTimeout> | undefined;
  #shown = false;
  #stopped = false;
  #workloads: WorkloadSource | null = null;
  /** kept, because workloads can be grouped before the cluster has joined the scene */
  #lastWorkloads: readonly WorkloadView[] = [];
  #network: NetworkSource | null = null;
  #lastNetwork: NetworkView = EMPTY_NETWORK;

  constructor(kubeResources: KubeResources, id: string, name: string, aurora: Aurora) {
    this.#kubeResources = kubeResources;
    this.#id = id;
    this.#name = name;
    this.#aurora = aurora;
    this.store = new ClusterStore({
      onDelta: (message) => {
        this.#show();
        aurora.apply(id, message);
      },
      onEvents: (events) => aurora.apply(id, { type: "event", events }),
      onMetrics: (metrics) => aurora.apply(id, { type: "metrics", metrics }),
    });
  }

  start(): void {
    const source = new LensCluster(this.#kubeResources, this.#id);
    this.#source = source;
    source.start(this.store).catch(() => {
      source.stop();
      if (!this.#stopped) this.#retry = setTimeout(() => this.start(), RETRY_MS);
    });
  }

  #show(): void {
    if (this.#shown) return;
    this.#shown = true;
    this.#aurora.addCluster(this.#id, this.#name);
    this.#aurora.setWorkloads(this.#id, this.#lastWorkloads);
    this.#aurora.setNetwork(this.#id, this.#lastNetwork);
  }

  #setWorkloads(workloads: readonly WorkloadView[]): void {
    this.#lastWorkloads = workloads;
    this.#aurora.setWorkloads(this.#id, workloads);
  }

  /** Watches what the lens draws, and nothing that only another lens draws. */
  followLens(lens: LensName): void {
    this.#followWorkloads(lens === "workloads");
    this.#followNetwork(lens === "network");
  }

  #followWorkloads(follow: boolean): void {
    if (follow === (this.#workloads !== null)) return;
    if (follow) {
      const source = new WorkloadSource(this.#kubeResources, this.#id);
      this.#workloads = source;
      source.start((workloads) => this.#setWorkloads(workloads)).catch(() => {
        if (this.#workloads === source) this.#followWorkloads(false);
      });
      return;
    }
    this.#workloads?.stop();
    this.#workloads = null;
    this.#setWorkloads([]);
  }

  #setNetwork(network: NetworkView): void {
    this.#lastNetwork = network;
    this.#aurora.setNetwork(this.#id, network);
  }

  #followNetwork(follow: boolean): void {
    if (follow === (this.#network !== null)) return;
    if (follow) {
      const source = new NetworkSource(this.#kubeResources, this.#id);
      this.#network = source;
      source.start((network) => this.#setNetwork(network)).catch(() => {
        if (this.#network === source) this.#followNetwork(false);
      });
      return;
    }
    this.#network?.stop();
    this.#network = null;
    this.#setNetwork(EMPTY_NETWORK);
  }

  stop(): void {
    this.#stopped = true;
    clearTimeout(this.#retry);
    this.#followWorkloads(false);
    this.#followNetwork(false);
    this.#source?.stop();
    if (this.#shown) this.#aurora.removeCluster(this.#id);
  }
}
