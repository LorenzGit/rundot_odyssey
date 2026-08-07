// Local-notification reminders for RUN games: permission bootstrap, a
// declarative reminder catalogue, cancel-first dedupe by custom id, and the
// sliding "come back" re-engagement pattern.
//
// Model:
//   - Reminders are DATA. config.reminders maps a custom id to
//     {title, body, delaySeconds}; arm(id) schedules one. The custom id is
//     what dedupes on the platform side — every schedule cancels the same id
//     first, so re-arming never stacks notifications.
//   - The re-engagement reminder SLIDES. rescheduleReEngagement() is called
//     at every "player is active" moment (boot, resume, end of run), so the
//     pending reminder always sits N hours past the LAST activity and only
//     lands once the player actually stops playing.
//   - Schedule while the app is ALIVE — never from onSleep/onQuit handlers.
//     A hard close tears down the JS runtime before the schedule RPC reaches
//     the host, so anything armed at close time silently never registers
//     (backgrounding works, hard-kill doesn't).
//   - Two independent gates. config.isOptedIn is the game's own settings
//     toggle: it suppresses scheduling, and the settings UI calls
//     cancelAll() on opt-out. The platform permission (ensureEnabled) is
//     bootstrapped once at boot — but schedule() deliberately does NOT check
//     the cached result: it always attempts and lets the host no-op if
//     notifications are off, so one failed/stale boot-time probe can't
//     silently block a whole session's reminders.
//   - Every SDK call is try/catch'd: in mock mode (local dev, no host)
//     everything no-ops safely, and nothing ever leaks an unhandled
//     rejection out of a lifecycle-adjacent call site.

import RundotGameAPI from "@series-inc/rundot-game-sdk/api";

/**
 * A reminder field that is either a plain value or a zero-arg function
 * producing one, resolved at SCHEDULE time (not import time).
 */
export type Resolvable<T> = T | (() => T);

/** One entry in the reminder catalogue. */
export interface ReminderDef {
    /**
     * Notification title. May be a function, resolved at SCHEDULE time —
     * that way copy follows a mid-session language switch instead of
     * freezing at import time.
     */
    title: Resolvable<string>;
    /** Notification body. Same value-or-function contract as `title`. */
    body: Resolvable<string>;
    /**
     * Seconds from now until the notification fires. May be a function for
     * event reminders whose delay is a live cooldown ("boost ready in Xs");
     * a non-finite or <= 0 result means "nothing to remind about right now"
     * and arm() silently skips.
     */
    delaySeconds: Resolvable<number>;
}

export interface NotificationsConfig {
    /**
     * The game's reminder catalogue, keyed by custom id (the platform dedupe
     * key — keep ids stable across versions).
     */
    reminders: Record<string, ReminderDef>;
    /**
     * The game's own settings gate (e.g. `() => save.settings.notifications
     * !== false` — `!== false` so pre-settings saves default to opted in).
     * Independent of the platform permission. Default: always opted in.
     */
    isOptedIn?: () => boolean;
    /** Which `reminders` entry rescheduleReEngagement() re-arms. Default 're-engagement'. */
    reEngagementId?: string;
    /**
     * Developer kill switch: false suppresses ALL notification SDK traffic
     * (schedule AND cancel), regardless of player preference. For shipping a
     * build with notifications off or isolating host-side overhead.
     * Default true.
     */
    enabled?: boolean;
}

export interface NotificationsSystem {
    /** Cached platform permission — only ever set to true. Internal. */
    _perm: boolean;
    /** Bootstrap the platform permission: probe, request if needed, confirm, cache. Call ONCE at boot. Resolves to whether permission is granted; never rejects. */
    ensureEnabled(): Promise<boolean>;
    /** Cancel-first schedule on the custom id; gated on the kill switch and opt-out. Resolves, never rejects. */
    schedule(id: string, title: string, body: string, delaySeconds: number): Promise<void>;
    /** Schedule a configured reminder by id, resolving its fields at call time. Unknown ids no-op. */
    arm(id: string, delaySeconds?: number): Promise<void>;
    /** Re-arm the sliding come-back reminder. Call at every "player is active" moment. */
    rescheduleReEngagement(): Promise<void>;
    /** Cancel a pending notification. NOT gated on the opt-out toggle. */
    cancel(id: string): Promise<void>;
    /** Cancel every configured reminder id. Call on settings opt-out. */
    cancelAll(): Promise<void>;
}

