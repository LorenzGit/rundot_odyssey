# Ads — rewarded placements, daily cap, watch-to-earn ladder

Rewarded-ad monetization for RUN games: one `grantReward()` chokepoint for every "watch an ad, get a bonus" placement, a game-wide daily watch cap with trusted-clock midnight reset, and an optional "watch N ads → claim milestone rewards" ladder with a reference vanilla-DOM screen.

Its defining design is the **three-path reward flow** — every placement calls the same entry point, and the system picks how the player "pays":

1. **Ad** — on ad-capable platforms, show a rewarded ad; grant only on the SDK's `true` return.
2. **Subscriber instant** — an active no-ads subscriber gets the reward immediately, no ad shown. Deliberately still counted as a real watch (daily cap + ladder), so a subscriber's economy is identical to a watcher's, minus the 30 seconds.
3. **RunBucks fallback** — on no-ads platforms (`capabilities.ads === false`, e.g. a Steam channel), charge a small RunBucks price (the reference configuration uses 1 RB) for the same bonus via `iap.spendCurrency`. Exempt from the daily cap (paying per grant is self-limiting) and does not advance the ladder unless you flip `countFallbackAsWatch`.

Game code never branches on platform at a call site — it says "grant this bonus" and wires the reward into `onReward`.

`showRewardedAdAsync` is called with `{adDisplayId, adDisplayName}` so every request carries placement attribution in addition to any game-owned analytics.

## Files

| File | Copy to host? | Purpose |
|---|---|---|
| `ads.ts` | yes (e.g. `src/helpers/ads/`) | `createAds(config)` — capability detection, three-path grant flow, daily cap, watch counting |
| `adRewardsLadder.ts` | yes, if using the ladder | `createAdRewardsLadder(config)` — pure milestone/threshold/claim math, no SDK |
| `adRewardsScreen.ts` | yes, if the host is a DOM game | reference ladder screen: reward rows, progress bars, watch + claim buttons |
| `ads.css` | yes, with the screen | ladder styling, theme-neutral via `--ads-*` custom properties |
| `../../shared/serverTime.ts` | **yes** | trusted clock for the daily-cap day boundary |
| `README.md` | no | this guide |

