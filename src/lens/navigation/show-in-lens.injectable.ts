import { getInjectable2 } from "@k8slens/injectable";
import { applicationWindowId, sendMessageToWindowInjectionToken } from "@k8slens/messaging-contracts";
import type { ResourceRef } from "../../shared/resource";
import { showInLensChannel } from "./channels";

/** The details of a resource open in the application window, whichever window Aurora runs in. */
export const showInLensInjectable = getInjectable2({
  id: "aurora-show-in-lens",
  consumptions: [sendMessageToWindowInjectionToken],

  instantiate: (di) => {
    const sendMessageToWindow = di.inject(sendMessageToWindowInjectionToken)();

    return () => (ref: ResourceRef) => void sendMessageToWindow(applicationWindowId, showInLensChannel, ref);
  },
});
