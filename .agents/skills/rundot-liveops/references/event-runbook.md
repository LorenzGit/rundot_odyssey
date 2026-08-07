# RUN.world LiveOps runbook

## Before the event

1. Re-read target SDK types, the installed
   `docs/rundot-developer-platform/api/LIVEOPS.md`, and current `rundot
   liveops --help`.
2. Validate base, active, expiry, failure, and each experiment-variant behavior
   locally. Verify no `forceVariant` remains.
3. Check timezone-bearing timestamps, intended override precedence, typed
   defaults, and client-safe keys.
4. Inspect deployed configuration/history and record a rollback target.
5. Obtain explicit approval for the identified game, tag, player impact, and
   monetization/economy implications.

## During the change

1. Run the installed CLI's preview/diff or read-only command when available.
2. Push only reviewed config to the confirmed non-public rollout target.
3. Read it back and confirm snapshot/version, active override IDs, and expected
   resolution in the game.
4. Watch technical failures and the predeclared player-impact guardrails.

## After / rollback

1. At end time, verify the scheduled state resolves back to base values.
2. Remove expired one-off configuration and preserve only intentional defaults.
3. If a stop condition trips, use supported scoped rollback; do not overwrite
   unrelated server configuration.
4. Record result, config version, outcomes, guardrails, cleanup, and the next
   decision. Do not infer causality from an early or unhealthy split.