TypeScript; if the host game is plain JavaScript, strip the type annotations while copying (see the root README's integration protocol).

**Dependencies:** `shared/serverTime.ts` (copy it alongside — `ads.ts` imports it as `../../shared/serverTime`; fix the `ADAPT:` path if the host layout differs) and a save system for the two state fields (see `systems/save/` — but any persistence works; this module never imports the save system, it only reads the injected `getState()`).

**Synergy with `systems/iap-shop`, without coupling:** if the host sells a no-ads subscription, inject `isSubscriber: () => sub.isActive()` (the cached sync check from `subscription.ts`); if it has an IAP pipeline with analytics, inject `fallbackSpend` to route the no-ads charge through it. Both are **optional injected functions** — this system never imports iap-shop and works fully standalone (default: nobody subscribes, and the fallback calls `iap.spendCurrency` directly).

The two factories are separate files because the coupling is one callback wide: the ads core fires `onWatchCounted` per counted watch, and the ladder's `recordWatch()` is what you wire into it. A game that wants rewarded placements without a ladder copies only `ads.ts`.

## Quick integration

### 1. Add the save fields

In the host's `defaultSave()` (see `systems/save/README.md`):

```ts
// In the MySave interface: `ads: AdsState; adLadder: AdLadderState;`
// (both types are exported by the modules). In defaultSave():
ads: { watchedToday: 0, lastResetDay: null },
adLadder: { watched: 0, claimed: [] },        // only if using the ladder
```

And guards in `validate()`:

```ts
if (!s.ads || typeof s.ads !== 'object') s.ads = def.ads;
if (!s.adLadder || typeof s.adLadder !== 'object') s.adLadder = def.adLadder;
if (!Array.isArray(s.adLadder.claimed)) s.adLadder.claimed = [];
```

Purely additive — old saves back-fill automatically, no migration needed.

### 2. Define placements and create the systems (new file, e.g. `src/adsConfig.ts`)

```ts
import { createAds } from './helpers/ads/ads';
import { createAdRewardsLadder, type AdLadderRewardDef } from './helpers/ads/adRewardsLadder';
import { game } from './game';                 // ADAPT: however the host exposes shared state
import { saveSystem } from './saveConfig';
import { sub } from './subConfig';             // ADAPT: only if selling a no-ads sub (iap-shop)

// ADAPT: one entry per rewarded placement, derived from the game's scarcity
// points (see "Derive from the host game"). `id` doubles as the SDK's
// adDisplayId and the analytics trigger; `productId` is the platform catalog
// id charged on no-ads platforms.
export const PLACEMENTS = {
    gameOverCoins: { id: 'gameover_coins', name: 'Game Over Bonus Coins', productId: 'bonus_gameover_coins' },
    dmgBoost:      { id: 'dmg_boost',      name: 'Damage Boost',          productId: 'bonus_dmg_boost' },
    revive:        { id: 'revive_wave',    name: 'Wave Revive',           productId: 'bonus_revive_wave' },
};

// ADAPT: the ladder. `cost` = ads required BEYOND the previous reward, so
// thresholds are cumulative (3, 5, 10, …). Def shape past `cost` is yours.
export const AD_LADDER_REWARDS: AdLadderRewardDef[] = [
    { cost: 3,  type: 'gems', amount: 50,  desc: '+50 gems' },
    { cost: 3,  type: 'stat', stat: 'coinGainMult', amount: 0.05, desc: '+5% coins forever' },
    { cost: 5,  type: 'gems', amount: 150, desc: '+150 gems' },
    { cost: 10, type: 'stat', stat: 'dmgMult', amount: 0.05, desc: '+5% damage forever' },
];

export const adLadder = createAdRewardsLadder({
    rewards: AD_LADDER_REWARDS,
    getState: () => game.save.adLadder,
    applyReward(def) {
        // ADAPT: grant ONE-SHOT rewards here. 'stat' rewards are a no-op —
        // they're re-derived from the claimed list (see Patterns below).
        if (def.type === 'gems') game.save.gems = (game.save.gems || 0) + def.amount;
    },
});

export const ads = createAds({
    getState: () => game.save.ads,
    maxPerDay: 15,
    persist: () => saveSystem.save(),
    isSubscriber: () => sub.isActive(),        // ADAPT: omit if no subscription — defaults to false
    onWatchCounted: () => adLadder.recordWatch(),  // ADAPT: omit if no ladder
    // fallbackSpend: omit — the default charges iap.spendCurrency directly.
    fallbackCostRB: 1,                         // ADAPT: no-ads bonus price
    // ADAPT: wire to the host's analytics; on no-ads platforms these hooks
    // are the only spend audit trail (spendCurrency returns no receipt).
    analytics: {
        onRewardGranted: (r) => track('ad_reward_granted', r),   // method: ad|subscription|runbucks
        onRewardFailed:  (r) => track('ad_reward_failed', r),
        onFallbackSpend: (r) => track('ad_fallback_spend', r),
    },
});
```

### 3. Boot wiring

```ts
import RundotGameAPI from '@series-inc/rundot-game-sdk/api';
import { refreshServerTime } from './helpers/shared/serverTime';

await RundotGameAPI.initializeAsync();
game.save = await saveSystem.load();
await refreshServerTime();                     // trusted clock for the cap's day boundary

// Re-sample on return from background so a device that slept past midnight
// sees the cap reset.
try {
    RundotGameAPI.lifecycles.onAwake(() => { void refreshServerTime(); });
} catch (e) { /* mock mode */ }
```

No warm-up calls needed — capability is read lazily and memoized on first use.

### 4. A rewarded placement call site (game-over bonus coins)

```ts
import { ads, PLACEMENTS } from './adsConfig';

// Button label: three states, checked in this order.
async function setupBonusButton(btn: HTMLButtonElement, reward: { total: number }): Promise<void> {
    if (!ads.adsCapability()) {
        // No-ads platform: always tappable — the host's spend-confirm dialog
        // is the gate, nothing to preflight. ADAPT: show the RB price + icon.
        btn.disabled = false;
        btn.textContent = '+50% COINS (1 RB)';
        return;
    }
    btn.disabled = false;
    btn.textContent = 'WATCH AD FOR +50% COINS';    // optimistic
    const avail = await ads.isAvailable();           // cap + SDK readiness
    btn.disabled = !avail;
    if (!avail) btn.textContent = 'NO AD AVAILABLE';
}

btn.addEventListener('click', async () => {
    if (btn.disabled) return;
    btn.disabled = true;                             // double-tap guard
    const granted = await ads.grantReward({
        productId: PLACEMENTS.gameOverCoins.productId,
        description: 'Bonus coins: +50%',            // host spend-dialog copy
        trigger: PLACEMENTS.gameOverCoins.id,
        name: PLACEMENTS.gameOverCoins.name,
        onReward() {
            // ADAPT: the actual reward. Grant + persist IMMEDIATELY — on the
            // fallback path real currency was just spent.
            game.save.coins += Math.floor(reward.total * 0.5);
            saveSystem.save();
            updateCurrencyHud();
        },
        onFailed(reason) {
            // 'cancelled' = player declined the spend dialog — stay quiet.
            if (reason !== 'cancelled') showToast('No ad available');
        },
    });
    if (granted) btn.classList.add('hide');          // one bonus per game-over
    else setupBonusButton(btn, reward);              // restore the right label
});
```

### 5. Ladder screen wiring (DOM games)

Include `ads.css`, give the screen a container element, then:

```ts
import { renderAdRewardsLadder, adLadderBadgeVisible }
    from './helpers/ads/adRewardsScreen';
import { ads, adLadder } from './adsConfig';

function openAdRewards(): void {
    showScreen('ad-rewards');                        // ADAPT: host navigation
    renderAdRewardsLadder(document.getElementById('ad-rewards-body'), adLadder, {
        ads,                                         // watch-button availability states
        onWatch: () => ads.showRewardedAd({ id: 'ladder_watch', name: 'Ad Rewards Ladder' }),
        onClaim(def) {                               // the claim pipeline
            computeBonuses();                        // ADAPT: re-derive stat rewards
            saveSystem.save();                       // persist the claim immediately
            showToast('Claimed: ' + def.desc);       // ADAPT
            updateMenuBadges();                      // ADAPT
        },
        renderRewardContent(info, def) {
            // ADAPT: reward-specific icon/preview markup. Default (omit this)
            // renders def.desc as plain text.
        },
    });
}
```

`renderAdRewardsLadder` is idempotent — it re-renders itself after watches and claims; call it again yourself whenever an ad is watched elsewhere while the screen is visible.

### 6. Menu badge

Wherever the host refreshes its menu (boot, screen changes, after every `grantReward`/claim):

```ts
badgeEl.classList.toggle('hidden', !adLadderBadgeVisible(adLadder));
```

## Config reference

### `createAds(config)`

| Key | Required | Purpose |
|---|---|---|
| `getState` | yes | `() =>` the **live** persisted `{watchedToday, lastResetDay}` object (mutated in place) |
| `maxPerDay` | no (15) | game-wide daily watch budget shared by every placement |
| `persist` | yes in practice | e.g. `() => saveSystem.save()` — called after every counted watch |
| `isSubscriber` | no (false) | **injected** sync no-ads-sub check, e.g. `() => sub.isActive()`; exceptions = false |
| `fallbackSpend` | no | **injected** override for the no-ads charge; default calls `iap.spendCurrency` directly. Contract: `async ({productId, costRB, description}) => {status: 'purchased'\|'cancelled'\|'failed', error?}` |
| `fallbackCostRB` | no (1) | RunBucks price per bonus on no-ads platforms |
| `countFallbackAsWatch` | no (false) | successful fallback also fires `onWatchCounted` (ladder progress on no-ads platforms); never counts toward the cap |
| `onWatchCounted(method)` | no | fired once per counted watch, before `persist()` — wire `() => adLadder.recordWatch()` |
| `debugFakeAds` | no (false) | **testing only**: every show counts as watched; false in production |
| `analytics.*` | no | `onRewardGranted({trigger, method})`, `onRewardFailed({trigger, reason})`, `onFallbackSpend({productId, costRB, status, error?})` |

API: `grantReward(opts)` → `Promise<boolean>` (opts: `productId`, `description`, `trigger`, `name`, `onReward`, `onFailed`), `showRewardedAd(placement?)` → `Promise<boolean>` (pure watch — quests, ladder button), `isAvailable()` → `Promise<boolean>` (ad-path probe: cap + SDK readiness; skip on no-ads platforms), `adsCapability()`, `remainingToday()`, `capReached()`, `msUntilCapReset()`, `state()`, `defaults()`, `setAdsOverride('platform'|'ads'|'noads')` / `getAdsOverride()` (debug), property `maxPerDay`.

### `createAdRewardsLadder(config)`

| Key | Required | Purpose |
|---|---|---|
| `rewards` | yes | ordered defs; machinery reads only `cost` (ads beyond the previous reward), the rest is game-defined |
| `getState` | yes | `() =>` the **live** persisted `{watched, claimed[]}` object |
| `applyReward(def, index)` | no | grant one-shot rewards on claim; keep permanent stats out of it (Patterns) |

API: `rewards`, `defaults()`, `watchedCount()`, `claimedCount()`, `isClaimed(i)`, `isComplete()`, `threshold(i)`, `earnedCount()`, `claimableCount()`, `progress(i)` → `{cost, into, earned, claimed, ready, active}`, `claim(i)` → def or null, `recordWatch()`, `forEachClaimed(fn)`. Pure math, no SDK — any UI can consume it.

## Patterns

### Permanent ladder rewards: re-derive, don't store

`stat`-type ladder rewards ("+5% damage forever") are **not** applied in `applyReward`. The game's bonus recompute derives them from the claimed list every time:

```ts
function computeBonuses(): void {
    let dmgMult = 1, coinGainMult = 1;
    adLadder.forEachClaimed((def) => {
        if (def.type === 'stat' && def.stat === 'dmgMult')      dmgMult      += def.amount;
        if (def.type === 'stat' && def.stat === 'coinGainMult') coinGainMult += def.amount;
    });
    // ... fold in the game's other bonus sources
}
```

Same rationale as daily-rewards and iap-shop: the claimed list is the single source of truth; rebalancing a reward retroactively applies on next boot. Call the recompute at boot and inside the claim pipeline.

### Temporary boost via ad

A placement pattern, not template code — the machinery is ~15 lines on top of `grantReward`. Each grant extends a timed boost; the expiry is a **server-time absolute epoch** so device-clock changes can't extend it:

```ts
const BOOST_STEP_MS = 60 * 60 * 1000;       // +1h per grant
const BOOST_MAX_MS  = 2 * 60 * 60 * 1000;   // 2h cap
const NEAR_MAX_MS   = 5 * 60 * 1000;        // disable the button this close to cap

const remainingMs = (): number => Math.max(0, (game.save.boostExpiresMs || 0) - serverNow());
const atMax = (): boolean => remainingMs() >= BOOST_MAX_MS - NEAR_MAX_MS;   // don't sell a wasted tap

function extendBoost(): void {   // inside grantReward's onReward
    game.save.boostExpiresMs = serverNow()
        + Math.min(remainingMs() + BOOST_STEP_MS, BOOST_MAX_MS);
}
```

Two useful refinements: disable the button within 5 minutes of the cap (a top-up there is a wasted watch), and snapshot the boost's effect at run start so a boost active when a run begins lasts the whole run — "start a run NOW to use your boost" feels snappy instead of punitive.

### "Watch an ad" as a quest / cooldown placement

For a recurring pure-watch placement such as gems every 8 hours on the quests screen, store `nextAdReadyMs` (server epoch) in the save, gate the button on `serverNow() >= nextAdReadyMs`, call `ads.showRewardedAd({id: 'quest_gems'})` (not `grantReward` — on no-ads platforms a *paid* recurring freebie makes no sense; hide the row when `!ads.adsCapability()`), and on `true` grant the gems, stamp the next window, and persist. Watches like this advance the ladder automatically via `onWatchCounted`.

### Cap design

The cap is one budget shared by **all** placements, not per-placement — it exists to bound the whole economy's daily ad income (and keep "watch an ad" from becoming the dominant loop), so a player can't stack every placement to its own limit. 15/day was the shipped value and is generous: an engaged player rarely hits it, but it hard-stops abuse of repeatable placements. It resets at local midnight on the trusted clock — the same "day" as the daily-rewards calendar, so the player's mental model stays consistent. Subscribers consume the cap too (their instant grants are watches); the RunBucks fallback doesn't (each grant costs real currency).

### Testing both platform paths on one device

`ads.setAdsOverride('noads')` forces the RunBucks fallback at runtime; `'ads'` forces the ad path; `'platform'` restores reality. A debug-only button can cycle the three states; never expose it in production UI.

## Derive from the host game (do not ask the user)

| Decision | How to derive it |
|---|---|
| Which moments get rewarded placements | The game's **scarcity points** — grep for where a run ends, a resource runs out, or a timer blocks the player. The proven set: end-of-run bonus (+50% of the run's earnings), continue/revive after failure, temporary power boost from the main menu, recurring soft-currency top-up. 2–4 placements is plenty; every one must be optional (rewarded ads are opt-in by definition) |
| Reward sizes | Anchor to what the game already pays out: an end-of-run ad bonus of +50% of that run's reward, a boost matching an existing buff channel, a currency grant ≈ one short session's earnings. Don't invent new currencies or buffs for placements. Skip the button entirely on trivial rewards (the source hid it when a run earned ≤ 5 coins — ad friction must be worth the prize) |
| `fallbackCostRB` + `productId`s | Keep the price tiny — the source charged **1 RB** per bonus; it's a friction token replacing a 30-second ad, not a revenue line (compare: 100 RB ≈ $1 in the iap-shop pricing anchor). One `productId` per placement (`bonus_<placement>`), and flag in your integration summary that the ids must exist in the live platform catalog before a no-ads build ships |
| `maxPerDay` | Keep 15 unless the economy simulation says otherwise; lower it if placements grant premium currency generously |
| Ladder rewards & costs | Front-load: first reward ~3 watches (a day-one player tastes it), then escalate (3, 5, 10, …). Mix one-shot grants with `stat` permanents from bonus channels the game **already** recomputes. Total track length ≈ a few weeks of moderate watching |
| Where the state lives | Inside the host's existing save blob (step 1). If the game has its own persistence, point both `getState`s at wherever its persisted state lives |
| `isSubscriber` / `fallbackSpend` | If `systems/iap-shop` (or an equivalent) is integrated, inject its cached sub check and, only if it has an audited purchase pipeline, its spend path. Otherwise omit both — the defaults are correct standalone |
| Ladder screen entry | The host's screen/navigation pattern + badge affordance. If the game has no ladder-worthy meta rewards, skip the ladder entirely — `ads.ts` works alone |

