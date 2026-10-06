import { navigateToKubeResourceDetailsInjectionToken } from "@k8slens/details-panel-contracts";
import { getKubeResourceKind, getKubernetesApiVersion } from "@k8slens/kubernetes-contracts";
import { getWindowMessageListenerInjectableBunch } from "@k8slens/messaging-contracts";
import { isNavigationSupersededError } from "@k8slens/navigation-contracts";
import { showErrorNotificationInjectionToken } from "@k8slens/notifications-contracts";
import { showInLensChannel } from "./channels";

export const showInLensListenerBunch = getWindowMessageListenerInjectableBunch({
  id: "aurora-show-in-lens-listener",
  channel: showInLensChannel,
  windows: ["application"],
  handler: {
    consumptions: [navigateToKubeResourceDetailsInjectionToken, showErrorNotificationInjectionToken],
    instantiate: (di) => {
      const navigateToKubeResourceDetails = di.inject(navigateToKubeResourceDetailsInjectionToken)();
      const showErrorNotification = di.inject(showErrorNotificationInjectionToken)();

      return () => async ({ cluster, kind, apiVersion, namespace, name }) => {
        try {
          await navigateToKubeResourceDetails({
            clusterId: cluster,
            kind: getKubeResourceKind(kind),
            apiVersion: getKubernetesApiVersion(apiVersion),
            ref: { namespace, name },
          });
        } catch (error) {
          if (!isNavigationSupersededError(error)) showErrorNotification(error as Error);
        }
      };
    },
  },
});
