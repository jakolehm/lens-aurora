import { getWindowMessageListenerInjectableBunch } from "@k8slens/messaging-contracts";
import { revealHandledChannel } from "./channels";
import { revealRequestInjectable } from "./reveal-request.injectable";

export const revealHandledListenerBunch = getWindowMessageListenerInjectableBunch({
  id: "aurora-reveal-handled",
  channel: revealHandledChannel,
  windows: ["application"],
  handler: {
    instantiate: (di) => {
      const revealRequest = di.inject(revealRequestInjectable)();

      return () => (id) => revealRequest.handled(id);
    },
  },
});
