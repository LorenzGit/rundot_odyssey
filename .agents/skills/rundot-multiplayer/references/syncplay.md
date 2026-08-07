# SyncPlay implementation route

## Contents

- Suitability gate
- Required documents
- Deterministic contract
- Offline and networked modes
- Presence, prediction, and late join
- Specialized systems
- Verification

## Suitability gate

Choose SyncPlay only when the complete gameplay simulation can produce the
same state and checksum from the same initial state, seed, ordered inputs, and
tick on every supported client. Use authoritative realtime rooms instead when
the server must hold secrets, make non-deterministic decisions, or own complex
world state.

## Required documents

Always read the installed `SYNCPLAY.md` completely. Then read:

- `SYNCPLAY-SECRETS.md` for hidden state or withheld information.
- `SYNCPLAY-PHYSICS.md` before integrating physics.
- `SYNCPLAY-MOVEMENT.md` for locomotion and input semantics.
- `SYNCPLAY-PATHFINDING.md` before deterministic navigation.
- `SYNCPLAY-BOTS.md` for substituted or simulated players.
- `SYNCPLAY-ANIMATION.md` for deterministic animation state.
- `SYNCPLAY-LAG-COMPENSATION.md` for prediction, reconciliation, and
  presentation under latency.

Use the exact paths in [source-map.md](source-map.md).

## Deterministic contract

- Define an explicit `deterministicVersion`, fixed tick rate, bounded input
  schema, bounded/checksummed state schema, stable system order, default input,
  and deterministic step.
- Obtain the multiplayer seed and player count from the server session. Never
  generate either locally for a networked match.
- Use integers or documented deterministic number handling where cross-engine
  floating behavior could diverge.
- Give every collection an explicit stable order. Do not depend on object,
  set, map, filesystem, locale, or network iteration order.
- Keep the step pure: no DOM, Pixi, React, Web APIs, storage, network, audio,
  wall time, `Date`, `performance`, `Math.random`, or renderer objects.
- Keep visual interpolation, particles, audio, haptics, and camera outside
  checksummed state unless the installed docs require otherwise.
- Treat simulation version changes as protocol migrations. Old replays and
  live peers must never silently use new rules.

## Offline and networked modes

- Build and test the offline deterministic runtime first.
- Declare a deterministic room type in the installed SDK's canonical room
  config. The generic input authority serves it; do not attach custom
  `GameRoom` code unless the installed API explicitly defines a hybrid.
- Create the network client from the server transport and a session factory
  that consumes the assigned seed and player count.
- Encode/decode inputs deterministically and map missing input to the declared
  neutral or repeat/command policy.
- Keep the render loop responsible for pumping the client and drawing state,
  never for advancing authority independently.
- Export and preserve replays needed for deterministic verification and
  support.

## Presence, prediction, and late join

- Show room code, occupancy, seating, creator authority, connection state,
  prediction distance, rollback activity, and failure states when relevant.
- Only the room creator can change seating in the audited SDK; handle rejected
  requests.
- Treat presence as transport metadata, not checksummed gameplay state.
- Late join and rejoin require deterministic catch-up. Implement documented
  state serialization/deserialization and never trust an unvalidated donated
  snapshot.
- Design prediction limits and presentation smoothing so rollback does not
  produce impossible controls, duplicate effects, or repeated rewards.

## Specialized systems

- Physics: use only the deterministic adapter and configuration documented for
  the installed version.
- Movement/pathfinding: quantize inputs, destinations, and update order;
  define tie-breaking.
- Bots: give bots the same deterministic input boundary as players.
- Animation: derive presentation from simulation facts; do not let animation
  callbacks drive simulation.
- Secrets: follow the documented secret protocol. If all clients receive the
  hidden data, it is not secret.
- Lag compensation: separate visual compensation from authoritative or
  checksummed outcomes.

## Verification

- Run the strict SyncPlay build/checker.
- Run repeat simulations with identical seed/input and compare final state and
  checksums.
- Verify replay export/import and reject version mismatches.
- Exercise two independent clients, late join, reconnect, empty seats,
  substituted input, seating close/open, latency, loss, rollback, and long
  catch-up.
- Test on different browsers/devices when the game uses physics or numeric
  paths.
- Confirm the production build contains no development checker or credential.
