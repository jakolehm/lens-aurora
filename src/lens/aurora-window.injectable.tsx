import { getSubWindowKind, getSubWindowKindInjectableBunch } from "@k8slens/sub-window-contracts";
import { AuroraView } from "./aurora-view";

export const auroraWindowKind = getSubWindowKind()("aurora");

const AuroraWindow = () => (
  <div className="aurora-window">
    <AuroraView />
  </div>
);

export const auroraWindowBunch = getSubWindowKindInjectableBunch({
  kind: auroraWindowKind,
  Component: AuroraWindow,
  configuration: {
    title: "Aurora",
    defaultWidth: 1400,
    defaultHeight: 900,
    minWidth: 480,
    minHeight: 360,
  },
});
