# Daily Rewards — forgiving login calendar

A finite, ordered reward track ("day 1 … day N") claimed one per local day, with a popup calendar UI, countdown to the next claim, menu badge, and an optional come-back-tomorrow notification.

Its defining design choice is **miss-day forgiveness**: missing a day never resets progress. The next claim is always the next unclaimed slot, no matter how many days passed — the only rule is "one claim per local day". No streaks means no streak-reset punishment, nothing to explain in an apologetic tooltip, and returning players are greeted with a reward instead of a wiped calendar. When every slot is claimed the track is finished forever.

State is just `{ claimed: int, lastClaimDay: 'YYYY-MM-DD'|null }` inside the host's save blob (exported as `DailyRewardsState`). Claim gating uses the trusted server clock (`shared/serverTime.ts`), not the device clock.

## Files

| File | Copy to host? | Purpose |
|---|---|---|
| `dailyRewards.ts` | yes (e.g. `src/helpers/daily-rewards/`) | claim engine — `createDailyRewards(config)` factory, pure state API |
| `dailyRewardsScreen.ts` | yes, if the host is a DOM game | reference popup UI: tiles, countdown, 1s ticker, badge helper |
| `dailyRewards.css` | yes, with the screen | tile grid + claim states, themed via CSS custom properties |
| `dailyRewards.html` | paste into host `index.html` | dialog/backdrop/grid/countdown markup snippet |
| `README.md` | no | this guide |

