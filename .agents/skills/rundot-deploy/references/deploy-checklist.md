# Deploy preflight checklist

- *Authenticated:* if you aren't logged in, run `rundot login`. Once you are,
  `rundot list-games` lists your games.
- *Project initialized:* `rundot init` has been run in this directory, so
  `game.config.prod.json` exists in the project root.
- *Build is current:* you've rebuilt the game (typically `npm run build`) so the
  build/dist folder reflects your latest changes — `rundot deploy` uploads that
  folder as-is, it does not build.
- *SDK installed:* `@series-inc/rundot-game-sdk` is in the game's dependencies.

# When a deploy fails

Read the actual error `rundot` printed first — it names the cause. Common ones
and their fixes:

- It's an authentication problem → run `rundot login`, then retry.
- No game is configured in this directory → run `rundot init` in the project root.
- The build folder is missing or stale → rebuild (e.g. `npm run build`), then
  `rundot deploy`.

Run `rundot deploy --help` to see the available flags.
