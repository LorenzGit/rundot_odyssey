# Monetization patterns — how and why

The six patterns, with the reasoning and the timing that makes them work.
Pricing lives in `pricing-templates.md`; RUN implementation in `sdk-surface.md`.

## 1. Premium currency packs

**What:** Six priced tiers of your game's premium currency (see pricing table),
with a bonus % that grows with price.

**Why:** This is where most spend happens over a game's life. The growing bonus
makes bigger packs look like better value and raises average purchase size.

**Make it work:** You must have compelling things to spend the currency on —
ideally *permanent* unlocks (stat cards, new buildings/relics, characters), not
just consumables. Permanent value justifies bigger purchases.

## 2. Ice-breaker purchase

**What:** One cheap (~100 RB), limited-time, visually distinct offer whose only
job is to convert a non-spender into a spender.

**Why:** The first purchase is the hard one. A player who has spent once is far
more likely to spend again ("breaking the ice"). The low price and countdown
lower the barrier and add urgency.

**Make it work:** Keep it cheap and obviously a good deal. Make it look
different from everything else in the shop. Run several variants or re-show it;
if one ice-breaker doesn't convert, the next might.

## 3. Surfacing offers

**What:** A prominent, attention-grabbing entry point to an IAP — e.g. a pulsing
"SPECIAL OFFER" button with a countdown on the main menu.

**Why:** Players won't buy what they don't notice. Surfacing converts passive
browsing into clicks.

**Make it work — timing matters:** Start surfacing **after** the player has been
through the initial tutorial / core loop. Before that, players don't understand
the value and rarely buy, so early pressure is wasted (and annoying). Early on,
surface the **ice-breaker**; once that's purchased, surface other IAPs the
player hasn't bought yet, rotating through them.

## 4. Bundles

**What:** A single item combining stat boosts + premium currency.

**Why:** Bundles raise perceived value: when the included currency alone costs
about the same as the whole bundle, the boosts feel free, so the purchase reads
as smart. They also raise average order value vs. selling currency alone.

**Make it work:** Price so the included currency ≈ the bundle price (see the
worked example in `pricing-templates.md`). Combine a currency grant with a
meaningful gameplay perk and, ideally, one *unique* unlock.

## 5. Depth of spend (gated higher tiers)

**What:** Higher-priced bundles, with one or more **gated** until a prior bundle
is purchased.

**Why:** Your most valuable players are the ones who already bought in. Gating a
premium tier behind an earlier purchase reserves your biggest, best offers for
the players most willing to pay — and gives committed players something to
aspire to.

**Make it work:** Gate the premium tier on owning the prerequisite entitlement
(check owned entitlements in game logic before surfacing it — see
`sdk-surface.md`). Price it well above the entry bundles and pack in genuinely
great perks. Style it as premium so it feels special.

## 6. First-purchase deal

**What:** A one-time discount, or 2× currency, on the first premium-currency
pack a player buys.

**Why:** It massively sweetens the most important conversion — the first pack —
and pulls forward the decision to spend. Cheap to offer, high impact.

**Make it work:** Apply it exactly once (to the first pack purchased), then
revert to normal amounts for all packs. 2× currency on the first pack is the
simplest high-impact form. Make the bonus visible and clearly one-time so it
creates urgency.

## Ethics note

Several of these are deliberately persuasive (repeated surfacing, limited-time
countdowns, gated FOMO). They work, and they're standard — but apply them in
proportion and never use them to deceive. Limited-time should be genuinely
limited; gated should be genuinely gated; odds and value should be honest. If a
creator asks for fake scarcity or hidden costs, push back and offer the honest
version that still converts.
