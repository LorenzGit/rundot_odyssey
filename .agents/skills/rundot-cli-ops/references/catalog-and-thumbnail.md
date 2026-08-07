# RUN.world catalog metadata and thumbnail

Catalog changes affect the game’s public-facing identity. Inspect the current
state first with `rundot game info`, run the exact command help immediately
before changing it, and require explicit authorization for a remote mutation.

## Title, description, keywords, and orientation

The installed CLI exposes these game-level changes:

```bash
rundot game set-name "New game title"
rundot game set-description "Short player-facing description"
rundot game set-keywords "cozy,puzzle,relaxing"
rundot game set-orientation Portrait
```

Use the target game directory/configuration. After a mutation, run
`rundot game info` and verify the exact game ID and values changed. Do not make
the game public as part of a metadata change; visibility is separate and needs
its own explicit approval.

## Catalog thumbnail

The Explore/search/share thumbnail is source-controlled artwork, not a separate
dashboard upload:

```text
public/thumbnail.jpg
```

It must be an original **512×512 JPG**. `rundot deploy` picks it up and uploads
it with the build; deploy fails for wrong dimensions or the default template
thumbnail. Before a deploy, inspect the actual file dimensions and small-tile
legibility, then build and deploy only with explicit approval for the target
game/environment/tag.

Use `rundot-game-quality` for the mandatory art-direction and screenshot gate;
this reference covers the operational catalog path only.
