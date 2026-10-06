import { getInjectable2 } from "@k8slens/injectable";
import {
  applicationWindowId,
  isApplicationWindow,
  sendMessageToWindowInjectionToken,
  thisWindowIdInjectionToken,
} from "@k8slens/messaging-contracts";
import type { ResourceRef } from "../../shared/resource";
import { showInLensChannel } from "./channels";
import { navigateToResourceInjectable } from "./navigate-to-resource.injectable";

/** The details of a resource open in the application window, whichever window Aurora runs in. */
export const showInLensInjectable = getInjectable2({
  id: "aurora-show-in-lens",
  consumptions: [thisWindowIdInjectionToken, sendMessageToWindowInjectionToken],

  instantiate: (di) => {
    const getThisWindowId = di.inject(thisWindowIdInjectionToken);
    const sendMessageToWindow = di.inject(sendMessageToWindowInjectionToken)();

    // the navigation exists only in the application window
    return () =>
      isApplicationWindow(getThisWindowId())
        ? di.inject(navigateToResourceInjectable)()
        : (ref: ResourceRef) => void sendMessageToWindow(applicationWindowId, showInLensChannel, ref);
  },
});
