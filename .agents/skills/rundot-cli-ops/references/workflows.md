# CLI workflows

## Local setup

```bash
rundot --version
rundot login
rundot init --name "Game" --description "Description" --build-path ./dist --orientation Portrait --keywords "strategy,arcade"
npm run build
rundot game info
```

`init` creates the remote game and a local `game.config.prod.json`. A profile ID or username is not an authentication credential.

## Deploy

Use the official `$rundot-deploy` skill. Build first, inspect `game.config.prod.json`, then deploy to the intended environment/tag. Do not make a game public unless requested.

## Inspect and recover

- No session: run `rundot login`; browser login uses a local callback listener on port 20000.
- Port 20000 busy: find the stale `rundot` process, stop that authentication flow, then retry one login.
- Wrong game: inspect `game.config.<env>.json` and `rundot game info`; never copy a game ID by guesswork.
- Missing docs: reinstall/update the npm SDK and inspect its `docs/` directory.
- Hidden command: check whether it is beta-gated, then use `RUNDOT_BETA_FEATURES=1 rundot --help` only when needed.
- Build/runtime mismatch: compare normal `npm run build` with the bundled-library build.

## High-impact command groups

`game`, `deploy`, `storage`, `files`, `leaderboard`, `ugc`, `collectibles`, `marketing`, `socials`, `generate`, `image`, `credits`, and `liveops` can mutate remote state, spend credits, affect players, or publish content. List/preview first and confirm target scope.
