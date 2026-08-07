---
name: rundot-ftue-onboarding
description: >-
  Design a strong first-time user experience (FTUE) / onboarding for a RUN.game
  title: minimize time-to-fun, teach by doing, and remove first-session friction.
  Use when building or reviewing a tutorial, first session, new-player flow, or
  onboarding, or when the user mentions FTUE, onboarding, tutorial, first session,
  first-time players, or teaching mechanics.
---

# RUN.game FTUE & Onboarding Design

The first session decides whether a player stays. Most churn happens in the first few minutes, before the player ever sees what makes the game good. This skill is a **design framework** for getting a new player to fun fast — not a fixed script. Apply the principles and checklist to the specific game; let the game define its own beats.

This is the *design* side. To *measure* the first session, instrument every beat as a granular FTUE funnel — see the `rundot-analytics` skill.

**When to run this:** assume the creator has already nailed down their core loop. FTUE design comes *after* the game is fun to play, not before — you're teaching an experience that already works, not compensating for one that doesn't. If the core loop isn't fun yet, fix that first.

## Coaching approach — ask, teach, reveal blind spots

Design the first session *with* the creator, not for them. The goal is to make them see their opening minutes through a new player's eyes — someone who has never seen this game and will leave in seconds if confused. Ask questions that force that perspective, and teach the principles as you go.

Ask as you go (a couple at a time):

- Watch someone play cold for the first time — where do they hesitate or look lost? (If they haven't done this, it's the first homework.)
- How many seconds until a brand-new player does the *fun* thing, not just reads about it?
- What's the very first thing on screen when the game opens? Why that, and not the fun?
- What are you asking the player to learn before they've had any fun — can any of it wait?
- Is there anything they *must* tap, sign into, or read before playing? What breaks if you remove it?
- Show, don't tell: could a player who can't read still get through your first minute?

Teach the why, and name the blind spots first-timers miss: they front-load tutorials and menus because *they* know the game deeply and forget the player doesn't; they explain with paragraphs a player will never read; they gate first fun behind logins or settings. The fix is almost always *remove and defer*, not *add more instructions*.

## Study comparable titles' first sessions

Before designing, look at how genre leaders onboard — they've optimized the first session against millions of installs. Identify 2–3 comparable titles (same core loop, audience, platform), then study their opening minutes: use web search or play them and note how fast they reach the first fun moment, what single mechanic they teach first, how they teach it (arrows/highlights vs. text), what they defer (menus, meta, social, auth), and where they let the player act vs. watch. Adapt the patterns common across your comps to this game's loop — don't copy a flow built for a different one. Summarize the findings back to the creator so the design below is grounded in what works.

## The one metric that matters: time-to-fun

Minimize the time (and taps) between launch and the player's first genuinely fun, satisfying moment — the first "I get it, this is good" beat of the core loop. Every second and every screen before that is churn risk. Design the first session backward from that moment: what is the *least* the player must understand to experience it, and how fast can you get them there?

## Design principles (apply, don't recite)

**Teach the player by making them do it.**
- The player performs the action, not reads about it. Show → let them do it → confirm success.
- Just-in-time: introduce a mechanic the moment it's needed, never up front in a manual.

**Players can't or won't read.**
- Wherever possible, *show* what you want them to do with arrows, highlights, or a pointing hand — not sentences.
- When you must use words, use very short ones ("Tap the sand", "Swipe up"), never paragraphs. No walls of text.

**Build concepts slowly — one at a time.**
- Introduce a single new idea per beat. Don't dump every mechanic in the first minute; let each concept land before adding the next.
- Gate advanced UI/buttons until the concept behind them is taught — a hidden button can't confuse or distract.

**Front-load the core loop, delay everything else.**
- The first thing the player *does* should be the core verb of the game (build, shoot, match, drive) — not navigate a menu.
- Defer meta systems (upgrades, shop, settings, currencies) until after the player has felt the core loop. Introduce them only when they become relevant.

**Lock features you don't yet need.**
- Keep any feature, button, or system locked/hidden until the player reaches the point where it matters. A smaller surface is easier to learn and impossible to get lost in. Unlock progressively as the player earns each system.

**Put social features later in the flow.**
- The early experience should not require other players. Anything social (multiplayer, leaderboards, friends, sharing) belongs after the player already values the game solo — never as a gate to first fun.

**Defer auth-gated SDK features unless they're core.**
- If you use RUN SDK features that require auth/sign-in, try to place them later in the flow. Only put an auth-gated feature up front if it's critical to the core mechanic itself — otherwise let the player reach the fun first.

