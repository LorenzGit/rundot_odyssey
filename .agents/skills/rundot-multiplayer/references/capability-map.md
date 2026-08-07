# Multiplayer capability map

## Contents

- Architecture selection
- Realtime room foundation
- Advanced persistent-world systems
- SyncPlay
- Server-authoritative simulation
- Combination rules

This is an SDK 5.24 audit inventory, not an evergreen API reference. Verify
every selected surface against the target's installed docs and declarations.

## Architecture selection

| Requirement | Primary model |
| --- | --- |
| Trusted shared state, hidden information, turns, private rooms | Realtime `GameRoom` |
| Cross-instance competitive pairing | Realtime authoritative matchmaking |
| Persistent shared world or season | Persistent realtime `GameRoom` |
| Shared finite economy or authoritative platform service | Realtime `GameRoom` services |
| Fast deterministic action with prediction and rollback | SyncPlay |
| Timers, recipes, actors, energy, gacha, offline progression | Server-authoritative simulation |
| Social presence without shared gameplay authority | Normal RUN social/profile APIs, not necessarily multiplayer |

Prefer one authority model. A hybrid is valid only when state ownership cannot
overlap and the handoff protocol is versioned and tested.

## Realtime room foundation

Read installed `MULTIPLAYER.md` completely.

### Build and configuration

- `rundotMultiplayerPlugin` builds the server entry, validates the room map,
  and provides local room infrastructure.
- `rundot/realtime.config.json` maps room type to a `GameRoom` file and
  per-room configuration.
- Reverify `maxPlayers`, `idleTimeout`, `autoPersist`, `persistInterval`,
  `allowReconnect`, `reconnectTimeout`, `startLocked`, metadata, persistent
  fields, and plugin defaults in the installed version.

### Server

- Extend `GameRoom<Protocol>` from the `/mp-server` entry.
- Lifecycle includes creation, join validation, game messages, leave,
  disposal, restore, migration, and—when configured—server ticks.
- Use `broadcast`, `sendTo`, `lock`, `unlock`, `kick`, `reject`, `save`,
  `players`, `playerCount`, `clock`, `log`, and `services` only from the room
  instance.
- Use named room clocks so cleanup and recovery follow the harness.
- Persist a versioned minimum authoritative snapshot and validate restored
  values as untrusted data.

### Client

- The supported namespace is `RundotGameAPI.realtime`.
- Verify `createRoom`, `joinRoomByCode`, `joinOrCreateRoom`,
  `matchmakeRoom`, and `getUserRooms` before use.
- `ServerRoom` exposes typed and raw messaging, connection state, latency,
  roster/capacity/creator facts, seating control, server time, chat, and leave.
- Subscribe before gameplay, retain unsubscribe/leave ownership, and handle
  reconnect, disconnect, lock, roster, move, delta, resync, chat, and error
  events required by the design.

## Advanced persistent-world systems

Read installed `ADVANCED-MULTIPLAYER.md` after `MULTIPLAYER.md`.

### Persistent rooms and seasons

- A persistent room uses a stable caller-supplied `persistentKey`, survives
  bundle deploys through durable snapshots, freezes while empty, and resumes
  on the next join.
- `onTick` runs only while warm. Settle missed time from absolute expiry
  timestamps rather than replaying absent ticks.
- `SeasonSchedule` defines unique season keys, time windows, active/current
  resolution, join gates, recurring schedules, and persistent room keys.
- Persist and migrate world state across bundle changes. Never reuse a season
  key for a different world.

### Authoritative deltas

- Mutate authoritative state first, then send a computed delta.
- `broadcastDelta` reports whether it sent a delta or requested a resync.
- The audited contract exports `MAX_BROADCAST_BYTES` at 16 KiB. Oversized
  deltas produce resync instead of truncation or silent drop.
- Clients must implement both delta application and full authoritative
  refetch.

### Shared economy and platform services

- `this.services.economy` owns finite, room-scoped shared pools with claim,
  contribute, and remaining operations.
- Simulation services can read state and execute documented recipes; audited
  advanced docs also include cross-season `grantMeta` for eligible meta
  entities and current members.
- Treat `ServiceError` as a typed failure boundary. Fail closed, show an honest
  outcome, and retry only documented idempotent operations.
- Never implement authoritative rewards by broadcasting a client-requested
  number.

### Turn, transfer, matchmaking, and chat

- `TurnManager` owns server turn order, validation, advance, removal, and
  snapshot/restore. Game move validation still belongs to the room.
- Server-driven player transfer keeps the socket and emits `onMoved`; refetch
  destination state before rendering it.
- `matchmakeRoom` is transactional cross-instance pairing for two-player PvP.
  `joinOrCreateRoom` is not equivalent competitive matchmaking.
- Platform room chat is member-gated, persisted, and rate-limited; consume
  chat/history events and still apply the game's safety and UI policies.

## SyncPlay

Use SyncPlay for deterministic input simulation, not as a generic replacement
for an authoritative game server. Read
[syncplay.md](syncplay.md) and the installed documents it routes.

## Server-authoritative simulation

Read installed `SERVER_AUTHORITATIVE.md` and `SIMULATION_CONFIG.md` for
documented timers, recipes, actors, movement, energy, gacha, and state. Keep
long-term economic and timed progression on that authority. Do not re-create
those guarantees with browser storage, analytics, or client clocks.

## Combination rules

- Realtime + services: the room decides when a valid command may call a
  service; the service owns its durable platform result.
- Realtime + simulation: simulation owns its configured entities/recipes; the
  room owns session protocol and membership.
- SyncPlay + long-term progression: SyncPlay owns deterministic match state;
  an authoritative post-match system validates and persists rewards.
- Chat + gameplay: chat never mutates gameplay state without passing through
  the same validated command boundary.
- Rendering owns presentation only.
