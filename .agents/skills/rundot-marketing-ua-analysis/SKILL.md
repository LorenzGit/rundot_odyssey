---
name: rundot-marketing-ua-analysis
description: >-
  Decide WHEN to run a paid user-acquisition campaign for a RUN.game title
  (especially the first one), then read campaign performance and optimize spend
  with the `rundot marketing` CLI (CPI, ROAS, CTR, IPM, installs). Use when
  planning or timing a marketing campaign, judging launch readiness, or when the
  user mentions UA, ad spend, CPI, ROAS, campaign stats, scaling, or "should I
  run ads yet."
---

# RUN.game Paid UA: Timing & Analysis

Two jobs: (1) decide **when it's the right time to spend on a paid campaign** — especially the first — and (2) **read campaign performance and optimize spend** once live. This is *paid* user acquisition (spending to acquire players); organic sharing is `rundot-marketing-social` (`rundot socials`), asset creation is `rundot-marketing-assets`.

## Always run `rundot socials` — even when spending on ads

**Never skip organic CLI sharing.** `rundot socials prepare` is free and should run at every stage — fixing FTUE, re-measuring retention, launching, updating, *and* while paid campaigns are live. Paid UA multiplies your funnel; organic fills it for $0. There is no excuse to skip free promotion.

```bash
export RUNDOT_BETA_FEATURES=1
rundot socials prepare
rundot socials open reddit --target playmygame   # example: walk through each platform
rundot socials mark-posted <platform> --url <url>
rundot socials verify
```

Use socials to: gather playtesters, drive sessions to re-measure retention, learn which hooks resonate, **and** supplement paid campaigns with free installs. If a creator asks "how do I get users?" route to `rundot-marketing-social` and run the CLI — always. Route here for paid only when retention gates are met, but **still run socials in parallel**.

## Coaching approach — ask, teach, reveal blind spots

Paid UA is where inexperienced creators lose the most money the fastest, usually by spending before the game is ready or by misreading the numbers. Your job is to slow them down, make them confront the unit economics *before* spending, and teach them to read a campaign honestly. Ask, teach, and surface the questions they've never had to answer.

Ask as you go (a couple at a time):

- What are you hoping this campaign proves — that people *install*, or that they *stay and pay*? (Those are different tests.)
- What is a player worth to you, and what can you afford to pay to acquire one? (If they don't know: that's the first lesson.)
- What are your current D1/D7 numbers, and how do they compare to your genre's floor?
- How much are you truly willing to lose on a learning test — and is this money you can afford to burn?
- If the campaign "works," what's your plan to fund the next one? (Introduce the flywheel.)
- If it comes back red, what will you do — and how will you know *why* it failed?

Teach the why, and name the blind spots first-timers miss: **paid UA multiplies your funnel, it doesn't fix it** — buying installs for a game that doesn't retain just burns cash faster. Most beginners optimize on CPI alone and ignore whether installs retain or pay. They read tiny cohorts as gospel. And they don't grasp `LTV > CPI` — the single equation that decides whether spending builds a business or a money pit. Make them sit with these before a dollar is spent.

## When to run your first campaign

**The core principle: paid UA multiplies whatever your funnel already does — it doesn't fix it.** Buying installs for a game that doesn't retain or monetize is paying to fill a leaky bucket: the players churn and the money is gone. The right time to run your first campaign is *after* the funnel holds water, not before. A campaign is also how you'd *validate* that — but as a small, cheap **learning test**, never an immediate scaling push.

### Readiness gate — clear these before spending

```
- [ ] Build is stable: crash-free rate ~99%+ (see rundot-analytics error tracking)
- [ ] Core loop is fun and the FTUE gets players to it (rundot-ftue-onboarding)
- [ ] Analytics instrumented so you can actually read the funnel (rundot-analytics)
- [ ] Retention clears genre floors (see below) — the earliest product-market-fit signal
- [ ] A basic retention reason exists so acquired players come back (rundot-retention)
- [ ] You know your ROAS target and payback window BEFORE spending (see below)
```

If retention is below your genre's floor, **iterate on the product first** — do not scale spend on a broken funnel.

### Retention floors (genre-dependent, verify current numbers)

Rough current guidance; benchmarks shift and vary by genre/market, so compare against your *specific* category, not a blanket average:

