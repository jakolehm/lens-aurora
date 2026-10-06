import { Button } from "@k8slens/element-components";
import { getTopBarItemInjectableBunch } from "@k8slens/top-bar-contracts";
import { useInject } from "@k8slens/use-inject";
import { AuroraIcon } from "./aurora-icon";
import { openAuroraInjectable } from "./open-aurora.injectable";

const OpenAuroraButton = () => {
  const openAurora = useInject(openAuroraInjectable)();

  return (
    <Button $onClick={() => void openAurora()} $tooltip="Aurora: open your connected clusters in 3D" $interactive>
      <AuroraIcon $size="m" />
    </Button>
  );
};

export const auroraTopBarItemBunch = getTopBarItemInjectableBunch({
  id: "aurora-open-top-bar-item",
  side: "right",
  orderNumber: 50,
  Component: OpenAuroraButton,
});
