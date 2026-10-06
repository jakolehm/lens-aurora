import { getInjectable2 } from "@k8slens/injectable";
import {
  applicationWindowId,
  computedChannelOfWindowInjectionToken,
  isApplicationWindow,
  sendMessageToWindowInjectionToken,
  thisWindowIdInjectionToken,
} from "@k8slens/messaging-contracts";
import { showInfoNotificationInjectionToken } from "@k8slens/notifications-contracts";
import { reaction } from "mobx";
import { lensOf, type Aurora } from "../../web/aurora";
import { revealHandledChannel, revealRequestChannel, type RevealRequest } from "./channels";
import { revealRequestInjectable } from "./reveal-request.injectable";

const RETRY_MS = 200;
// a lens turned to loads what it shows first, so give it time
const GIVE_UP_MS = 15_000;

interface RevealRequests {
  readonly get: () => RevealRequest | undefined;
  readonly handled: (id: number) => void;
}

export const followRevealRequestsInjectable = getInjectable2({
  id: "aurora-follow-reveal-requests",
  consumptions: [
    thisWindowIdInjectionToken,
    computedChannelOfWindowInjectionToken,
    sendMessageToWindowInjectionToken,
    showInfoNotificationInjectionToken,
  ],

  instantiate: (di) => {
    const getThisWindowId = di.inject(thisWindowIdInjectionToken);
    const computedChannelOfWindow = di.inject(computedChannelOfWindowInjectionToken)();
    const sendMessageToWindow = di.inject(sendMessageToWindowInjectionToken)();
    const showInfoNotification = di.inject(showInfoNotificationInjectionToken)();

    // the application window holds the requests, and Aurora's own window follows them from there
    const revealRequests = (): RevealRequests => {
      if (isApplicationWindow(getThisWindowId())) return di.inject(revealRequestInjectable)();
      const request = computedChannelOfWindow({
        of: applicationWindowId,
        channel: revealRequestChannel,
        pendingValue: undefined,
      })();
      return {
        get: () => request.get(),
        handled: (id) => void sendMessageToWindow(applicationWindowId, revealHandledChannel, id),
      };
    };

    return () => (aurora: Aurora): (() => void) => {
      const requests = revealRequests();
      let retry: ReturnType<typeof setInterval> | undefined;
      let handling: number | undefined;
      const stopRetrying = () => clearInterval(retry);
      const handled = (id: number) => {
        stopRetrying();
        handling = undefined;
        requests.handled(id);
      };

      const stopFollowing = reaction(
        () => requests.get(),
        (pending) => {
          stopRetrying();
          const lens = pending && lensOf(pending.ref.kind);
          if (pending === undefined || lens === undefined) return;

          // turned to once, so the user can still turn away while the lens loads
          aurora.lens.set(lens);
          handling = pending.id;
          const giveUpAt = Date.now() + GIVE_UP_MS;
          const attempt = () => {
            const revealed = aurora.reveal(pending.ref);
            if (!revealed && Date.now() < giveUpAt) return;
            if (!revealed) showInfoNotification(`Aurora does not show ${pending.ref.kind} ${pending.ref.name}.`);
            handled(pending.id);
          };
          retry = setInterval(attempt, RETRY_MS);
          attempt();
        },
        { fireImmediately: true },
      );

      // a request left behind would jump the next Aurora window to it
      return () => {
        if (handling !== undefined) handled(handling);
        stopRetrying();
        stopFollowing();
      };
    };
  },
});