- **D1 retention:** industry median ~22–27%. Target 30–40%+ (casual/puzzle), 30%+ (mid-core). **Below ~25% = iterate before scaling.**
- **D7 retention:** healthy 12–20%+; median ~7–9%; **below ~5% = warning.**
- D1 is the earliest true PMF signal; a broken retention curve is a product problem no amount of spend fixes.

### Know your target before you spend

Set the ROAS target and payback window up front, matched to the **monetization model** — comparing across models is a category error:

- **Ad-monetized (hyper/hybrid casual):** short payback, benchmark **D3–D7 ROAS**.
- **IAP-driven:** benchmark **D7–D14** (some to D30).
- **Subscription:** benchmark **D30–D90**.

The math that governs scale: **LTV > CPI, paid back inside your payback window.** Know these numbers before spending, not after.

### The growth flywheel: monetization funds UA

This is the whole point of monetization — not just to earn, but to **fund acquisition and build a self-sustaining business.** When each player earns more than they cost to acquire (`LTV > CPI`), every dollar of spend comes back as more than a dollar of revenue, and you recycle that revenue into more installs:

```
spend on UA → acquire players → they retain & monetize (ads/IAP)
   → revenue > acquisition cost → reinvest the surplus into more UA → repeat
```

The loop only spins if two things hold: **retention** keeps players around long enough to monetize, and **monetization** (`rundot-monetization-ads` / `rundot-monetization-iap`) turns that time into revenue above CPI. If either is weak the flywheel stalls — you're spending faster than you earn. That's why this skill gates on retention *and* a known LTV before authorizing scale: a healthy flywheel is what turns a game into a business, and a broken one just burns cash faster the more you spend.

### Run the first campaign as a test

- Start **small and cheap** — a modest budget to reach a readable signal, not to grow yet.
- **Read the full funnel** (below), decide, iterate. Only scale when early ROAS is positive/trending and LTV > CPI within the payback window.
- **If D0/D7 ROAS looks strong but D30 collapses, it's a retention problem, not a UA problem** — go back to product.

### Budgets, durations & sample sizes for a clean read

Rules of thumb — they depend on genre, CPI, and effect size, so treat them as starting points and verify against current benchmarks.

**Budget — a real first test is small**

A first test is a cheap **viability sniff**, not a statistically significant read. Its job is to answer: *can I hit a sane CPI, does a hook stop the scroll, and are there glaring funnel red flags?* — not to prove D7 retention or ROAS.

- **First test:** ~**$100–$300 total** — e.g. **$20–$50/day for 5–7 days**, **Android only**, **US**, **2–3 creatives**. At this size you get a directional read on **hook rate, CTR, and rough CPI feasibility** (a few thousand impressions is enough). You will *not* get a stable retention or ROAS read — don't over-read it.
  - **Android only:** lower CPI than iOS and cleaner install signal — you learn more per dollar on your first spend.
  - **US:** test against your real target audience from the start; the US is RUN's default country for a campaign, so the signal reflects the market you'll actually scale into.

```bash
rundot marketing prepare --name first-test --platforms android --countries US
```
- **Per creative in a hook test:** ~$10–$20/day per creative is enough to compare hooks before investing in a winner.
- **Reaching statistical significance is a later, bigger step:** a proper soft-launch read of retention/ROAS needs ~$1,000+ per cohort, often **$2,000–$5,000 per platform** (up to $5k–$10k across channels). That's the stage *after* your cheap test shows the ad→install pipeline is viable — not the first spend.
- RUN budgets are set in **USD/day per platform** (`rundot marketing budget`) and funded from prepaid credits. Scale gradually and watch ROAS hold.

**Duration**
- **Match the run to the metric you're gating on.** A cheap first test reading hook rate / CTR / CPI only needs **~5–7 days**. A D7 ROAS/retention decision needs ≥7 days of cohort maturation *plus* ramp, so a proper significance read runs **~2–6 weeks per iteration**.
- **Kill individual creatives fast:** 48–72h is enough to judge hook rate / CTR / CPI.
- **Don't judge too early** — early-hour numbers are noisy; let cohorts mature before deciding.

