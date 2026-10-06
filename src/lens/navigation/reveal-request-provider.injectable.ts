import { getWindowComputedChannelProviderInjectableBunch } from "@k8slens/messaging-contracts";
import { computed } from "mobx";
import { revealRequestChannel } from "./channels";
import { revealRequestInjectable } from "./reveal-request.injectable";

export const revealRequestProviderBunch = getWindowComputedChannelProviderInjectableBunch({
  id: "aurora-reveal-request-provider",
  channel: revealRequestChannel,
  windows: ["application"],
  provide: {
    instantiate: (di) => {
      const revealRequest = di.inject(revealRequestInjectable)();

      return () => () => computed(() => revealRequest.get());
    },
  },
});
