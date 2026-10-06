import { navigateToKubeResourceDetailsInjectionToken } from "@k8slens/details-panel-contracts";
import { getInjectable2 } from "@k8slens/injectable";
import { getKubeResourceKind, getKubernetesApiVersion } from "@k8slens/kubernetes-contracts";
import { isNavigationSupersededError } from "@k8slens/navigation-contracts";
import { showErrorNotificationInjectionToken } from "@k8slens/notifications-contracts";
import { applicationWindowOnly } from "@k8slens/sub-window-contracts";
import type { ResourceRef } from "../../shared/resource";

export const navigateToResourceInjectable = getInjectable2({
  id: "aurora-navigate-to-resource",
  tags: [applicationWindowOnly],
  consumptions: [navigateToKubeResourceDetailsInjectionToken, showErrorNotificationInjectionToken],

  instantiate: (di) => {
    const navigateToKubeResourceDetails = di.inject(navigateToKubeResourceDetailsInjectionToken)();
    const showErrorNotification = di.inject(showErrorNotificationInjectionToken)();

    return () =>
      async ({ cluster, kind, apiVersion, namespace, name }: ResourceRef) => {
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
});
