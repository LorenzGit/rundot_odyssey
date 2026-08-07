# IAP Shop — RunBucks storefront, bundles, packs, offers, subscription

Monetization for RUN games: a client-defined catalog of bundles (one-time/gated purchases recorded in the save) and currency packs (consumables), one hardened purchase pipeline over `RundotGameAPI.iap.spendCurrency`, a limited-time starter offer, a rotating per-session promo, and an optional platform-subscription wrapper (e.g. no-ads). Ships with a reference vanilla-DOM storefront.

Two safeguards are built in: `USER_CANCELLED` purchase results are handled **quietly**, and the save persists **immediately** after every grant to shrink the no-receipt crash window (see gotchas).

**Which IAP model is this?** The RUN platform has two. This template uses the **low-level RunBucks model**: the catalog lives in game code, `iap.spendCurrency(itemId, costRB)` executes the spend, and ownership persists in the game's own save (`save.iapOwned`). The alternative is the **server-config Shop + Entitlements model** (`RundotGameAPI.shop.getCatalog()` / `shop.purchase(itemId, idempotencyKey)` + `RundotGameAPI.entitlements.*`): server-authoritative catalog and ownership, idempotency keys, order history, refund windows. Prefer that model when you need purchases to survive a client crash with zero loss risk, ownership shared across devices independent of the save blob, or refund support; prefer this template when you want catalog iteration without config uploads and a save-integrated economy.

## Files

| File | Copy to host? | Purpose |
|---|---|---|
| `iapShop.ts` | yes (e.g. `src/helpers/iapShop.ts`) | purchase pipeline, ownership, balance/icon caches, limited + session offers |
| `subscription.ts` | only if selling a subscription | platform-authoritative sub wrapper with cached sync status |
| `shopScreen.ts` | reference | vanilla-DOM storefront (use as-is or as a spec — see UI adaptation) |
| `shop.css` | reference | storefront styling, theme-neutral via CSS custom properties |
| `../../shared/serverTime.ts` | **yes** | trusted clock for the offer window + first-purchase stamp |
| `README.md` | no | this guide |

