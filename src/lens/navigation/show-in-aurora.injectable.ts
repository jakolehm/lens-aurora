import { getInjectable2 } from "@k8slens/injectable";
import { applicationWindowOnly } from "@k8slens/sub-window-contracts";
import type { ResourceRef } from "../../shared/resource";
import { openAuroraTabInjectable } from "../open-aurora-tab.injectable";
import { revealRequestInjectable } from "./reveal-request.injectable";

export const showInAuroraInjectable = getInjectable2({
  id: "aurora-show-in-aurora",
  tags: [applicationWindowOnly],

  instantiate: (di) => {
    const revealRequest = di.inject(revealRequestInjectable)();
    const openAurora = di.inject(openAuroraTabInjectable)();

    return () => (ref: ResourceRef) => {
      revealRequest.request(ref);
      void openAurora();
    };
  },
});
