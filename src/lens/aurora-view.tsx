import { Div } from "@k8slens/element-components";
import { useInject } from "@k8slens/use-inject";
import { observer } from "mobx-react";
import { useCallback } from "react";
import { connectedClustersInjectable } from "./connected-clusters.injectable";
import { mountAuroraInjectable } from "./mount-aurora.injectable";

interface AuroraViewProps {
  readonly clusterId?: string;
}

const Scene = ({ clusterId }: AuroraViewProps) => {
  const mountAurora = useInject(mountAuroraInjectable);
  const mount = useCallback(
    (host: HTMLDivElement | null) => (host === null ? undefined : mountAurora()(host, clusterId)),
    [mountAurora, clusterId],
  );

  return <div ref={mount} className="aurora-view" />;
};

export const AuroraView = observer(({ clusterId }: AuroraViewProps) => {
  const clusters = useInject(connectedClustersInjectable)().get();

  if (clusters === undefined) {
    return <Div $padding="l">Looking for clusters…</Div>;
  }

  if (clusterId !== undefined && !clusters.some((cluster) => cluster.id === clusterId)) {
    return <Div $padding="l">This cluster is not connected. Connect it in the navigator to see it here.</Div>;
  }

  if (clusters.length === 0) {
    return <Div $padding="l">No cluster is connected. Connect a cluster in the navigator to see it here.</Div>;
  }

  return <Scene clusterId={clusterId} />;
});
