---
name: rundot-multiplayer
description: Design, implement, diagnose, test, and operate RUN.world multiplayer games using authoritative realtime GameRoom servers, persistent shared worlds, matchmaking, room chat, platform services, deterministic SyncPlay, or server-authoritative simulation. Use whenever players share a room, world, match, turn order, economy, synchronized simulation, competitive outcome, or reconnectable session.
---

# RUN.world multiplayer

Build from current evidence, not remembered API shapes. Multiplayer combines
product design, networking, authority, persistence, security, and operations;
choose the model before writing gameplay code.

## Establish the source of truth

1. Read [references/source-map.md](references/source-map.md).
2. Inspect the target's installed `@series-inc/rundot-game-sdk` version,
   bundled multiplayer documents, `agents-index.txt`, and `.d.ts`
   declarations.
3. Read the installed `MULTIPLAYER.md` completely for every realtime task.
4. Read the additional installed documents selected by the routing below.
5. Check `rundot --version` and relevant command help before relying on CLI
   syntax.
6. Consult the live official pages only after the installed package. If
   sources disagree, follow the target package's declarations and bundled docs,
   record the discrepancy, and do not silently combine incompatible versions.

Never assume an API because this skill names it. Names in the references are
the SDK 5.24 audit inventory and must be reverified against the target.

## Choose the architecture

- Choose authoritative realtime `GameRoom` + `ServerRoom` for trusted game
  state, matchmaking, private information, persistent worlds, turns, shared
  economies, chat, or competitive outcomes.
- Choose SyncPlay only for simulations that can be deterministic on every
  client with fixed schemas, server-owned seed/player count, input authority,
  prediction, rollback, and replay verification.
- Choose server-authoritative simulation for documented asynchronous timers,
  recipes, energy, actors, gacha, and economy systems.
- Use a hybrid only when each boundary is explicit. Never allow two systems to
  own the same state.
- Never start new work on deprecated Rooms V1.

Read [references/capability-map.md](references/capability-map.md) before
selecting features. For SyncPlay, also read
[references/syncplay.md](references/syncplay.md).

## Produce the multiplayer brief

Before implementation, specify:

- player count, room/world lifetime, privacy, discovery, invite, and
  matchmaking path;
- lobby, seating, late-join, spectator, host-loss, leave, reconnect, and
  timeout behavior;
- authoritative state, hidden state, client prediction, conflict resolution,
  clocks, RNG, and end-of-match persistence;
- protocol version, migration rules, rate/size limits, idempotency, and
  compatibility policy;
- rewards, economy, moderation, support, analytics, and rollback ownership;
- local, Playground, production, device, identity, and fault tests.

Do not code a shared session until every security-sensitive value has one
authoritative owner.

## Implement in dependency order

1. Define versioned, typed, discriminated protocol contracts shared by client
   and server.
2. Implement authoritative state and command validation independently from
   rendering.
3. Configure the room type and opt-in Vite plugin using the installed
   documentation's canonical paths.
4. Implement client connection state, snapshots/deltas, reconnect, resync,
   leave, and teardown.
5. Add platform services, persistence/migration, matchmaking, chat, or
   deterministic networking only when the game requires them.
6. Integrate rendering as a consumer of authoritative or deterministic state.
7. Add visible waiting, reconnecting, degraded, failed, and recovery states.

Apply [references/security-and-authority.md](references/security-and-authority.md)
while designing protocols and server handlers.

## Non-negotiable rules

- Clients send intent, never claimed outcomes.
- Validate identity, membership, phase, turn, authorization, schema, bounds,
  finiteness, sequence, freshness, rate, and payload size server-side.
- Never expose secrets or hidden opponent state to untrusted clients.
- Use `this.clock` for `GameRoom` timers and persist/migrate critical state.
- Drive persistent-world catch-up from absolute timestamps; idle persistent
  rooms do not replay every missed tick.
- Handle oversized deltas by authoritative resync according to the installed
  contract.
- Keep SyncPlay steps pure and deterministic: no DOM, network, storage, wall
  clock, `Math.random`, renderer objects, or unordered state.
- Never simulate a successful room join, authoritative reward, service call,
  purchase, or competitive result in local fallback code.
- Keep multiplayer and SyncPlay tooling opt-in so ordinary development and
  production bundles do not accidentally start server infrastructure.

## Verify

Read [references/testing-and-operations.md](references/testing-and-operations.md)
and exercise the applicable matrix. At minimum, use independent clients and
test join, leave, reconnect, background/foreground, invalid and duplicate
commands, latency/loss, persistence or replay, version migration, server
errors, match completion, and cleanup.

For this template, inspect the intentionally minimal references under
`additional_features/multiplayer/`, `rundot/realtime.config.json`,
`vite.config.js`, and the multiplayer scripts in `package.json`. Adapt them;
do not mistake them for a complete game.

Report the chosen model, authority boundary, protocol/simulation version,
configuration paths, environments and identities tested, fault evidence, and
anything still requiring the RUN host, a deployed server bundle, or another
player.

## Resources

- [rooms/ExampleRoom.ts](rooms/ExampleRoom.ts) — minimal server-authoritative
  `GameRoom` skeleton (validate-then-apply, `sendTo` on join, `onPlayerLeave`,
  `onRestore` persistence). Copy to `src/rooms/` and register it in
  `rundot/realtime.config.json`.
