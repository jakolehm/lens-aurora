import { clusterNameReactiveInjectionToken } from "@k8slens/cluster-contracts";
import { Div, Span } from "@k8slens/element-components";
import { mainViewTabHostKind } from "@k8slens/main-view-contracts";
import { getTabKind, getTabKindInjectableBunch, type TabProps } from "@k8slens/tab-contracts";
import { useSyncInject } from "@k8slens/use-inject";
import { observer } from "mobx-react";
import { Suspense, use } from "react";
import { AuroraIcon } from "./aurora-icon";
import { AuroraView } from "./aurora-view";

// the tab id is the cluster id, so a tab needs nothing kept beside it
export const auroraClusterTabKind = getTabKind()("aurora-cluster");

const AuroraClusterTab = ({ tabId }: TabProps<typeof mainViewTabHostKind>) => <AuroraView clusterId={tabId} />;

// a long cluster name ends in an ellipsis, and the whole of it is in the tooltip
const ClusterTitle = observer(({ clusterId }: { clusterId: string }) => {
  const title = `Aurora: ${use(useSyncInject(clusterNameReactiveInjectionToken, clusterId)).get()}`;

  return (
    <Span $className="aurora-tab-title" $tooltip={title}>
      {title}
    </Span>
  );
});

const AuroraClusterTabTitle = ({ tabId }: TabProps<typeof mainViewTabHostKind>) => (
  <Div $flex={{ gap: "xs", verticalAlign: "center" }}>
    <AuroraIcon $size="s" />
    <Suspense fallback={<Span>Aurora</Span>}>
      <ClusterTitle clusterId={tabId} />
    </Suspense>
  </Div>
);

export const auroraClusterTabBunch = getTabKindInjectableBunch({
  tabHostKind: mainViewTabHostKind,
  kind: auroraClusterTabKind,
  Component: AuroraClusterTab,
  Title: AuroraClusterTabTitle,
});
