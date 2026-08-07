# Notifications — re-engagement & event reminders

Local-notification scheduling for RUN games: a one-time permission bootstrap at boot, a declarative reminder catalogue (id → title/body/delay), cancel-first dedupe by custom id, a sliding 24h "come back" reminder re-armed at every active moment, and cancel-everything on settings opt-out.

The reference configuration includes a 24-hour re-engagement nudge and an 8-hour "your free-gems ad is ready again" event reminder. **Schedule while the app is alive, never from `onSleep`/`onQuit`**: a hard close can tear down the runtime before the scheduling call registers.

This is the smallest system in the library. All state is a cached permission boolean; nothing persists (the host platform persists the schedules themselves).

## Files

| File | Copy to host? | Purpose |
|---|---|---|
| `notifications.ts` | yes (e.g. `src/helpers/notifications.ts`) | all machinery — `createNotifications(config)` factory |
| `README.md` | no | this guide |

No dependencies beyond the RUN SDK. TypeScript; if the host game is plain JavaScript, strip the type annotations while copying (see the root README's integration protocol). An opt-in settings toggle is recommended (see `systems/save/` for where settings live), but the system works without one.

## Quick integration

### 1. Define the reminder catalogue (new file, e.g. `src/notificationsConfig.ts`)

```ts
import { createNotifications } from './helpers/notifications';
import { game } from './game';           // ADAPT: however the host exposes shared state

export const notifications = createNotifications({
    // ADAPT: the game's reminders, keyed by custom id (the platform dedupe
    // key — keep ids stable across versions). Derive the set from the game's
    // own return-trigger moments; see "Derive from the host game".
    reminders: {
        're-engagement': {
            title: 'Your towers miss you!',                    // ADAPT: game voice
            body: 'The next wave is waiting. Jump back in!',   // ADAPT
            delaySeconds: 24 * 60 * 60,
        },
        // Event reminder example: delaySeconds as a FUNCTION, resolved at
        // arm() time, so it always reflects the live cooldown. <= 0 means
        // "nothing pending" and arm() silently skips.
        'boost-ready': {
            title: 'Free boost ready',                          // ADAPT
            body: 'Your free boost has recharged. Grab it!',    // ADAPT
            delaySeconds: () => Math.ceil(boostRemainingMs() / 1000), // ADAPT
        },
    },
    // ADAPT: the game's own settings toggle. `!== false` so saves from
    // before the toggle existed default to opted in.
    isOptedIn: () => game.save.settings.notifications !== false,
});
```

If the game localizes strings, make `title`/`body` functions too (`title: () => L.Get('NotifTitle')`) — they resolve at schedule time, so copy follows a mid-session language switch instead of freezing at import.

### 2. Boot wiring

```ts
import RundotGameAPI from '@series-inc/rundot-game-sdk/api';
import { notifications } from './notificationsConfig';

await RundotGameAPI.initializeAsync();
// ... load save, etc.

// Bootstrap the platform permission ONCE, then arm reminders while the app
// is alive — they're registered with the OS long before any close, which is
// what lets them survive a hard kill.
notifications.ensureEnabled().then(() => {
    void notifications.rescheduleReEngagement();
    void notifications.arm('boost-ready');   // re-arms leftover cooldown from
                                             // a prior session; skips if none
});
```

### 3. Resume + end-of-run wiring (keep the reminder sliding)

```ts
RundotGameAPI.lifecycles.onResume(() => {
    // Returning to the app is another "active" moment — push the reminder
    // forward so it stays ~24h past the latest activity.
    void notifications.rescheduleReEngagement();
    void notifications.arm('boost-ready');
});
```

And at every end-of-session-shaped moment (game over, run quit, returning to the main menu — ADAPT to the host's flow):

```ts
function gameOver(): void {
    // ...existing game-over logic...
    void notifications.rescheduleReEngagement();
}
```

Do **not** add scheduling to `onSleep`/`onQuit` handlers — see SDK notes below. Those hooks should only flush the save.

### 4. Settings toggle wiring

```ts
// In the settings UI's notifications toggle handler (newValue: boolean):
game.save.settings.notifications = newValue;
saveSystem.save();
if (newValue === false) {
    // Opt-out cancels everything pending, so nothing fires after the player
    // explicitly said no. (New schedules are independently suppressed by
    // the isOptedIn gate.)
    void notifications.cancelAll();
}
// Opt back IN deliberately does NOT eagerly schedule — the next alive
// moment (resume / end of run / next boot) re-arms the reminders.
```

### 5. Event reminders: arm on consume, cancel on collect

```ts
// The moment the player consumes the gated thing (starts the 8h cooldown):
void notifications.arm('boost-ready');           // delay fn reads the fresh cooldown

// The moment they collect it in-app (the reminder is now stale noise):
void notifications.cancel('boost-ready');
```

## Config reference

| Key | Required | Purpose |
|---|---|---|
| `reminders` | yes | map of custom id → `{title, body, delaySeconds}`. `title`/`body`: string or `() => string` (resolved at schedule time). `delaySeconds`: number or `() => number`; non-finite or ≤ 0 = skip |
| `isOptedIn` | no | `() => boolean` — the game's own settings gate. Suppresses `ensureEnabled()`/`schedule()`/`arm()`; never blocks `cancel()`. Default always opted in |
| `reEngagementId` | no | which `reminders` entry `rescheduleReEngagement()` re-arms; default `'re-engagement'` |
| `enabled` | no | developer kill switch (default `true`): `false` suppresses all notification SDK traffic regardless of player preference |

Factory API: `ensureEnabled()`, `schedule(id, title, body, delaySeconds)`, `arm(id, delaySeconds?)`, `rescheduleReEngagement()`, `cancel(id)`, `cancelAll()` — all async, all resolve (never reject), all no-op safely in mock mode. Exported types: `NotificationsConfig`, `ReminderDef`, `NotificationsSystem` (the factory's return). Full doc comments in `notifications.ts`.

## Patterns

### The sliding re-engagement reminder

One reminder, one id, re-armed at **boot, resume, and every end-of-run** — each call cancels the previous schedule (custom-id dedupe) and starts a fresh 24h countdown. Net effect: the pending reminder always sits 24h past the *last* activity, so a long session keeps pushing it forward and it only lands once the player actually stops playing. Cancel-first dedupe makes re-arming liberally free; there is never more than one pending per id. Returning immediately re-schedules instead of taking a separate cancellation path.

### Event reminders ("X is ready in N hours")

For anything with a cooldown or timer the player will want to return for — a free rewarded ad (the source's 8h quest ad), energy refill, building completion:

- `delaySeconds` is a **function** returning the live remaining cooldown; ≤ 0 skips, so `arm()` at boot is safe whether or not anything is pending.
- Arm at the moment the cooldown starts, re-arm the leftover at boot/resume (a prior session's schedule survives, but re-arming keeps it honest), and **cancel when the player collects in-app** — a reminder for a task already done is confusing noise (the SDK docs call this out explicitly).

### Copy guidelines (from the platform docs)

- **Throttle.** Over-scheduling increases opt-outs and triggers host-level throttling. Two or three well-chosen reminders beat ten.
- **Meaningful custom ids** (`energy_refill`, `daily_reward`) — they're the dedupe keys and what you'll see in `getAllScheduledLocalNotifications()` while debugging.
- **Small payloads.** Title + short body; if you use the `payload` schedule option, reference data by id rather than embedding it.
- **Cancel on completion.** Every reminder should have a "player did the thing" moment that cancels it.
- Write copy in the game's voice with a concrete pull ("Your free boost has recharged"), not generic pleading ("We miss you! Come back!").

### Coordinating with other systems in this library

`systems/daily-rewards/` schedules its own `daily_reward` reminder directly against the SDK (its `scheduleReminder()`/`cancelReminder()`), without going through this factory. That's fine: custom-id dedupe namespaces every reminder independently, so systems can't stomp each other as long as ids are distinct. If the game grows several reminder sources, adopt an id-prefix convention (`daily_reward`, `shop_offer-expiring`, `core_re-engagement`) so a `getAllScheduledLocalNotifications()` dump reads at a glance. One rule does span systems: the settings opt-out should silence everything — add the other systems' ids to a wrapper around `cancelAll()`, or route their scheduling through this factory's `reminders` map.

## Derive from the host game (do not ask the user)

| Decision | How to derive it |
|---|---|
| What deserves a reminder | the game's **return-trigger moments**: grep for cooldowns, timers, energy/refill mechanics, daily resets, "come back tomorrow" mechanics. Each maps to one event reminder. Every game gets the re-engagement reminder; add event reminders only for gates that already exist — don't invent mechanics to have something to notify about |
| Delays | from the game's own gate durations (the source: 24h re-engagement ≈ one play-session cadence; 8h = the ad cooldown itself). Event reminder delays are always the live remaining cooldown, as a function |
| Copy | match tone and vocabulary from the game's existing UI strings (toasts, menus); if the game is localized, resolve through its l10n at schedule time via function-valued `title`/`body` |
| `isOptedIn` | wire to an existing notifications setting if one exists; otherwise add `settings.notifications: true` to the save schema (additive — no migration) plus a settings-row toggle following the host's settings UI pattern |
| Where to wire boot | the host's boot path, after `initializeAsync()` and save load (the gate reads the save) |
| Where to wire end-of-run | the host's session-boundary functions: game over, run quit/abandon, "return to menu" — wherever a play session ends while the app is alive |

## SDK notes & gotchas

Exact API surface (`RundotGameAPI.notifications`, from the platform's NOTIFICATIONS doc):

| Method | Returns | Notes |
|---|---|---|
| `scheduleAsync(title, body, delaySeconds, id?, options?)` | `Promise<string \| null>` | resolves to the scheduled id, or `null` if the host declined. `options`: `{priority?: number (default 50 — numeric, not 'high'), groupId?: string, payload?: Record<string, any>}` |
| `cancelNotification(id)` | `Promise<boolean>` | `true` when something was actually cancelled; safe when nothing is pending |
| `getAllScheduledLocalNotifications()` | `Promise<ScheduleLocalNotification[]>` | `{id, title?, body?, payload?, trigger?}` — your debugging window |
| `isLocalNotificationsEnabled()` | `Promise<boolean>` | platform-level permission probe |
| `setLocalNotificationsEnabled(enabled)` | `Promise<boolean>` | resolves to the resulting enabled state |

Gotchas:

- **Never schedule from `onSleep`/`onQuit`.** A hard close tears down the JS runtime before the schedule RPC reaches the host — backgrounding appears to work in testing, hard-kill silently drops the reminder. Worse, chaining several awaited RPCs in those hooks (`isEnabled → setEnabled → isEnabled → schedule`) gets cut off mid-chain. This is why the template bootstraps permission once at boot (`ensureEnabled()`) and arms reminders at alive moments (boot / resume / end-of-run) only. If you must fire anything notification-shaped near a lifecycle edge, `await` it.
- **`schedule()` is deliberately not gated on the cached permission.** A failed or stale boot-time probe must not silently block every reminder for the session; the template always attempts (cancel-first) and lets the host no-op when notifications are off. The permission bootstrap exists so the *first* schedule isn't a silent no-op, not as a gate.
- **Three permission layers.** The in-game toggle (`isOptedIn`), the platform permission (`ensureEnabled`), and the OS-level setting. The platform silently drops notifications the OS disallows — you cannot detect that; don't build UI that promises delivery.
- **Permission UX:** `setLocalNotificationsEnabled(true)` can surface a host prompt. Call it once at boot, as `ensureEnabled()` does; never re-prompt a player whose in-game toggle is off (`ensureEnabled()` respects the gate for exactly this reason).
- **Every call can reject; an unhandled rejection crashes the game.** The template try/catches everything and its methods never reject — keep that posture in wiring code.
- **Mock mode:** outside the RUN host, all calls no-op or return nothing. The template treats that as "unknown", never as an error; verify real delivery on a device or host build.
- **Deeplinking:** a tapped notification launches the game; detect it with `RundotGameAPI.app.resolveLaunchIntent()` — `intent.kind === 'notification'` with the schedule-time `payload` in `intent.params`. Only needed if a reminder should land somewhere other than the default boot screen.
- **RCS/SMS cross-channel messaging** (`requestRCSOptInAsync` etc.) is a separate BETA surface with regulatory (TCPA) constraints — opt-in must be a user gesture. Out of scope for this template; see the platform NOTIFICATIONS doc before touching it.

## Design choices

- Per-reminder behavior is represented by the `reminders` map + `arm(id)` instead of separate exported functions such as `scheduleReEngagement` and `scheduleQuestAdReady`.
- `ensureEnabled()` respects the `isOptedIn` gate so an opted-out player is never permission-prompted.
- The `enabled` config field is a module-wide kill switch. Debug confirmation UI belongs in the host game, not this module.

## Verification checklist

1. `notifications.ts` typechecks in the host's build (or `npx tsc --noEmit`); the game boots in mock mode (no host) with zero console errors — every method no-ops quietly.
2. Boot on host: `await RundotGameAPI.notifications.getAllScheduledLocalNotifications()` shows exactly one entry per armed id (re-engagement present; event reminder only if its cooldown is running).
3. Trigger resume and an end-of-run several times: still exactly one entry per id (dedupe holds), each re-arm resetting the delay.
4. Consume the event-gated thing → its reminder appears with the live cooldown; collect it in-app → the entry disappears.
5. Toggle notifications OFF in settings: pending list empties; play a run — nothing new is scheduled. Toggle ON: nothing schedules immediately, but the next resume/run-end/boot re-arms.
6. Delivery smoke test: temporarily override a delay to ~15s (`notifications.arm('re-engagement', 15)`), background the app, notification arrives. Then the hard-close version: arm at boot, force-kill the app, the reminder still fires — this proves alive-scheduling.
7. Opted-out fresh profile (settings off before first `ensureEnabled()`): no permission prompt appears.
