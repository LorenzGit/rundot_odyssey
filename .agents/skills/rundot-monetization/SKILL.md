---
name: rundot-monetization
description: Monetize a RUN game with in-app purchases — bundles, ice-breaker offers, premium currency packs, depth-of-spend gating, and first-purchase deals, with RUN-specific pricing. Use when a creator wants to add or improve IAPs, set prices, design a shop, or asks how to make money from their game.
---

# Monetize a RUN game

A practical IAP playbook for RUN games, distilled from creators who have shipped
many monetized games. Treat these as **starting points**, not rules — every game
and genre differs. When unsure, look at successful comparable games and match
what they sell and what they charge.

## The one principle to remember

**Most creators underprice their IAPs.** The price points in this skill sell
well in practice. Don't reflexively make things cheaper — make them feel worth
it. When in doubt, price like a successful comp, not like what you'd
personally pay.

## Two currencies — keep them straight

RUN games have two layers of currency, and good monetization uses both:

1. **RB (RUN Bits)** — the *platform* hard currency. Players acquire it with
   real money. This is what your IAPs are priced in. (~100 RB ≈ $1 USD —
   verify the current conversion against the live catalog / your store
   dashboard before relying on it.)
2. **Your game's premium currency** — e.g. "gems". Players
   **buy it with RB** and **spend it in-game** on permanent unlocks (cards,
   relics, characters…). This is per-game and themable; it is not a platform
   wallet currency.

The money flow is: **real money → RB → your premium currency → in-game value.**
Premium-currency packs are where most revenue comes from; bundles and
ice-breakers get players to spend the first time.

## The playbook (six patterns)

Read `references/patterns.md` for the full how/why of each. In brief:

1. **Premium currency packs** — six priced tiers, bigger packs give bonus %.
   The revenue backbone. Make sure there's something good to spend on.
2. **Ice-breaker purchase** — one cheap (~100 RB), limited-time, visually
   distinct offer. A player who spends once spends again.
3. **Surfacing offers** — a pulsing/countdown button that draws attention to an
   IAP. Start surfacing *after* the player understands the core loop.
4. **Bundles** — stat boosts + premium currency, priced so the currency alone
   would cost about the same → reads as a smart buy.
5. **Depth of spend** — higher-priced bundles, some gated until a prior bundle
   is bought. Players who already bought in are the most likely to buy more.
6. **First-purchase deal** — a one-time discount or 2× currency on the first
   premium-currency pack. A high-impact, low-effort win that many games skip.

## RUN pricing templates

Exact RB price tables (currency packs, bundle math, ice-breaker, gated tier,
first-purchase bonus) are in `references/pricing-templates.md`. Use them as the
default and adjust to your game.

## How to apply it (recommended order)

**Work through `references/monetization-checklist.md`** — an ordered, checkable
list that takes a game from no monetization to launch-ready. The short version:

1. Define your game's premium currency and what it buys (permanent unlocks beat
   consumables for perceived value).
2. Ship the **six-tier currency packs** using the pricing template.
3. Add a **first-purchase bonus** (2× on first pack is the simplest high-impact
   version).
4. Add an **ice-breaker** offer and start **surfacing** it after the tutorial.
5. Add 2–3 **bundles**, then a **gated depth-of-spend** bundle above them.
6. Verify prices against a successful comp before launch.

When acting on this skill, work the checklist item by item and report what's
done, skipped (and why), and still open.

## Implementing it on RUN

These patterns map onto the RUN SDK's `iap` and `shop` surfaces — limited-time
windows, buy-once items, entitlements, bundles/collections, and discounts are
all supported. See `references/sdk-surface.md` for the concrete API entry points
and which storefront fields back each pattern. Do not invent product schemas —
read the SDK source / docs referenced there for exact signatures before writing
code.

## Be honest with the creator

These tactics work, and some (repeated surfacing, limited-time pressure) are
deliberately persuasive. Apply them in proportion to the game and audience, and
don't deceive players about odds or value. If a creator asks for something that
would mislead players (fake scarcity on an always-available item, hidden costs),
say so and offer the honest version.

## Traps that only appear with a host

- **`[].every()` marks every consumable as owned.** A consumable's
  `expectedEntitlementIds` is empty and `[].every(...)` is vacuously `true`, so
  ownership computed that way flips to `true` for every consumable the moment
  entitlements load — rendering `OWNED`, setting `purchasable: false`, and
  making the currency packs **unbuyable**. Require a non-empty entitlement list
  *and* a non-consumable kind. With no host, entitlements never load, so local
  testing never sees it.
- **Host-gated offers hide themselves locally**, so layout tests measure a hole
  where the offer sits on a device. Force them visible in tests.
- **Grants come only from host-confirmed outcomes** — never from an optimistic
  client path, and never from a local save for anything money bought.

`rundot-reliability-qa/references/host-reality-gap.md` covers this class in full.
