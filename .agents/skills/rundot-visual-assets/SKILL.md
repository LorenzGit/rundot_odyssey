---
name: rundot-visual-assets
description: "Create, edit, import, optimize, and ship RUN.world game visual assets: concept art, backgrounds, UI, thumbnails, sprites, image generation, reference images, background removal, upscaling, depth, and CDN assets. Use for any visual-asset pipeline or rundot image/generate workflow."
---

# RUN.world visual assets

Make a coherent asset system, not isolated generated images. Read
`rundot-game-quality` first for the mandatory visual gate. Then read the target
SDK declarations and relevant `image_gen.md`, `sprite_gen.md`, `assets.md`, and
`setting-your-game-thumbnail.md` local docs before choosing an API or CLI path.

Complete `references/visual-asset-brief-template.md` before generating or
importing a production set.

## Asset pipeline

1. Name art direction: palette, lighting, composition, shape language,
   texture/rendering style, UI typography/materials, camera, and forbidden
   visual traits. Create a reference board from owned/permitted source material.
2. Define the target use before production: thumbnail, splash, background,
   gameplay sprite, UI icon, collectible, marketing creative, or runtime UGC.
   Specify pixel dimensions, alpha/background need, safe crop, file format,
   expected memory/load budget, and mobile legibility.
3. Generate or edit candidates only after estimating credit-priced work and
   receiving explicit creator approval. Keep prompt, model, seed/generation ID,
   source/reference rights, and selected output recorded with the asset.
4. Review at real in-game scale and against the full scene—not in isolation.
   Reject artifacts, unwanted text, broken hands/objects, inconsistent lighting,
   near-invisible silhouettes, jagged alpha, unreadable UI, and style drift.
5. Optimize, name, and place approved assets in the game’s asset structure.
   Bundle small core art; use `public/cdn-assets/` only when CDN delivery or
   entitlement-gating is actually needed. Verify every deployed asset path.

## Images, backgrounds, and removal

- Use image generation for concept art, backgrounds, UI, and composition-aware
  assets. Provide aspect ratio and up to the documented reference-image limit;
  never pass unapproved third-party/private material as a reference.
- Use background removal at generation time when alpha is a required deliverable,
  or the standalone removal operation for an existing image. Inspect edges,
  hair/fur, translucent effects, and the result over the intended game backdrop.
- Use upscaling only after selecting a composition; it does not repair an
  unsuitable image. Recheck dimensions, detail, artifacts, and file weight.
- Utility output URLs from image background removal/depth estimation are
  temporary. Persist an approved file into the project/CDN; never save an
  ephemeral URL as the game’s permanent asset reference.
- Generated thumbnail art still must be original, 512×512 JPG, tile-legible,
  and pass `rundot-game-quality` before it replaces `public/thumbnail.jpg`.

## Sprites and runtime generation

- For sprites, preserve a stable style reference and use the documented
  generation ID/reference asset workflow when animating a selected sprite.
  Review every frame, loop, alpha edge, pivot, collision bounds, and atlas size.
- Treat image/sprite generation in a player-facing game as an explicit action:
  show cost/consent where applicable, loading, cancellation/error UI,
  moderation policy, rate-limit handling, and a usable fallback.
- Do not expose creator/admin generation or moderation APIs to ordinary players.
  Keep privileged work off the client-facing gameplay path.

## CLI and SDK safety

`rundot generate image` supports generation, references, and optional background
removal; the `rundot image` post-processing utilities are beta/prod-only. Run
the exact installed `--help` (and required beta setting) immediately before
using either. API/CLI behavior, models, and pricing can vary by version.

No generation, background removal, upscale, depth estimate, or remote asset
operation is authorized merely by this skill. Estimate first, obtain explicit
approval for the identified work/cost, then read results back and save approved
outputs under source control.

## Verify and hand off

Report the art brief, source/rights, prompt/model/seed or edit history,
dimensions/formats, alpha/crop inspection, in-game screenshots, deployed paths,
asset budget check, and any asset still blocked by generation access, credits,
or a real host.
