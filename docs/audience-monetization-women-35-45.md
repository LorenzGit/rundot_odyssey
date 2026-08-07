# Monetization research brief: women aged 35–45

Last reviewed: 2026-07-22.

Nothing in this guide will “definitely work.” Age and gender can help define a
research cohort, but they do not determine an individual player’s motivations,
spending, available time, competitiveness, or preferred art. Validate every
offer with representative players and segment primarily by observed behavior.

For puzzle, merge, hidden-object, decorating, simulation, collection, and
narrative games, a high-confidence starting hypothesis is:

> Optional rewarded ads for non-spenders, plus timely purchases for convenience,
> content, collection, completion, and self-expression.

Write the non-payer promise first. A player who never pays or watches an ad
must still receive an honest, enjoyable core game.

## Motivations to research—not stereotypes to assume

- completing a collection or visible space;
- uncovering a story or helping characters;
- making steady progress in a relaxing session;
- personalizing an avatar, home, club, or profile;
- planning efficiently and reducing repetitive friction;
- participating in a friendly community or event;
- competing, mastering, or optimizing when the player chooses.

Do not reduce the audience to pink palettes, romance, fashion, motherhood, or
low difficulty. Test themes, accessibility, session length, challenge, and
presentation with the intended cohort.

## Monetization stack to test

### 1. First-purchase bundle

Show it after the player experiences a clear value moment—not on install. A
bundle might include premium currency, useful boosters, temporary unlimited
energy, a durable cosmetic, and an entitlement that removes forced ads.

The product’s job is to test whether a small, understandable transaction
converts a never-payer. Any “normally X” comparison must come from real,
currently available standalone catalog prices.

### 2. Rewarded ads as useful choices

Good hypotheses include watching to:

- receive a bounded energy grant;
- add a few moves after a genuine near-win;
- double a completed-level reward;
- accelerate one timer or recharge one generator;
- open a bonus chest or replace an unwanted daily task;
- activate a short efficiency boost.

Rewarded ads must be explicit opt-in exchanges. Grant only after the SDK
confirms completion. An unavailable, failed, or cancelled ad leaves the player
no worse off. Do not follow one with another ad or purchase interruption.

### 3. Recurring themed pass

Test a 21–30 day free/premium track with forgiving catch-up, a coherent theme,
and no requirement to play every day. Names such as “Garden Festival,” “Mystery
Season,” “Travel Journal,” or “Renovation Pass” may fit the product fantasy
better than “battle pass.”

Include ongoing value such as cosmetics, collection progress, premium currency,
boosters, or energy. Avoid turning a relaxing game into a second job.

### 4. Contextual rescue offer

Offer relief only when the player understands exactly what it accomplishes:

- after several organic failures;
- one item from a merge or collection milestone;
- near completion of a room, chapter, or event;
- out of energy during a strong voluntary session.

Do not tune difficulty upward to manufacture purchase moments. That sells
frustration rather than value and can damage retention and trust.

### 5. Piggy bank

Let ordinary play visibly fill a bank that can be opened as a purchase. The full
bank should provide coherent value relative to a real catalog package. Make the
terms, capacity, reset, and next-bank behavior clear; never imply the player
already owns currency that still requires payment.

### 6. Completion and self-expression

Potential products include room themes, seasonal furniture, outfits,
alternative visual styles, pets, profile frames, premium story chapters, and
collectible albums. Cosmetics work best when players repeatedly see or share
them rather than losing them in an inventory.

### 7. Convenience membership

For established players, test one modest membership with durable convenience:
daily currency, expanded capacity, one daily booster, faster regeneration, an
exclusive monthly item, and clearly defined forced-ad removal. One membership
plus one pass is usually enough complexity for an initial test.

Subscriptions require continuing value, clear renewal terms, cross-device
ownership, cancellation handling, and entitlement reconciliation.

## Illustrative price hypotheses

The following values summarize common external mobile-market test ideas from
the source brief; they are not RUN pricing guidance or performance guarantees:

| Product job | External-market hypothesis |
| --- | ---: |
| Starter / first purchase | USD $1.99 equivalent |
| Piggy bank | USD $2.99 equivalent |
| Contextual bundle | USD $4.99 equivalent |
| Themed event pass | USD $7.99–$9.99 equivalent |
| Cosmetic/decoration set | USD $9.99–$14.99 equivalent |
| Established-player completion bundle | up to USD $19.99 equivalent |

For RUN, author products in the live Shop catalog and use live RB prices. Never
hardcode an RB-to-fiat conversion or copy this ladder without evidence. Record
the comparison source, date, audience/genre match, unlock, primary KPI, and
retention/economy guardrails for every price experiment.

## Ad posture