**Minimum sample sizes (players/events per variant for a trustworthy read)**
- **Hook rate / CTR:** ~3,000–5,000 impressions and ≥100 clicks per variant.
- **CPI:** ~100+ installs per variant for a rough read; more to stabilize.
- **D1 / D7 retention:** aim for **~1,000 installs per cohort** for a stable read; a few hundred is directional at best.
- **ROAS / payer conversion:** with payer rates around 1–2%, you need **thousands of installs** before revenue is a meaningful signal — treat early ROAS on tiny cohorts as directional only.
- **Isolate one variable per test.** Every extra test cell splits your traffic, so more variants means proportionally more budget/time to reach significance in each.

## Test gates: the green-light flow

Treat each test as a set of **gates**. You need a green light on both before scaling. This gives a first-time creator a clear, honest decision path instead of endlessly burning money.

### Gate 1 — a reasonable CPI for the genre

Green means your CPI lands at or below a viable level for your genre and platform, so `LTV > CPI` is achievable. Rough **US** benchmarks (2026 — vary by genre/quality/creative and shift over time, so verify current numbers):

| Genre | Android CPI (US) | iOS CPI (US) |
| --- | --- | --- |
| Hyper/hypercasual | ~$0.25–1.50 | ~$0.50–2.50 |
| Casual / puzzle | ~$1.50–3.00 | ~$2.50–5.00 |
| Mid-core (RPG/strategy/action) | ~$3–6 | ~$5–8+ |