Copy `shared/serverTime.ts` alongside and fix the import paths in `iapShop.ts`/`shopScreen.ts` (templates import `'../../shared/serverTime'`). Depends on `systems/save/` (or any equivalent save system) for persistence. TypeScript; if the host game is plain JavaScript, strip the type annotations while copying (see the root README's integration protocol).

## Quick integration

### 1. Define the catalog + shop config (new file, e.g. `src/shopConfig.ts`)

```ts
import { createIapShop, type ShopCatalog } from './helpers/iapShop';
import { saveSystem } from './saveConfig';

// ADAPT: the whole catalog. Derive bundle contents from the game's own
// economy (see "Derive from the host game"). Pricing anchor: 100 RB ≈ $1.
export const CATALOG: ShopCatalog = {
    bundles: [
        {
            id: 'bundle_starter', name: 'STARTER PACK',
            costRB: 100,                     // ≈ $0.99 — deliberately cheap
            limited: true,                   // 24h window from first shop open
            grants: { gems: 125 },           // data for applyGrant below
            perks: ['1.5x damage', '+125 gems'],  // display copy
        },
        {
            id: 'bundle_speed3', name: 'TRIPLE TIME',
            costRB: 600,
            grants: { gems: 250, unlockSpeed: 3 },
            perks: ['Unlock 3x speed', '+250 gems'],
        },
        {
            id: 'bundle_speed4', name: 'QUADRUPLE TIME',
            costRB: 1400,
            requires: 'bundle_speed3',       // hidden until speed3 is owned
            grants: { gems: 750, unlockSpeed: 4 },
            perks: ['Unlock 4x speed', '+750 gems'],
        },
    ],
    packs: [
        // First pack = the value baseline for the "+N%" badges. `amount` is
        // the display quantity; better amount-per-RB than baseline = badge.
        { id: 'gem_pack_1', costRB: 400,  amount: 250,   grants: { gems: 250 },   toast: '+250 gems' },
        { id: 'gem_pack_2', costRB: 800,  amount: 600,   grants: { gems: 600 },   toast: '+600 gems' },
        { id: 'gem_pack_3', costRB: 1600, amount: 1500,  grants: { gems: 1500 },  toast: '+1,500 gems' },
    ],
};

export const shop = createIapShop({
    catalog: CATALOG,
    getSave: () => saveSystem.data!,   // non-null: save loads before any shop call
    // ADAPT: one-shot grant semantics — interpret each grants field. Do NOT
    // bump iapOwned (machinery's job) or apply passive stat bonuses (see
    // recomputeBonuses).
    applyGrant(item, kind) {
        const s = saveSystem.data!;
        const g = item.grants || {};
        if (typeof g.gems === 'number') s.gems = (s.gems || 0) + g.gems;
        if (typeof g.unlockSpeed === 'number') {
            s.maxSpeedUnlocked = Math.max(s.maxSpeedUnlocked || 1, g.unlockSpeed);
        }
    },
    persist: () => saveSystem.save(),
    recomputeBonuses: () => computeIapBonuses(),   // ADAPT: see step 5
    onBalanceChanged: () => updateCurrencyHud(),   // ADAPT: host HUD hook
    ui: {
        toast: showToast,                          // ADAPT: host toast fn
        refresh: () => { if (isShopOpen()) openShop(); },  // ADAPT
    },
    // ADAPT: wire to the host's analytics. These hooks are the ONLY
    // purchase audit trail — spendCurrency returns no receipt.
    analytics: {
        onBuyTapped: (item, kind) => track('shop_buy_tapped', { id: item.id, kind }),
        onSpendResult: (r) => track('shop_spend_result', {
            id: r.item.id, kind: r.kind, cost_rb: r.costRB, status: r.status,
        }),
        onFirstPurchase: (r) => track('first_iap_ever', { id: r.item.id }),
    },
});
```

### 2. Add the save fields

Add the three fields the shop owns to the save interface + `defaultSave()` (additive — old saves back-fill automatically, no migration needed):

```ts
// in the save interface (types match the exported IapShopSaveSlice):
iapOwned: Record<string, number>;   // {bundleId: purchaseCount}
firstPurchaseAt: number;            // epoch ms of first-ever IAP (analytics milestone)
limitedOfferStartMs: number;        // 24h offer window start (0 = shop never seen)

// in defaultSave():
iapOwned: {},
firstPurchaseAt: 0,
limitedOfferStartMs: 0,
```

`shop.defaults()` returns exactly this object (typed `IapShopSaveSlice`) if you prefer a programmatic merge.

### 3. Boot wiring

```ts
import RundotGameAPI from '@series-inc/rundot-game-sdk/api';
import { refreshServerTime } from './helpers/shared/serverTime';
import { shop } from './shopConfig';
import { sub } from './subConfig';   // if selling a subscription (step 6)

await RundotGameAPI.initializeAsync();
await refreshServerTime();          // trusted clock for offer windows
game.save = await saveSystem.load();
computeIapBonuses();                // re-derive passive bonuses from iapOwned
shop.pickSessionOffer();            // rotating menu promo, fixed per launch
// Warm-ups: fire-and-forget — never block boot on the IAP surface.
void shop.refreshBalance();
void shop.fetchCurrencyIcon();
void sub.refreshStatus();
```

### 4. Screen wiring

```ts
import { renderShop } from './helpers/shopScreen';
import './helpers/shop.css';

function openShop(): void {
    showScreen('shop');                       // ADAPT: host navigation
    void shop.refreshBalance();               // re-fetch on every open
    void sub.refreshStatus();
    renderShop(document.getElementById('shop-body'), shop, sub, {
        toast: showToast,
        packIconHtml: gemIconHtml(),          // ADAPT: soft-currency icon HTML
    });
}
```

`renderShop` stamps the limited-offer window on first open, orders the sections (sub sell card → bundles → packs → sub ACTIVE card), and runs the 1s countdown while a limited offer is active. Wire `ui.refresh` (step 1) to re-call it so purchases repaint automatically.

### 5. Bonus re-derivation (the ownership → stats bridge)

Passive stat bonuses from bundles are **never applied at purchase time**. They are pure functions of ownership counts, recomputed at boot and after every purchase — so they survive reloads, migrations, and refunds-by-hand-edit for free:

```ts
// ADAPT: read your own bonus fields off each bundle definition. (ShopBundle
// carries an open index signature, so game-specific fields like these
// type-check without a template edit.)
export function computeIapBonuses(): void {
    let dmgMult = 1, mutagenGain = 1;
    shop.forEachOwned((bundle, count) => {
        for (const b of bundle.multBonuses || []) {   // multiplicative channel
            if (b.stat === 'dmgMult') dmgMult *= Math.pow(b.val, count);
        }
        for (const b of bundle.bonuses || []) {       // additive channel
            if (b.stat === 'mutagenGainMult') mutagenGain += b.val * count;
        }
    });
    game.iapDmgMult = dmgMult;        // ADAPT: wherever combat reads bonuses
    game.iapMutagenGain = mutagenGain;
}
```

### 6. Subscription (optional, e.g. no-ads — new file `src/subConfig.ts`)

```ts
import { createSubscription } from './helpers/subscription';

export const sub = createSubscription({
    tier: 'LITE',              // ADAPT: platform tier (LITE is weekly-only)
    interval: 'weekly',
    enabled: true,             // kill switch: stops SELLING, never revokes
    name: 'NO ADS SUBSCRIPTION',
    perks: [                   // ADAPT: card copy
        'Skip all ads',
        'Any time an ad is offered, get the reward without watching!',
    ],
    successToast: 'Subscribed — ads are gone!',
    onStatusChanged: (active) => updateAdButtons(),  // ADAPT
});
sub.exposeProbe('__subProbe'); // console diagnostic, safe to ship
```

Gate the perk on the cached sync check — cheap enough for every placement:

```ts
if (sub.isActive()) { grantReward(); return; }   // no SDK round-trip
showRewardedAd(grantReward);
```

## Config reference

### `createIapShop(config)`

| Key | Required | Purpose |
|---|---|---|
| `catalog` | yes | `{bundles: [], packs: []}` — shapes are the exported `ShopBundle`/`ShopPack` interfaces; grant semantics live in `applyGrant` |
| `getSave` | yes | `() => live save object` (shop reads/writes its 3 fields on it) |
| `getOwned` | no | override for the live ownership map (default `getSave().iapOwned`) |
| `applyGrant(item, kind)` | yes in practice | apply one-shot grants to the save |
| `persist` | yes in practice | e.g. `() => saveSystem.save()` — called immediately after grants |
| `recomputeBonuses` | no | re-derive passive bonuses from counts after each purchase |
| `onBalanceChanged` | no | balance cache updated (`null` = unknown) |
| `ui.toast` / `ui.refresh` | no | player messaging / storefront repaint |
| `analytics.*` | no | `onBuyTapped`, `onSpendAttempt`, `onSpendResult`, `onFirstPurchase`, `onLimitedOfferStamped` |
| `limitedOfferDurationMs` | no | default 24h |

API: `purchase(item, kind)` → `'purchased'|'insufficient'|'cancelled'|'failed'|'busy'`, `ownedCount(id)`, `isGated(bundle)`, `visibleBundles()`, `forEachOwned(fn)`, `refreshBalance()`, `fetchCurrencyIcon()`, `defaults()`, `stampLimitedOfferIfUnset()`, `limitedOfferRemainingMs()`, `limitedOfferState(bundle)`, `pickSessionOffer()`; properties `balance` (null = unknown), `iconUrl` (null until fetched), `sessionOffer`, `catalog`.

### `createSubscription(config)`

| Key | Required | Purpose |
|---|---|---|
| `tier` / `interval` | yes | platform tier + lowercase `'weekly'` / `'monthly'` / `'annual'` |
| `enabled` | no (true) | selling kill switch — existing subscribers keep their entitlement |
| `name` / `perks` / `successToast` | no | card copy |
| `fallbackPriceLabel` | no | label before the live price lands (only visible with `debugShow`) |
| `debugShow` | no (false) | force the sell card in local dev; **false in production** |
| `onStatusChanged` | no | fired when the cached active state flips |
| `analytics.*` | no | `onPurchaseStarted`, `onPurchaseResult` |

API: `isActive()` (sync, cached, defaults false), `isAvailable()`, `refreshStatus()`, `priceLabel()`, `purchase()`, `exposeProbe(name)`.

## Patterns

**Bonus re-derivation from counts.** Ownership (`iapOwned` counts) is the persisted truth; derived stats are recomputed from it (step 5). Never write a bonus into the save at purchase time — that forks two sources of truth that drift on migrations or partial writes.

**Limited-time starter offer.** Flag exactly one bundle `limited: true` — a cheap (100 RB), outsize-value pack whose job is breaking the ice on the first real-money purchase. The 24h clock stamps via `serverNow()` the *first time the player sees the shop* (never at install), is immutable per save (expired = gone forever — the scarcity is real), and the card shows while `'active'` or `'owned'`, hiding once `'expired'` unpurchased.

**Rotating session offer.** `pickSessionOffer()` at boot picks one random unpurchased, ungated, non-limited bundle and pins it for the session. Render it as a main-menu promo (button/popup) that deep-links to a purchase without visiting the full shop; hide the surface when it returns `null` (everything owned) or while the limited offer is still active — the starter pack gets first claim on the player's attention.

**Non-spender targeting.** `await RundotGameAPI.iap.hasUserMadePurchase()` (try/catch it) tells you whether this player has *ever* purchased on the platform. Use it to gate the starter offer to genuine non-spenders, or to pick which session offer to promote. `save.firstPurchaseAt` is the same signal scoped to *this game*.

**The `| 0` timestamp bug (preserve this warning).** Never truncate an epoch-ms timestamp with `| 0` (or any 32-bit bitwise op): ~1.77e12 overflows a 32-bit signed int and wraps to garbage, which can make a limited offer "expire" the instant it is stamped. Use `Number(x) || 0` for defaulting.

## Derive from the host game (do not ask the user)

| Decision | How to derive it |
|---|---|
| What to sell | Scan the game's economy: soft currencies → packs; permanent boosts, unlocks, speed tiers, characters/relics → bundles. Propose a starter catalog: one `limited` starter pack at **100 RB (≈ $0.99)** with outsize value, 2–4 bundles at 400–1600 RB combining a permanent perk + a currency grant, and 3–6 currency packs with improving amount-per-RB (first pack = baseline). Keep prices consistent with the game's existing soft-currency scale. |
| `applyGrant` semantics | Where each currency/unlock lives in the save — grep the host's reward-granting code and mutate the same fields |
| Passive-bonus wiring | Where combat/economy multipliers are read today; add the IAP-derived values there and call the recompute at boot + post-purchase |
| Pack `amount`/icon | The game's main premium soft currency and its existing icon markup |
| Subscription perk | If the game shows rewarded ads, a no-ads sub (skip the ad, keep the reward, still counted against any daily caps so subscriber economy ≡ watcher economy). No ads → skip `subscription.ts` entirely. |
| Shop entry point | The host's screen/navigation pattern; also gate all IAP surfaces behind the same progression gate the host uses for monetization (e.g. after the first game) |
| Platform product configuration | RunBucks spends need no per-item platform setup, but **subscriptions require the game's product binding platform-side**. Flag in your integration summary as a deploy-time note ("verify with `window.__subProbe()` on a deployed build") — do not ask the user during integration. |

## SDK notes & gotchas

- **`USER_CANCELLED` is the only stable `error` string** from `spendCurrency`. The template stays quiet on it (the player just declined the confirm sheet) and shows generic "Purchase failed" copy for everything else. Never branch on, or display, other error strings.
- **`spendCurrency` auto-opens a top-up flow** if the player is short at confirm time — the explicit `openStore()` bail in the pipeline handles the *known*-short case cleanly, but don't be surprised when a spend succeeds after the platform topped up mid-call. A third `options` argument (`{description}`) customizes the host confirm dialog if you want it.
- **No receipts.** `spendCurrency` returns no transaction id — your `analytics.onSpendResult` events are the entire audit trail; wire them. The crash window between a successful spend and the persisted grant is real money: the pipeline persists **synchronously right after the grant, before any await**. Keep it that way. If the residual millisecond-scale risk is unacceptable, use the server-config `shop.purchase` + entitlements model instead.
- **Balance is trusted-read, never cached across sessions.** `balance: null` means unknown — render `'--'`, never `0`. `spendCurrency` returns no balance (re-fetch after success); `openStore()` *does* return an authoritative `newBalance`.
- **Currency icon is raw base64** — `getCurrencyIcon()` returns `{base64Data}` needing the `data:image/png;base64,` prefix. The template keeps the "RB" text as a hidden sibling of the injected `<img>` so a load failure degrades to text.
- **Capability gates:** subscription UI must check `system.getEnvironment().capabilities.subscriptions` (false on e.g. Steam) — `isAvailable()` does, *plus* requires a live price fetch to have landed, because a sell card whose checkout can't complete is worse than no card. Status/price fetches carry a 3s timeout defaulting to not-subscribed; checkout gets 5min (the player is typing card details).
- **Mock/local dev (SDK 5.23+):** the balance starts at `100`, the mock currency icon replaces the text fallback, spending deducts from the in-memory balance, and `openStore()` adds 100. The mock reports every queried tier as subscribed and provides a weekly `CORE` price row; the default `LITE` example therefore renders active subscription state without a matching live price. `debugShow` is only needed to force an inactive sell card.
- All time math uses `shared/serverTime.ts` — a device-clock rollback cannot extend the limited offer.

## UI adaptation

`shopScreen.ts` + `shop.css` are the reference implementation. In a DOM game, use them directly and reskin via the `--shop-*` custom properties (documented at the top of `shop.css`). In a canvas/framework game, treat `renderShop` as the spec and re-implement: section order, gated-hidden vs owned-disabled bundle states, the check overlay, `'--'` for unknown balance, the icon-swap-with-text-fallback, the pack bonus-badge math (`packBonusPercent` is exported), the 1s countdown with re-render on expiry, and the double-tap-disabled buy buttons. All purchase behavior lives in `iapShop.ts`/`subscription.ts`, so a rewrite of the view layer risks nothing in the pipeline.

## Verification checklist

1. **Mock purchase flow:** in local dev, open the shop → balance shows `100` and the mock currency icon loads. Buy a 100-RB item → the purchase succeeds, its grant/ownership persists, and the balance refreshes to `0`.
2. **Owned state:** buy (or hand-set `save.iapOwned.bundle_x = 1` and reload) → card shows disabled OWNED + check overlay; passive bonuses reflect ownership after reload (proving re-derivation, not purchase-time application).
3. **Gating:** a `requires` bundle is invisible until its prerequisite is owned, then appears.
4. **Insufficient balance routes to `openStore()`** and *bails* — no `spendCurrency` call on that tap (verify via the `onSpendAttempt` hook not firing).
5. **Cancel is quiet:** a `USER_CANCELLED` result produces no toast, and `onSpendResult` reports `status: 'cancelled'`.
6. **Limited offer:** first shop open stamps `limitedOfferStartMs` once (immutable on later opens); countdown ticks; with the stamp hand-edited to `serverNow() - 25h`, the card is gone and `pickSessionOffer()` may now surface other bundles.
7. **Subscription states:** in SDK 5.23+ mock mode, `refreshStatus()` makes the configured tier active and the SUBS section renders its active state. The mock price catalog only has weekly `CORE`, so the default `LITE` example has no price row. Separately stub inactive status + no package to verify the section hides with `debugShow: false` and renders the fallback sell card with `debugShow: true`. `enabled: false` hides selling but `isActive()` still honors a subscribed player.
8. **Persistence:** after a successful purchase, kill the tab immediately → on reload the grant and `iapOwned` are present.
