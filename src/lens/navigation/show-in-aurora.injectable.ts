import { getInjectable2 } from "@k8slens/injectable";
import { applicationWindowOnly } from "@k8slens/sub-window-contracts";
import type { ResourceRef } from "../../shared/resource";
import { openAuroraInjectable } from "../open-aurora.injectable";
import { revealRequestInjectable } from "./reveal-request.injectable";

export const showInAuroraInjectable = getInjectable2({
  id: "aurora-show-in-aurora",
  tags: [applicationWindowOnly],

  instantiate: (di) => {
    const revealRequest = di.inject(revealRequestInjectable)();
    const openAurora = di.inject(openAuroraInjectable)();

    return () => (ref: ResourceRef) => {
      revealRequest.request(ref);
      void openAurora();
    };
  },
});
