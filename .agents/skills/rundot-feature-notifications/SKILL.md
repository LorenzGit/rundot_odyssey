---
name: rundot-feature-notifications
description: Add local notifications to a RUN game — declarative re-engagement reminders with cancel-first dedupe, sliding re-engagement windows, and an opt-out that cancels everything. Ships copy-in TypeScript templates extracted from a shipped RUN game plus an AI-first integration guide. Use when a creator wants notifications, reminders, or to bring players back to the game.
---

# Add re-engagement notifications to a RUN game

Copy-in implementation extracted from a shipped RUN game. The authoritative
integration guide is `systems/notifications/README.md` — read it top to bottom
before writing code. It derives every game-specific decision (which reminders
exist, their copy and timing, where they reschedule) from the host game's own
code, so you should not need to ask the developer questions.

## What's in this skill

| Path | What |
|---|---|
| `systems/notifications/README.md` | Full integration guide: wiring steps, config reference, derive-from-host table, verification checklist |
| `systems/notifications/notifications.ts` | The template you copy into the host game: permission bootstrap, reminder catalogue, cancel-first dedupe |
| `references/run-sdk-notes.md` | Distilled RUN SDK facts (init, lifecycles, storage limits, error posture) |

## How to integrate (summary — the README is authoritative)

1. Read `systems/notifications/README.md` fully, then `references/run-sdk-notes.md`.
2. Inventory the host game: rendering/UI approach, where
   `RundotGameAPI.initializeAsync()` is awaited, whether a per-frame
   `update(dt)` loop exists, and any existing persistence to integrate with.
3. Copy the template into the host (suggested home:
   `src/helpers/notifications/`), keeping file names. If the host is plain
   JavaScript, strip the type annotations while copying — the runtime code is
   identical.
4. Adapt every `ADAPT:` comment; game-specific content goes in the
   `create...(config)` factory config, machinery below it should not change.
5. Wire per the README's numbered steps, then run its verification checklist —
   actually schedule and receive a reminder, don't just confirm it compiles.

## Global RUN rules (always apply)

- Every `RundotGameAPI` call can reject, and an unhandled rejection crashes
  the game — keep the template's try/catch posture in code you add.
- Await `RundotGameAPI.initializeAsync()` once at boot before any other SDK call.
- Degrade gracefully outside the RUN host: local dev uses deterministic SDK
  mocks; follow the feature README for expected behavior, and treat unexpected
  `null`/failure as "unknown", never as an error state.
- Persist aggressively on `lifecycles.onSleep` (that's what it's for); never
  rely on `onQuit` firing. Don't fire other fresh SDK RPCs (e.g. scheduling
  notifications) from `onSleep`/`onQuit` — a hard close tears down the runtime
  before the RPC lands; do that work while the app is alive.

## Related skills

Opt-out state persists in a save blob: `rundot-feature-save`. Daily rewards
schedules its own reminder ids; the two coexist via custom-id dedupe:
`rundot-feature-daily-rewards`.
