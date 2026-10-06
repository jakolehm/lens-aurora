import { Button } from "@k8slens/element-components";
import { getTopBarItemInjectableBunch } from "@k8slens/top-bar-contracts";
import { useInject } from "@k8slens/use-inject";
import { AuroraIcon } from "./aurora-icon";
import { openAuroraWindowInjectable } from "./open-aurora-window.injectable";

const OpenAuroraButton = () => {
  const openAuroraWindow = useInject(openAuroraWindowInjectable)();

  return (
    <Button $onClick={() => void openAuroraWindow()} $tooltip="Aurora: open your connected clusters in 3D, in a new window" $interactive>
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
