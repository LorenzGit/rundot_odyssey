# rundot CLI atlas

Reference baseline: rundot CLI 7.10.0. Run `rundot --help` and
`rundot <group> --help` before use because beta groups and schemas evolve.

This document is an operator guide, not an automation script. Read-only commands
are safe to explore. Uploads, configuration changes, credits, API keys, storage
writes, deployments, publishing, marketing, and social actions change external
state and require the owner’s explicit intent. Never print session files or
credentials.

## Project and release

| Group | Example | Purpose / safety |
| --- | --- | --- |
| CLI | `rundot --help`, `rundot update` | Discover/current binary. Updating the installed CLI is a machine change. |
| Auth | `rundot login` | Starts authentication; do not expose resulting tokens. |
| Scaffold | `rundot init`, `rundot migrate-config` | Initialize/migrate a reviewed game directory. Inspect all generated diffs. |
| Discovery | `rundot list-games`, `rundot game --help` | Read game inventory and available game operations. |
| Game metadata | `rundot game info`, `rundot game configure --help` | Read or configure identity, name, description, orientation, keywords, tags, editors, release notes, server/runtime config, and API keys. Writes need review. |
| Builds | `rundot game list-versions`, `rundot game upload-build --help` | Inspect versions or upload a build. Build fresh immediately before upload. |
| Deploy | `rundot deploy --help` | External release mutation. Default to private/unlisted; publishing public is separate explicit intent. |
| Playground access | `rundot playground --help` | Grant/revoke scoped dev access. Keys belong in ignored local env files. |

The `game` group also exposes 3D generation/remesh/rig/animate operations. These
are billed generation workflows: estimate where supported, state the budget,
and get approval before a batch.

## Data, assets, and operations

| Group | Example | Purpose / safety |
| --- | --- | --- |
| Player storage | `rundot storage --help` | Inspect data/keys/usage or get/export. Set/remove/clear/import are remote mutations; snapshots may contain player data and must not be committed. |
| Creator files | `rundot files --help` | List/get/quota/usage or upload/delete/clear/visibility/transform. Upload/delete/transform changes durable assets. |
| CDN assets | `rundot assets --help` | List or remove deployed assets. Removal can break published builds. |
| Profile | `rundot profile --help` | Inspect current creator/profile context. |
| Credits | `rundot credits --help` | Read balance/plans/billing; paywall/top-up or billed work requires explicit intent. |
| Analytics | `rundot analytics --help` | Read game telemetry and funnels; treat exports as sensitive operational data. |
| Intel | `rundot intel --help` | Research/insight workflows; review any generated or uploaded artifacts. |
| LiveOps | `rundot liveops --help` | Preview/validate/read or push scheduled config. Pushing changes live behavior. |
| Leaderboard | `rundot leaderboard --help` | Inspect/configure/reset boards and anti-cheat. Writes/resets affect player-facing state. |
| Stats (beta) | `rundot stats --help` | Inspect or manage stat-backed features. Treat mutations as player-state changes. |
| Collectibles | `rundot collectibles --help` | Inspect/configure card catalogs and claims. Uploads alter entitlements/content. |
| UGC (beta) | `rundot ugc --help` | Browse/moderate UGC. Removal/report resolution is a privileged moderation decision. |
| Jam | `rundot jam --help` | Jam discovery/submission workflows. Submission is external publication. |

`offerwall` is an internal command group. Do not use it for creator games unless
RUN explicitly documents and authorizes that workflow.

## Generation

Use `rundot generate costs` and `rundot generate estimate --help` before any
supported generation. The group covers:

- image generation and model discovery;
- music, sound effects, TTS, voice listing/design/save;
- text generation and text-model discovery;
- video generation;
- sprites, sprite animation, character animation, workflows, and models;
- job listing/status and cost inspection.

Representative discovery commands are `rundot generate --help`,
`rundot generate image --help`, and `rundot generate jobs --help`. A generation
call can consume RUN credits even when the result is unusable. Get approval per
batch and record the requested count plus estimate.

The separate beta `rundot image --help` surface and `rundot game` 3D operations
are also billed-capability surfaces; discover their current flags from help.

## Packaging, skills, and AI helpers

| Group | Example | Purpose / safety |
| --- | --- | --- |
| Pack | `rundot pack --help` | Validate/package game artifacts. Inspect output before upload. |
| Skills | `rundot skills --help` | Discover/install/update RUN workflow skills. Installing changes local tooling. |
| AI | `rundot ai --help` | CLI AI assistance. Review generated code/config and budget any billed calls. |

## Marketing and social beta groups

`rundot marketing --help` covers prepare, generate, submit, composite, reference
assets, tips, preview, status, stats, budget, pause/resume/cancel, listing, and
operations. `rundot socials --help` covers preparation, status, opening the next
item, promo text, marking posts, verification, and profiles.

These commands can create paid spend, public-facing assets, or records that imply
a post occurred. Preparation/status/preview may be read-only; generation,
submission, budget changes, pause/resume/cancel, mark-posted, and verification
all require explicit campaign scope and owner approval. Never infer marketing
authorization from a game build request.

## Safe operator sequence

1. Confirm the target directory, game ID, environment, CLI version, and current
   config with read-only commands.
2. Run the group’s current `--help`; do not rely on remembered beta flags.
3. Preview/estimate/validate and inspect the exact local diff or artifact.
4. State external effects, visibility, spend ceiling, and rollback path.
5. Obtain approval when the operation writes remote state, spends value, or
   affects players/public channels.
6. Execute the narrow command, read back the resulting state, and report IDs,
   visibility, and failures without exposing credentials.
