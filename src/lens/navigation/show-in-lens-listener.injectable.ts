import { getWindowMessageListenerInjectableBunch } from "@k8slens/messaging-contracts";
import { showInLensChannel } from "./channels";
import { navigateToResourceInjectable } from "./navigate-to-resource.injectable";

export const showInLensListenerBunch = getWindowMessageListenerInjectableBunch({
  id: "aurora-show-in-lens-listener",
  channel: showInLensChannel,
  windows: ["application"],
  handler: {
    instantiate: (di) => {
      const navigateToResource = di.inject(navigateToResourceInjectable)();

      return () => navigateToResource;
    },
  },
});