**Constrain the first session so the player can't fail or get lost.**
- Remove or reduce choices early; guide the eye with focus (dim the rest, highlight the target, disable unrelated input).
- Make the first encounter effectively un-losable — the first win should feel earned but be near-guaranteed.

**Reward early and often.**
- Deliver a visible reward/juice for the first correct action and the first loop completion (feedback, currency, celebration). Confirm progress immediately.

**Respect the player — no friction before value.**
- Do not force logins, account creation, permission prompts, ads, or IAP offers before the player has experienced the fun.
- Make anything long or repeatable skippable where safe; never trap the player in an unskippable cutscene or a tutorial they can't dismiss.

## First-session checklist

```
- [ ] Core loop is already fun — FTUE is being designed after, not before
- [ ] Player performs the core verb within the first few seconds (not a menu)
- [ ] Time-to-first-fun is measured in seconds, not minutes
- [ ] Instruction is shown (arrows/highlights/hand) or very short — never text walls
- [ ] One new concept per beat, built slowly; advanced UI gated until taught
- [ ] Features not yet needed are locked/hidden; unlock progressively
- [ ] Social features (multiplayer, leaderboards, sharing) placed after solo fun
- [ ] Auth-gated SDK features deferred unless critical to the core mechanic
- [ ] First encounter is near-un-losable; first win feels earned
- [ ] Immediate, juicy feedback on first action + first loop completion
- [ ] No login / permission / ad / IAP friction before the first fun moment
- [ ] Long/forced sequences are skippable or dismissible
- [ ] Meta systems (shop/upgrades/settings) deferred until relevant
- [ ] Every beat is instrumented as a granular FTUE funnel step (rundot-analytics)
```

## Instrument every beat

Design and measurement are two halves of the same job. For each onboarding beat, fire a granular, linear, once-ever FTUE funnel step so you can see exactly where new players drop. Use the `OnboardingController` in [`onboarding.ts`](onboarding.ts) to gate UI and persist progress, and fire the funnel step on first completion:

```typescript
import { OnboardingController } from './onboarding/onboarding'
import { trackFunnelStepOnce } from './analytics/analytics'

const onboarding = new OnboardingController()
await onboarding.load()

// Gate a first-time-only hint
if (onboarding.shouldShow('tutorial_01')) {
  showHint('Tap the sand to build')
}

// On dismiss: persist + fire the matching FTUE funnel step (once ever)
await onboarding.complete('tutorial_01_dismissed', () =>
  trackFunnelStepOnce(3, 'ftue_tutorial_01_dismissed', 'ftue', 'ftue_tut01_dismissed', 1),
)
```

See [`onboarding.ts`](onboarding.ts) for the full controller (gating, once-ever persistence via `appStorage`, `nextStep`, `isFinished`, `reset`).

## Reviewing an existing onboarding

When auditing a game's first session, **pull the funnel first** (`rundot analytics export funnel_steps_30d --game-id <id>` — see `rundot-analytics`):

```
- [ ] Export funnel_steps_30d; find the biggest step-to-step drop in ftue/onboarding
- [ ] Confirm counts decrease monotonically — if not, fix instrumentation before product conclusions
- [ ] Time the run: how many seconds/taps to the first fun moment?
- [ ] Count screens/text before the core loop — flag every one that delays fun
- [ ] Find forced friction before value (login, permission, ad, IAP, long cutscene)
- [ ] Verify each beat is gated once-ever (no repeated tutorial on replay)
```

## Anti-patterns

- ❌ A tutorial that is a wall of text or a series of "OK" popups — players skip and miss it.
- ❌ Opening on a menu/lobby instead of the core action.
- ❌ Teaching every mechanic before the player has done anything.
- ❌ Forcing account creation, permissions, ads, or store offers before the first fun moment.
- ❌ Requiring other players (multiplayer, friends, a leaderboard) before the player has had fun solo.
- ❌ Showing every feature/button unlocked at once instead of revealing them progressively.
- ❌ An unskippable cutscene or a hint the player can't dismiss.
- ❌ A first level hard enough to lose — early frustration is churn.
- ❌ Onboarding that re-triggers on every session because completion isn't persisted.

## Resources

- [onboarding.ts](onboarding.ts) — drop-in `OnboardingController` for gating first-time UI and persisting once-ever progress.
- `rundot-analytics` skill — instrument each beat as a granular FTUE funnel.
- `rundot-marketing-social` — after shipping FTUE fixes, always run `rundot socials prepare` to drive free playtesters and re-measure the funnel.