## SDK notes & gotchas

The full `RundotGameAPI.ads` surface (from the platform ADS.md):

| Method | Returns | Notes |
|---|---|---|
| `ads.isRewardedAdReadyAsync()` | `Promise<boolean>` | preflight; disable buttons on false ("No ad available") — hosts may throttle during campaigns |
| `ads.showRewardedAdAsync(options?)` | `Promise<boolean>` | **true only when the reward was earned** |
| `ads.isInterstitialAdReadyAsync()` | `Promise<boolean>` | interstitial preflight |
| `ads.showInterstitialAd(options?)` | `Promise<boolean>` | true if displayed; false when no fill **or the viewer is a platform subscriber** (auto-hidden — safe to call unconditionally) |

`options` for both show calls: `{ adDisplayId?: string, adDisplayName?: string }` — optional placement attribution forwarded to the host's analytics. The template passes `trigger`/`name` through. Deprecated top-level aliases (`RundotGameAPI.showRewardedAdAsync()` etc.) still forward to the `ads` namespace but the top-level rewarded call takes **no arguments**, losing attribution — use the namespaced form.

- **The boolean is the grant gate, and there is no `USER_CANCELLED` equivalent.** A `false` from `showRewardedAdAsync` covers both "never shown" and "shown but closed early" — the host surfaces no separate "shown" flag and no structured error for a skip. Rejections (connectivity, denied permissions) are caught and treated as `false` too. So the ad path has exactly two outcomes: granted or not; keep failure UX quiet and generic. (`USER_CANCELLED` semantics exist only on the **fallback** path, via `iap.spendCurrency` — the template maps it to a silent `'cancelled'`.)
- **Ads are not supported on Desktop** — calling the ads API there shows a universal link to the mobile app instead of an ad. This is why the capability gate matters: on channels with `capabilities.ads === false` the template never touches `RundotGameAPI.ads` and routes to the RunBucks fallback.
- **Capability unknown = ads available.** SDK 5.23+ mock mode explicitly reports `capabilities.ads: true`; older SDKs or unavailable environment data fall back to the same ad-capable behavior. Only an explicit `false` from the host flips a placement to the fallback. In local dev, the mock readiness probe resolves `true` and `showRewardedAdAsync` completes a rewarded overlay with `true`, so the normal grant path is testable without `debugFakeAds`. Use `debugFakeAds: true` only when a test needs to bypass the overlay.
- **Preflight before showing.** `isAvailable()` short-circuits on the local cap before pinging the SDK, then asks `isRewardedAdReadyAsync()`. Subscribers skip the readiness probe entirely — they don't need host ad fill.
- **The day boundary is the trusted clock** (`shared/serverTime.ts`): winding the device clock forward does not refill the cap once a server sample has landed. Residual risk is device-*timezone* shifting, same trade-off as daily-rewards — acceptable for an ad cap.
- **Never fire SDK RPCs from `onSleep`/`onQuit`** — that includes "one last ad" or scheduling a "your cap reset" notification from a lifecycle handler; a hard close tears down the runtime before the RPC lands. The template does all its SDK work in live flows only.
- **Every SDK call is try/catch'd** (readiness, show, environment, spend) and failure always means "not watched"/"not granted" — never a crash, never a player-facing raw error.
- **Interstitials are out of scope** for this rewarded-ad template. If you add them: preflight with `isInterstitialAdReadyAsync()`, show only at natural break points (level transitions, game over), never mid-gameplay, and don't gate anything on the return value — subscribers legitimately get `false`.

