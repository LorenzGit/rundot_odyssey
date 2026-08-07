# Analytics — fire-and-forget funnels + custom events

Typed helpers over `RundotGameAPI.analytics`: declared conversion funnels with journey ordering, custom events auto-enriched with cohort context, standard economy/monetization/tutorial events, per-event kill switches, and a console mirror for mock-mode verification.

The central rule is: **gameplay code calls small typed helpers; raw SDK analytics calls appear nowhere else.** One module owns fire-and-forget safety, event naming, payload hygiene, enrichment, and kill switches — a call site is one line, and turning an event off never means hunting call sites.

## Files

| File | Copy to host? | Purpose |
|---|---|---|
| `analytics.ts` | yes (e.g. `src/helpers/analytics.ts`) | all machinery — you should not need to edit it |
| `README.md` | no | this guide |

No dependencies beyond the RUN SDK — not even the save system (per-save dedupe flags live on the host's save, written by call sites, not by this module). TypeScript; if the host game is plain JavaScript, strip the type annotations while copying (see the root README's integration protocol).

## Quick integration

### 1. Define funnels + enrichment (new file, e.g. `src/analyticsConfig.ts`)

```ts
import { createAnalytics, countedSteps } from './helpers/analytics';
import { saveSystem } from './saveConfig';

export const analytics = createAnalytics({
    // ADAPT: declare every funnel upfront — names, journey order, step
    // names. Never renumber or rename shipped steps (SDK best practice);
    // append new steps at the end instead. See "Patterns" for how the
    // ADAPT: shape these around the host game's journeys.
    funnels: {
        // FTUE: one step per onboarding beat the player clicks through.
        ftue: { order: 1, steps: [
            'tutorial_welcome',        // ADAPT: first card dismissed
            'tutorial_first_action',   // ADAPT: core-loop beat completed
            'tutorial_complete',       // ADAPT: FTUE done
        ] },
        // Early retention: one step per integer gamesPlayed value 1..20.
        engagement: { order: 2, steps: countedSteps('games_played_', 20) },
        // Cash shop: the canonical 4-step purchase flow (see wiring below).
        cash_shop: { order: 3, steps: [
            'shop_opened', 'item_tapped', 'purchase_initiated', 'purchase_completed',
        ] },
        // Limited-time starter offer: exposure → conversion.
        starter_offer: { order: 4, steps: ['offer_seen', 'offer_purchased'] },
        // Daily rewards: unlock, open, then one step per day claimed.
        daily_rewards: { order: 5, steps: [
            'daily_rewards_unlocked', 'daily_rewards_opened',
            'claimed_day_1', 'claimed_day_2', 'claimed_day_3', 'claimed_day_4',
            'claimed_day_5', 'claimed_day_6', 'claimed_day_7',
        ] },
    },
    // ADAPT: cohort context merged into EVERY custom event — the 3–6
    // dimensions every analysis pivots on. Read live off the save; keep
    // it cheap and flat. Explicit event props win on key conflicts.
    enrich() {
        const s = saveSystem.data;   // typed MySave | null — null only before load()
        return {
            games_played: s?.stats.gamesPlayed ?? 0,
            tutorial_step: s?.tutorialStep ?? 0,
            highest_level: s?.highestLevel ?? 0,   // ADAPT: the game's depth metric
        };
    },
    // ADAPT: kill switches — silence an event/funnel with zero call-site
    // edits (e.g. a high-volume in-battle currency).
    enabled: {
        // currency_spend_scrap: false,
    },
    debug: false,   // flip true in local dev: console.debug's every emit
});
```

### 2. Boot wiring

None. The factory is synchronous, holds no state, and needs no load order — create it at module scope and import it anywhere. The global rule still applies to the *game*: await `RundotGameAPI.initializeAsync()` at boot before gameplay starts; any event that somehow fires earlier (or in local dev with no host) is attempted and swallowed, never a crash.

### 3. Call sites

```ts
import { analytics } from './analyticsConfig';

// A discrete moment, with context:
analytics.event('boss_defeated', { boss_id: 'dragon', attempts: 3 });

// Funnel progression — declared once in config, one line at the site:
analytics.funnelStep('cash_shop', 1);   // shop screen entered

// Economy: AFTER subtracting, so balance_after is the post-spend state.
game.save.gems -= cost;
analytics.spend('gems', cost, 'card_draw', 'random', game.save.gems);
saveSystem.save();      // analytics never blocks or delays the flush
```

Never `await` an analytics call from gameplay, and never build a payload you then throw away — the kill-switch check is first for a reason.