### Use rewarded video as the primary ad surface

Start with a bounded opportunity budget suited to the session and economy. A
range such as three to eight meaningful opportunities per active day can be an
exploratory hypothesis for some casual loops, not a universal target. Measure
offer views, opt-in, confirmed completion, ads per DAU, reward economy share,
retention, and total LTV.

### Test interstitials cautiously

- Never interrupt active play or appear immediately after failure.
- Exclude the first sessions until the player understands the game.
- Use natural breaks such as a completed level or results screen.
- Enforce minimum spacing plus session/day caps.
- Never stack after a rewarded ad or purchase.
- Remove forced interstitials after the promised purchase/entitlement.
- Compare against a no-interstitial holdout.

An initial experiment might test one eligible interstitial every three to five
completed levels with a time floor, but only when policy, pacing, and the
non-payer promise support it.

### Avoid banners during primary gameplay

Banners consume scarce space and can create accidental taps. If tested at all,
keep them outside active interaction and compare their incremental value against
lost clarity, trust, and retention.

### Treat payers as upgraded players

Remove promised forced ads, keep rewarded ads optional, and shift merchandising
toward content, collections, passes, and convenience. Do not punish demonstrated
willingness to pay with more pressure.

## Three starting configurations

### Match-3 plus renovation

- Rewarded: extra moves after a near-win, double completed-level coins, daily
  booster chest.
- Purchase: starter bundle, piggy bank, contextual rescue, themed pass, complete
  room set.

### Merge plus story

- Rewarded: energy, one generator recharge, temporary bubble claim, one timer
  acceleration.
- Purchase: starter energy, durable inventory expansion, event bundle, themed
  pass, generator-progression bundle.

### Hidden-object mystery

- Rewarded: reduced scene-energy cost, one hint, doubled scene reward, short
  cooldown skip.
- Purchase: beginner pack, story-weekend bundle, mystery pass, estate decoration
  set, established-player event completion bundle.

Reference games worth studying include June’s Journey, Royal Match, Project
Makeover, and Merge Mansion. Study their current live implementations directly;
do not assume an old price, cadence, ad policy, or offer composition remains
accurate or fits this game.

## Segment by behavior

| Observed segment | First hypothesis |
| --- | --- |
| New nonpayer | uninterrupted value, then optional rewarded ads and one starter offer |
| Engaged nonpayer | useful rewarded choices and a low-friction first-purchase test |
| First-time payer | honor ad-removal value and test coherent mid-tier bundles |
| Regular payer | pass, membership, collections, and durable convenience |
| High-value payer | larger event/completion products without pressure or hidden costs |
| Story-focused | chapter access, energy, and cliffhanger-safe return pacing |
| Decorator/collector | seasonal sets, albums, rooms, pets, and visible profile value |
| Lapsed | restore momentum with free value before showing a purchase |

Do not infer a segment solely from gender or age, and do not include sensitive
personal data in analytics properties.

## Measurement and release rules

Choose one to three outcomes and paired guardrails:

- payer conversion and time to first confirmed purchase;
- rewarded offer-to-completion and ads per active player;
- total ad + purchase value per DAU and cohort LTV;
- D1/D7/D30 retention and post-offer session abandonment;
- refund/revocation, purchase/ad errors, ratings, and support complaints;
- economy inflation and ad-granted share of currency;
- organic invitations and K-factor where social loops exist.

Expand only when combined ad + purchase LTV improves without unacceptable harm
to retention, fairness, ratings, reliability, or organic referral behavior.
Small or contaminated samples do not prove a universal audience truth.

## RUN implementation rules

- Default durable products to server-configured Shop + Entitlements.
- Keep ads and offers fail-closed behind LiveOps kill switches.
- Require a direct player action for ads and purchases.
- Use stable placement/product IDs, idempotent purchase intents, order history,
  refund/revocation handling, and entitlement reconciliation.
- Playground purchases can be real and persistent; use an approved identity and
  explicit budget before testing.
- Never simulate authoritative ad completion, ownership, or purchase success.

See [`monetization.md`](monetization.md) and
[`run-capabilities.md`](run-capabilities.md) for the template’s active contracts
and implementation seams.

## Current policy references

- [Google Play Ads policy](https://support.google.com/googleplay/android-developer/answer/9857753)
- [Google AdMob interstitial guidance](https://developers.google.com/admob/android/interstitial)
- [Apple App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/)
- [Apple In-App Purchase guidance](https://developer.apple.com/in-app-purchase/)
- [FTC report on dark patterns](https://www.ftc.gov/reports/bringing-dark-patterns-light)

Policies, catalogs, and audience behavior change. Recheck them before launch and
date every material monetization decision.
