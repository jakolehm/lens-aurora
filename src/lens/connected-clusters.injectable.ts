import { connectedClusterRecordsReactiveInjectionToken, type ClusterRecord } from "@k8slens/cluster-contracts";
import { getInjectable2 } from "@k8slens/injectable";
import { computed, observable, runInAction, type IComputedValue } from "mobx";

export const connectedClustersInjectable = getInjectable2({
  id: "aurora-connected-clusters",
  consumptions: [connectedClusterRecordsReactiveInjectionToken],

  instantiate: (di) => {
    const connectedClusterRecords = di.inject(connectedClusterRecordsReactiveInjectionToken);
    // undefined while Lens does not know any cluster yet
    const records = observable.box<IComputedValue<ClusterRecord[]> | undefined>(undefined, { deep: false });

    void connectedClusterRecords().then((loaded) => runInAction(() => records.set(loaded)));

    const clusters = computed(() => records.get()?.get());

    return () => clusters;
  },
});
