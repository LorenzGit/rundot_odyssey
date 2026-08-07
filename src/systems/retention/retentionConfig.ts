import { store } from "../../state/store.ts";
import { t } from "../localization.ts";
import { cancelLocalNotification, rearmLocalNotification, resolveLaunchIntent } from "../../sdk/runSdk.ts";
import { analytics } from "../analytics/analyticsConfig.ts";
import { RETURN_DELAYS_SECONDS, createReturnReminders } from "./returnReminders.ts";

/**
 * ADAPT: the reminder copy is the whole product here.
 *
 * Each body must name the specific thing waiting for this player in THIS game
 * — the daily reward that is ready, the streak about to lapse, the run they
 * left mid-way. A reminder that says "come back and play" is the one players
 * mute, and muting is permanent. Rewrite these three lines per game; do not
 * ship the template's wording.
 *
 * Cadence stops at 72h on purpose. A fourth ping converts nobody and costs the
 * notification permission that the first three depend on.
 */
export const returnReminders = createReturnReminders({
    idPrefix: "odyssey-perfect-shot",
    // Resolved on every schedule so the copy follows the player's language.
    reminders: () => [
        {
            id: "d1",
            title: t("NotificationDay1Title"),
            body: t("NotificationDay1Body"),
            delaySeconds: RETURN_DELAYS_SECONDS[0],
        },
        {
            id: "d2",
            title: t("NotificationDay2Title"),
            body: t("NotificationDay2Body"),
            delaySeconds: RETURN_DELAYS_SECONDS[1],
        },
        {
            id: "d3",
            title: t("NotificationDay3Title"),
            body: t("NotificationDay3Body"),
            delaySeconds: RETURN_DELAYS_SECONDS[2],
        },
    ],
    schedule: (input) => rearmLocalNotification(input),
    cancel: (id) => cancelLocalNotification(id),
    resolveLaunch: () => resolveLaunchIntent(),
    // The player's settings toggle is a real opt-out and does gate. The consent
    // probe deliberately does not: it only annotates the scheduled event, so a
    // stale or failed probe cannot silence the whole cadence.
    isOptedOut: () => !store.get().notificationsEnabled,
    permissionHint: () => store.get().notificationsConsent === "granted",
    track: (event, payload) => analytics.event(event, payload),
});

/**
 * Resolve a notification-driven launch and record it. Call once at startup,
 * before the menu paints, so the caller can deep-link to whatever the
 * reminder promised instead of dropping the player on a generic menu.
 */
export async function resolveReturnLaunch(): Promise<string | null> {
    const reminderId = await returnReminders.resolveLaunch();
    if (reminderId) {
        analytics.event("retention_notification_return_play", { reminder_id: reminderId });
    }
    return reminderId;
}
