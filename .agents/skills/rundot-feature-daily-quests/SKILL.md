---
name: rundot-feature-daily-quests
description: Add daily quests to a RUN game — day-rolled quest slots, stat-baseline progress deltas, seeded deterministic rolls, and engagement-scaled targets, on a trusted server clock. Ships copy-in TypeScript templates extracted from a shipped RUN game plus an AI-first integration guide. Use when a creator wants daily quests, missions, daily challenges, objectives, or to give players goals each day.
---

# Add daily quests to a RUN game

Copy-in implementation extracted from a shipped RUN game. The authoritative
integration guide is `systems/daily-quests/README.md` — read it top to bottom
before writing code. It derives every game-specific decision (the quest pool,
which stats back each goal, target scaling, rewards) from the host game's own
code, so you should not need to ask the developer questions.

## What's in this skill

| Path | What |
|---|---|
| `systems/daily-quests/README.md` | Full integration guide: wiring steps, config reference, derive-from-host table, verification checklist |
| `systems/daily-quests/dailyQuests.ts` | Quest core: day-rolled slots, seeded rolls, stat-baseline progress deltas |
| `systems/daily-quests/dailyQuestsScreen.ts` | Reference vanilla-DOM panel: countdown, quest rows, claim buttons |
| `systems/daily-quests/dailyQuests.html` | Panel markup shell to paste into the host's `index.html` |
| `systems/daily-quests/dailyQuests.css` | Reference styling, themed through neutral custom properties |
| `shared/serverTime.ts` | Trusted clock for the day rollover — copy alongside; imported as `../../shared/serverTime` |

## How to integrate (summary — the README is authoritative)

1. Read `systems/daily-quests/README.md` fully.
2. Inventory the host game: rendering/UI approach, where
   `RundotGameAPI.initializeAsync()` is awaited, whether a per-frame
   `update(dt)` loop exists, and any existing persistence to integrate with.
3. Copy the templates into the host (suggested home:
   `src/helpers/daily-quests/`), keeping file names. If the host is plain
   JavaScript, strip the type annotations while copying — the runtime code is
   identical.
4. Adapt every `ADAPT:` comment; game-specific content goes in the
   `create...(config)` factory config, machinery below it should not change.
5. Wire per the README's numbered steps, then run its verification checklist —
   actually exercise a day rollover with the test flag, don't just confirm it
   compiles.

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
- Anything time-gated uses `shared/serverTime.ts`, never the device clock.

## Related skills

Quest goals are stat counters — integrate `rundot-feature-stats` first (or
with this). State persists in a save blob: `rundot-feature-save`. Daily
rewards pays for showing up; quests pay for playing:
`rundot-feature-daily-rewards`. Writing `RundotGameAPI` code directly:
`rundot-sdk`.
