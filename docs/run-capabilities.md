# RUN capability map

This map answers two questions: what this workspace’s games already proved, and
where a new game can find a safe implementation or reference for every installed SDK surface. The
runtime metadata equivalent is `src/sdk/capabilityCatalog.ts`.

All SDK calls can reject. Every adopted call needs error handling, a meaningful
fallback, and the correct authority model. The active Feature Lab runs only
after a player tap; files under `additional_features/` are never imported by
the default client bundle.

## Lessons folded in from the game portfolio

| Game | RUN/platform patterns carried into this template |
| --- | --- |
| Dungeon Sweep | WebGPU/WebGL fallback and device-loss posture, storage, foreground recovery, all primary lifecycle states, analytics, rewarded ads, safe areas, device context, haptics |
| Shape Siege | Access gates, roles/launch intent, attribution, clips, collectibles, credits, entitlements, gamepad, profile, leaderboards, LiveOps, logging, notifications, preloader, realtime rooms, Shop, simulation, social, stats, trusted time, UGC |
| Gloomspire | Interstitial/rewarded ads, funnels, device cache, IAP, purchase history/recovery, popups, subscriptions, fail-closed monetization |
| CANTRIP | Headless deterministic core, Playground opt-in, entitlement reconciliation, host exit, procedural art/audio, richer product systems |
| Hole Vortex | WebGPU-first 3D presentation lessons, renderer diagnostics, responsive visual QA, preloader, leaderboards, safe areas |
| Moonstep Couriers | Explicit Pixi initialization fallback, trusted future time, direct currency spend, environment-aware layout, rewarded progression |
| Prism Drift | Entitlement quantities, LiveOps pacing, catalog reads, trusted time, WebGPU diagnostics |
| Wreckshot | Stats, notifications, exit handling, procedural presentation, semantic QA and release evidence |

Shared portfolio rules now active here include validated versioned saves/migrations,
trusted daily boundaries, responsive portrait framing, generated audio settings,
renderer forcing and initialization fallback, performance/DPR caps, reduced
motion, document-level gesture suppression, lifecycle/back cleanup,
identity-safe reload, serialized save writes, and development-only semantic browser QA.

## SDK coverage

Safety labels:

- **read**: no intended remote mutation, but still may reject.
- **write**: changes player/game state; validate and make retry/idempotency safe.
- **gesture**: show only after a direct player action.
- **billed**: may spend creator/player credits or real money.
- **privileged**: creator/admin role and an explicit moderation decision.
- **server**: belongs in an authoritative room/server or deterministic runtime.

