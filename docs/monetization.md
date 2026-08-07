# Day-zero monetization brief

## Required derived-game outcome

Every ship-track game derived from this template must implement both:

1. at least one genuine, player-facing product priced in **RB (Run Bits)**
   through RUN Shop + Entitlements; and
2. at least one genuine, player-facing ad placement.

The implementing AI chooses the product, value, RB price hypothesis, ad formats,
placements, timing, caps, eligibility, and presentation that best fit the
game's audience, core loop, economy, progression, session shape, and natural
breaks. Rewarded ads, interstitials, or both are valid; do not force every
format into every game. Direct-fiat products and subscriptions are optional
additions and do not replace the Run Bits product unless the owner explicitly
approves that substitution. Do not copy Pixel Foundry's examples and do not
treat SDK seams, placeholder IDs, disabled cards, hidden diagnostics, or a list
of recommendations as implementation.

## Odyssey's implementation

Both required channels ship. The catalog lives in `rundot/shop.config.json`;
the ids are mirrored in `src/config/platform.ts` and the registry in
`src/systems/monetization/config.ts`, which are the only places allowed to name
a product. RB prices exist only in the catalog — the shop renders whatever the
live catalog resolved and says `PRICE NOT SYNCED` when it has not.

- **Model:** hybrid. Drachmae (soft currency) drive the armory; Run Bits buy
  time, never reach.
- **Non-payer promise:** every arrow, course and star is reachable on drachmae
  earned from play. No product changes shot physics, scoring, ring layouts or
  course difficulty.
- **Value moment:** one cleared course. Until the player has seen a payout,
  drachmae and the armory mean nothing, so the shop has nothing to say.
- **Durable — `odyssey_navigators_patronage`, 900 RB.** Every cleared course
  pays 25% more, the results bounty is banked without a video, and the shaft
  flies the white Meltemi fletching. `PATRONAGE_EARNINGS_MULTIPLIER` is the one
  number that expresses the first effect.
- **Consumables — `odyssey_ships_purse` / `odyssey_talent_of_troy` /
  `odyssey_hoard_of_ithaca`, 400 / 1,200 / 2,400 RB** for 1,200 / 4,000 / 9,000
  drachmae. The uplift per Run Bit is computed from `DRACHMAE_PACKS` and shown
  on the card. The whole armory costs 6,050 drachmae, so the top pack covers it.
  A pack's grant is credited only after the server confirms the entitlement was
  consumed, so an interrupted redemption retries instead of paying twice.
  Consumables are deliberately excluded from `ownedProductIds`: an unspent
  grant read as ownership would set `purchasable: false` and make the packs
  unbuyable.
- **Rewarded placement — `odyssey_results_bonus_rewarded`.** The victory card
  offers to double what the course just paid. It is drawn only after the host
  confirms a video is loaded, sits in its own column away from REPLAY/COURSE so
  a mis-tap cannot open an ad, and pays only on a verified completion —
  cancelled and unavailable grant nothing. Patrons see the receipt instead of
  the offer.
- **LiveOps:** `rundot/liveops.config.json` carries the enable flags. With them
  off, or with unconfigured ids, both surfaces fail closed rather than offering
  something that cannot complete.

## The template's own posture

This open-source template itself remains fail-closed because it has no derived
game, live catalog, or production IDs. A prototype may defer both channels
until ship-track promotion, and an explicit owner instruction may narrow or
override the model.

- Model: hybrid-capable foundation, disabled by default.
- Non-payer promise: the complete core loop, progression, daily rewards, and quests remain playable without ads or purchases.
- Value moment: the Feature Lab is a developer-facing reference surface and
  keeps both ad actions locked until one demo run has started. A derived
  player-facing game must define and instrument its own value moment before
  enabling either placement.
- Purchase architecture: RUN Shop plus authoritative Entitlements. Do not
  substitute client-owned grants or low-level RB deduction without a recorded
  architecture exception.
- Rewarded placement: `template_results_bonus_rewarded`, opt-in and visible in
  the Feature Lab. It grants 100 demo coins exactly once per SDK-confirmed
  completion. LiveOps defaults off, and unavailable/cancelled/error grants
  nothing. Rename the self-authored placement ID in every derived game.
- Product: a derived game's Shop item must use a final Shop price with
  `type: "bucks"` and display the resolved live price as Run Bits/RB.
- Interstitial placement: `template_feature_lab_interstitial`, available only
  from an explicit Feature Lab natural-break test. LiveOps defaults off; there
  is no automatic or first-session interstitial. Remove the lab action or adopt
  real spacing/session caps before shipping a derived game.
