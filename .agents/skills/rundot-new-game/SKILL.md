---
name: rundot-new-game
description: Scaffold a brand-new RUN game — a complete app shell (Vite + Pixi.js v8 + React 19 + Tailwind v4) with correct RUN SDK boot order, a boot-cover and asset-warming loading screen, lifecycle wiring, device-frame CSS, a design-resolution stage, and deploy config. Use when a creator is starting a RUN game from nothing or asks for a starter project, boilerplate, app template, or project skeleton.
---

# Scaffold a new RUN game

A complete, runnable app shell extracted from a shipped RUN game. The
authoritative guide is `starter/README.md` — read it before scaffolding.

## What's in this skill

| Path | What |
|---|---|
| `starter/README.md` | Setup guide: install, run, build, deploy, and where each piece lives |
| `starter/**` | The full project template: Vite config, SDK boot (`src/sdk/runSdk.ts`), Pixi stage, React UI, loading screen, deploy config |
| `docs/run-sdk-notes.md` | Distilled RUN SDK facts (init, lifecycles, storage limits, error posture) — at this path because `starter/README.md` links it as `../docs/run-sdk-notes.md` |

## How to scaffold

1. Read `starter/README.md`, then `docs/run-sdk-notes.md`.
2. Copy the entire `starter/` contents into the new project root, then rename
   the game in `package.json`, `index.html`, and `game.config.prod.json`.
3. `npm install` and `npm run dev` — the shell must boot before you add game
   code. Note: the RUN SDK dynamically imports `firebase/app` without
   declaring it; the starter's `package.json` already depends on `firebase` —
   keep that dependency.
4. Build with `base: './'` (already configured) and deploy the `dist/` folder
   with `rundot deploy` (see the `rundot-deploy` skill).

## Global RUN rules (always apply)

- Every `RundotGameAPI` call can reject, and an unhandled rejection crashes
  the game — keep the shell's try/catch posture in code you add.
- `RundotGameAPI.initializeAsync()` is awaited once at boot in
  `src/sdk/runSdk.ts` before any other SDK call — keep it first.
- `npm run dev` runs the game against the RUN.world **playground** backend — the
  starter's `vite.config.js` already wires `rundotGamePlaygroundPlugin()`. Sign
  in via the dev toolbar. For multi-player testing and headless `pk_` keys, read
  the Playground guide — run `npx rundot-sdk-setup` to copy the full SDK docs
  into `rundot/docs/` (then see `rundot-developer-platform/playground.md`), or
  read it in the online SDK docs. Still code defensively: every `RundotGameAPI`
  call can reject.

## Related skills

Game systems (save, shop, daily rewards, quests, stats, tutorial, ads,
notifications, analytics, localization) plug into this shell — each has its
own `rundot-feature-*` skill. Deploying: `rundot-deploy`.
