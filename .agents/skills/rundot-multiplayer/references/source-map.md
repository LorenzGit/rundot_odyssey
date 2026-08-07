# Multiplayer source map

## Contents

- Source-of-truth order
- Installed package documents
- Type declarations and code examples
- Live official documents
- Configuration and version traps
- Refresh procedure

## Source-of-truth order

Use this order for every target project:

1. Installed `@series-inc/rundot-game-sdk` version.
2. Installed SDK `docs/agents-index.txt`.
3. Installed SDK documents and `.d.ts` declarations.
4. Target project configuration and typechecked examples.
5. Local workspace copies, if present.
6. Live official RUN documentation.

The target's installed SDK is the compatibility boundary. Do not copy APIs,
config shapes, defaults, or paths from a different version.

## Installed package documents

Resolve these paths from the project root after dependencies are installed:

| Need | Installed document |
| --- | --- |
| Realtime rooms, GameRoom, ServerRoom, persistence, services, migration | `node_modules/@series-inc/rundot-game-sdk/docs/rundot-developer-platform/api/MULTIPLAYER.md` |
| Persistent worlds, seasons, deltas, shared economy, turns, transfer, PvP matching, chat | `node_modules/@series-inc/rundot-game-sdk/docs/rundot-developer-platform/api/ADVANCED-MULTIPLAYER.md` |
| Deterministic simulation and networked SyncPlay | `node_modules/@series-inc/rundot-game-sdk/docs/rundot-developer-platform/api/SYNCPLAY.md` |
| Secrets and hidden information | `node_modules/@series-inc/rundot-game-sdk/docs/rundot-developer-platform/api/SYNCPLAY-SECRETS.md` |
| Physics | `node_modules/@series-inc/rundot-game-sdk/docs/rundot-developer-platform/api/SYNCPLAY-PHYSICS.md` |
| Movement | `node_modules/@series-inc/rundot-game-sdk/docs/rundot-developer-platform/api/SYNCPLAY-MOVEMENT.md` |
| Pathfinding | `node_modules/@series-inc/rundot-game-sdk/docs/rundot-developer-platform/api/SYNCPLAY-PATHFINDING.md` |
| Bots | `node_modules/@series-inc/rundot-game-sdk/docs/rundot-developer-platform/api/SYNCPLAY-BOTS.md` |
| Animation state | `node_modules/@series-inc/rundot-game-sdk/docs/rundot-developer-platform/api/SYNCPLAY-ANIMATION.md` |
| Lag compensation | `node_modules/@series-inc/rundot-game-sdk/docs/rundot-developer-platform/api/SYNCPLAY-LAG-COMPENSATION.md` |
| Server-authoritative simulation | `node_modules/@series-inc/rundot-game-sdk/docs/rundot-developer-platform/api/SERVER_AUTHORITATIVE.md` |
| Simulation configuration | `node_modules/@series-inc/rundot-game-sdk/docs/rundot-developer-platform/api/SIMULATION_CONFIG.md` |
| Playground behavior | `node_modules/@series-inc/rundot-game-sdk/docs/rundot-developer-platform/playground.md` |
| Runtime and failure semantics | `node_modules/@series-inc/rundot-game-sdk/docs/rundot-developer-platform/error-handling.md` |
| CLI syntax | `node_modules/@series-inc/rundot-game-sdk/docs/rundot-developer-platform/cli-reference.md` |

Read the whole selected primary document before coding. Use the SyncPlay
subpages only when the game needs that system.

## Type declarations and code examples

Check declarations immediately before implementation:

- Stable server entry:
  `node_modules/@series-inc/rundot-game-sdk/dist/mp-server/index.d.ts`
- Client declarations use generated filenames. Locate them instead of
  hardcoding a hash:
  `rg -l "interface MultiplayerApi" node_modules/@series-inc/rundot-game-sdk/dist --glob "*.d.ts"`
- SyncPlay declarations:
  `node_modules/@series-inc/rundot-game-sdk/dist/syncplay/*.d.ts`
- Vite plugin declarations:
  `node_modules/@series-inc/rundot-game-sdk/dist/vite/index.d.ts`

Template references:

- `additional_features/multiplayer/realtimeClient.ts`
- `additional_features/multiplayer/realtimeServer.ts`
- `additional_features/multiplayer/syncplay.ts`
- `additional_features/config/rooms.syncplay.config.json`
- `rundot/realtime.config.json`
- `vite.config.js`

These examples prove imports and build wiring, not full product behavior.

## Live official documents

- Basic multiplayer:
  <https://series-1.gitbook.io/rundot-docs/readme/multiplayer>
- Advanced multiplayer:
  <https://series-1.gitbook.io/rundot-docs/readme/advanced-multiplayer>
- Documentation index:
  <https://series-1.gitbook.io/rundot-docs/llms.txt>

Markdown is normally available by appending `.md`. Live pages can reflect a
different SDK version than the target. Treat them as discovery and update
signals, not permission to ignore installed types.

## Configuration and version traps

- Do not use the deprecated `RundotGameAPI.rooms` surface.
- The audited SDK 5.24 tooling uses `rundot/realtime.config.json` as the
  canonical room-type map. Reverify this in the installed Vite declarations
  and `MULTIPLAYER.md`.
- Deterministic rooms have `deterministic: true` and no custom `GameRoom`
  source file; the generic input authority owns ordering.
- Some documentation revisions describe a separate
  `rundot/rooms.config.json` for hosted environments. The audited SDK 5.24
  package says `realtime.config.json` serves local, Playground, and production,
  with a bare-array `rooms.config.json` only as an explicit override. Follow
  the target package, never blend both descriptions.
- Local sidecars, Playground, and production do not prove the same identity,
  persistence, authentication, or deployment behavior. Test each environment
  the game claims to support.
- Server bundles must not import DOM, Pixi, React, browser-only modules,
  credentials, or client secrets.

## Refresh procedure

1. Read `package.json` and the installed SDK package version.
2. Read `docs/agents-index.txt`.
3. Search the installed documents for the needed feature.
4. Confirm every used method and type in `.d.ts`.
5. Inspect the target's Vite and room config.
6. Run `rundot --version` and relevant `--help`.
7. Compare the two live multiplayer pages for changes.
8. Record any mismatch and implement only the target-supported contract.
