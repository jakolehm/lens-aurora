import {
  getKubeResourceMenuItemInjectableBunch,
  kubeResourceMenuOrderNumbers,
  type KubeResourceMenuTarget,
} from "@k8slens/kube-resource-menu-contracts";
import { DropDownMenuItemRow } from "@k8slens/drop-down-menu-items";
import { useInject } from "@k8slens/use-inject";
import { lensOf } from "../../web/aurora";
import { showInAuroraInjectable } from "./show-in-aurora.injectable";

const ShowInAurora = ({ data }: { data: KubeResourceMenuTarget }) => {
  const showInAurora = useInject(showInAuroraInjectable)();
  const { clusterId, kind, apiVersion, name, namespace } = data;

  return (
    <DropDownMenuItemRow $onClick={() => showInAurora({ cluster: clusterId, kind, apiVersion, name, namespace })}>
      Show in Aurora
    </DropDownMenuItemRow>
  );
};

export const showInAuroraMenuItemBunch = getKubeResourceMenuItemInjectableBunch({
  id: "aurora-show-in-aurora-menu-item",
  orderNumber: kubeResourceMenuOrderNumbers.sectionEnd + 100,
  isVisible: ({ kind }) => lensOf(kind) !== undefined,
  Component: ShowInAurora,
});