**Dependencies:** `shared/serverTime.ts` (copy it alongside — the templates import it as `'../../shared/serverTime'`; fix the `ADAPT:` import paths if the host layout differs) and a save system for the state field (see `systems/save/` — but any persistence works; this module never imports the save system, it only reads the injected `getState()`). TypeScript; if the host game is plain JavaScript, strip the type annotations while copying (see the root README's integration protocol).

## Quick integration

### 1. Add the save field

In the host's `defaultSave()` (see `systems/save/README.md`):

```ts
dailyRewards: { claimed: 0, lastClaimDay: null },   // typed: DailyRewardsState
```

And a guard in `validate()`:

```ts
if (!s.dailyRewards || typeof s.dailyRewards !== 'object') s.dailyRewards = def.dailyRewards;
```

This is a purely additive field — old saves back-fill automatically, no migration needed.

### 2. Define the track and create the system (new file, e.g. `src/dailyRewardsConfig.ts`)

`createDailyRewards` is generic over the reward-def type: extend `RewardDef` with the game's fields once and `applyReward`/`claimNext()`/`forEachClaimed()` are typed everywhere downstream.

```ts
import { createDailyRewards, type RewardDef } from './helpers/daily-rewards/dailyRewards';
import { game } from './game';                    // ADAPT: however the host exposes shared state
import { saveSystem } from './saveConfig';

// ADAPT: the reward track. Def shape is entirely game-defined — the template
// only reads array positions and the optional `milestone` flag. Derive types
// and amounts from the host's own economy (see "Derive from the host game").
export interface GameReward extends RewardDef {
    day: number;
    type: 'gems' | 'dmgBonus' | 'coinBonus';
    amount: number;
}

export const DAILY_REWARDS: GameReward[] = [
    { day: 1, type: 'gems', amount: 25 },
    { day: 2, type: 'gems', amount: 25 },
    { day: 3, type: 'dmgBonus', amount: 0.10, milestone: true },   // permanent
    { day: 4, type: 'gems', amount: 25 },
    { day: 5, type: 'gems', amount: 25 },
    { day: 6, type: 'gems', amount: 25 },
    { day: 7, type: 'coinBonus', amount: 0.10, milestone: true },  // permanent
];

export const dailyRewards = createDailyRewards({
    rewards: DAILY_REWARDS,
    getState: () => game.save.dailyRewards,
    // ADAPT: unlock gate — a light progression stat keeps day-1 players
    // focused on the core loop.
    // Omit for always-unlocked.
    isUnlocked: () => (game.save.stats.gamesPlayed || 0) >= 4,
    applyReward(def) {
        // ADAPT: grant ONE-SHOT rewards here. Permanent bonuses are a no-op —
        // they're re-derived from the claimed count (see Patterns below).
        if (def.type === 'gems') game.save.gems = (game.save.gems || 0) + def.amount;
    },
    // ADAPT: copy, or omit the whole block to disable the reminder.
    notification: {
        title: 'Daily Reward Ready',
        body: 'Your next reward is waiting — come back and claim it!',
    },
});
```

### 3. Boot wiring

```ts
import RundotGameAPI from '@series-inc/rundot-game-sdk/api';
import { refreshServerTime } from './helpers/shared/serverTime';
import { dailyRewards } from './dailyRewardsConfig';

await RundotGameAPI.initializeAsync();
game.save = await saveSystem.load();
await refreshServerTime();                        // first trusted-clock sample

// The reminder is stale noise if the player is already back with a claimable
// (or finished) calendar — clear it. Runs while the app is alive, never in
// onSleep/onQuit.
if (dailyRewards.canClaimNow() || dailyRewards.isComplete()) {
    void dailyRewards.cancelReminder();
}

// Re-sample the clock whenever the app returns from the background, so a
// device that slept past midnight sees the rollover.
try {
    RundotGameAPI.lifecycles.onAwake(() => { void refreshServerTime(); });
} catch (e) { /* mock mode */ }
```

### 4. Popup wiring (DOM games)

Paste `dailyRewards.html` into `index.html`, include `dailyRewards.css`, then:

```ts
import { openDailyRewards, closeDailyRewards, dailyRewardsBadgeVisible }
    from './helpers/daily-rewards/dailyRewardsScreen';

const dialogEl = document.getElementById('daily-rewards-dialog');

// ADAPT: the host's menu button for daily rewards. Hide/disable it while
// !dailyRewards.isUnlocked().
btnDailyRewards.addEventListener('click', async () => {
    await refreshServerTime();   // re-sample on EVERY open, not just boot —
                                 // the popup is where the claim gate is judged
    openDailyRewards(dialogEl, dailyRewards, {
        onClaim: runClaimPipeline,               // step 5
        renderTileContent(tile, def) {
            // ADAPT: reward-type-specific icon + amount markup. Default (omit
            // this) renders def.label or '+'+def.amount as plain text.
            const amt = document.createElement('div');
            amt.className = 'day-amt';
            amt.textContent = def.type === 'gems' ? '+' + def.amount
                : '+' + Math.round(def.amount * 100) + '%';
            tile.appendChild(amt);
        },
    });
});

document.getElementById('daily-close')
    .addEventListener('click', () => closeDailyRewards(dialogEl));
```

`closeDailyRewards` also stops the 1s countdown ticker — make sure every path that hides the dialog goes through it.

### 5. The claim pipeline

`claimNext()` (invoked by the tile tap) only applies the reward def and advances state. Everything else is the host's job, in the `onClaim` callback:

```ts
function runClaimPipeline(def: GameReward): void {
    game.computeBonuses();            // ADAPT: re-derive permanents (Patterns below)
    saveSystem.save();                // persist the claim immediately
    updateCurrencyHud();              // ADAPT: refresh HUD + menu badge
    showToast('+' + def.amount + (def.type === 'gems' ? ' gems' : '% forever!')); // ADAPT
    void dailyRewards.scheduleReminder();  // tomorrow's nudge (no-op if not configured)
}
```

### 6. Menu badge

Wherever the host refreshes its menu (boot, screen changes, after claims):

```ts
badgeEl.classList.toggle('hidden', !dailyRewardsBadgeVisible(dailyRewards));
```

## Config reference

| Key | Required | Purpose |
|---|---|---|
| `rewards` | yes | ordered array of game-defined reward defs; any length. Only array positions and the optional `milestone: true` flag (UI: full-width tile) are read by the template |
| `getState` | yes | `() =>` the **live** persisted `{claimed, lastClaimDay}` object (not a copy — `claimNext()` mutates it in place) |
| `isUnlocked` | no | `() => boolean` feature gate; default always unlocked |
| `applyReward(def, index)` | no | grant one-shot rewards; keep permanents out of it (Patterns) |
| `notification` | no | `{title, body, id?}` enables `scheduleReminder()`; `id` defaults to `'daily_reward'` |

Factory API: `rewards`, `defaults()`, `isUnlocked()`, `isComplete()`, `canClaimNow()`, `nextIndex()`, `claimNext()`, `forEachClaimed(fn)`, `msUntilNextClaim()`, `scheduleReminder()`, `cancelReminder()` — all documented in `dailyRewards.ts` JSDoc. Exported types: `DailyRewardsConfig` (the config above), `DailyRewards` (the returned system), `RewardDef`, `DailyRewardsState` (the save slice). The state API is pure reads (no DOM), so any UI can consume it.

## Patterns

### Permanent bonuses: re-derive, don't store

Milestone rewards like "+10% damage forever" are **not** stored as flags when claimed. `applyReward` ignores them; instead the game's bonus recompute derives them from the claimed count every time:

```ts
function computeBonuses(game: Game): void {   // Game = the host's own state type
    let dmgMult = 1, coinGainMult = 1;
    dailyRewards.forEachClaimed((def) => {
        if (def.type === 'dmgBonus')  dmgMult      += def.amount;
        if (def.type === 'coinBonus') coinGainMult += def.amount;
    });
    // ... fold in the game's other bonus sources, assign to live stats
}
```

Why: `claimed` stays the single source of truth — no flag can drift out of sync with it, saves stay two fields, and rebalancing a milestone's amount retroactively applies to every player on next boot. Call the recompute at boot (after load) and inside the claim pipeline.

### Testing the whole track in minutes

Flip `TEST_MINUTES_AS_DAYS = true` in `shared/serverTime.ts` (marked `ADAPT(testing only)`): every wall-clock minute becomes a distinct "day", so a 7-slot track plays through in 7 minutes, the countdown tops out at 59s, and the reminder schedules ~1 minute out. Must be `false` in production.

### Unlock gating

Gate the whole feature behind a light progression stat via `isUnlocked` (for example, `gamesPlayed >= 4`) so first-session players see the core loop before the metagame. Hide the menu entry while locked; the engine independently refuses claims (`canClaimNow()` is false while locked), so a stray UI path can't claim early.

## Derive from the host game (do not ask the user)

| Decision | How to derive it |
|---|---|
| Reward types & amounts | use the host's **existing** currencies and bonus systems — grep for currency fields in its save and what gameplay awards per session. Pick modest amounts consistent with that economy (for example, ~25 gems/day when a game session awards a comparable amount, or milestones worth +10% on an existing multiplier). Don't invent new currencies or bonus types for this system |
| Track length & milestones | 7 slots with milestones mid-track and at the end is the shipped shape; keep it unless the host's economy suggests otherwise. Mark the big ones `milestone: true` |
| Where the state lives | inside the host's existing save blob (see `systems/save/`); add the field per step 1. If the game has its own persistence, point `getState` at wherever its persisted state lives |
| Where to wire boot | the host's boot path, after save load and `initializeAsync()`; add `refreshServerTime()` there and on its resume/awake hook |
| Unlock stat | an existing progression counter (games played, level reached). If the host tracks nothing suitable, default to always-unlocked rather than adding a stat just for this |
| Menu badge | if the host has a menu/nav with badge affordances, drive one from `dailyRewardsBadgeVisible()`; if not, skip it — don't build a menu system for a badge |
| Notification copy | match the game's voice (title/body in step 2); omit the block if the game sends no notifications |

## SDK notes & anti-cheat

- **Server-time authority.** All gating reads `serverNow()` — a cached server sample plus local *deltas* — so winding the device clock forward does nothing once a sample has landed. Re-sample on boot, on awake, and on every popup open. In local dev (no host) it falls back to `Date.now()`; the system still works, just untrusted.
- **Residual risk: device timezone.** The day boundary is device-local midnight (matches player intuition: "I'll claim after dinner"). A player shifting their device *timezone* can still harvest an extra day per shift. At worst, a determined player claims the finite track early. If your economy can't tolerate that, pin the boundary to a fixed timezone with `RundotGameAPI.getFutureTimeAsync({ days: 1, timeOfDay: { hour: 0, minute: 0, second: 0 }, timezone: 'PT' })` and store/compare epoch ms instead of local day keys.
- **Client-authoritative state.** `claimed`/`lastClaimDay` live in the game's own save, which the client writes. This is fine for a finite self-buff track; do not gate anything cross-player (PvP power, tradeables) on it without server-side verification.
- **Notifications:** cancel-first dedupe on one custom id (`daily_reward`), cancel at boot when the player is already back with a claimable/finished calendar, and schedule only while the app is alive — **never from `onSleep`/`onQuit`** (a hard close kills the RPC mid-flight). Every notification call is try/catch'd; in mock mode they silently no-op.
- **Never `|0` an epoch-ms timestamp.** Bitwise ops truncate to 32 bits and epoch ms (~1.75e12) overflows int32 into garbage. The template stores day *keys* (strings) and only ever formats ms differences, but keep the rule in mind in pipeline code you write.

## UI adaptation

The reference UI (`dailyRewardsScreen.ts` + `.css` + `.html`) is plain DOM. For a React/canvas/framework host, treat it as the spec and consume the pure state API directly:

- **Tiles:** for each `sys.rewards[i]` — `claimed` when `i < claimedCount` (`claimedCount = nextIndex() === -1 ? rewards.length : nextIndex()`), `claimable` when `i === claimedCount && canClaimNow()` (at most one tile, the only interactive one — `role="button"`, keyboard-activatable), else `locked`. Render `milestone` defs bigger/full-width.
- **Countdown row:** three states — `isComplete()` → celebration copy; `canClaimNow()` → "tap to claim" CTA; else "Next reward in " + `formatCountdown(msUntilNextClaim())`.
- **Ticker:** re-check once per second while visible; only rebuild the tile tree when `canClaimNow()` *changes* (rebuilding every tick invalidates the claimable tile mid-tap — in React, keying tiles by index and memoizing on `[claimedCount, canClaim]` gets this for free). Always stop the ticker when the view closes.
- **Claim:** call `claimNext()`; if it returns a def, run the host pipeline (step 5) and refresh.
- **Badge:** `canClaimNow()`.

## Verification checklist

1. Fresh save: feature locked until the unlock condition; menu entry hidden, `canClaimNow()` false.
2. Unlock, open the popup: tile 1 pulses (and is the **only** focusable tile), countdown row shows the CTA copy, menu badge visible.
3. Claim: reward granted once, tile flips to claimed, countdown switches to "Next reward in …", badge clears, save persists across a reload, reminder scheduled (`RundotGameAPI.notifications.getAllScheduledLocalNotifications()` shows one `daily_reward` entry — mock mode may return nothing; that's fine).
4. Same-day re-open: nothing claimable; countdown ticks down 1s at a time without the tiles re-rendering (watch the DOM, or click-hold a tile — it must not vanish under the pointer).
5. Flip `TEST_MINUTES_AS_DAYS = true` in `shared/serverTime.ts` and run the **entire track** in N minutes: each minute rollover flips the popup to claimable mid-session (ticker transition), milestones apply, permanents re-derive after reload, and the final claim lands the complete state ("All rewards claimed", no badge, `scheduleReminder()` no-ops). Flip the flag back.
6. Skip a "day" (test mode: wait 2+ minutes without claiming): next claim is still the next unclaimed slot — progress never resets.
7. Wind the device clock forward a day while the app is running: `canClaimNow()` does **not** flip (server sample wins).
8. Boot with a claimable reward after a claim scheduled a reminder: the reminder is cancelled.
