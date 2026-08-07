/**
 * Contract test for the return-reminder cadence.
 *
 * The retention rules this enforces are easy to regress silently and expensive
 * to get wrong in production: a fourth ping costs the notification permission,
 * a stale reminder pings players about a reward they already claimed, and a
 * launch that isn't attributed makes every copy A/B unreadable.
 *
 * Run: node --experimental-strip-types scripts/test-return-reminders.ts
 */
import { createReturnReminders, RETURN_DELAYS_SECONDS } from "../src/systems/retention/returnReminders.ts";

const failures: string[] = [];
function expect(condition: boolean, message: string): void {
    if (!condition) failures.push(message);
}

interface Scheduled {
    id: string;
    title: string;
    body: string;
    delaySeconds: number;
}

function harness(
    options: {
        optedOut?: boolean;
        permission?: boolean;
        launch?: { kind: string; params: Record<string, string> } | null;
    } = {},
) {
    const scheduled: Scheduled[] = [];
    const cancelled: string[] = [];
    const events: Array<{ event: string; payload: Record<string, string | number | boolean> }> = [];
    const reminders = createReturnReminders({
        idPrefix: "testgame",
        reminders: () => [
            { id: "d1", title: "T1", body: "Your reward is ready", delaySeconds: RETURN_DELAYS_SECONDS[0] },
            { id: "d2", title: "T2", body: "Your streak is alive", delaySeconds: RETURN_DELAYS_SECONDS[1] },
            { id: "d3", title: "T3", body: "Your record stands", delaySeconds: RETURN_DELAYS_SECONDS[2] },
        ],
        schedule: async (input) => {
            scheduled.push(input);
            return true;
        },
        cancel: async (id) => {
            cancelled.push(id);
        },
        resolveLaunch: async () => options.launch ?? null,
        isOptedOut: () => options.optedOut ?? false,
        permissionHint: () => options.permission ?? true,
        track: (event, payload) => events.push({ event, payload }),
    });
    return { reminders, scheduled, cancelled, events };
}

// --- cadence is exactly 24/48/72h, in order, and stops there ---------------
{
    const h = harness();
    await h.reminders.refreshAll();
    expect(h.scheduled.length === 3, `cadence must be 3 reminders, got ${h.scheduled.length}`);
    const hours = h.scheduled.map((s) => s.delaySeconds / 3_600);
    expect(
        JSON.stringify(hours) === JSON.stringify([24, 48, 72]),
        `cadence must be 24/48/72h, got ${JSON.stringify(hours)}`,
    );
    expect(
        h.scheduled.every((s) => s.id.startsWith("testgame-")),
        "notification ids must carry the game prefix so games cannot cancel each other's reminders",
    );
    expect(
        h.scheduled.every((s) => s.body.trim().length > 0),
        "every reminder needs a body naming what is waiting",
    );
    expect(
        h.events.filter((e) => e.event === "retention_notification_scheduled").length === 3,
        "each scheduled reminder must be recorded, so scheduled-vs-opened is readable",
    );
}

// --- the 24h reminder is re-anchorable on its own --------------------------
{
    const h = harness();
    await h.reminders.refreshPrimary();
    expect(h.scheduled.length === 1, "refreshPrimary must schedule exactly the 24h reminder");
    expect(h.scheduled[0]?.delaySeconds === 24 * 3_600, "refreshPrimary must re-anchor the 24h nudge");
}

// --- an explicit player opt-out silences everything ------------------------
{
    const h = harness({ optedOut: true });
    await h.reminders.refreshAll();
    await h.reminders.refreshPrimary();
    expect(h.scheduled.length === 0, "no reminder may be scheduled once the player has opted out");
}

/*
 * Regression: a cached host-permission probe must never gate scheduling.
 *
 * Shipped once with `isEnabled: () => notificationsGranted`, where
 * notificationsGranted was a single boot-time probe defaulting to false. A
 * probe that failed, timed out, or ran before the player answered the prompt
 * silenced the entire cadence for the session, and a mid-session grant never
 * armed anything. The host already no-ops an unpermitted schedule, so the
 * attempt costs nothing and the stale `false` costs every reminder.
 */
{
    const h = harness({ permission: false });
    await h.reminders.refreshAll();
    expect(
        h.scheduled.length === 3,
        "a false permission probe must NOT suppress scheduling — only an explicit opt-out may",
    );
    const scheduledEvents = h.events.filter((e) => e.event === "retention_notification_scheduled");
    expect(
        scheduledEvents.every((e) => e.payload.permission_cached === false),
        "the cached permission must ride on the scheduled event so low-permission and low-schedule are separable",
    );
}

// --- kill switch cancels the prefixed id ----------------------------------
{
    const h = harness();
    await h.reminders.cancel("d1");
    expect(h.cancelled[0] === "testgame-d1", `kill switch must cancel the prefixed id, got ${h.cancelled[0]}`);
}

// --- a notification launch is attributed ----------------------------------
{
    const h = harness({ launch: { kind: "notification", params: { reminder_id: "testgame-d2" } } });
    const id = await h.reminders.resolveLaunch();
    expect(id === "d2", `notification launch must resolve to the bare reminder id, got ${String(id)}`);
    expect(
        h.events.some((e) => e.event === "retention_notification_opened" && e.payload.reminder_id === "d2"),
        "a notification-driven return must be recorded, or no copy can be compared",
    );
}

// --- a cold launch is NOT attributed to a notification ---------------------
{
    const h = harness({ launch: { kind: "none", params: {} } });
    expect((await h.reminders.resolveLaunch()) === null, "a cold launch must not be credited to a notification");
    expect(
        !h.events.some((e) => e.event === "retention_notification_opened"),
        "a cold launch must not emit an opened event",
    );
}

if (failures.length > 0) {
    console.error(`Return-reminder checks failed (${failures.length}):`);
    for (const failure of failures) console.error(`- ${failure}`);
    process.exitCode = 1;
} else {
    console.log("Return-reminder checks passed: cadence, consent gate, kill switch, launch attribution.");
}
