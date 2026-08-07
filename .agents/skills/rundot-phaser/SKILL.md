---
name: rundot-phaser
description: Build, restructure, review, or debug Phaser 3 games hosted on RUN.world. Use for Phaser scenes, responsive mobile layout, RUN.world safe areas and lifecycle handling, SDK service facades, input, asset loading, embedded-library bundling, game performance, or Phaser/Vite deployment issues.
---

# RUN.world Phaser

## Build the game

1. Read `package.json`, `vite.config.*`, `src/main.*`, and the active scenes before editing.
2. Keep simulation and SDK state outside Phaser display objects. Let scenes render state and translate input into commands.
3. Use logical game coordinates with `Phaser.Scale.FIT` and `CENTER_BOTH`; incorporate `RundotGameAPI.system.getSafeArea()` into interactive HUD placement.
   Keep a portrait/landscape playable frame separate from a full-viewport
   DOM/CSS backdrop on desktop; the backdrop uses aspect-preserving `cover`,
   while gameplay and safe controls remain in their design frame.
4. Render grid geometry from data. Store irregular footprints as normalized cell offsets and validate every occupied cell before placement.
5. Use Phaser timers or the scene update loop so pause/resume behaves consistently. Pause gameplay from RUN lifecycle callbacks.
6. Prefer generated vector primitives and small local assets for core play. Load large deployed assets through the CDN API and revoke blob URLs after Phaser completes loading.
7. Keep the RUN SDK behind one typed adapter. Gameplay must remain playable in browser/mock mode unless a platform feature is the point of the flow.
8. Make touch targets at least 44 CSS pixels and offer keyboard shortcuts only as an enhancement.

## Integrate the host

Read [references/host-integration.md](references/host-integration.md). Treat ads, purchases, generation, sharing, notifications, login, and privileged tooling as explicit UI actions. Do not place them in `create()` or the update loop.

## Verify

Run TypeScript and both normal and bundled builds. Exercise placement at edges, path blocking, rotation, selection, selling/upgrading, pause/resume, resize, restart, and storage restore. Check that failures from the host become non-blocking notices rather than an unhandled rejection.
