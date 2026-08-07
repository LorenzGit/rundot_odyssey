---
name: rundot-cli-ops
description: Set up, inspect, operate, or troubleshoot projects with the rundot CLI. Use for login, init, game config, local playground, build, deploy, tags, server/runtime config, SDK docs, game metadata, player storage/files, leaderboards, generation, credits, skills installation, or diagnosing CLI authentication and version problems.
---

# rundot CLI Operations

## Preflight

1. Run `scripts/preflight.sh <project-dir>`.
2. Read the installed SDK's `docs/rundot-developer-platform/cli-reference.md`.
3. Run `rundot <command> --help` immediately before a mutating command; the CLI changes faster than examples.
4. Verify the intended environment, game ID, local build directory, version/tag, and auth mode.

## Operate safely

- Use an interactive owner session for initialization and owner-only administration.
- Use an `rk_` per-game key for headless deploys; never commit it or print it.
- Run `npm run build` before deploy and verify the configured build folder exists.
- Treat `rundot init` as remote game creation, not merely local scaffolding.
- Keep generated `game.config.<env>.json` and visible `rundot/` configuration; do not hand-edit a game ID.
- Preview or list remote state before changing tags, visibility, editors, storage, files, leaderboards, or server config.
- Require explicit approval for public visibility, deploy, purchases/credits, destructive player-data changes, moderation, and paid generation.
- Set `RUNDOT_BETA_FEATURES=1` only for a workflow that needs a beta-gated command.

## Route commands

Read [references/workflows.md](references/workflows.md) for command groups and common recovery steps. Use the official `$rundot-deploy`, `$rundot-monetization`, or `$rundot-marketing` skill for those focused workflows.
Read [references/catalog-and-thumbnail.md](references/catalog-and-thumbnail.md)
for game title, description, keywords, orientation, and catalog thumbnail work.

## Verify

After local changes, build and run `rundot game info` when authenticated. After a remote mutation, list the affected resource and report the exact game/environment/tag touched without exposing tokens.
