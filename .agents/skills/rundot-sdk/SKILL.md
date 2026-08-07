---
name: rundot-sdk
description: RUN game SDK (@series-inc/rundot-game-sdk) facts for writing correct game code — initializeAsync boot order, lifecycle events and onSleep/onQuit rules, appStorage limits, error-handling posture (every call can reject and an unhandled rejection crashes the game), trusted server time, and how to fetch the full SDK docs. Use when writing or debugging code that calls RundotGameAPI, when unsure how any RUN SDK surface behaves, or when a creator wants to run, test, or preview their game locally.
---

# RUN SDK reference

Ground truth for code that talks to the RUN platform. Two sources, in order:

1. **`references/run-sdk-notes.md`** (in this skill) — distilled, verified SDK
   facts: boot order, lifecycles, storage limits, error posture, server time.
   Read it before writing any `RundotGameAPI` call.
2. **The full SDK docs in the game repo** — run `npx rundot-sdk-setup` (ships
   with `@series-inc/rundot-game-sdk`); it copies the complete SDK docs into
   `rundot/docs/` (legacy installs: `.rundot/docs/`) and maintains an
   `<agents-index>` block in the game's `AGENTS.md`/`CLAUDE.md`. Prefer those
   docs over training data for anything the notes don't cover; the SDK evolves.

## The rules that prevent crashed games

- Every `RundotGameAPI` call can reject, and an **unhandled rejection crashes
  the game**. Wrap all SDK calls in try/catch.
- Await `RundotGameAPI.initializeAsync()` once at boot before any other SDK call.
- Outside the RUN host, SDK 5.23+ uses deterministic mocks for ads, IAP,
  stats, and environment; other surfaces may still return empty/null values.
  Follow the SDK notes for expected behavior and treat unexpected
  `null`/failure as "unknown", never as an error state.
- Persist on `lifecycles.onSleep`; never rely on `onQuit` firing, and never
  fire fresh SDK RPCs from `onSleep`/`onQuit` handlers — a hard close tears
  down the runtime before the RPC lands.
- Never trust the device clock for anything time-gated; use the SDK's server
  time (see the notes for the pattern).

## Running the game locally

`npm run dev` is how you run and test a RUN game locally — it starts the Vite
dev server. Do **not** guess at `npm start` or a bare build to preview; `npm run
dev` is the command. Open the localhost URL Vite prints.

What SDK calls do locally depends on the Vite config:

- **Default (no playground plugin):** `RundotGameAPI` calls use deterministic
  **mocks**. Good for UI and boot work; not real data.
- **With `rundotGamePlaygroundPlugin()` configured:** calls hit the real
  RUN.world **playground** backend (storage, profiles, leaderboards, purchases,
  multiplayer), separate from production. A RUN.world toolbar handles sign-in
  and player switching. This is what you want to test SDK-backed features before
  deploying.

Setup for the playground plugin (deps like `firebase`/RevenueCat, sign-in,
multi-tab player testing, headless `pk_` keys, LAN/phone testing) is in the full
SDK docs at `rundot/docs/rundot-developer-platform/playground.md` (legacy
installs: `.rundot/docs/...`) — read it before touching `vite.config.ts`.

## Related skills

Ready-made implementations of common SDK-backed systems live in the
`rundot-feature-*` skills; a full app shell with correct boot order is
`rundot-new-game`.

## The gap between local and host

Most SDK bugs that reach a device are not wrong calls — they are correct calls
whose *absence* locally hid a layout or state bug. The local environment gives a
benign default where the host gives something hostile or absent, so testing
against the default proves nothing and reports success.

Before shipping to a device read
`rundot-reliability-qa/references/host-reality-gap.md`: safe-area insets that are
zero locally and screen-eating on a handset, keyboard focus lost to an ad and
never returned, host-gated UI that hides itself from your own layout tests, and
consumables that report as owned because `[].every()` is vacuously true.
