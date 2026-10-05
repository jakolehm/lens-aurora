import { getCommandInjectableBunch } from "@k8slens/command-palette-contracts";
import { isApplicationWindow, thisWindowIdInjectionToken } from "@k8slens/messaging-contracts";
import { openAuroraTabInjectable } from "./open-aurora-tab.injectable";
import { openAuroraWindowInjectable } from "./open-aurora-window.injectable";

export const openAuroraCommandBunch = getCommandInjectableBunch({
  id: "aurora.open",
  title: "Aurora: Open",
  // tabs exist only in the application window, not in Aurora's own window
  isActive: {
    consumptions: [thisWindowIdInjectionToken],
    instantiate: (di) => () => isApplicationWindow(di.inject(thisWindowIdInjectionToken)()),
  },
  action: {
    instantiate: (di) => {
      const openAuroraTab = di.inject(openAuroraTabInjectable);

      return () => () => openAuroraTab();
    },
  },
});

export const openAuroraWindowCommandBunch = getCommandInjectableBunch({
  id: "aurora.open-window",
  title: "Aurora: Open in new window",
  action: {
    instantiate: (di) => {
      const openAuroraWindow = di.inject(openAuroraWindowInjectable);

      return () => () => openAuroraWindow();
    },
  },
});