export function createNotifications(config: NotificationsConfig): NotificationsSystem {
    const { reminders = {}, isOptedIn = () => true, reEngagementId = "re-engagement", enabled = true } = config;

    /** Resolve a string-or-function / number-or-function field at schedule time. */
    function resolve<T extends string | number>(v: Resolvable<T>): T {
        return typeof v === "function" ? v() : v;
    }

    /** The game's settings gate; a throwing accessor counts as opted out. */
    function optedIn(): boolean {
        try {
            return !!isOptedIn();
        } catch (e) {
            return false;
        }
    }

    const sys: NotificationsSystem = {
        _perm: false, // cached platform permission — only ever set to true

        /**
         * Bootstrap the platform-level permission: probe, request if needed,
         * confirm, cache. Call ONCE at boot (after initializeAsync), then
         * schedule — NOT from onSleep/onQuit, where chaining several awaited
         * RPCs (isEnabled → setEnabled → isEnabled → schedule) gets cut off
         * mid-chain by runtime teardown. Respects the opt-out gate so a
         * player who turned notifications off is never re-prompted.
         * Resolves to whether the platform permission is granted.
         */
        async ensureEnabled(): Promise<boolean> {
            if (!enabled || !optedIn()) return false;
            if (sys._perm) return true;
            try {
                const already = await RundotGameAPI.notifications.isLocalNotificationsEnabled();
                if (already) {
                    sys._perm = true;
                    return true;
                }
                await RundotGameAPI.notifications.setLocalNotificationsEnabled(true);
                const nowEnabled = await RundotGameAPI.notifications.isLocalNotificationsEnabled();
                if (nowEnabled) {
                    sys._perm = true;
                    return true;
                }
                return false;
            } catch (e) {
                return false; // mock mode / RPC failure — "unknown", never fatal
            }
        },

        /**
         * Schedule a notification with cancel-first dedupe on the custom id:
         * repeated calls replace the pending one, never stack. Gated on the
         * kill switch and the opt-out toggle; a non-finite or <= 0 delay is
         * "nothing to remind about" and no-ops. Deliberately NOT gated on
         * the cached ensureEnabled() result — always attempt and let the
         * host no-op when notifications are off (a stale boot probe must
         * not block reminders for the whole session).
         *
         * AWAIT this anywhere teardown could follow (it already resolves,
         * never rejects) — an un-awaited schedule racing an app close can be
         * dropped mid-RPC. `id` is the custom id (dedupe key);
         * `delaySeconds` fires this many seconds from now.
         */
        async schedule(id: string, title: string, body: string, delaySeconds: number): Promise<void> {
            if (!enabled || !optedIn()) return;
            if (!Number.isFinite(delaySeconds) || delaySeconds <= 0) return;
            try {
                await RundotGameAPI.notifications.cancelNotification(id);
                await RundotGameAPI.notifications.scheduleAsync(title, body, Math.ceil(delaySeconds), id);
            } catch (e) {
                /* mock mode / host declined — never fatal */
            }
        },

        /**
         * Schedule a configured reminder by id (a key into config.reminders),
         * resolving its title/body (and delay, unless overridden by the
         * optional delaySeconds argument) at call time. Unknown ids no-op.
         */
        async arm(id: string, delaySeconds?: number): Promise<void> {
            const def = reminders[id];
            if (!def) return;
            try {
                const delay = delaySeconds !== undefined ? delaySeconds : resolve(def.delaySeconds);
                await sys.schedule(id, resolve(def.title), resolve(def.body), delay);
            } catch (e) {
                /* a throwing title/body/delay fn must not crash callers */
            }
        },

        /**
         * Re-arm the sliding come-back reminder. Call at every "player is
         * active" moment — boot (after ensureEnabled resolves), onResume,
         * and end-of-run screens — so the pending reminder always points
         * delaySeconds past the LAST activity and only lands once the
         * player actually stops playing. Cancel-first dedupe makes calling
         * this liberally free. NEVER call from onSleep/onQuit.
         */
        async rescheduleReEngagement(): Promise<void> {
            await sys.arm(reEngagementId);
        },

        /**
         * Cancel a pending notification. Call when the player completes the
         * associated task in-app (a reminder for a done task is noise).
         * NOT gated on the opt-out toggle — cancelling must work exactly
         * when the player opts out. Safe when nothing is scheduled.
         */
        async cancel(id: string): Promise<void> {
            if (!enabled) return;
            try {
                await RundotGameAPI.notifications.cancelNotification(id);
            } catch (e) {
                /* swallow */
            }
        },

        /**
         * Cancel every configured reminder id. Call when the player turns
         * notifications OFF in settings, so nothing fires after an explicit
         * opt-out. Turning the toggle back ON should NOT eagerly schedule —
         * the next alive moment (resume / end of run / next boot) re-arms.
         */
        async cancelAll(): Promise<void> {
            for (const id of Object.keys(reminders)) {
                await sys.cancel(id);
            }
        },
    };

    return sys;
}
