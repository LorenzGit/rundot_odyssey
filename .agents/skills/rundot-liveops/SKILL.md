---
name: rundot-liveops
description: Design, implement, test, measure, and safely operate RUN.world LiveOps configuration, scheduled events, remote tuning, experiments, rollout, and rollback. Use for limited-time events, daily-reward tuning, remotely controlled content, feature flags, A/B tests, or any rundot liveops command.
---

# RUN.world LiveOps

Use LiveOps for client-visible, reversible configuration that changes a shipped
game without a full build deploy. Treat it as an operating discipline: every
event needs a player promise, a bounded configuration change, measurement, a
rollback owner, and a clean end state.

Read the target game's installed SDK declarations and its bundled
`node_modules/@series-inc/rundot-game-sdk/docs/rundot-developer-platform/api/LIVEOPS.md`
before implementing. Before using a CLI command, run
`rundot liveops --help`: the installed CLI can lag the documentation. Do not
assume a documented command is available.

## What belongs in LiveOps

- Client-visible, non-security-sensitive flags, copy, UI treatment, event
  availability, and tuning values.
- Scheduled event windows and conservative, reversible reward or offer
  presentation changes.
- Deterministic client experiments with a clear control and measured outcome.

Never put secrets, anti-cheat decisions, trusted economy multipliers, drop
tables, entitlement ownership, payment grants, or any value the client must
not be able to forge in `client` config. The v1 `server` section is not exposed
to game code; it is not a client-side security mechanism.

## Implement the integration once

1. Put `rundot/liveops.config.json` under source control. Start with a small,
   typed game-owned default config, so the game remains safe if a fetch fails.
2. Read `RundotGameAPI.liveops.getConfigAsync()` after identity has had an
   asynchronous chance to resolve. Keep access in one service/facade.
3. Apply returned `values` only at a safe boundary such as boot, menu entry, or
   round start—not per frame.
4. Use `nextChangeAt` to schedule one refresh. Do not poll.
5. Record `configVersion`, active override IDs, and relevant experiment
   assignment alongside event exposure/participation telemetry. Never use
   analytics as the source of truth for rewards or purchases.
6. For daily rewards, offers, cooldowns, and abuse-sensitive decisions, retain
   trusted server-time/save/entitlement rules. LiveOps may choose a visible
   presentation or multiplier only where the authoritative system permits it.
7. Add local/mock scenarios for base config, active event, expired event,
   unavailable config, and every experiment variant.

Read `references/event-brief-template.md` before creating an event and
`references/event-runbook.md` before a remote LiveOps change.

## Scheduling and experiment rules

- Use complete ISO 8601 datetimes with timezone. `expiresAt` is exclusive.
- Overrides resolve in array order; later active overrides win at the top level.
  Avoid overlapping keys unless that precedence is deliberate and documented.
- Never edit an active experiment's variants, order, weights, salt, or delivered
  treatment. Those changes reshuffle assignments and corrupt measurement.
- A treatment ramp is only safe when total weight stays constant, treatment is
  listed first, and its weight only increases. Otherwise start a new experiment.
- `forceVariant` is mock-only. Remove it before any push.
- Experiment exposure means configuration was read, not that the player saw the
  treatment. Log a separate meaningful-view event when needed.

## Operate safely

1. Complete the event brief and have an explicit rollback/stop condition.
2. Validate locally in mock mode; use Playground where host behavior matters.
3. Inspect deployed state with the applicable `show`, `history`, or `diff`
   command before any change.
4. Confirm game, environment/tag, affected keys, start/end UTC times, expected
   audience, player impact, and rollback target. A LiveOps push changes remote
   state, so require the same explicit authorization as other live changes.
5. Push only through the installed CLI syntax. Prefer private/review rollout;
   do not treat LiveOps as permission to change a public release silently.
6. Read the affected configuration back, check resolved state, then monitor
   player-impact guardrails and technical errors. Roll back through the
   supported scoped path, not by restoring unrelated server configuration.

## Verify and hand off

Report the game and tag, config version/snapshot, UTC event window, changed
keys, defaults/fallback behavior, active experiment IDs and variants, checks
run, observed guardrails, rollback target, and who owns end-of-event cleanup.
State anything blocked by the installed CLI, a real host, or analytics access.
