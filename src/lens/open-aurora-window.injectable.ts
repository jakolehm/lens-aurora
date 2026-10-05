import { getInjectable2 } from "@k8slens/injectable";
import { openSubWindowInjectionToken } from "@k8slens/sub-window-contracts";
import { auroraWindowKind } from "./aurora-window.injectable";

export const openAuroraWindowInjectable = getInjectable2({
  id: "aurora-open-window",
  consumptions: [openSubWindowInjectionToken],

  instantiate: (di) => {
    const openWindow = di.inject(openSubWindowInjectionToken.for(auroraWindowKind).for(di.scopeIds))();

    // opening the one window again brings it forward
    return () => openWindow({ id: "aurora", params: undefined });
  },
});
