---
name: rundot-feature-ads
description: Add rewarded ads to a RUN game — a three-path grant flow (watch ad, subscriber-instant, premium-currency fallback), a shared daily cap on a trusted clock, and watch-ladder milestone rewards. Ships copy-in TypeScript templates extracted from a shipped RUN game plus an AI-first integration guide. Use when a creator wants rewarded ads, watch-an-ad-for-a-reward, an ad rewards ladder, or ad boosts.
---

# Add rewarded ads to a RUN game

Copy-in implementation extracted from a shipped RUN game. The authoritative
integration guide is `systems/ads/README.md` — read it top to bottom before
writing code. It derives every game-specific decision (which placements grant
what, the daily cap, the ladder rewards) from the host game's own code, so you
should not need to ask the developer questions.

## What's in this skill

| Path | What |
|---|---|
| `systems/ads/README.md` | Full integration guide: wiring steps, config reference, derive-from-host table, verification checklist |
| `systems/ads/ads.ts` | Ads core: the single `grantReward` chokepoint, three-path grant flow, shared daily cap |
| `systems/ads/adRewardsLadder.ts` | Sequential "watch N ads → claim a milestone" progression track |
| `systems/ads/adRewardsScreen.ts` | Reference vanilla-DOM ladder screen: watch button + reward rows |
| `systems/ads/ads.css` | Reference styling, themed through neutral custom properties |
| `shared/serverTime.ts` | Trusted clock for the daily cap — copy alongside; imported as `../../shared/serverTime` |
| `references/run-sdk-notes.md` | Distilled RUN SDK facts (init, lifecycles, storage limits, error posture) |

## How to integrate (summary — the README is authoritative)

1. Read `systems/ads/README.md` fully, then `references/run-sdk-notes.md`.
2. Inventory the host game: rendering/UI approach, where
   `RundotGameAPI.initializeAsync()` is awaited, whether a per-frame
   `update(dt)` loop exists, and any existing persistence to integrate with.
3. Copy the templates into the host (suggested home: `src/helpers/ads/`),
   keeping file names. If the host is plain JavaScript, strip the type
   annotations while copying — the runtime code is identical.
4. Adapt every `ADAPT:` comment; game-specific content goes in the
   `create...(config)` factory config, machinery below it should not change.
5. Wire per the README's numbered steps, then run its verification checklist —
   actually exercise all three grant paths, don't just confirm it compiles.

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

Subscription status and currency fallback are injected functions —
`rundot-feature-iap-shop` provides both (optional; ads works alone). State
persists in a save blob: `rundot-feature-save`.
