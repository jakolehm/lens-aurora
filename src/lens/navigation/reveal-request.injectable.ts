import { getInjectable2 } from "@k8slens/injectable";
import { applicationWindowOnly } from "@k8slens/sub-window-contracts";
import { action, observable } from "mobx";
import type { ResourceRef } from "../../shared/resource";
import type { RevealRequest } from "./channels";

export const revealRequestInjectable = getInjectable2({
  id: "aurora-reveal-request",
  tags: [applicationWindowOnly],

  instantiate: () => {
    const pending = observable.box<RevealRequest | undefined>(undefined, { deep: false });
    let lastId = 0;

    const revealRequest = {
      get: () => pending.get(),
      request: action((ref: ResourceRef) => pending.set({ id: ++lastId, ref })),
      handled: action((id: number) => {
        if (pending.get()?.id === id) pending.set(undefined);
      }),
    };

    return () => revealRequest;
  },
});
