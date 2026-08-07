# Daily Quests — engagement-scaled daily goals

A pool of quests rolled fresh every local day ("Kill 25 zombies", "Complete 3 waves"), a few visible at a time, each measured against the game's **existing lifetime stat counters** and paying a claimable reward. Comes with a panel UI (progress bars, claim buttons, reset countdown, claimed-today tracker) and a menu-badge helper.

The reference configuration rolls 5 quests per day, shows 3 at a time, and pays a flat 5-gem reward for each. Where **daily rewards** (`systems/daily-rewards/`) pays for *showing up*, daily quests pay for *playing*: the player has to move real gameplay counters to claim. The two share the same day-rollover primitives (`shared/serverTime.ts`) so every "new day" feature ticks over together — most games ship both.

Three design choices define it:

- **Stat-baseline progress.** Quests don't get progress reported to them. Each rolled quest snapshots the player's current lifetime stat (`startVal`) and progress is `current − startVal` — gameplay code just keeps incrementing the counters it already has (see `systems/stats/`), and quests measure the delta.
- **Engagement-scaled difficulty.** A `questDays` counter increments on day rollover *only when the outgoing day had at least one claim* — skipping days never raises (or lowers) difficulty. Targets ramp from 1× at day 0 to 5× at day 30 (configurable), then plateau.
- **Seeded community rotation.** The daily roll is a deterministic shuffle seeded on `questDays`, so every player at the same tier sees the same quests in the same order — "what are today's quests?" becomes a talking point (think Helldivers / Apex dailies), and live-ops can read completion rates without per-player variance noise.

State is one object inside the host's save blob (see `defaults()`). Day gating uses the trusted server clock, not the device clock.

## Files

