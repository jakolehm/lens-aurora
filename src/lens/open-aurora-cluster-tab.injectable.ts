import { getInjectable2 } from "@k8slens/injectable";
import { mainViewTabHostKind } from "@k8slens/main-view-contracts";
import { focusTabInjectionToken, openTabInjectionToken, tabIsOpenInjectionToken } from "@k8slens/tab-contracts";
import { auroraClusterTabKind } from "./aurora-cluster-tab.injectable";

export const openAuroraClusterTabInjectable = getInjectable2({
  id: "aurora-open-cluster-tab",
  consumptions: [openTabInjectionToken, focusTabInjectionToken, tabIsOpenInjectionToken],

  instantiate: (di) => {
    const openTab = di.inject(openTabInjectionToken.for(mainViewTabHostKind).for(auroraClusterTabKind).for(di.scopeIds))();
    const focusTab = di.inject(focusTabInjectionToken.for(mainViewTabHostKind).for(auroraClusterTabKind).for(di.scopeIds))();
    const isOpen = di.inject(tabIsOpenInjectionToken.for(mainViewTabHostKind).for(auroraClusterTabKind).for(di.scopeIds))();

    return () => async (clusterId: string) => {
      if (await isOpen({ tabId: clusterId })) {
        await focusTab({ tabId: clusterId });
      } else {
        await openTab({ tabId: clusterId });
      }
    };
  },
});