## Wiring the other systems

Each existing template exposes analytics hooks precisely so the HOST can connect them here. The templates do not import each other — these snippets live in the host's config files.

### systems/iap-shop → cash-shop funnel, spends, failures, first purchase

The shop's hooks are the only purchase audit trail (`spendCurrency` returns no receipt). In `createIapShop({ ... })`:

```ts
analytics: {
    // Step 1 (shop_opened) fires from the host's openShop() — see below.
    onBuyTapped: (item, kind) =>
        analytics.funnelStep('cash_shop', 2, { item_id: item.id, kind, cost_rb: item.costRB }),
    // Fires BEFORE spendCurrency, so intent is recorded even if the
    // platform purchase UI hangs.
    onSpendAttempt: (item, kind) =>
        analytics.funnelStep('cash_shop', 3, { item_id: item.id, kind, cost_rb: item.costRB }),
    onSpendResult(r) {
        if (r.status === 'purchased') {
            analytics.funnelStep('cash_shop', 4, {
                item_id: r.item.id, kind: r.kind, cost_rb: r.costRB,
            });
            analytics.spend('runbucks', r.costRB,
                r.kind === 'pack' ? 'shop_pack' : 'shop_bundle',
                r.item.id, r.balanceAfter);
            if (r.item.limited) analytics.funnelStep('starter_offer', 2, { item_id: r.item.id });
        } else if (r.status === 'failed') {
            analytics.purchaseFailure({
                itemId: r.item.id, kind: r.kind, stage: r.stage, error: r.error,
            });
        }
        // 'cancelled' / 'insufficient' need no event of their own — the
        // step-3 → step-4 gap already measures them. ADAPT: add explicit
        // side events here if your dashboard wants the split.
    },
    // Fires exactly once per save (the shop dedupes via save.firstPurchaseAt).
    onFirstPurchase: (r) =>
        analytics.firstPurchase({ item_id: r.item.id, kind: r.kind, cost_rb: r.costRB }),
    // The 24h window just started = the player just became eligible.
    onLimitedOfferStamped: (bundle) =>
        analytics.funnelStep('starter_offer', 1, { item_id: bundle ? bundle.id : '' }),
},
```

And in the host's shop-open path:

```ts
function openShop() {
    analytics.funnelStep('cash_shop', 1);   // multi-opens dedupe per session
    // ...existing openShop body
}
```

### systems/stats → games-played engagement funnel

`onIncrement` fires with the NEW total after every `add()` — the seam for counter milestones, and (unlike reading the save at boot) it only fires on real progression. In `createStats({ ... })`:

```ts
onIncrement(key, value) {
    // ADAPT: branch per milestone-bearing stat; keep it cheap — this
    // also fires for per-frame duration ticks.
    if (key === 'gamesPlayed') analytics.funnelStep('engagement', value);
},
```

Values past the declared step count (20 above) no-op via the out-of-range rule — the "track only the first N games" contract needs no `if` at the call site.

### systems/tutorial → dismissal timing + FTUE funnel

In `createTutorials({ ... })`, the dismissal event is a straight pass-through:

```ts
onDismiss: (id, cardCount, durationMs) =>
    analytics.tutorialDismissed(id, cardCount, durationMs),
```

FTUE *funnel* steps are separate and fire from each sequence's `onDone` — so the event means "the player clicked through this beat", never "the save already had this value" at boot:

```ts
tutorials.showOnce('shownWelcomeTut', TUTORIALS.WELCOME, () => {
    game.save.tutorialStep = 1;
    saveSystem.save();
    analytics.funnelStep('ftue', 1);   // one trigger site per step = once per save
});
```

### systems/daily-rewards → retention funnel

