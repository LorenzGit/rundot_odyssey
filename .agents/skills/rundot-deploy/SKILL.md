---
name: rundot-deploy
description: Deploy a RUN game with the rundot CLI. Use when the user wants to ship a game, run a deploy, or diagnose a failed deploy.
---

# Deploy a RUN game

`rundot deploy` uploads a **already-built** game — it does not build for you.
The full flow for a new game is `login` → `init` → build → `deploy`; for an
existing game it's build → `deploy`.

## Deploy

1. Log in if you aren't already: `rundot login`.
2. For a new game, initialize it once in the project root: `rundot init`
   (this writes `game.config.prod.json`).
3. Build the game so the output (dist) folder is up to date — typically
   `npm run build`. `rundot deploy` deploys this folder, so build before every deploy.
4. From the game's project root, run `rundot deploy`. It uses the build folder
   configured in `game.config.prod.json` (it prompts if that isn't set). Run
   `rundot deploy --help` to see the available flags.
5. Read the command's output — `rundot` reports the result of the deploy there.

Useful checks: `rundot list-games` lists your games; `rundot game info` prints
details for the game configured in the current directory.

## Things a first deploy gets wrong

- **`init` writes the assigned `gameId` back into `game.config.prod.json`.**
  Commit that file. Without it a deploy from a fresh clone creates a *second*
  game instead of updating the first. The CLI also strips the trailing newline;
  restore it so the next diff is one line, not two.
- **Deploy private unless the owner explicitly asked for public.** `rundot
  deploy` publishes privately by default — reachable by share link, absent from
  search. `rundot game set-public` is a separate, deliberate step.
- **Build immediately before every deploy**, in the same command if possible.
  `rundot deploy` ships whatever is in the build folder, including a stale one
  from before your last change.
- **A newly created game has no description or keywords**, even when
  `game.config.prod.json` declares them. Set them explicitly with
  `rundot game set-description` and `rundot game set-keywords`.
- **`rundot game set-orientation` does not affect the live version.** It reports
  "will take effect on the next deploy" — so redeploy, or the version players
  load is served without it.
- Version numbers are assigned by the platform per upload and are not your
  package version. Expect them to diverge.

## If a deploy fails

Read the exact error `rundot` printed — it names the cause. Fix that cause
before retrying; don't retry blindly. See `references/deploy-checklist.md` for
the things to verify.
