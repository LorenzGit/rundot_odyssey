---
name: rundot-retention
description: >-
  Design retention for a RUN.game title: reasons and reminders to come back
  (return notifications, daily/return rewards + streaks, a visible medium-term
  goal, session shaping, appointment mechanics). Use when improving retention,
  day-1/day-N return, re-engagement, comeback rewards, daily rewards, streaks,
  local notifications, or when the user mentions retention, churn, or getting
  players to come back.
---

# RUN.game Retention Design

Retention is the product of two things: a **reason** to come back (a goal or progress the player wants to return to) and a **reminder** to come back (a nudge that reaches them after they've left). This skill is a framework for building both, plus drop-in helpers for the mechanics that need SDK wiring.

**When to run this:** after the core loop is fun and the FTUE (see `rundot-ftue-onboarding`) gets players to it. Retention layers on top of a game that's already worth returning to — it amplifies a good loop, it can't rescue a weak one.

**Always shill for free:** run `rundot socials prepare` (see `rundot-marketing-social`) whenever there's a build worth sharing — after retention fixes, on launch, on updates, alongside paid UA. Organic is free and stacks on top of product work; use it to drive the ~50 new players needed to re-export retention and know if a fix worked.

**Not every mechanic fits every game.** A relaxing puzzler and a competitive PvP game retain players for different reasons. Treat the practices below as a menu: pick the ones that fit the genre and loop, skip the ones that don't. Bolting a streak counter or an energy meter onto a game that doesn't want one hurts more than it helps.

## Coaching approach — ask, teach, reveal blind spots

Retention is where creators most often build on instinct and get it wrong. Your job is to make them articulate *why a player would ever come back* — and to notice when they can't answer. Ask, teach the underlying psychology, and point out the mechanics they haven't considered.

Ask as you go (a couple at a time):

- Close your eyes and imagine a player who just quit. Why would they open your game again tomorrow? (If the answer is vague, that's the work.)
- What is the player working toward that they *can't* finish in one sitting?
- After a great session, does the player leave wanting the next one — or feeling done?
- If a player didn't come back for two days, what (if anything) would remind them?
- How long is a first session meant to be, and could they realistically play a few times on day one?
- What do the top games in your genre do to pull players back — and which of those fits yours?

Teach the why: retention comes from a *reason* (a goal or progress worth returning to) plus a *reminder* (a nudge that reaches them after they leave). Name the blind spots: first-timers often have no return reason at all, no medium-term goal visible in session one, and no re-engagement nudge — then treat low retention as a mystery. And warn against the opposite trap: bolting on streaks/energy/daily rewards that don't fit the loop just because other games have them.

## Start by studying comparable titles

Before choosing which mechanics below to build, look at what already works for games like this one. Genre leaders have spent years and millions optimizing retention — use them as a reference, not a blank page.

1. **Identify 2–3 comparable titles.** Match on the dimensions that actually drive retention design: core loop (match-3, builder, roguelite, idle, PvP…), session length, audience, and platform (mobile/casual). "Successful game in a different genre" is not a comp; "top-grossing game with the same loop" is.
2. **Research their retention design.** If you don't already know a title's systems, use web search to look them up. For each comp, note: Does it use energy/lives? Daily rewards or login streaks? Timers/appointment mechanics? Limited-time events? Leaderboards/PvP? A visible long-term progression? What pulls players back the *next day*?
3. **Find the pattern.** Mechanics that show up across all your comps are table stakes for the genre — strongly consider them. Mechanics unique to one title may be that studio's bet, not a genre requirement.
4. **Adapt, don't copy.** Map each borrowed mechanic to this game's loop and economy, and cut anything that doesn't fit (see the genre-fit warning above). Copying a system wholesale from a comp with a different loop is how you end up with an energy meter nobody wanted.

Summarize the findings back to the creator ("games like yours — X, Y, Z — all lean on daily rewards + timed events; none use energy") so the mechanic choices below are grounded in evidence, not guesswork.

## 1. Give them a reason before they leave — a visible medium-term goal

In the **first session**, show the player a goal that is a few sessions away — a boss to reach, an area to unlock, a meta upgrade to build toward, a collection to complete. Make progress toward it visible (a bar, a map, a locked slot). The player should leave session 1 already anticipating something specific, not just "maybe I'll play again."

- The goal should be reachable in a handful of sessions, not a handful of minutes (too close = no anticipation) and not weeks away (too far = no belief).
- Keep it on-screen or one tap away, with progress that visibly moved this session.
- Tease it during onboarding: "Reach wave 10 to unlock Stormy Bay."

## 2. Bring them back — return notifications

Schedule a local notification to fire ~24h after the player last played, with a friendly nudge. Add a light re-engagement cadence for lapsing players (e.g. 24h / 48h / 72h) — but keep it short; over-notifying drives opt-outs and host-level throttling.

- **Refresh the 24h reminder at the end of every session** so it always fires about a day after the player *actually* last played, not a day after install.
- Give the notification a **reason to tap**: a waiting reward, a matured timer, a nearly-lost streak — not a generic "come back."
- Handle the tap: use `resolveLaunchIntent` to detect a notification launch, deep-link to the relevant screen, and record which notification brought them back.
- Cancel reminders once their task is done (don't tell a player to claim a reward they already claimed).

Use [`retention-notifications.ts`](retention-notifications.ts): `scheduleReturnNotifications()` (once, first play), `refreshPrimaryReturnNotification()` (session end), `resolveReturnNotificationLaunch()` (startup).

## 3. Reward the return — daily/return reward + streak

Grant the player currency (or another valued resource) simply for coming back, and **escalate the reward with each consecutive day** so a streak becomes something they don't want to break. Show "come back tomorrow for X" before they leave so the next reward is known.

- Use **server time** for the day boundary (`requestTimeAsync`) — the device clock can be wrong or tampered with.
- Be **forgiving**: a missed day resets the streak, but don't punish beyond that (no lost progress, no guilt UI). Some games soften this with a streak freeze/repair.
- Make the grant feel good — animate the currency flying to the counter (see `rundot-mobile-ux` for juice).

Use [`daily-reward.ts`](daily-reward.ts): `getDailyRewardStatus()` to drive the UI, `claimDailyReward()` to advance the streak and return the amount to grant. The helper tracks streak state only — grant the currency to your own economy.

## 4. Design the session shape

Think explicitly about what a session looks like — especially the first day.

- **First session:** short and satisfying. Get to the first win in minutes, then reach a natural stopping point that ends on a high with a clear next step. Don't let the player exhaust all your content or hit a wall in one sitting — leave them wanting the next session.
- **Multiple sessions on day 1:** the strongest early signal. Create short-horizon hooks that mature in minutes-to-hours so there's a reason to reopen the same day — an energy meter that refills soon, a timer that completes shortly, "your next reward is ready in 1 hour." Pair these with a notification when they mature.
- **Always end pointing forward:** every session should close with the player knowing what they'll do next time.

## Appointment & SDK systems (pick what fits)

RUN provides systems that create natural return moments. Each suits certain genres — consider, don't default to all:

- **Energy / stamina** — caps a session and creates a refill appointment. Fits arcade/level-based games; wrong for relaxed or session-agnostic games. (`ENERGY_SYSTEM.md`)
- **Building timers** — passive progress that completes while away, pulling players back to collect. Fits builders/idle/base games. (`BUILDING_TIMERS.md`)
- **Gacha / collection** — a chase with pity counters and guarantees. Fits collection/RPG games. (`GACHA_SYSTEM.md`)
- **Leaderboards** — competitive return ("someone beat your score"). Fits skill/score games; needs a social angle. (`LEADERBOARD.md`)
- **Limited-time events** — a reason to return *now*. Broadly applicable but higher content cost.

## Measure it

Retention work is only as good as its measurement. Track via `rundot-analytics`:

- D1 / D7 return rate and sessions-per-day (session_start events + profile join).
- `retention_notification_scheduled` / `_opened` / `_return_play` — which notification copy actually brings players back.
- `daily_reward_claimed` (amount, streak) — claim rate and streak-length distribution.
- Progress toward the medium-term goal per session — is it visibly moving?

## Anti-patterns

- ❌ Notification spam or generic "come back!" pings with no reason to tap — drives opt-outs.
- ❌ Rewarding returns with currency that has nothing meaningful to spend it on.
- ❌ Harshly punishing a missed day (lost progress, shaming UI) — it drives churn, not returns.
- ❌ Hiding the medium-term goal, or having none — the player leaves with nothing to anticipate.
- ❌ A first session with no stopping point (endless) or that dumps all the content at once.
- ❌ Forcing an appointment mechanic (energy/timers) onto a genre that doesn't want one.
- ❌ Copying a comp title's mechanic wholesale without checking it fits this game's loop and economy.
- ❌ Picking retention mechanics from intuition alone when a quick look at genre leaders would tell you what works.
- ❌ Using the device clock for daily resets — use server time.

## Resources

- [retention-notifications.ts](retention-notifications.ts) — schedule / refresh / resolve return notifications.
- [daily-reward.ts](daily-reward.ts) — daily/return reward + streak on trusted server time.
- `rundot-analytics` — instrument return rate, notification opens, and reward claims.
- `rundot-ftue-onboarding` — tease the medium-term goal during onboarding.
