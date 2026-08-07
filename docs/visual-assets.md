# Visual assets

The template deliberately ships real, original PNG artwork. Procedural shapes,
CSS gradients, and debug geometry are useful for mechanics and layout probes,
but they are not a substitute for an authored visual direction. A derived game
should establish its own art brief early, generate or commission coherent
source art, and replace every Pixel Foundry asset before release.

## Active reference art

| Asset | Source size | Role | Fit policy |
| --- | ---: | --- | --- |
| `src/assets/art/pixel-foundry-backdrop-portrait.png` | 1024×1536 RGB PNG | Portrait menu/loading backdrop | Decorative `cover`; calm central 45% protects UI |
| `src/assets/art/pixel-foundry-backdrop-wide.png` | 1536×1024 RGB PNG | Landscape menu/loading backdrop | Decorative `cover`; independently recomposed, not stretched |

The portrait and landscape files are separate compositions. CSS selects the
correct source on orientation change, preserves its aspect ratio with `cover`,
and permits only decorative edge cropping. Required controls and information
remain DOM/canvas UI inside the safe area; they are never baked into the image.

`src/assets/manifest.ts` preloads only the composition active at startup. The
alternate orientation is deferred so rotation can reveal it without a reload
or a new renderer. Imported source assets are fingerprinted by Vite, and the
stylesheet and Pixi asset loader share the resulting browser cache entry.

## Asset brief

- Purpose: show a polished mobile-casual visual target behind the replaceable
  Pixel Foundry reference UI.
- Style: premium original 2D mobile-casual illustration with rounded, chunky
  forms, painterly texture, soft depth, and crisp silhouettes.
- Subject: a whimsical floating toy workshop in a purple-blue sky, with small
  islands, gears, pipes, conveyors, balloons, clouds, and warm windows.
- Palette: violet, indigo, coral, mint, sky blue, and sunny yellow.
- Composition: low-contrast central 45%; interesting forms in the outer thirds;
  no important subject at an extreme edge.
- Exclusions: no text, letters, numbers, logos, watermarks, UI, buttons, icons,
  emoji, people, faces, mascots, or platform marks.
- Deliverables: independently composed 2:3 portrait and 3:2 landscape RGB PNGs.

The files were generated as one approved batch with the local
`codex-image-gen` workflow using Codex CLI `0.146.0-alpha.3.1`. The batch used
48,120 Codex tokens and returned generation IDs
`call_DEA8eY7tesdSwTzAM8cTgmQ9` (portrait) and
`call_GQRQMnL7uM1D9dalpN2OR8W4` (landscape). Both outputs were inspected at
original resolution and accepted without retouching. The source PNGs total
about 4.1 MB; only the current orientation belongs to the critical boot bundle.

## Rules for derived games

1. Replace the brief with the game's mechanic, audience, fantasy, camera, and
   emotional tone before generating anything.
2. Prefer authored PNG/WebP/AVIF art for visible presentation. Use temporary
   primitives only while they communicate a deliberate prototype state.
3. Record every deliverable's dimensions, aspect ratio, intended fit, focal
   point, crop-safe region, and source/provenance.
4. Use `cover` only for decorative art that may crop. Use `contain` for
   characters, products, tutorials, logos, and other must-see content.
5. Produce separate compositions when portrait and landscape cannot share a
   crop without distortion or loss of focus. Never stretch one image to fit.
6. Keep instructions, prices, rewards, and controls out of raster art so they
   remain accessible, localizable, safe-area-aware, and testable.
7. Optimize final delivery formats and loading tiers, but keep the highest
   quality editable/original source available in the project's asset pipeline.
8. Review the final art in every supported viewport after the last visual
   change. Distorted shapes, unstable crops, illegible UI contrast, and
   placeholder-looking presentation are blocking defects.

The complete resolution, safe-area, text, and image-fit contract lives in
[`multi-resolution.md`](multi-resolution.md).