## UI adaptation

`adRewardsScreen.ts` + `ads.css` are the reference implementation. In a DOM game, use them directly and reskin via the `--ads-*` custom properties (documented at the top of `ads.css`). In a canvas/framework game, treat the screen as the spec and consume the pure state APIs:

- **Rows:** for each `ladder.rewards[i]`, `ladder.progress(i)` yields the state — `claimed` (dim + CLAIMED), `ready` (glowing CLAIM button; claim **only** that index), `active` (progress bar `into/cost`), else `locked` (dim, show the requirement).
- **Watch button precedence:** hidden when `!ads.adsCapability()` or the ladder is complete → disabled "DAILY LIMIT REACHED" when `ads.capReached()` → enabled optimistically, demoted to "NO AD AVAILABLE" when the async `ads.isAvailable()` probe resolves false. Disable it while a watch is in flight, and guard async continuations against re-renders replacing their nodes (the reference uses a render sequence token; in React, state-driven rendering gets this for free).
- **Claim:** `ladder.claim(i)`; if it returns a def, run the host pipeline (recompute, persist, toast, badge) and refresh.
- **Badge:** `ladder.claimableCount() > 0`.
- **Placement buttons elsewhere** follow the step-4 pattern: fallback price label on no-ads platforms (no probe), otherwise optimistic label + async `isAvailable()` demotion.

