import { openKubeResourceDetailsPanelInjectionToken } from "@k8slens/details-panel-contracts";
import { getInjectable2 } from "@k8slens/injectable";
import { getKubeResourceKind, getKubernetesApiVersion } from "@k8slens/kubernetes-contracts";
import type { ResourceRef } from "../../shared/resource";

// beside the Aurora tab, in whichever window shows it, so Aurora stays in view
export const showDetailsInjectable = getInjectable2({
  id: "aurora-show-details",
  consumptions: [openKubeResourceDetailsPanelInjectionToken],

  instantiate: (di) => {
    const openKubeResourceDetailsPanel = di.inject(openKubeResourceDetailsPanelInjectionToken)();

    return () =>
      ({ cluster, kind, apiVersion, namespace, name }: ResourceRef) =>
        openKubeResourceDetailsPanel({
          clusterId: cluster,
          kind: getKubeResourceKind(kind),
          apiVersion: getKubernetesApiVersion(apiVersion),
          ref: { namespace, name },
        });
  },
});
