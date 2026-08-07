---
name: rundot-feature-daily-rewards
description: Add daily login rewards to a RUN game — a forgiving finite reward track (no streak reset), local-midnight rollover on a trusted server clock, claim popup, badge, and a come-back reminder notification. Ships copy-in TypeScript templates extracted from a shipped RUN game plus an AI-first integration guide. Use when a creator wants daily rewards, a login bonus, streak rewards, a reward calendar, or come-back-every-day mechanics.
---

# Add daily login rewards to a RUN game

Copy-in implementation extracted from a shipped RUN game. The authoritative
integration guide is `systems/daily-rewards/README.md` — read it top to bottom
before writing code. It derives every game-specific decision (the reward
track, what a reward grants, when the popup opens) from the host game's own
code, so you should not need to ask the developer questions.

## What's in this skill

| Path | What |
|---|---|
| `systems/daily-rewards/README.md` | Full integration guide: wiring steps, config reference, derive-from-host table, verification checklist |
| `systems/daily-rewards/dailyRewards.ts` | Track core: forgiving claim logic, day rollover, reminder scheduling |
| `systems/daily-rewards/dailyRewardsScreen.ts` | Reference vanilla-DOM popup: tile grid + live countdown |
| `systems/daily-rewards/dailyRewards.html` | Popup markup shell to paste into the host's `index.html` |
| `systems/daily-rewards/dailyRewards.css` | Reference styling, themed through neutral custom properties |
| `shared/serverTime.ts` | Trusted clock for the day rollover — copy alongside; imported as `../../shared/serverTime` |
| `references/run-sdk-notes.md` | Distilled RUN SDK facts (init, lifecycles, storage limits, error posture) |

## How to integrate (summary — the README is authoritative)

1. Read `systems/daily-rewards/README.md` fully, then `references/run-sdk-notes.md`.
2. Inventory the host game: rendering/UI approach, where
   `RundotGameAPI.initializeAsync()` is awaited, whether a per-frame
   `update(dt)` loop exists, and any existing persistence to integrate with.
3. Copy the templates into the host (suggested home:
   `src/helpers/daily-rewards/`), keeping file names. If the host is plain
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

State persists in a save blob: `rundot-feature-save`. Ships its own reminder;
coexists with `rundot-feature-notifications` via custom-id dedupe. Daily
quests share the same day-rollover primitive: `rundot-feature-daily-quests`.
