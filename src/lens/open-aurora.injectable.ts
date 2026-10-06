import { getInjectable2 } from "@k8slens/injectable";
import { applicationWindowOnly } from "@k8slens/sub-window-contracts";
import { auroraOpensInBunch } from "./aurora-opens-in.injectable";
import { openAuroraTabInjectable } from "./open-aurora-tab.injectable";
import { openAuroraWindowInjectable } from "./open-aurora-window.injectable";

export const openAuroraInjectable = getInjectable2({
  id: "aurora-open",
  tags: [applicationWindowOnly],

  instantiate: (di) => {
    const opensIn = di.inject(auroraOpensInBunch.persistable);
    const openAuroraTab = di.inject(openAuroraTabInjectable)();
    const openAuroraWindow = di.inject(openAuroraWindowInjectable)();

    return () => async () => ((await opensIn()).get() === "tab" ? openAuroraTab() : openAuroraWindow());
  },
});
