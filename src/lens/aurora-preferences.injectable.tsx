import { Div, P } from "@k8slens/element-components";
import { type SelectOption, SingleSelect } from "@k8slens/input-components";
import { getExtensionPreferencePageInjectableBunch } from "@k8slens/preferences-contracts";
import { useInject } from "@k8slens/use-inject";
import type { IObservableValue } from "mobx";
import { observer } from "mobx-react";
import { useEffect, useState } from "react";
import packageJson from "../../package.json";
import { type AuroraPlace, auroraOpensInBunch } from "./aurora-opens-in.injectable";

const places: readonly SelectOption<AuroraPlace>[] = [
  { id: "tab", label: "A tab in the main window" },
  { id: "window", label: "A window of its own" },
];

const OpensIn = observer(() => {
  const opensIn = useInject(auroraOpensInBunch.persistable);
  const [place, setPlace] = useState<IObservableValue<AuroraPlace>>();

  useEffect(() => {
    void opensIn().then(setPlace);
  }, [opensIn]);

  if (place === undefined) return null;

  return (
    <Div>
      <P>Open Aurora in</P>
      <SingleSelect options={places} selected={place.get()} onSelect={(id) => place.set(id)} />
    </Div>
  );
});

export const auroraPreferencesBunch = getExtensionPreferencePageInjectableBunch({
  packageJson,
  blocks: [{ id: "opens-in", orderNumber: 10, Component: OpensIn }],
});
