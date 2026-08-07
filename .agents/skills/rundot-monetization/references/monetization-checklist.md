# Monetization checklist

Work top to bottom. Each item is a concrete, checkable step. Pricing detail is in
`pricing-templates.md`; the API entry points are in `sdk-surface.md`; the why
behind each pattern is in `patterns.md`. Skip nothing silently — if you
deliberately skip an item, tell the creator why.

## 0. Foundations (two-currency setup)

- [ ] Confirm the money flow: real money → **RB (RUN Bits)** → **your game's
      premium currency** → in-game value. (RB is the platform hard currency; your
      premium currency is per-game.)
- [ ] Decide your premium currency's name/theme and what it buys. Favor
      **permanent** unlocks (cards, relics, characters) over consumables.
- [ ] Confirm there is enough to spend currency on that a player could buy the
      largest pack and still have goals left.
- [ ] Storefront catalog is server-configured and `getCatalog()` returns it.

## 1. Premium currency packs (do this first — revenue backbone)

- [ ] Six tiers configured at the template RB prices (400 / 800 / 1,600 / 2,400 /
      4,000 / 8,000 RB).
- [ ] Each tier grants the template currency amount via `entitlements[]`.
- [ ] Growing bonus % is shown on each pack (+20 / +50 / +67 / +100 / +150%).
- [ ] Tiers ordered with `sortOrder`; bonus badge visible in the UI.
- [ ] Prices read from the catalog `price.{type,value}` — RB→USD rate is **not**
      hardcoded in game logic.

## 2. First-purchase deal (high-impact, low-effort)

- [ ] One-time deal on the first premium-currency pack (2× currency is simplest).
- [ ] Gated on `hasUserMadePurchase() === false` so it shows only before any spend.
- [ ] Reverts to normal amounts for all packs after the first purchase.
- [ ] Bonus is shown clearly as one-time so it creates urgency.

## 3. Ice-breaker + surfacing

- [ ] One cheap (~100 RB), limited-time, visually distinct ice-breaker offer.
- [ ] Limited-time window set via `releasedAt` / `expiresAt`; buy-once via `unique`.
- [ ] Distinct `category` / `tags` so the UI can style it differently.
- [ ] A surfacing entry point (pulsing button + countdown) on the main menu.
- [ ] Surfacing starts **only after** the tutorial / core loop is understood.
- [ ] Surfacing logic: show the ice-breaker first; once bought (or after enough
      declines), rotate to other not-yet-purchased IAPs.

## 4. Bundles + depth of spend

- [ ] 2–3 bundles, each = premium currency + stat boost(s) + ideally one unique
      unlock (one item with multiple `entitlements[]`, or a `collection`).
- [ ] Each bundle priced so the included currency alone ≈ the bundle price (so the
      boosts read as free).
- [ ] One premium, higher-priced **gated** bundle above the entry bundles.
- [ ] Gating done in game logic: check ownership via `getOrderHistory()` (or your
      entitlement state); surface/enable the gated bundle only once the
      prerequisite is owned.
- [ ] Gated bundle is styled as premium and packs genuinely great perks.

## 5. Purchase correctness

- [ ] Every `purchase` / `purchaseCollectionItem` call passes a stable
      `idempotencyKey` so retries can't double-charge.
- [ ] `spendCurrency` calls pass a clear `description` for the host confirmation
      dialog.
- [ ] `SpendCurrencyResult.error === 'USER_CANCELLED'` is handled (no item granted,
      no error shown as a failure).
- [ ] A player short on RB is routed to `openStore()` at the moment of intent.

## 6. Pre-launch verification

- [ ] Prices sanity-checked against a successful, popular **comparable** game —
      you are not far below it (the #1 mistake is underpricing).
- [ ] Live RB→USD pricing verified against the catalog / your store / RevenueCat
      dashboard.
- [ ] Each offer purchased end-to-end in test: currency packs, first-purchase
      bonus, ice-breaker, a bundle, and the gated bundle (after unlocking it).
- [ ] Limited-time offers actually expire; gated offers actually stay gated.

## 7. Honesty gate

- [ ] Limited-time really is limited; gated really is gated (no fake scarcity on
      always-available items).
- [ ] No hidden costs; refund eligibility (`refundEligible` / `requestRefund`) is
      surfaced honestly.
- [ ] Persuasive tactics are proportionate to the game and audience.