| Surface | Safety | Template source and adoption note |
| --- | --- | --- |
| Host/capabilities | read | `src/sdk/runSdk.ts`; bounded import-initialized host handshake, never manual `initializeAsync()` |
| Access gate | gesture | active `src/sdk/featureLab.ts`; check anonymous/tier first, prompt from a tap |
| Lifecycle + identity | read | `src/sdk/runSdk.ts` and `src/main.tsx`; pause/resume/sleep/awake/quit/back/identity, with unsubscribe cleanup and browser visibility fallback |
| App role, release notes, launch intent | read/gesture | active release/launch reads in `src/sdk/featureLab.ts`; privileged moderation remains in `additional_features/client/moderation.ts`; use `app.resolveLaunchIntent()`, not context snapshots |
| Profile and locale | read | active `src/sdk/featureLab.ts`; use root `getProfile()`, not deprecated `getCurrentProfile()` |
| System/device/environment/safe area | read/gesture | active runtime and Feature Lab; add-to-home-screen follows a tap |
| Feature flags/gates | read | active Feature Lab; platform-managed gates only, while creator A/B tests belong in LiveOps |
| Large-number helpers | read | active Feature Lab; normalization, incremental formatting, and geometric-series economy math |
| Navigation, app stack, and host exit | gesture | Android back and root host exit are active; disruptive cross-app patterns remain in `additional_features/client/navigation.ts` |
| Popups, likes, comments | gesture | active Feature Lab; platform UI never proves a game reward |
| Logging | write | active Feature Lab diagnostics; never log credentials or player-sensitive data |
| App/device/owner storage | write | active serialized app save plus read/delete examples in `additional_features/client/storage.ts`; choose scope deliberately, keep device cache non-authoritative |
| Shared storage/assets | write/read | `additional_features/client/storage.ts`; target app policy controls cross-app namespaces |
| Files | write | `additional_features/client/content.ts`; two-step upload + confirm, quota/visibility/transform/job APIs |
| CDN | read | active Feature Lab; signed/entitlement-aware asset resolution and shared library URLs |
| RUN asset loader/cache | read | `additional_features/client/assets.ts`; load/preload with progress, reuse cached object URLs, and call cleanup only after consumers release them |
| Native preloader | write | active Feature Lab; the React boot loader remains default because prod config has `usesPreloader: false` |
| Analytics/funnels | write | active custom-event and first-play funnel examples in `src/systems/runtimeServices.ts`; telemetry never grants or gates value |
| Attribution | read | active Feature Lab; do not place PII in campaign or share metadata |
| LiveOps/experiments | read | active runtime and `additional_features/config/liveops.config.json`; assignments are stable, values bounded, secrets forbidden |
| Trusted time/formatting | read | `src/systems/serverTime.ts` plus active future-time/locale formatting probes; sample at boot/resume and extrapolate, never treat local fallback as authority |
| Notifications/RCS/inbox | gesture/write | active local path plus `additional_features/client/notifications.ts`; consent first, stable collapse key, schedule while alive |
| Haptics | gesture | active runtime + Feature Lab; root `triggerHapticAsync()` with `system.getDevice().haptics`, player preference, and non-haptic feedback |
| Gamepad | read | active Feature Lab; await `gamepad.ready()` before trusting support |
| Ads | gesture | visible Feature Lab rewarded/interstitial seams; reward only on exact verified completion, cancellation/unavailable grants nothing |
| Shop | gesture/write | active catalog/order reads and fail-closed purchase boundary; server config remains under `additional_features/config/` |
| IAP/currencies/subscriptions | billed | active balance/offer reads; spend/checkout/direct-SKU patterns remain in `additional_features/client/commerce.ts`; Playground purchases are real |
| Entitlements/ledger | write/read | active ownership reads; consumption remains in `additional_features/client/commerce.ts` with idempotent references |
| Creator credits/paywall | billed | `additional_features/client/generation.ts`; show estimate and billing context before a direct player-confirmed call |
| Stats | write/read | active reads; submission remains in `additional_features/client/progression.ts` |
| Leaderboards | write/read | active rank read plus `additional_features/client/progression.ts` and config reference; paging, score token, duration/telemetry, rejection handling, replay when required |
| Collectibles | write/read | active catalog reads; VIP claims remain in `additional_features/client/progression.ts` and server validated |
| Simulation | write/server | `additional_features/client/progression.ts` plus inert entities/recipes/lifecycle configs under `additional_features/config/simulation/`; real games replace the example authority model |
| Social links and composer | gesture/write | active score-share and composer; QR/click/file patterns require deliberate adoption |
| Clips | gesture/write | `additional_features/client/content.ts`; feature detect, capture consent, short recording, private UGC first |
| UGC/discovery/collaboration/voting | write/privileged | `additional_features/client/content.ts` + `moderation.ts`; local profanity check is UX only, server moderation remains required |
| Native video/PiP | gesture | `additional_features/client/content.ts`; preserve the session handshake when resuming playback |
| Text generation | billed | `additional_features/client/generation.ts`; prefer server-authored prompts and moderate player input/output |
| Image/depth/cutout/upscale | billed | `additional_features/client/generation.ts`; cost estimate, explicit confirmation, job recovery |
| Audio/music/SFX/TTS/voice design | billed | `additional_features/client/generation.ts`; distinguish generated assets from the default free procedural WebAudio |
| Sprite/character generation | billed | `additional_features/client/generation.ts`; list models/costs, recover jobs, store durable selected assets |
| Video generation | billed | `additional_features/client/generation.ts`; provider policy failures and cancellation are normal outcomes |
| 3D generate/remesh/rig/animate | billed | `additional_features/client/generation.ts`; file keys/URLs, staged operations, and completed-job recovery |
| 3D avatar | read/gesture/write | `additional_features/client/generation.ts`; loading is read-only, editor/save/delete require player action |
| Realtime multiplayer | server | `.agents/skills/rundot-multiplayer/` plus `additional_features/multiplayer/realtimeClient.ts`, `realtimeServer.ts`, and `rundot/realtime.config.json`; current `realtime` + `mp-server` path |
| Syncplay | server | `.agents/skills/rundot-multiplayer/references/syncplay.md` plus `additional_features/multiplayer/syncplay.ts` and Syncplay room config; pure immutable step, strict determinism plugin, replay/synctest before adoption |
| Creator admin generation/UGC | privileged | `additional_features/client/moderation.ts`; role check and explicit moderation decision for every mutation |

## RUN runtime features outside the SDK

Camera, microphone, clipboard read/write, and autoplay are allowed by the RUN
runtime but are not SDK capability groups. Clipboard write is active in the
Feature Lab. Permissioned camera/microphone and lower-level clipboard patterns
are typechecked in `additional_features/client/runtime.ts`; optional
camera/microphone clip capture is in `additional_features/client/content.ts`.

## Deprecated compatibility surfaces

They remain in SDK 5.24 for older games but new template code does not use them:

- `initializeAsync()` — the SDK initializes on import; use the bounded `initSdk()`
  host handshake before game calls.
- `rooms` — unsupported V1 path; use `realtime` with `mp-server` or Syncplay.
- `ai` — compatibility alias; use `textGen`.
- `getCurrentProfile()` — use `getProfile()`.
- root `isMobile()` / `isWeb()` — use `system`.
- launch/share/notification fields on `context` — use `app.resolveLaunchIntent()`.
- platform-managed `getExperiment()` — use LiveOps assignments for game tests.
- `notifications.scheduleAsync()` / `scheduleRCSAsync()` — use
  `notifications.submitMessageAsync()`.

## Adoption checklist

1. Start with the active minimal runtime; copy only the feature being designed.
2. Read the installed SDK declaration and matching local RUN documentation.
3. Add a real fallback and explicit unavailable state.
4. Add configuration outside client code; never ship secrets or authority in
   LiveOps/client bundles.
5. Test local mock, RUN Playground, and production host separately.
6. Add failure, cancellation, retry, lifecycle, identity-switch, and duplicate
   action cases to the semantic QA contract.
7. Remove placeholder IDs and verify authoritative reconciliation before value
   can be granted.
