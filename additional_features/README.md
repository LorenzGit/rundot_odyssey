# Additional features

The active Pixel Foundry demo already exercises safe RUN client capabilities:
host discovery, profile/access state, system and gamepad facts, launch intent,
attribution, release notes, feature controls, trusted/future time, number formatting,
CDN resolution, platform UI, community UI, add-to-home, shop/order/entitlement/
currency/subscription/stat/collectible/leaderboard/UGC/clip-support/credit reads,
sharing, clipboard writes, ads, haptics, storage, custom/funnel analytics,
LiveOps, notifications, and lifecycle/back handling.

This directory contains the remaining patterns that should **not** be folded
into a generic demo without a product decision. They may navigate away, mutate
remote state, spend money or generation credits, upload player content, require
creator privileges, or need a server/multiplayer build.

Nothing here is imported by the default client bundle. It is typechecked by
`npm run typecheck` so SDK drift is caught early.

## Contents

- `client/navigation.ts` — cross-game/app navigation, host exit, and teardown.
- `client/storage.ts` — device/owner/shared storage and shared asset bundles.
- `client/runtime.ts` — RUN-host camera, microphone, clipboard, and autoplay
  browser capabilities; permission prompts remain explicitly player initiated.
- `client/assets.ts` — RUN-hosted asset loading and cache cleanup.
- `client/notifications.ts` — RCS consent and cross-channel messaging.
- `client/commerce.ts` — optional direct-fiat purchase discovery, low-level Run
  Bits spending, subscription checkout, and entitlement consumption. These are
  additions or accepted-risk exceptions; a production game defaults its
  required Run Bits product to Shop + Entitlements.
- `client/progression.ts` — leaderboard reads, stats/leaderboard writes, simulation recipes, and
  VIP collectible claims.
- `client/content.ts` — UGC, files, clips (including optional reaction camera/microphone), and native video.
- `client/generation.ts` — billed generation and 3D avatar mutation.
- `client/moderation.ts` — creator-only moderation operations.
- `multiplayer/` — deliberately minimal realtime client/server and
  deterministic SyncPlay patterns. Use
  [the project-local multiplayer skill](../.agents/skills/rundot-multiplayer/SKILL.md)
  for architecture, advanced capabilities, authority, and testing before
  adapting them.
- `config/` — inert Shop, LiveOps, leaderboard, simulation, and Syncplay
  operator configuration samples.

Copy only the capability a derived game adopts, preserve its authority and
consent checks, and test host-dependent behavior in the opt-in RUN Playground.
