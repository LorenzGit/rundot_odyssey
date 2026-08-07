# Multiplayer testing and operations

## Contents

- Required environments
- Core matrix
- Realtime and persistent-world tests
- SyncPlay tests
- Fault, lifecycle, and security tests
- Build, deploy, and handoff evidence

## Required environments

Use the smallest set that proves the claimed behavior:

1. Pure unit/headless tests for protocol, validation, state, migration, and
   deterministic rules.
2. Local Vite multiplayer sidecar with independent identities.
3. RUN Playground for host authentication and hosted services when required.
4. Deployed private/unlisted build for production room-server routing.
5. Real mobile devices for backgrounding, connectivity changes, safe areas,
   thermal behavior, and touch controls.

Never treat one tab, one process, or a local mock as proof of multiplayer.
For local SyncPlay, use separately opened tabs/windows; duplicated tabs may
copy identity and correctly trigger duplicate-session rejection.

## Core matrix

| Area | Required cases |
| --- | --- |
| Join | create, code join, matchmaking, full, locked, private, invalid code, duplicate identity |
| Membership | join, voluntary leave, kick, disconnect grace, timeout, reconnect, creator/seat changes |
| Protocol | valid, malformed, oversized, stale, duplicate, unauthorized, out-of-phase, out-of-turn |
| Network | latency, jitter, loss, offline, reconnect success, reconnect expiry, server restart |
| Lifecycle | pause, sleep, background, resume, navigation away, teardown, repeated mount |
| State | initial snapshot, delta, oversized-delta resync, restore, migration, transfer |
| Completion | win/loss/draw/forfeit, reward once, persistence, rematch, room disposal |
| Compatibility | old client/new server, new client/old server, rejected protocol/simulation version |

Use at least two independent clients and add a third when spectators, late
join, occupancy, creator migration, or multiple seats matter.

## Realtime and persistent-world tests

- Validate every server handler directly with valid and adversarial commands.
- Test room lock/unlock, capacity, private joins, matching criteria, and
  creator-only actions.
- Test crash recovery and bundle migration with realistic snapshots.
- Verify named clocks restore correctly and raw timers do not survive
  disposal.
- Freeze a persistent room, advance wall time, resume, and prove absolute-time
  settlement without replaying missed ticks.
- Test overlapping/no-active/expired seasons and unique persistent keys.
- Force a delta over the installed broadcast limit and verify client resync.
- Race shared-economy claims/contributions and verify no over-allocation or
  local reward fallback.
- Exercise service rejection, timeout, documented retry, and terminal failure.
- Transfer a player and verify state refetch before destination rendering.
- Test competitive cross-instance matchmaking in a hosted environment.
- Test room chat membership, history, length/rate rejection, safe rendering,
  and moderation/reporting decisions.

## SyncPlay tests

- Repeat the same seed/input stream and compare every checksum/final state.
- Vary render FPS without changing simulation output.
- Verify neutral/repeat/command input semantics for empty and late seats.
- Test prediction ceiling, rollback, correction, duplicate effect
  suppression, and connection-health UI.
- Verify replay export/import, deterministic version rejection, and long-match
  snapshot catch-up.
- Test late join, rejoin, seating close/open, full rooms, creator permissions,
  substituted input, and different browsers/devices.
- Run strict certification/build checks after every deterministic code change.

## Fault, lifecycle, and security tests

- Fuzz numeric bounds, NaN/infinity, long strings, large arrays, nested
  objects, unexpected discriminants, and repeated sequence IDs.
- Flood commands within a safe test harness and verify rate limits and bounded
  logs.
- Background clients during waiting, active play, reconnect, and completion.
- Kill the room server during critical transitions and verify restore or honest
  failure.
- Verify hidden state, credentials, private configuration, and service errors
  are absent from client bundles and network messages.
- Confirm a malicious client cannot directly grant score, inventory, currency,
  shared resources, rewards, or match results.

## Build, deploy, and handoff evidence

For this template:

```sh
npm run typecheck
npm run build:multiplayer
npm run build:syncplay
npm run check:all
```

Before relying on commands, verify package scripts and current CLI help.
Deployment, publication, server configuration upload, purchases, and live
economy changes require the owner's explicit authorization.

Record:

- installed SDK and CLI versions;
- architecture and authority map;
- protocol, snapshot, and deterministic versions;
- room/config/plugin paths;
- server and client build outputs;
- environment, device, account, and player-count matrix;
- fault/latency/reconnect/migration evidence;
- production-only or multi-player behavior still unverified;
- monitoring, support, rollback, and compatibility plan.
