/** Local/RCS/inbox messaging. Consent prompts must follow a player gesture. */
import { api, guarded, requireExplicitAction } from "./guards";

export async function requestMessagingConsent(playerTapped: boolean) {
    requireExplicitAction(playerTapped, "Messaging consent");
    return guarded("RCS opt-in", () =>
        api.notifications.requestRCSOptInAsync({
            rewardCopy: "Get return reminders for this game",
        }),
    );
}

export async function scheduleReturnMessage(playerTapped: boolean) {
    requireExplicitAction(playerTapped, "Return reminder");
    return guarded("cross-channel message", () =>
        api.notifications.submitMessageAsync({
            channels: ["local", "rcs"],
            title: "Your reward is ready",
            body: "Return when you are ready to play.",
            delaySeconds: 3_600,
            notificationId: "template-return-reminder",
            collapseKey: "template-return-reminder",
            continuationParams: { route: "daily-rewards" },
            payload: { route: "daily-rewards" },
        }),
    );
}
