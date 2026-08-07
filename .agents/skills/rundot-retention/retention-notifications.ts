/**
 * Drop-in return-notification scheduler for a RUN.game title.
 *
 * Copy into `src/retention/retention-notifications.ts`. Schedules a friendly
 * re-engagement cadence, keeps the 24h reminder anchored to the player's last
 * session, and attributes notification-driven returns. Edit RETURN_NOTIFICATIONS
 * copy/cadence to the game's voice — keep it short so players don't opt out.
 */
import RundotGameAPI from "@series-inc/rundot-game-sdk/api";

const HOUR = 60 * 60;
const SCHEDULED_FLAG_KEY = "retention_notifs_scheduled";

export interface ReturnNotification {
    id: string;
    title: string;
    body: string;
    delaySeconds: number;
}

/** First entry is the primary 24h nudge (refreshed each session). Keep the list short. */
export const RETURN_NOTIFICATIONS: ReturnNotification[] = [
    {
        id: "day1",
        title: "Your castle awaits",
        body: "Come back and claim your daily reward!",
        delaySeconds: 24 * HOUR,
    },
    { id: "day2", title: "We miss you", body: "Your streak is waiting — one quick run?", delaySeconds: 48 * HOUR },
    {
        id: "day3",
        title: "New tides rolling in",
        body: "Jump back in before your progress cools off.",
        delaySeconds: 72 * HOUR,
    },
];

function notifId(id: string): string {
    return `retention_${id}`;
}

async function schedule(n: ReturnNotification): Promise<void> {
    await RundotGameAPI.notifications.scheduleAsync(n.title, n.body, n.delaySeconds, notifId(n.id), {
        groupId: "retention",
        payload: { retention_id: n.id },
    });
}

/** Schedule the return cadence once, the first time the player plays. Idempotent. */
export async function scheduleReturnNotifications(): Promise<void> {
    try {
        if ((await RundotGameAPI.appStorage.getItem(SCHEDULED_FLAG_KEY)) === "1") return;

        const pending = await RundotGameAPI.notifications.getAllScheduledLocalNotifications();
        const pendingIds = new Set(pending.map((notif) => notif.id));

        for (const n of RETURN_NOTIFICATIONS) {
            if (pendingIds.has(notifId(n.id))) continue;
            await schedule(n);
        }
        await RundotGameAPI.appStorage.setItem(SCHEDULED_FLAG_KEY, "1");
    } catch (err) {
        RundotGameAPI.error("retention: failed to schedule notifications", err);
    }
}

/**
 * Re-anchor the primary 24h reminder to *now*, so it fires ~1 day after the
 * player's most recent session rather than a day after install. Call on session end.
 */
export async function refreshPrimaryReturnNotification(): Promise<void> {
    const primary = RETURN_NOTIFICATIONS[0];
    if (!primary) return;
    try {
        await RundotGameAPI.notifications.cancelNotification(notifId(primary.id));
        await schedule(primary);
    } catch (err) {
        RundotGameAPI.error("retention: failed to refresh primary notification", err);
    }
}

/** Cancel a scheduled reminder once its task is done (e.g. the daily reward was claimed). */
export async function cancelReturnNotification(id: string): Promise<void> {
    try {
        await RundotGameAPI.notifications.cancelNotification(notifId(id));
    } catch (err) {
        RundotGameAPI.error("retention: failed to cancel notification", err);
    }
}

/**
 * Detect a notification-launched session. Call once at startup. Returns the
 * retention id that opened the app (for deep-linking + attribution), or null.
 */
export async function resolveReturnNotificationLaunch(): Promise<string | null> {
    try {
        const intent = await RundotGameAPI.app.resolveLaunchIntent({ maxWaitMs: 800 });
        if (intent.kind !== "notification") return null;
        const id = intent.params?.["retention_id"];
        return typeof id === "string" ? id : null;
    } catch {
        return null;
    }
}