## Verification checklist

1. **Mock ad grant flow:** in local dev, capability and readiness resolve `true`; a placement tap opens the rewarded mock overlay, then grants: `onReward` runs, `save.ads.watchedToday` increments, the ladder's watched count advances, and both survive a reload.
2. **Fake-ad bypass:** with `debugFakeAds: true`, the same grant resolves instantly without opening the overlay. Verify the same counters, then flip it back off.
3. **Daily cap:** set `maxPerDay: 2` temporarily — the third grant fails with reason `cap_reached` *without* an SDK call, `isAvailable()` goes false, and the ladder watch button shows "DAILY LIMIT REACHED".
4. **Cap reset:** flip `TEST_MINUTES_AS_DAYS = true` in `shared/serverTime.ts` — one minute later `state()` resets `watchedToday` to 0 and stamps the new day key. Flip it back.
5. **No-ads fallback:** `ads.setAdsOverride('noads')` → a placement tap calls `spendCurrency(productId, fallbackCostRB, {description})` (host confirm dialog in production; observe the call in mock). A `USER_CANCELLED` result is quiet (`onFailed('cancelled')`, no toast); success grants without touching `watchedToday`. Restore `'platform'`.
6. **Subscriber instant:** stub `isSubscriber: () => true` → grants resolve immediately with no SDK show call, method `'subscription'`, and the cap/ladder still advance.
7. **Ladder math:** with costs `[3, 3, 5, 10]`, thresholds are 3/6/11/21; at 7 watches `earnedCount() === 2`, reward 3 shows `1 / 5`, claims work in any order among the earned, `claim()` on an unearned or claimed index returns null, and claimed stat rewards re-derive after a reload (proving derivation, not storage).
8. **Badge + screen:** earning a reward flips `adLadderBadgeVisible` true; claiming it re-renders the row as CLAIMED and clears the badge when nothing else is ready.
