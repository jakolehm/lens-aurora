import { getCommandInjectableBunch } from "@k8slens/command-palette-contracts";
import { openAuroraTabInjectable } from "./open-aurora-tab.injectable";

export const openAuroraCommandBunch = getCommandInjectableBunch({
  id: "aurora.open",
  title: "Aurora: Open",
  action: {
    instantiate: (di) => {
      const openAuroraTab = di.inject(openAuroraTabInjectable)();

      return () => () => openAuroraTab();
    },
  },
});
