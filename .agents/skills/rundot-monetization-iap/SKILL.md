---
name: rundot-monetization-iap
description: >-
  Add in-app purchases to a RUN.game title — spending RunBucks on a shop
  catalog, bundles, consumables, cosmetics, and subscriptions — through the RUN
  SDK iap/shop APIs, with an economy that's fair and converts. Use when adding
  or tuning a shop, IAP, bundles, currency, starter packs, subscriptions, or
  when the user mentions purchases, monetization, spending, whales, or "how do I
  sell things in my game."
---

# RUN.game In-App Purchases

Let players spend **RunBucks** (the platform hard currency) on digital goods: consumables, cosmetics, convenience, progression, bundles, and subscriptions. The SDK handles the billing flow — your job is designing *what* to sell and *why a player wants it*.

**Why this matters beyond the money:** IAP revenue funds user acquisition and growth. When a player's lifetime value exceeds what they cost to acquire, you reinvest the surplus into more installs — the growth flywheel (see `rundot-marketing-ua-analysis`). IAP is where most of a game's revenue comes from a small share of players, so it's the high-ceiling half of monetization — but only if the economy is fair enough that players *want* to spend, not feel forced to.

**When to run this:** after the core loop is fun and retention clears its floors (`rundot-retention`). Players only spend on a game they're invested in — a purchase prompt in a game they'd otherwise quit converts no one. Instrument analytics first (`rundot-analytics`) so every SKU is measurable.

## Coaching approach — ask, teach, reveal blind spots

Creators often either sell nothing anyone wants, or reach straight for pay-to-win that poisons the game. Your job is to find what players would *gladly* pay for and price it fairly, and to make the whale/first-purchase reality concrete. Ask, teach, and name the blind spots.

Ask as you go (a couple at a time):

- What does a player most *want* in your game that money could reasonably give them — time, cosmetics, convenience, progression?
- Would a purchase ever make the game *less* fun for that player or their opponents? (If yes, rethink it.)
- Why would someone buy for the *first* time — what's the small, obvious, high-value first offer?
- Which top games in your genre sell what? Are they cosmetic-led, progression-led, or convenience-led?
- Do you know that most revenue comes from a few players — and does your catalog have anything worth a big spend for them?

Teach the why, and name the blind spots first-timers miss: **the first purchase is the hardest** — a cheap, generous starter pack converts far more players than a wall of expensive bundles. **A small fraction of players ("whales") drive most revenue**, so you need high-value offers for them *and* an easy on-ramp for everyone else. And the trap that kills games: **pay-to-win in a competitive game** — selling power erodes the fun for non-payers, who are the audience payers want to beat. Selling *fairly* (cosmetics, convenience, generous value) usually out-earns selling *aggressively* because it protects retention and the flywheel.

## Study comparable titles' economies

Before designing a catalog, study how 2–3 successful games *in your genre* monetize — they've tuned their economy against millions of players. Note: what they sell (cosmetics vs. progression vs. convenience), their starter/first-time offer, their price points, how they run sales and limited-time offers, and whether they use a subscription/battle-pass. Match on genre and audience; a cosmetic-led model that works for one loop may earn nothing in another. Summarize the pattern back to the creator, then adapt — don't clone an economy built for a different loop.

## What to sell (a menu, pick what fits the loop)

| Category | Examples | Notes |
|---|---|---|
| **Consumables** | Extra lives/continues, boosts, currency packs, timer skips | Repeatable revenue; the workhorse of most economies |
| **Cosmetics** | Skins, themes, trails, emotes | Zero balance impact — safe in competitive games; identity/self-expression sells |
| **Convenience** | Auto-collect, extra slots, remove friction | Respects the player's time; low pay-to-win risk |
| **Progression** | Chapter/level-pack unlocks, characters | Fine in solo games; risky in competitive |
| **Bundles / starter packs** | Cheap high-value first offer, themed bundles | Starter pack converts first-time buyers; bundles raise ARPU |
| **Subscriptions** | Recurring perks, ad-removal, monthly currency | Recurring revenue; RUN offers CORE/PLUS/PRIME/ULTIMATE tiers |

## Two ways to charge

**1. Simple spend (`RundotGameAPI.iap`)** — spend RunBucks directly on an item id. Good for one-off unlocks and continues.

```typescript
const result = await RundotGameAPI.iap.spendCurrency('continue_run', 5, {
  description: 'Continue your run',   // shown in the host confirmation dialog
  screenName: 'game_over',
});
if (result.success) {
  resumeGame();
} else if (result.error === 'USER_CANCELLED') {
  // player backed out of the dialog; nothing was charged
}
```

