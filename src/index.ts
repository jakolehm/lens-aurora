import { getFeature, registerInjectablesFromModules } from "@k8slens/feature-core";
import modulesWithInjectables from "./**/*.injectable.(ts|tsx)";
import stylesheets from "./**/!(_*).(scss|css)";

export const auroraFeature = getFeature({
  id: "aurora",
  register: (di) => {
    registerInjectablesFromModules(di, [...modulesWithInjectables, ...stylesheets]);
  },
});
