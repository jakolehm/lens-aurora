import { getComputedChannel, getMessageChannel } from "@k8slens/messaging-contracts";
import type { ResourceRef } from "../../shared/resource";

export interface RevealRequest {
  readonly id: number;
  readonly ref: ResourceRef;
}

export const showInLensChannel = getMessageChannel<ResourceRef>("aurora:show-in-lens");

/** The application window holds the resource to reveal until the Aurora window reports it handled. */
export const revealRequestChannel = getComputedChannel<RevealRequest | undefined>("aurora:reveal-request");
export const revealHandledChannel = getMessageChannel<number>("aurora:reveal-handled");
