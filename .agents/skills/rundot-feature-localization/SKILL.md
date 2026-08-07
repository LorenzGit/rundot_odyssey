---
name: rundot-feature-localization
description: Add localization to a RUN game — a CSV string table loaded synchronously at first paint, bracket interpolation, an English fallback chain, language-picker persistence, and data-loc DOM stamping. Ships copy-in TypeScript templates extracted from a shipped RUN game plus an AI-first integration guide. Use when a creator wants translations, i18n, l10n, multi-language text, or to support another language.
---

# Add localization to a RUN game

Copy-in implementation extracted from a shipped RUN game. The authoritative
integration guide is `systems/localization/README.md` — read it top to bottom
before writing code. It derives every game-specific decision (which strings to
extract, key naming, which languages ship) from the host game's own code, so
you should not need to ask the developer questions.

## What's in this skill

| Path | What |
|---|---|
| `systems/localization/README.md` | Full integration guide: wiring steps, config reference, derive-from-host table, verification checklist |
| `systems/localization/l10n.ts` | The template you copy into the host game: CSV string table, interpolation, fallback chain |
| `systems/localization/Localization.csv` | Starter string table (`KEY,English,PortugueseBR,SpanishLA`) — replace the rows with the host game's strings |
| `references/run-sdk-notes.md` | Distilled RUN SDK facts (init, lifecycles, storage limits, error posture) |

## How to integrate (summary — the README is authoritative)

1. Read `systems/localization/README.md` fully, then `references/run-sdk-notes.md`.
2. Inventory the host game: rendering/UI approach, where
   `RundotGameAPI.initializeAsync()` is awaited, whether a per-frame
   `update(dt)` loop exists, and any existing persistence to integrate with.
3. Copy the templates into the host (suggested home:
   `src/helpers/localization/`), keeping file names. If the host is plain
   JavaScript, strip the type annotations while copying — the runtime code is
   identical.
4. Adapt every `ADAPT:` comment; game-specific content goes in the
   `create...(config)` factory config, machinery below it should not change.
5. Wire per the README's numbered steps, then run its verification checklist —
   actually switch language at runtime and reload, don't just confirm it
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

## Related skills

Integrate this first if the game will ship multi-language, so other systems'
player-facing copy goes through it. Language choice persists in a save blob:
`rundot-feature-save`.
