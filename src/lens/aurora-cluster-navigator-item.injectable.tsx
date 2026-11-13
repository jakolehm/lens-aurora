import { clusterNavigatorItemKind } from "@k8slens/cluster-contracts";
import { NavigatorItemIcon, NavigatorItemLabel, NavigatorLeafIndicator } from "@k8slens/navigator-components";
import {
  getNavigatorItemKind,
  getNavigatorItemKindInjectableBunch2,
  type NavigatorItemProps,
} from "@k8slens/navigator-contracts";
import { computed } from "mobx";
import { AuroraMonoIcon } from "./aurora-icon";
import { openAuroraClusterTabInjectable } from "./open-aurora-cluster-tab.injectable";

interface AuroraItem {
  readonly id: string;
  readonly name: string;
}

const auroraClusterItemKind = getNavigatorItemKind<AuroraItem, [clusterId: string]>()("aurora-cluster");

const auroraItems = computed((): AuroraItem[] => [{ id: "aurora", name: "Aurora" }]);

const AuroraRow = ({ item }: NavigatorItemProps<AuroraItem, typeof clusterNavigatorItemKind>) => (
  <>
    <NavigatorLeafIndicator />
    <NavigatorItemIcon>
      <AuroraMonoIcon $size="s" />
    </NavigatorItemIcon>
    <NavigatorItemLabel>{item.name}</NavigatorItemLabel>
  </>
);

export const auroraClusterNavigatorItemBunch = getNavigatorItemKindInjectableBunch2({
  kind: auroraClusterItemKind,
  parentKind: clusterNavigatorItemKind,
  description: "Aurora of one cluster: opens a tab that shows only that cluster in 3D.",
  items: {
    instantiate: () => async () => auroraItems,
  },
  activate: {
    instantiate: (di) => {
      const openAuroraClusterTab = di.inject(openAuroraClusterTabInjectable)();

      return async (clusterId) => openAuroraClusterTab(clusterId);
    },
  },
  Component: AuroraRow,
});