Step 1 fires where the host reveals the menu button (one-shot per save — gate with a save flag, since "unlocked" isn't a click):

```ts
if (dailyRewards.isUnlocked() && !game.save.dailyUnlockSeen) {
    game.save.dailyUnlockSeen = true;   // ADAPT: add to defaultSave()
    saveSystem.save();
    analytics.funnelStep('daily_rewards', 1);
}
```

Step 2 on open, steps 3..9 from the claim pipeline (`onClaim` receives the claimed index, so `3 + index` = the step for day `index + 1`):

```ts
analytics.funnelStep('daily_rewards', 2, {
    claimed_count: game.save.dailyRewards.claimed || 0,
    can_claim_now: dailyRewards.canClaimNow(),
});
openDailyRewards(dialogEl, dailyRewards, {
    onClaim(def, index) {
        analytics.funnelStep('daily_rewards', 3 + index, {
            day: index + 1, reward_type: def.type, amount: def.amount,
        });
        // ...rest of the host claim pipeline: recompute, persist, HUD, toast
    },
});
```

## Config reference

### `createAnalytics(config)`

| Key | Required | Purpose |
|---|---|---|
| `funnels` | no | `{ name: { order, steps: [...] } }` — every funnel, declared upfront; `steps[i]` names step `i+1`; `order` positions the funnel in the user journey (SDK default 0) |
| `enrich` | no | `() => props` merged under every custom-event payload (cohort context); exceptions swallowed; event props win conflicts |
| `enabled` | no | per-name kill switches (`false` = fully suppressed, zero SDK calls); funnel names, event names, and `currency_spend_<currency>` all work |
| `debug` | no (false) | mirror every emit to `console.debug` (mock-mode verification; ship off) |

API: `event(name, props?)`, `funnelStep(funnelName, step, props?)`, `spend(currency, amount, sink, itemId?, balanceAfter?)`, `purchaseFailure({itemId, kind, stage, error})`, `firstPurchase(props?)`, `tutorialDismissed(id, cardCount, durationMs)`. Module also exports `countedSteps(prefix, count)` for counter funnels.

Standard event names emitted: `currency_spend`, `iap_failure`, `first_iap_purchase`, `tutorial_dismissed` — plus whatever names you pass to `event()` and declare as funnel steps.

## Patterns

**A worked funnel map.** This example uses 9 funnels, with `order` matching the chronological user journey:

| Funnel | Order | Steps |
|---|---|---|
| `tutorial` | 1 | 5 steps, one per FTUE beat (`tutorial_welcome` … `tutorial_quests_shown`), each fired inside the tutorial card's `onDone` — step number = the `tutorialStep` save value AFTER the transition |
| `engagement` | 2 | 20 steps, `games_played_1` … `games_played_20` — step number = the new `gamesPlayed` total; past 20 intentionally untracked (dashboard targeted early drop-off) |
| `cash_shop` | 3 | 4 steps: `shop_opened`, `item_tapped`, `purchase_initiated`, `purchase_completed` |
| `icebreaker` | 4 | 3 steps: offer seen → bundle viewed → purchased (the limited starter pack got its own funnel — its urgency-driven drop-off shape would be noise inside `cash_shop`) |
| `prestige` / `daily_rewards` / `cards` / `relics` | 6–9 | feature-depth arcs: unlocked → opened → first use → deeper milestones. `daily_rewards` ran 9 steps (unlocked, opened, `claimed_day_1..7`), and its headline metric — "% of day-1 claimers who reached day 7" — reads directly off step 9 / step 3 |

**Several small funnels, not one big one.** Funnel steps must be reached in order; the backend drops a lower-numbered step that arrives after a higher-numbered one. Tutorial and games-played arcs often interleave during FTUE (the same game-over advances both), so combining them would race and drop steps. Split interleaving arcs into separate funnels and use `order` to keep them side by side on the dashboard.

**Step numbers carry meaning.** Pick a scheme per funnel and keep it: step = the counter value (`engagement`), step = position in a fixed flow (`cash_shop`), step = `2 + day` (`daily_rewards`). Renaming or renumbering shipped steps corrupts historical comparisons — only append.

**Dedupe lives in two places, neither of them here.** The backend treats each step as "ever reached" per session, so browsing taps and popup re-opens need no guards. Once-per-save semantics (FTUE steps, milestones) come from firing inside a naturally one-shot path (`showOnce` onDone, `onFirstPurchase`) or an explicit save flag. The analytics layer stays stateless.

**Terminal states are side events, not steps.** A funnel measures ordered progress; an explicit "this conversion will never happen" signal (offer expired unpurchased, purchase cancelled, prestige dialog cancelled) is a plain `event()` — it distinguishes "never got there" from "got there and bailed", two different product problems.

**Economy taxonomy: sinks, not sources.** One `currency_spend` schema across all currencies — `currency`, `amount`, low-cardinality `sink` enum (the source's: `upgrade`, `unit_level`, `card_draw`, `card_slot`, `mutation`, `building`, `shop_bundle`, `shop_gem_pack`, `bonus`), `item_id` for drilldowns, `balance_after`. The source deliberately fired **no income events**: `balance_after` reconstructs rolling balances per session, at a fraction of the event volume. If 80% of gems drain into one sink, the other sinks' pricing is wrong — that's the tuning signal this exists for.

## Derive from the host game (do not ask the user)

| Decision | How to derive it |
|---|---|
| Which funnels to define | The game's conversion moments: FTUE completion (always), the purchase flow if IAP exists (always), then one depth funnel per gated feature — find unlock conditions (`isUnlocked`, `requires`, gamesPlayed gates) and one-shot tutorial flags; each marks a funnel-worthy arc: unlocked → opened → first use |
| FTUE step names | One step per onboarding beat the host already has — its tutorial sequence, `tutorialStep`-style field, or `showOnce` chain; name steps after what the player just did |
| `engagement` length | 10–20 (source: 20). Long enough to see week-one drop-off, short enough that the dashboard stays readable |
| `enrich()` fields | The progression numbers the game already persists that segment players: games/levels played, prestige or rebirth count, highest level/wave, tutorial step. 3–6 fields, all numeric |
| Spend currencies + sinks | Grep for currency-subtraction sites (`save.gems -=`, spend/`canAfford` helpers); every subtraction site is a `spend()` call with a sink named after the feature that took the money |
| Event naming | Follow whatever names the host already emits (grep for `recordCustomEvent`); otherwise stable snake_case verbs of what happened (`boss_defeated`, not `event_1`) |
| Where steps fire | Player-action paths only: click handlers, `onDone`/`onClaim`/hook callbacks — never boot-time state loads (a reload must not refire progression) |
| Dashboard visibility | Custom events need the RUN Operators team's heads-up to appear in dashboards — flag as a deploy-time note in your integration summary; do not ask the user during integration |

## SDK notes & gotchas

- **The entire SDK surface is two methods** on `RundotGameAPI.analytics`:
  - `recordCustomEvent(name, params?)` → `Promise<void>` — `params` is an arbitrary `Record<string, any>`; omitting it is valid when the name alone suffices. (A deprecated root-level `logCustomEvent({eventName, params})` exists; don't use it.)
  - `trackFunnelStep(step, name, funnel?, funnelOrder?)` → `Promise<void>` — 1-based step number, step name, funnel name, and an optional `funnelOrder` positioning the funnel in the user journey (defaults to 0 when omitted).
- **Analytics is fire-and-forget at the SDK level too:** unlike storage/ads/purchases, the SDK catches analytics RPC failures internally and logs a non-fatal console warning — rejections won't crash the host. The template still wraps everything (pre-init calls, mock hosts, older SDKs); keep that posture in any code you add.
- **Payload hygiene:** the docs set no hard byte limit — the rule is "limit payload size; send identifiers for large objects instead of entire blobs". Keep payloads small and flat; the flattest useful shape wins.
- **Naming rules:** stable snake_case, meaningful names, funnel steps defined upfront with step numbers held consistent forever.
- **Never emit from `onSleep`/`onQuit`.** The docs suggest batching non-critical analytics behind `onPause` or `onSleep`; on a hard close the runtime is torn down before the RPC lands (this repo's global lifecycle rule). `onPause` is safe (the app is alive under an overlay); for session-end signals, emit at end-of-run/screen-close moments instead.
- **Dashboards are not included:** this API records; viewing happens in the platform dashboard, and custom events surface there only after a heads-up to the RUN Operators team.
- **Mock/local dev:** no host pipeline — emits resolve into nothing. `debug: true` is the visibility tool; the game must behave identically either way.

## Verification checklist

1. **Mock-mode visibility:** with `debug: true` in local dev, exercising the game prints a `[analytics]` line per emit — funnel lines show `(funnel, step, name)`, event lines show the merged payload including `enrich()` fields.
2. **No crash without a host:** fire an `event()` before `initializeAsync()` resolves and in plain local dev — nothing throws, no unhandled rejection in the console.
3. **Out-of-range no-op:** `funnelStep('engagement', 999)` and a step on an undeclared funnel both emit nothing.
4. **Kill switch:** set `enabled: { currency_spend: false }` → `spend()` prints/sends nothing; remove it → events return. Per-currency: `currency_spend_<currency>: false` silences only that currency.
5. **Hooks wired end-to-end:** in mock mode — open the shop and tap BUY (`cash_shop` steps 1–3 fire, plus 4 + `currency_spend` or `iap_failure` depending on the mock result); finish a run (`engagement` step with the new total via stats `onIncrement`); dismiss a tutorial (`tutorial_dismissed` with a plausible `duration_ms`); claim a daily reward (`claimed_day_N` with `day: N`).
6. **No gameplay stalls:** no `await` on any analytics call anywhere in the host (grep for `await analytics.`); with `debug: false`, frame time and save-flush timing are unchanged from before integration.