- `spendCurrency` auto-opens the RunBucks purchase flow if the player is short. It does **not** return a balance — call `getHardCurrencyBalance()` after if you need it.
- Only `'USER_CANCELLED'` is a stable error value; don't branch on any other error string.

**2. Shop catalog (`RundotGameAPI.shop`)** — define a catalog in `rundot/shop.config.json` (items, collections, sales), upload it, and purchase by id with an idempotency key. Use this for a real storefront with sales, bundles, and scheduled offers.

```typescript
const idempotencyKey = crypto.randomUUID();          // prevents double charges on retry
const result = await RundotGameAPI.shop.purchase('speed_boost', idempotencyKey);
if (result.success) grantEntitlements(result.order);
```

- The catalog is server config — each upload is an immutable version pinned by `configId`. If the catalog changed since the client fetched it, `purchase` throws a stale-catalog error: re-fetch `getCatalog()` and retry (the helper does this).
- Sales are separate objects targeting items/collections by id, so you can schedule discounts without touching item definitions.

**Subscriptions (`RundotGameAPI.iap`)** — `getSubscriptions()`, `purchaseSubscription(tier, interval)`, and gate content with `isUserSubscribed(tier)` (respects tier hierarchy). Tiers low→high: CORE, PLUS, PRIME, ULTIMATE; intervals `'weekly' | 'monthly' | 'annual'`.

## Design principles

- **Sell value, not unfair power.** Especially in competitive games, keep purchases cosmetic/convenience so non-payers still enjoy the game.
- **Make the first purchase trivial to say yes to.** A cheap, obviously-generous starter pack (once per player) is the single highest-leverage offer. Use `hasUserMadePurchase()` to show it only to non-payers.
- **Serve whales too.** Have at least one high-value bundle worth a big spend — most revenue comes from a few players.
- **Always show the balance and confirm the purchase.** Pass a clear `description` so the host dialog tells players exactly what they're buying.
- **Anchor and discount honestly.** Show original vs. sale price; use limited-time offers to create urgency — but don't fake scarcity.
- **Never nickel-and-dime.** An economy that feels stingy or manipulative kills retention and the flywheel it feeds.

## Instrument every SKU

The platform tracks server-side `shop_purchase` / `shop_purchase_failed` / `shop_refund` automatically. Add client-side funnel events via `rundot-analytics`:

- `shop_item_viewed`, `shop_item_click_purchase`, `shop_item_cancel_purchase` (with `item_id`, `price`) — the store conversion funnel.
- Track first-purchase conversion, ARPDAU, ARPPU, and payer %. Watch that monetization changes don't dent retention.

## Drop-in helper

`purchase.ts` wraps shop purchases with an idempotency key, stale-catalog re-fetch/retry, and analytics funnel events. Copy it in and adapt item ids.

## Checklist

```
- [ ] Retention clears genre floors before monetizing hard
- [ ] Catalog fits the loop (consumables/cosmetics/convenience/progression as appropriate)
- [ ] No pay-to-win in competitive modes — power sold fairly or not at all
- [ ] A cheap, generous first-time starter pack exists (shown to non-payers)
- [ ] At least one high-value bundle for big spenders
- [ ] Every spend passes a clear `description`; balance shown in the shop UI
- [ ] Shop purchases use an idempotencyKey and handle stale-catalog retry
- [ ] Store funnel events fire; ARPDAU/ARPPU/payer% + retention tracked
```

## Anti-patterns

- ❌ Pay-to-win in a competitive game — sells short-term, poisons the fun payers came for.
- ❌ Only expensive bundles, no cheap first-purchase on-ramp — most players never convert.
- ❌ No high-value offer — leaving whale revenue on the table.
- ❌ Spending without a `description` — the host dialog can't tell the player what they're buying.
- ❌ Ignoring `USER_CANCELLED` or branching on unstable error strings.
- ❌ Skipping the idempotencyKey / stale-catalog retry — double charges or failed buys.
- ❌ A stingy, manipulative economy that trades retention for a short revenue bump.

## Resources

- `rundot-marketing-ua-analysis` — the growth flywheel IAP revenue funds; LTV > CPI, benchmark D7–D14 ROAS for IAP.
- `rundot-retention` — players only spend on games they return to.
- `rundot-analytics` — SKU-level funnels, ARPPU, payer conversion.
- `rundot-monetization-ads` — the other half; ads + IAP (hybrid) is common in casual.
- SDK: `RundotGameAPI.iap` (`spendCurrency`, `getHardCurrencyBalance`, `openStore`, `hasUserMadePurchase`, subscriptions), `RundotGameAPI.shop` (`getCatalog`, `purchase`, `purchaseCollectionItem`, `requestRefund`), config in `rundot/shop.config.json`.
