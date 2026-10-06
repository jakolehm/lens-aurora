import { getInjectable2 } from "@k8slens/injectable";
import { kubeResourcesInjectionToken } from "@k8slens/kubernetes-contracts";
import { reaction } from "mobx";
import { Aurora } from "../web/aurora";
import { ClusterFeed } from "./cluster-feed";
import { connectedClustersInjectable } from "./connected-clusters.injectable";
import { followRevealRequestsInjectable } from "./navigation/follow-reveal-requests.injectable";
import { showInLensInjectable } from "./navigation/show-in-lens.injectable";
import { themeBackground } from "./theme-background";

const FLUSH_MS = 120;

export const mountAuroraInjectable = getInjectable2({
  id: "aurora-mount-scene",
  consumptions: [kubeResourcesInjectionToken],

  instantiate: (di) => {
    const kubeResources = di.inject(kubeResourcesInjectionToken)();
    const connectedClusters = di.inject(connectedClustersInjectable)();
    const showInLens = di.inject(showInLensInjectable)();
    const followRevealRequests = di.inject(followRevealRequestsInjectable)();

    return () => (host: HTMLElement) => {
      const aurora = new Aurora(host, { background: themeBackground(host), showInLens });
      const feeds = new Map<string, ClusterFeed>();

      const connect = (id: string, name: string) => {
        const feed = new ClusterFeed(kubeResources, id, name, aurora);
        feed.start();
        feed.followLens(aurora.lens.name);
        feeds.set(id, feed);
      };

      const disconnect = (id: string) => {
        feeds.get(id)?.stop();
        feeds.delete(id);
      };

      aurora.lens.onChange(() => {
        for (const feed of feeds.values()) feed.followLens(aurora.lens.name);
      });

      const stopFollowing = reaction(
        () => connectedClusters.get()?.map((cluster) => ({ id: cluster.id, name: cluster.name.get() })) ?? [],
        (clusters) => {
          const wanted = new Set(clusters.map((cluster) => cluster.id));
          for (const id of feeds.keys()) if (!wanted.has(id)) disconnect(id);
          for (const cluster of clusters) if (!feeds.has(cluster.id)) connect(cluster.id, cluster.name);
        },
        { fireImmediately: true },
      );

      const stopRevealing = followRevealRequests(aurora);

      const flush = setInterval(() => {
        for (const { store } of feeds.values()) store.flush(Date.now());
      }, FLUSH_MS);

      return () => {
        stopFollowing();
        stopRevealing();
        clearInterval(flush);
        for (const id of [...feeds.keys()]) disconnect(id);
        aurora.dispose();
      };
    };
  },
});