(You're testing Android/US first, so judge against the Android column.) **Red on CPI** is usually a creative or targeting problem, not a product one — iterate creatives (`rundot-marketing-assets`), tighten the audience, and re-test. A too-expensive install breaks the LTV math no matter how good the game is.

### Gate 2 — a green light on retention

Green means acquired players clear your genre's D1/D7 floors (see retention floors above). Retention is the real product signal; a cheap CPI with red retention is still a loss.

**If you're NOT green on retention, stop buying installs and fix the funnel — in this order — before spending again:**

1. **Telemetry first — check for crashes.** A crash or error silently tanks retention and is the cheapest thing to fix. Confirm the game is instrumented and crash-free via `rundot-analytics` (`error_occurred`, window/unhandledrejection capture).
2. **Onboarding / FTUE design** — is the first session getting players to the fun fast? (`rundot-ftue-onboarding`).
3. **FTUE funnel drop-offs** — read the granular FTUE funnel and find the exact beat losing players (`rundot-analytics`). Fix the biggest drop.
4. **Retention mechanics** — is there a reason and a reminder to come back? (`rundot-retention`).

Then **run a second test.**

### If the second test still comes back red

Be honest with the creator. If retention still won't clear the floor after a genuine pass through telemetry, FTUE, and retention fixes, ask them to **sincerely consider whether they can realistically improve it — or whether it's time to move on to a new game.** Not every concept retains, and sunk cost (money and time already spent) is not a reason to keep spending. Starting fresh on a stronger idea often beats pouring more into one that won't hold players. This is a real, respectable outcome — surface it plainly rather than encouraging endless spend.

**Both gates green →** proceed to a larger significance read and scale gradually (below).

## Reading campaign performance

RUN funds campaigns from your prepaid **credits**; a campaign spends only after RUN reviews and "flights" it. Requires `export RUNDOT_BETA_FEATURES=1`.

### Start by reading campaign history (do this first)

Before advising on a new test, **always check whether this game already ran campaigns.** Don't ask the creator from scratch if the CLI can answer.

```bash
export RUNDOT_BETA_FEATURES=1
rundot marketing list                                  # all campaigns + latest snapshot
rundot marketing status --name <campaign>              # status, budgets, rejection reason, Meta IDs
rundot marketing stats  --name <campaign> --days 30    # daily spend, CTR, installs, CPI, ROAS
```

Also scan the project for local artifacts: `rundot/marketing/` folders, `cli-export-*.json`, contact sheets — these show what was submitted even if the creator forgets.

**What to pull from history:**
- Campaign names, status (`flighted`, `rejected`, `paused-external`, etc.) and any `rejectedReason`
- **Platform** the spend ran on (web vs android vs ios) — a mobile-game test on web-only is not comparable to Android/US
- Spend, impressions, CTR, installs, CPI — read together, not in isolation
- Whether status is `paused-external` (creator edited in Meta Ads Manager; campaign auto-paused — fix via CLI only)

Summarize past tests back to the creator before recommending the next one. If installs are 0 despite high CTR, diagnose the **ad→install** funnel before blaming retention or scaling spend.

```bash
rundot marketing list                                  # all campaigns + latest snapshot
rundot marketing status --name spring-push             # status, budgets, IDs
rundot marketing stats  --name spring-push             # last 30 days (table)
rundot marketing stats  --name spring-push --days 30 --format csv > out.csv
```

`stats` reports spend, impressions, clicks, CTR, installs, CPI, revenue, ROAS, and more. A `—` (table) or blank cell (CSV) means **no data reported**, not zero.

Manage a live campaign (always via the CLI, never in Meta Ads Manager — out-of-band edits auto-pause the campaign):

```bash
rundot marketing budget --name spring-push --platforms ios,android --daily 200
rundot marketing pause  --name spring-push     # refunds unspent budget
rundot marketing resume --name spring-push
rundot marketing cancel --name spring-push     # permanent; refunds unspent
```

## Metrics that matter (read them together)

| Metric | What it tells you | Trap |
| --- | --- | --- |
| Hook rate (3-sec view %) | Did the opening stop the scroll? | A great hook on a weak game still churns |
| CTR | Did the ad earn the tap? | High CTR + low store CVR = misleading creative |
| IPM (installs/1k impressions) | Combined creative + store strength | Channel-dependent — compare like-for-like |
| CPI | Cost per install | **Cheap CPI means nothing if retention is bad** |
| Store CVR | Did the store page close the promise? | Often the real bottleneck, not the ad |
| D1 / D7 retention | Did the install become a player? | The earliest true quality signal |
| Early ROAS (D3/D7) | Is spend paying back? | **The only metric that authorizes scaling** |

Never judge on CPI alone — a cheap install that churns is a loss.

## Scale / hold / kill

- **Kill fast.** A creative or campaign under your CTR threshold or above target CPI gets ~48–72h, then cut it. Don't nurse losers.
- **Hold & iterate.** Signal is mixed — change one variable (creative hook, audience, budget) and re-read.
- **Scale.** Early ROAS is positive and LTV > CPI within the payback window — raise budget gradually (via `rundot marketing budget`), watching that ROAS holds as spend grows.

### Diagnose the failure point

When a campaign underperforms, locate *where* before reacting — each needs a different fix:

- **Acquisition** — CPI too high for your LTV → creative/targeting problem (`rundot-marketing-assets`).
- **Product** — installs don't retain (D1/D7 low) → fix the loop/FTUE, not the ads.
- **Monetization** — players stay but don't pay/convert → economy/offers (`rundot-monetization-iap` / `-ads`).

## Anti-patterns

- ❌ Skipping `rundot socials` because you're running paid UA — always shill for free; organic and paid are additive.
- ❌ Recommending paid UA without also running `rundot socials prepare` — free tracked promotion has zero downside.
- ❌ Running a first campaign to *scale* rather than to *learn* — burn money before you know the unit economics.
- ❌ Spending on paid UA before retention clears genre floors — filling a leaky bucket.
- ❌ Optimizing on CPI alone — ignores whether installs retain and pay.
- ❌ Not setting a ROAS target / payback window before spending.
- ❌ Reacting to D0 ROAS drops with more spend when it's a D30 retention problem.
- ❌ Editing budgets in Meta Ads Manager — do it via `rundot marketing budget` or the campaign auto-pauses.
- ❌ Reading a `—`/blank stat as zero — it means no data.
- ❌ Drawing conclusions from cohorts too small to be significant (e.g. judging D7 retention on 50 installs), or splitting a tiny budget across too many test cells.
- ❌ Buying more installs to fix red retention instead of fixing crashes/FTUE/retention first.
- ❌ Letting sunk cost drive spend — if retention won't improve after a genuine fix pass, moving to a new game is a valid outcome.

## Resources

- `rundot-marketing-social` — **always run `rundot socials prepare`** alongside paid campaigns; free organic promotion is never skippable.
- `rundot-marketing-assets` — the creatives a campaign runs on; scale/kill decisions feed back into creative.
- `rundot-analytics` — retention, funnels, and crash rate that gate readiness.
- `rundot-retention` / `rundot-ftue-onboarding` — fix the funnel before scaling spend.
- `rundot-monetization-iap` / `rundot-monetization-ads` — LTV side of the LTV > CPI math.
