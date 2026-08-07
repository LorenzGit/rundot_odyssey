# Retention design

Treat retention as a continuation of the player experience, not a layer of
timers and notifications added after the core loop. Give the player a specific
reason to return before designing any reminder. Neither can rescue an
unsatisfying game, but a clear promise gives the game another opportunity to
deliver value.

## Contents

- [Build a goal ladder](#build-a-goal-ladder)
- [Design the session boundary](#design-the-session-boundary)
- [Choose appointment mechanics deliberately](#choose-appointment-mechanics-deliberately)
- [Pair reasons with reminders](#pair-reasons-with-reminders)
- [Study comparable games](#study-comparable-games)
- [Measure the loop](#measure-the-loop)

## Build a goal ladder

Define all three horizons before scaling content:

- **Short term:** Repeatable, satisfying core-loop goals a player can complete
  several times in a day. Deliver a meaningful first win within the opening
  minutes and keep retry fast and emotionally fair.
- **Medium term:** A goal reachable across several sessions or roughly a week,
  such as a boss, new area, capability, collection, or major upgrade. Reveal it
  during or immediately after onboarding, show steady progress, and ensure its
  completion changes what the player can do.
- **Long term:** The durable fantasy that made the game appealing—mastery,
  discovery, expression, collection, social recognition, or building something
  meaningful. Raise or renew the stakes as the player advances.

Replace a completed goal with another visible, credible goal. Do not hide the
game's depth until an unspecified later point, and do not expose so many goals
at once that the first session becomes a dashboard tutorial.

## Design the session boundary

Map the first session and every ordinary session to a natural ending:

1. Deliver value and a visible success.
2. Show progress toward the next meaningful goal.
3. Leave one exact, understandable next step.
4. Let the player stop on a high without punishing the exit.

Avoid an endless first session with no stopping point. For Day One, consider a
second-session hook that matures in roughly one to four hours only when it
naturally follows the loop—for example, a completed build or recovered energy.
Treat that timing as a hypothesis, not a mandatory mechanic.

## Choose appointment mechanics deliberately

Use an appointment mechanic only when waiting, returning, or involving another
player adds value:

| Mechanic | Natural fit | Main risk |
| --- | --- | --- |
| Energy or stamina | Short arcade or level sessions | Frustration manufactured by scarcity |
| Build, craft, heal, or hatch timer | Builder, idle, and collection loops | Waiting substituted for gameplay |
| Collection refresh or reward | Collection and RPG loops | Opaque odds or manipulative urgency |
| Leaderboard or shared challenge | Skill and score games with a real social layer | Meaningless competition or unfair cohorts |
| Limited event | Games with sustainable content operations | FOMO, fatigue, and excessive content cost |

Do not add energy, streaks, timers, or limited events merely because successful
games use them. Map each mechanic back to this game's loop, economy, audience,
and non-payer promise.

## Pair reasons with reminders

Keep the goal visible in the game. Show progress after relevant actions, place
the next objective where the player makes decisions, and show both the value
and unlock condition of locked features.

Make out-of-game reminders:

- consensual, optional, and specific to a real pending goal;
- truthful about current player state and any reward or timer;
- cancellable when the goal changes, completes, or is claimed;
- scheduled or refreshed while the game is active, not by starting new
  notification work during quit;
- deep-linked only when the current RUN launch-intent path supports it and the
  destination is tested; and
- bounded by a light cadence. Treat 24/48/72-hour follow-ups as a starting
  experiment and stop when the player does not respond.

Prefer “Your workshop upgrade is ready” over a generic “Come back and play.”
Install and follow the CLI's current `rundot-feature-notifications` skill for
the SDK integration, consent, deduplication, cancellation, and lifecycle
details. This reference owns the player reason and message strategy, not the
transport implementation.

## Study comparable games

Choose two or three games with similar core loops, platforms, audiences, and
session shapes. Record their first win, visible goal horizons, natural stopping
point, return hook, reminders, daily systems, events, and social layer. Adapt
only patterns that reinforce this game's own loop and economy.

## Measure the loop

Define cohorts, time zones, session boundaries, and metric denominators before
interpreting retention. Track:

- D1, D3, and D7 return rates;
- sessions per player and session length, especially multiple sessions on Day
  One;
- FTUE completion, time to first value, and first-session stopping point;
- progress toward the medium-term goal per session;
- daily reward claims and streak distribution when used; and
- notification eligibility, consent, schedule/cancel outcome, open or launch
  attribution when available, and the promised action's completion.

Separate failures in the reason from failures in the reminder. A notification
can open successfully while the underlying return hook remains weak.

Never treat an arbitrary cohort size such as 50 players as universally
conclusive. Report the sample size, acquisition/source mix, observed effect,
uncertainty, and data-quality caveats. Use small cohorts directionally and make
fundamental core-loop changes when repeated evidence shows that surface-level
retention mechanics are not solving the problem.
