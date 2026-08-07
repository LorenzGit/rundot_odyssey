# Analytics and level instrumentation

The template includes runtime analytics calls, funnels, and a reusable
pause-aware level timer. Treat the demo event vocabulary as an integration
proof: derived games must adapt the context and call sites to their real core
loop while preserving stable, queryable event contracts.

For a larger event/funnel integration, install the CLI-shipped guidance:

```sh
rundot skills install rundot-feature-analytics
```

## Measurement plan

- Decision and owner: find progression drop-off and difficulty spikes, then decide which level, tutorial beat, or balance value to change. The derived game's product owner owns the review.
- Primary metric: unique players completing a level divided by unique players starting it, grouped by level and game version. Supporting metrics are median active completion time, attempts, and highest level reached.
- Guardrails: retention, errors, fairness/solvability, monetization integrity, and analytics volume.
- Data policy: only small, flat, non-sensitive properties. Never send credentials, payment data, player-authored text, raw click identifiers, or save snapshots.
- Cohorts: game version plus 3–6 low-cardinality progression/difficulty dimensions. Add normalized campaign dimensions only when the host supplies them.
- QA and reporting: `npm run simulate` proves timer behavior; real-host QA must verify event delivery. A dashboard or approved creator export must define the exact denominator before product decisions rely on it.

## Reusable code

[`src/systems/levelAnalytics.ts`](../src/systems/levelAnalytics.ts) owns active
time, attempts, restarts, completion, abandonment, and overlapping pause
reasons. It is renderer-independent and accepts an injected event emitter and
clock.

The default events are:

| Event | Meaning | Core properties |
| --- | --- | --- |
| `level_started` | A player entered a level/run | `level`, `level_id`, `attempt`, plus game-specific context |
| `level_restarted` | The current attempt was explicitly reset | `duration_seconds`, `attempt_duration_seconds`, `attempt`, `next_attempt` |
| `level_completed` | The level's real success condition fired | `duration_seconds`, `attempt_duration_seconds`, `attempts`, `restarts` |
| `level_abandoned` | The player left before success | Timing snapshot plus `exit_reason` |

`duration_seconds` is total active time across attempts.
`attempt_duration_seconds` is active time in the current attempt. Independent
pause reasons prevent host overlays, sleep, browser hiding, ads, and overlapping
lifecycle signals from inflating either timer.

[`src/systems/demoAnalytics.ts`](../src/systems/demoAnalytics.ts) adapts the
generic helper to Pixel Foundry. Pressing Play starts the current demo level,
the existing ten-bounce milestone completes it, and returning to the menu or a
renderer failure abandons it.

## Adapting a derived game

1. Keep `levelAnalytics.ts` or move the same machinery behind the game's typed analytics facade.
2. Start only from a real player-entry path, never from save loading.
3. Complete at the authoritative success transition, not when celebration UI finishes.
4. Call `restart` before resetting attempt state.
5. Abandon on explicit navigation or replacement by another level. Do not emit fresh analytics from `onSleep` or `onQuit`.
6. Pause for host pause/sleep and browser hiding. Add game-owned blockers for revive screens, matchmaking waits, or other time that should not count as play.
7. Include stable progression and difficulty dimensions such as level, mode, board size, enemy tier, or content ID. Avoid high-cardinality state dumps.
8. Keep shipped event names and property meanings stable. Add fields rather than silently redefining existing ones.

Unlimited levels should use the numeric `level` property on `level_started`; do
not create an unbounded funnel with one declared step per level. The maximum
level started is the highest level reached.

## Reporting boundary

`RundotGameAPI.analytics.recordCustomEvent` records structured events. The
generic CLI exports currently count custom events but do not automatically
aggregate arbitrary duration properties by level. A production game should
request or add an approved report that calculates starts, completions,
completion rate, and median/p95 duration by level and game version.

Paid-acquisition analysis also needs the host's normalized campaign identity
joined to the same session/events. Level instrumentation measures behavior; it
does not by itself prove which advertisement acquired the player.
