import { getInjectable2 } from "@k8slens/injectable";
import { mainViewTabHostKind } from "@k8slens/main-view-contracts";
import { focusTabInjectionToken, openTabInjectionToken, tabIsOpenInjectionToken } from "@k8slens/tab-contracts";
import { auroraTabKind } from "./aurora-tab.injectable";

const tabId = "aurora";

export const openAuroraTabInjectable = getInjectable2({
  id: "aurora-open-tab",
  consumptions: [openTabInjectionToken, focusTabInjectionToken, tabIsOpenInjectionToken],

  instantiate: (di) => {
    const openTab = di.inject(openTabInjectionToken.for(mainViewTabHostKind).for(auroraTabKind).for(di.scopeIds))();
    const focusTab = di.inject(focusTabInjectionToken.for(mainViewTabHostKind).for(auroraTabKind).for(di.scopeIds))();
    const isOpen = di.inject(tabIsOpenInjectionToken.for(mainViewTabHostKind).for(auroraTabKind).for(di.scopeIds))();

    return async () => {
      if (await isOpen({ tabId })) {
        await focusTab({ tabId });
      } else {
        await openTab({ tabId });
      }
    };
  },
});
