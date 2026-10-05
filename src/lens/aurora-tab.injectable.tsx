import { Div } from "@k8slens/element-components";
import { mainViewTabHostKind } from "@k8slens/main-view-contracts";
import { getTabKind, getTabKindInjectableBunch, type TabProps } from "@k8slens/tab-contracts";
import { AuroraIcon } from "./aurora-icon";
import { AuroraView } from "./aurora-view";

export const auroraTabKind = getTabKind()("aurora");

const AuroraTab = (_props: TabProps<typeof mainViewTabHostKind>) => <AuroraView />;

const AuroraTabTitle = (_props: TabProps<typeof mainViewTabHostKind>) => (
  <Div $flex={{ gap: "xs", verticalAlign: "center" }}>
    <AuroraIcon $size="s" />
    Aurora
  </Div>
);

export const auroraTabBunch = getTabKindInjectableBunch({
  tabHostKind: mainViewTabHostKind,
  kind: auroraTabKind,
  Component: AuroraTab,
  Title: AuroraTabTitle,
});