- Non-authoritative sources: analytics, local storage, client LiveOps, and SDK timeouts never prove ownership or completed value exchange.

## What counts as Run Bits monetization

A derived ship-track game has not implemented the required purchase channel
until all of these are true:

1. `rundot/shop.config.json` contains at least one active, game-specific launch
   item with an evidence-backed price:

   ```json
   "price": { "type": "bucks", "value": "100" }
   ```

   `bucks` is the Shop schema name for the platform balance shown to players as
   **Run Bits** or **RB**.
2. A visible, game-appropriate player surface fetches the live Shop catalog and
   renders that item's resolved RB price. A disabled example card, tester-only
   control, hardcoded price, or recommendation does not count.
3. Direct player action starts `shop.purchase()` with a stable idempotency key
   for the logical purchase intent.
4. Order history and authoritative Entitlements reconcile success,
   cancellation, ambiguous outcomes, retry, resume, cross-device ownership,
   refunds, and revocations.
   An ambiguous outcome must never become a permanent checkout lock:
   background/resume reconciliation is read-only, while a later direct tap for
   the same item retries the original logical order with the same idempotency
   key.
5. When the player lacks RB, the RUN host may open its native Run Bits
   acquisition flow. The game never silently substitutes a direct charge or an
   ad.

## The RB rate

`~100 RB ≈ $1 USD`. The dated observation, the full tier table, and a worked
example of getting this wrong live in
`.agents/skills/rundot-monetization/references/pricing-templates.md`. Read it
before setting prices, and re-verify against the live catalog — do not derive
the rate from what other games charge.

## Consumables are never "owned"

A consumable's `expectedEntitlementIds` is empty, and `[].every(...)` is
vacuously `true`. Ownership computed as
`entitlementsLoaded && expectedEntitlementIds.every(has)` therefore flips to
`true` for every consumable the moment entitlements load — rendering `OWNED`,
setting `purchasable: false`, and making the currency packs **unbuyable**. It
only manifests with a host present, so local testing never sees it.

Require a non-empty entitlement list *and* a non-consumable kind.

Player-facing copy uses “Run Bits” or “RB.” `RunBucks`, `bucks`,
`hardCurrency`, and `getHardCurrencyBalance()` remain only where the installed
SDK, type, or schema requires those exact identifiers.

Direct-fiat SKUs and subscriptions can supplement the catalog, but they do not
satisfy this required Run Bits channel without an explicit owner-approved
exception. Low-level `iap.spendCurrency` spends the same RB balance but owns
catalog/grant recovery in the client, so it is a documented
prototype/accepted-risk exception rather than the production default.

## Kill switches and gates

Both `runtime.monetization.adsEnabled` and `runtime.monetization.shopEnabled`
default false. Ad activation also requires platform capability and direct
player interaction. Shop activation additionally requires a real Run Bits
catalog item and entitlement IDs. Rewarded completion must be exactly confirmed
by the SDK. Purchases need stable idempotency and authoritative entitlement
reconciliation before any durable grant.

## Ship-track definition of done

- The Run Bits product and ad placement are both visible at intentional,
  game-appropriate moments.
- The final Shop config, entitlement mapping, RB price, and LiveOps flags ship
  with the game; no required surface remains dark because its config is absent.
- Fiat-only IAP, subscription-only monetization, placeholders, disabled cards,
  hidden diagnostics, SDK wrappers, and future recommendations do not satisfy
  the Run Bits requirement.
- Local development fails honestly when the host is unavailable. RUN
  Playground verifies catalog reads, resolved RB pricing, checkout outcomes,
  and entitlement reconciliation without fabricating success.

## Measurement

Initial funnel events should cover eligible view, explicit click, SDK open, verified completion/order, reconciliation, grant, cancellation, unavailable, and failure. Primary hypotheses are payer conversion and rewarded completion; guardrails are retention, post-exposure abandonment, economy source share, and non-cancellation error rate. Event delivery never changes player state.

## Required host QA

Exercise unavailable ads, cancellation, SDK false completion, timeout, duplicate taps, backgrounding, purchase cancellation, ambiguous purchase recovery, read-only background reconciliation, explicit same-key retry after an unresolved intent, order history reconciliation, missing entitlement, refund, catalog mismatch, LiveOps kill switch, and offline resume in RUN Playground. Purchases can be real and persistent; use only an approved identity and explicit budget.
