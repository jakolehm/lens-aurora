import { Div } from "@k8slens/element-components";
import { useInject } from "@k8slens/use-inject";
import { observer } from "mobx-react";
import { useCallback } from "react";
import { connectedClustersInjectable } from "./connected-clusters.injectable";
import { mountAuroraInjectable } from "./mount-aurora.injectable";

const Fleet = () => {
  const mountAurora = useInject(mountAuroraInjectable);
  const mount = useCallback(
    (host: HTMLDivElement | null) => (host === null ? undefined : mountAurora()(host)),
    [mountAurora],
  );

  return <div ref={mount} className="aurora-view" />;
};

/** Every connected cluster in one scene, wherever it is shown: a tab or a window of its own. */
export const AuroraView = observer(() => {
  const clusters = useInject(connectedClustersInjectable)().get();

  if (clusters === undefined) {
    return <Div $padding="l">Looking for clusters…</Div>;
  }

  if (clusters.length === 0) {
    return <Div $padding="l">No cluster is connected. Connect a cluster in the navigator to see it here.</Div>;
  }

  return <Fleet />;
});
