# Implementing monetization on RUN (SDK surface)

How the playbook maps onto the RUN SDK. The catalog (items, prices, bundles,
limited-time windows, discounts) is configured **server-side** per game; the SDK
reads it and runs purchases at runtime.

**Verify before you code.** The entry points below are real as of this writing,
but read the actual source / SDK docs for exact, current signatures and types
rather than copying from memory:

- `packages/sdk/src/iap/IapApi.ts` — currency + IAP + subscriptions
- `packages/sdk/src/shop/ShopApi.ts` — storefront catalog, items, bundles, orders
- `packages/sdk-docs/` — published developer docs
- Your store / RevenueCat dashboard — the source of truth for live SKU prices and
  the current RB→USD conversion

## Currency & IAP — `IapApi`

```ts
getHardCurrencyBalance(): Promise<number>            // player's RB balance
spendCurrency(productId, amount, options?): Promise<SpendCurrencyResult>
openStore(): Promise<OpenStoreResult>                // open the RB top-up store
hasUserMadePurchase(): Promise<boolean>              // has this player ever spent?
getCurrencyIcon(): Promise<...>                      // RB icon for your UI
getSubscriptions(tier?): Promise<...>                // RUN subscriptions (CORE/PLUS/PRIME/ULTIMATE)
purchaseSubscription(tier, interval): Promise<...>
isUserSubscribed(tier): Promise<boolean>
```

- `spendCurrency` deducts **RB** and shows a host confirmation dialog — pass a
  clear `description` (e.g. "Unlock Frost Relic") so the player sees what they're
  buying. `SpendCurrencyResult.error === 'USER_CANCELLED'` when they decline; no
  RB is deducted.
- `hasUserMadePurchase()` is the key signal for two patterns: drive the
  **ice-breaker** and the **first-purchase deal** off it (offer the deal only
  while it returns `false`).
- `getHardCurrencyBalance()` + `openStore()` let you nudge a player who lacks RB
  straight into topping up at the moment of intent.
- Subscriptions are a RUN-level lever; mention them, but the patterns in this
  skill are about per-game IAPs.

## Storefront, bundles & gating — `ShopApi`

```ts
getCatalog(includeInactive?, includeExpired?, includeUnreleased?): Promise<StorefrontResponse>
getItemDetail(itemId): Promise<StorefrontItem>
purchase(itemId, idempotencyKey): Promise<ShopPurchaseResponse>
purchaseCollectionItem(collectionId, itemId, idempotencyKey): Promise<ShopPurchaseResponse>
getOrderHistory(options?): Promise<ShopOrderHistoryResponse>
getOrder(orderId): Promise<ShopPurchaseResponse>
requestRefund(orderId, reasonCode): Promise<ShopPurchaseResponse>
```

Always pass a stable `idempotencyKey` per purchase attempt so a retry can't
double-charge.

### Pattern → storefront field

`StorefrontItem` / `StorefrontCollection` carry the fields that back each pattern:

| Pattern | Backing fields |
|---|---|
| **Premium currency packs** | one item per tier, each granting currency via `entitlements[]` (`quantity`); order tiers with `sortOrder` |
| **Bundles** | an item with multiple `entitlements[]` (currency + boosts + a unique unlock), or a `StorefrontCollection` grouping items |
| **Ice-breaker / limited-time** | `releasedAt` / `expiresAt` for the countdown window; `unique: true` for buy-once; a distinct `category` / `tags` so your UI can style it differently |
| **Surfacing offers** | `active`, `expiresAt`, `sortOrder`, `tags` give your UI what it needs to pick and badge the offer to surface |
| **First-purchase / sales** | server-configured sales surface as `resolvedPrice.appliedSales[]` with `originalPrice` vs `finalPrice`; show both to make the deal legible |
| **Depth-of-spend gating** | no single "requires X" field is guaranteed — gate in **game logic**: check ownership via `getOrderHistory()` (or your entitlement state) and only surface/enable the premium tier once the prerequisite is owned |

### Notes

- **Prices** are `{ type, value }` — `type` identifies the currency (RB for
  RB-priced items). Don't hardcode the RB→USD rate in game logic; read prices
  from the catalog and verify USD against your store / RevenueCat dashboard.
- **Refunds** exist (`refundEligible`, `refundWindowHours`, `requestRefund`) —
  surface them honestly rather than hiding them.
- **Don't invent product schemas.** If you need a catalog field that isn't in
  `ShopApi.ts`, check the docs or ask — don't assume it exists.