| File | Copy to host? | Purpose |
|---|---|---|
| `dailyQuests.ts` | yes (e.g. `src/helpers/daily-quests/`) | quest engine — `createDailyQuests(config)` factory, pure state API |
| `dailyQuestsScreen.ts` | yes, if the host is a DOM game | reference panel UI: header, quest rows, 1s ticker, badge helper |
| `dailyQuests.css` | yes, with the screen | rows + progress bars + claim states, themed via `--quests-*` custom properties |
| `dailyQuests.html` | paste into host `index.html` — **skip if the host has its own screen system** (hand the renderer a container instead; the file's comment header explains) | panel/backdrop/list markup snippet |
| `README.md` | no | this guide |

TypeScript; if the host game is plain JavaScript, strip the type annotations while copying (see the root README's integration protocol).

**Dependencies:** `shared/serverTime.ts` (copy it alongside — the templates import it as `../../shared/serverTime`; fix the `ADAPT:` import paths if the host layout differs) and a save system for the state field (see `systems/save/` — but any persistence works; this module never imports the save system, it only reads the injected `getState()`). **Strong synergy with `systems/stats/`:** quest goals are stat keys, so `getStatValue` is just `stats.get` — if the host tracks no counters yet, integrate stats first (it's small) rather than inventing a parallel progress-reporting path.

## Quick integration

### 1. Add the save field

In the host's `defaultSave()` (see `systems/save/README.md`):

```ts
dailyQuests: {
    quests: [], day: null, activeSlots: [],
    claimedAnyToday: false, questDays: 0, lifetimeClaimed: 0,
},
```

(In the host's save interface the field is typed `dailyQuests: DailyQuestsState` — exported by `dailyQuests.ts`.) And a guard in `validate()`:

```ts
if (!s.dailyQuests || typeof s.dailyQuests !== 'object') s.dailyQuests = def.dailyQuests;
```

Purely additive — old saves back-fill automatically, no migration needed. (The engine's `refreshIfNeeded()` also heals missing/stale inner fields on the first roll.)

### 2. Define the quest pool and create the system (new file, e.g. `src/dailyQuestsConfig.ts`)

```ts
import { createDailyQuests, type QuestType } from './helpers/daily-quests/dailyQuests';
import { game } from './game';                    // ADAPT: however the host exposes shared state
import { statsSystem } from './statsConfig';      // ADAPT: see systems/stats

// ADAPT: the quest pool. Every `stat` must be an existing lifetime counter;
// `desc` uses '{n}' for the scaled target; `startingValue` is the day-0
// target. Derive both from the host's own verbs and pacing (see "Derive
// from the host game"). Aim for a pool 3-5x dailyCount so daily picks vary.
export const QUEST_TYPES: QuestType[] = [
    { stat: 'enemiesKilled',  desc: 'Defeat {n} enemies',   startingValue: 25 },
    { stat: 'wavesCompleted', desc: 'Complete {n} waves',   startingValue: 3 },
    { stat: 'itemsMerged',    desc: 'Merge {n} items',      startingValue: 5 },
    { stat: 'coinsEarned',    desc: 'Earn {n} coins',       startingValue: 300 },
    { stat: 'gamesPlayed',    desc: 'Play {n} games',       startingValue: 1 },
    // ... one entry per core verb / notable counter
];

export const QUEST_REWARD_GEMS = 5;   // ADAPT: flat per-quest reward

export const dailyQuests = createDailyQuests({
    questTypes: QUEST_TYPES,
    getState: () => game.save.dailyQuests,        // typed DailyQuestsState (step 1)
    getStatValue: (k) => statsSystem.get(k),      // or (k) => game.save.stats[k] || 0
    dailyCount: 5,                                // rolled per day (visible + reserve)
    activeCount: 3,                               // visible/claimable at once
    // ADAPT: unlock gate — a light progression stat keeps day-1 players on
    // the core loop. Omit for
    // always-unlocked.
    isUnlocked: () => (game.save.stats.gamesPlayed || 0) >= 3,
    applyReward(quest) {
        // ADAPT: grant the reward. Keep it minimal — persist/toast/UI live
        // in the claim pipeline (step 6). Per-quest rewards: put a `reward`
        // field on the type and read quest.reward here.
        game.save.gems = (game.save.gems || 0) + QUEST_REWARD_GEMS;
    },
    // scaling: { maxDays: 30, maxMult: 5 },      // shipped defaults
    // scaleTarget(type, questDays) { ... },      // or replace the curve entirely
});
```

### 3. Boot wiring

```ts
import RundotGameAPI from '@series-inc/rundot-game-sdk/api';
import { refreshServerTime } from './helpers/shared/serverTime';
import { dailyQuests } from './dailyQuestsConfig';

await RundotGameAPI.initializeAsync();
game.save = await saveSystem.load();
await refreshServerTime();                        // first trusted-clock sample

if (dailyQuests.refreshIfNeeded()) saveSystem.save();  // persist a fresh day's roll

// Re-sample the clock whenever the app returns from the background, so a
// device that slept past midnight sees the rollover.
try {
    RundotGameAPI.lifecycles.onAwake(() => { void refreshServerTime(); });
} catch (e) { /* mock mode */ }
```

### 4. Gameplay loop check

Completion should feel immediate, not discovered later on the quests screen. Piggyback the check on moments that already do periodic work, such as end-of-run bookkeeping and the in-battle debounced save flush:

```ts
// Wherever the host already does periodic bookkeeping (end of wave/run,
// or alongside saveSystem.tick's debounce):
for (const q of dailyQuests.takeNewlyClaimable()) {
    showToast('Quest complete: ' + q.desc);       // ADAPT: host's toast/banner
}
updateQuestBadge();                                // step 7
```

`takeNewlyClaimable()` refreshes the day roll, then returns each visible quest exactly once when it first crosses its target (in-memory memo, resets daily). No per-frame cost concerns — it's a handful of comparisons — but once every few seconds is plenty.

### 5. Panel wiring (DOM games)

Paste `dailyQuests.html` into `index.html` (or skip it and hand the renderer a container inside the host's own screen system — see the snippet's comment header), include `dailyQuests.css`, then:

```ts
import { openDailyQuests, closeDailyQuests, dailyQuestsBadgeCount }
    from './helpers/daily-quests/dailyQuestsScreen';

const panelEl = document.getElementById('daily-quests-panel');

// ADAPT: the host's menu button for quests. Hide/disable it while
// !dailyQuests.isUnlocked().
btnQuests.addEventListener('click', async () => {
    await refreshServerTime();   // re-sample on EVERY open, not just boot —
                                 // the panel is where the day boundary is judged
    openDailyQuests(panelEl, dailyQuests, {
        onClaim: runQuestClaimPipeline,           // step 6
        renderReward(el, quest) {
            // ADAPT: reward markup (icon + amount). Default renders
            // quest.reward as text, or nothing when the field is absent.
            el.innerHTML = gemIcon(14) + ' ' + QUEST_REWARD_GEMS;
        },
    });
});

document.getElementById('daily-quests-close')
    .addEventListener('click', () => closeDailyQuests(panelEl));
```

`closeDailyQuests` also stops the 1s ticker — make sure every path that hides the panel goes through it.

### 6. The claim pipeline

`claimSlot()` (invoked by the claim button) only marks the quest claimed, applies `applyReward`, and slides the next reserve quest into the slot. Everything else is the host's job, in the `onClaim` callback:

```ts
function runQuestClaimPipeline(quest: Quest): void {   // Quest is exported by dailyQuests.ts
    saveSystem.save();                 // persist the claim immediately
    updateCurrencyHud();               // ADAPT: refresh HUD
    updateQuestBadge();                // ADAPT: refresh menu badge
    showToast('+' + QUEST_REWARD_GEMS + ' gems!');  // ADAPT
}
```

### 7. Menu badge

Wherever the host refreshes its menu (boot, screen changes, after claims, after the loop check):

```ts
const n = dailyQuestsBadgeCount(dailyQuests);      // claimable-right-now count
badgeEl.classList.toggle('hidden', n === 0);
badgeEl.textContent = String(n);                   // or a plain dot — host's style
```

## Config reference

| Key | Required | Purpose |
|---|---|---|
| `questTypes` | yes | quest pool: `{stat, desc ('{n}' template), startingValue, id?, reward?}`. `reward` is opaque pass-through for `applyReward`/UI; `id` defaults to `stat` (set it only when two types share a stat) |
| `getState` | yes | `() =>` the **live** persisted state object (not a copy — the engine mutates it in place) |
| `getStatValue` | yes | `(stat) => number` current lifetime total; must be a monotonically increasing counter |
| `dailyCount` | no (5) | quests rolled per local day, visible + reserve |
| `activeCount` | no (3) | quests visible/claimable at once |
| `isUnlocked` | no | `() => boolean` feature gate; while locked the engine keeps state empty. Default always unlocked |
| `applyReward(quest, slotIndex)` | no | grant the reward inside `claimSlot()`; keep persist/toast/UI out of it |
| `scaleTarget(type, questDays)` | no | replaces the difficulty curve entirely; return the target for a type at an engagement level |
| `scaling` | no (`{maxDays: 30, maxMult: 5}`) | parameters for the default linear-ramp-with-cap curve |

Factory API: `activeCount`, `defaults()`, `isUnlocked()`, `dayKey()`, `refreshIfNeeded()`, `questAt(slot)`, `progress(quest)`, `isClaimable(quest)`, `claimSlot(slot)`, `claimableCount()`, `claimedToday()`, `takeNewlyClaimable()`, `msUntilReset()`, `relocalizeDescriptions()` — all typed and documented on the exported `DailyQuestsSystem` interface in `dailyQuests.ts` (config: `DailyQuestsConfig`; state slice: `DailyQuestsState`). The state API is pure reads plus two explicit mutators (`refreshIfNeeded`, `claimSlot`), so any UI can consume it.

## Patterns

### Stat-baseline progress measurement

The engine never receives progress events. Each rolled quest stores `startVal` (the lifetime counter at roll time) and `progress = current − startVal`. Two consequences worth knowing:

- **Gameplay code needs zero quest awareness.** If the host already increments stat counters (`systems/stats`), quests work on day one for any counter in the pool — adding a quest type is a data change, not a code change.
- **Baselines re-snapshot on slot arrival.** A reserve quest picked at the start of the day would otherwise carry a stale baseline, and progress made before it rotated in would count retroactively — arriving pre-completed ("I just got this quest and it's already done?!"). `refreshIfNeeded()`/`claimSlot()` re-snapshot `startVal` the moment a quest becomes visible, so it always starts at 0/target. This is also why `takeNewlyClaimable()` only reports *visible* quests.

Counters must only go up. A gauge (current HP, coins *balance*) makes progress go negative (clamped to 0) or complete for free — quest "earn coins" against a `coinsEarned` accumulator, never against the wallet.

### Engagement-scaled difficulty via questDays

`questDays` counts *days on which the player claimed at least one quest*, not calendar days since install: the rollover bumps it only when the outgoing day's `claimedAnyToday` flag is set, and nothing ever decrements it. A lapsed player returns to the difficulty they left, and an every-day player ramps steadily to the cap (default 5× at 30 engaged days — `scaling`). Because the daily roll is *seeded* on `questDays`, the bump also advances the rotation, so claim-then-skip-a-day still lands on a fresh-feeling set. Supply `scaleTarget` to replace the linear curve (e.g. per-type exponents) without touching the machinery.

### Quest types: goals are your game's verbs

A good pool is a survey of the host's core loop: one type per verb the player performs anyway (kill/merge/collect/complete), a few per notable subtype (per enemy kind, per building tier), plus one freebie (`gamesPlayed`, startingValue 1) so every roll likely contains an easy win. Descriptions are pre-rendered at roll time (`'{n}'` → target) so the saved quest is self-contained: rebalancing `startingValue` mid-day never rewrites text in front of the player. For multi-language games, call `relocalizeDescriptions()` after a language switch.

### The "watch an ad" bonus row (pattern only — not in the template)

An optional extra row can offer "Watch an ad → 5 gems" on an 8-hour cooldown (`questAdLastWatchedMs` epoch stamp in the save, compared against `serverNow()`), hidden entirely when `system.getEnvironment().capabilities.ads` is false and counted toward a shared daily ad cap. Decide explicitly whether it sets the same `claimedAnyToday` engagement flag; doing so means showing up just to watch the ad advances the difficulty curve. This is deliberately not in the template because it pulls in the host's ads and analytics stack. If the host has rewarded ads, implement it as a host-owned extra row rather than a quest type in the pool.

### Testing the whole system in minutes

Flip `TEST_MINUTES_AS_DAYS = true` in `shared/serverTime.ts` (marked `ADAPT(testing only)`): every wall-clock minute becomes a distinct "day", so rollovers, `questDays` bumps, and the seeded rotation can be exercised in minutes, and the reset countdown tops out at 59s. Must be `false` in production.

## Derive from the host game (do not ask the user)

| Decision | How to derive it |
|---|---|
| Quest goals (the pool) | from the host's **existing stat counters and core verbs** — grep its stats map / save counters for monotonic accumulators tied to actions the player performs every session. One type per verb, a few per subtype. Never add a counter *only* to quest it unless the verb is core |
| `startingValue` per type | what a modest single session moves that counter by — day-0 targets should be completable in one normal play session (for example, ~25 kills, 3 waves, or 1 game played). Check the host's own numbers (wave sizes, session length), not gut feel |
| Reward sizing | use the host's **existing** currencies; pay per-quest roughly what its economy awards for a comparable slice of play (source: 5 gems per quest ≈ the order of a session's premium drip, 25/day max). Flat per-quest is the shipped shape; per-type `reward` fields work when effort varies wildly. Don't invent a new currency |
| `dailyCount` / `activeCount` | 5 rolled / 3 visible shipped and reads well on phones; scale down only if the pool is tiny |
| `scaling` | keep `{maxDays: 30, maxMult: 5}` unless the host's counters inflate faster than 5× between a new and a veteran session (idle games often need a custom `scaleTarget`) |
| Unlock stat | an existing progression counter (the source used `gamesPlayed >= 3`); default to always-unlocked rather than adding a stat just for this |
| Where the state lives | inside the host's existing save blob (see `systems/save/`); step 1. Any persistence works via `getState` |
| Where to wire the loop check | wherever the host already does periodic bookkeeping — end-of-run/wave handlers, or next to the save system's debounced `tick()` |
| Menu badge | if the host has badge affordances, drive one from `dailyQuestsBadgeCount()`; if not, skip it |

## SDK notes & anti-cheat

- **Server-time authority.** Day boundaries read `serverNow()` — a cached server sample plus local *deltas* — so winding the device clock forward doesn't conjure a new day's roll once a sample has landed. Re-sample on boot, on awake, and on every panel open. In local dev (no host) it falls back to `Date.now()`; the system still works, just untrusted.
- **Residual risk: device timezone.** The day boundary is device-local midnight (matches player intuition and keeps all daily features aligned). A player shifting their device *timezone* can harvest an extra roll per shift. The exposure is one day's quest rewards, bounded by `dailyCount × reward`. If that's intolerable, pin the boundary to a fixed timezone with `RundotGameAPI.getFutureTimeAsync({ days: 1, timeOfDay: { hour: 0, minute: 0, second: 0 }, timezone: 'PT' })` and compare epoch ms instead of local day keys.
- **Client-authoritative progress.** Quests measure the game's own save-resident stat counters, which the client writes — a save editor can complete everything. Fine for self-economy rewards; do not gate cross-player value (PvP power, tradeables, leaderboard placement) on quest claims without server-side verification.
- **No SDK calls in this system.** The engine and screen touch only `shared/serverTime.ts` (which wraps its one SDK call in try/catch). Everything works in mock/local dev out of the box. If you add a come-back notification for quest resets, follow the daily-rewards pattern: cancel-first dedupe, schedule only while the app is alive, **never from `onSleep`/`onQuit`**.
- **Never `|0` an epoch-ms timestamp.** Bitwise ops truncate to 32 bits and epoch ms overflows int32 into garbage. The engine only `|0`s `questDays` (a small int) and stores day *keys* as strings — keep the rule in mind in pipeline code you write (e.g. an ad-cooldown stamp).

## UI adaptation

The reference UI (`dailyQuestsScreen.ts` + `.css` + `.html`) is plain DOM. For a React/canvas/framework host, treat it as the spec and consume the pure state API directly:

- **Header:** countdown = `formatCountdown(msUntilReset())`; tracker = `claimedToday()` as "claimed / total".
- **Rows:** for slots `0..activeCount-1`, `questAt(s)` → null (skip) or a quest: show `desc`, reward, a bar at `min(1, progress(q)/q.target)`, text `min(progress, target)/target`, and a claim button iff `isClaimable(q)`. All slots null → "all quests complete" state; `!isUnlocked()` → locked copy.
- **Ticker:** once per second while visible — `refreshIfNeeded()` (regenerates the list if midnight crosses mid-session), update countdown/bars in place, and only rebuild the row tree when a quest's claimable state or the day key changes (rebuilding every tick kills a claim tap in flight; in React, memoize rows on `[dayKey, slotClaimStates]`). Always stop the ticker when the view closes.
- **Claim:** `claimSlot(s)`; if it returns a quest, run the host pipeline (step 6) and re-render — the slot refills automatically.
- **Badge:** `dailyQuestsBadgeCount(sys)` (or `claimableCount()` if you refresh elsewhere).

## Verification checklist

1. Fresh save: feature locked until the unlock condition; menu entry hidden, panel shows the locked copy, `claimableCount()` is 0.
2. Unlock, open the panel: `dailyCount` quests rolled (`activeCount` visible), every row at 0/target, countdown ticks down 1s at a time **without the rows re-rendering** (watch the DOM, or hold a pointer on a row — it must not vanish).
3. Play so a stat crosses a target: the loop check (step 4) toasts exactly once; the row gains its claim button on the next panel tick; badge shows.
4. Claim: reward granted once, tracker increments, the 4th pool quest slides into the vacated slot **at 0/target** (its baseline re-snapshotted — even if that stat moved earlier today), save persists across a reload.
5. Claim all 5: slots empty into the "all quests complete" state; badge clears; countdown still ticks.
6. Reload mid-day: same quests, same progress (baselines persisted), no re-roll.
7. Flip `TEST_MINUTES_AS_DAYS = true` in `shared/serverTime.ts` and run a rollover ladder: (a) claim ≥1 quest, wait a "day" → new roll, `questDays` is now 1, targets scaled up (e.g. 25 → 28 at the default curve), rotation differs from day 0; (b) claim nothing, wait a "day" → new roll but `questDays` unchanged and targets flat; (c) leave the panel open across the minute boundary → list regenerates in place via the ticker. Flip the flag back.
8. Two fresh saves at the same `questDays` roll identical quest sets in the same order (seeded rotation).
9. Wind the device clock forward a day while the app is running: no new roll (`serverNow()` wins).
