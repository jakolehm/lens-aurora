import { getPersistableValueInjectableBunch } from "@k8slens/persistable-contracts";

export type AuroraPlace = "window" | "tab";

export const auroraOpensInBunch = getPersistableValueInjectableBunch<AuroraPlace>()({
  id: "opens-in",
  defaultValue: { instantiate: () => async () => "tab" },
});
