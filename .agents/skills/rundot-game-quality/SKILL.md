---
name: rundot-game-quality
description: "Enforce mandatory build identity, presentation, and sensory quality for RUN.world games: visible continuously bumped versions, original thumbnail and splash art, aspect-ratio-correct imagery, cohesive visuals and iconography, sound, haptics, touch-first layouts, safe areas, accessibility, screenshot review, and release evidence. Use at the start of every new RUN game, for every code/content/config/asset change, every polish pass, starter integration, release review, or claim that a game is complete or deployable."
---

# RUN.world game quality

Treat presentation as part of the game, not launch decoration. Do not call a RUN
game complete, release-ready, or deployable until every applicable gate below is
implemented and verified with evidence.

## Mandatory gate

### Visible build version — create first, bump every change

- Make version identity one of the first implementation steps in every new game, before feature work or visual polish. Start with an intentional semantic version such as `0.1.0` during development or `1.0.0` for an established first release.
- Keep one source of truth, preferably the package/app manifest version, and inject or import it into the game UI. Do not maintain an unrelated handwritten display string.
- Always display the version on the main menu or equivalent first screen. Place it in exactly one unobtrusive safe-area corner: bottom-right, bottom-left, top-right, or top-left.
- Bump the version immediately whenever any code, gameplay, UI, copy, configuration, audio, art, asset, metadata, or build behavior changes. Default to a patch bump; use minor or major deliberately for broader compatibility/product changes. Do not wait until deployment.
- Add an automated assertion that the version is valid and rendered from the source of truth. Before deploy, verify the visible local version matches the version being uploaded; after deploy, read back and report the remote version.
- Treat a missing, stale, duplicated, or unreadable version as a blocking QA defect. Never call a changed build complete or deployable without a new visible version.

### Thumbnail

- Replace `public/thumbnail.jpg` with original, intentional game art.
- Produce exactly 512×512 JPG and verify the actual file dimensions.
- Make the focal subject and game identity readable at small tile size. Prefer
  bold composition and little or no text.
- Reject template placeholders, generic stock imagery, stretched crops,
  illegible text, obvious generation artifacts, and art unrelated to gameplay.

### Splash and loading experience

- Create a branded splash/loading screen using polished art from the game's
  visual world; do not ship a generic spinner, blank color, plain text logo, or
  starter screen.
- Show honest loading progress or a clear loading state and transition cleanly
  into the menu without white/black flashes, layout jumps, or stuck overlays.
- Keep the splash composition correct across the game's supported phone aspect
  ratios and safe areas.

### Art direction and visual polish

- Name the art direction before producing final assets: palette, lighting,
  shape language, texture/rendering style, typography, icon treatment, motion,
  and UI materials.
- Treat every image's aspect ratio as an explicit, non-negotiable presentation
  contract. Preserve intrinsic proportions through uniform scaling. Use
  intentional `cover` cropping for decorative backdrops and `contain` for
  must-see subjects; create a correctly composed variant when one source cannot
  serve the target ratio. Never stretch, squash, or independently resize sprite
  axes to force an image into a container.
- Avoid platform-rendered emoji in production UI, controls, currencies, status
  markers, and artwork whenever a project-owned SVG, raster sprite, Pixi/CSS
  shape, or controlled-font glyph can express the same idea. Emoji rendering is
  platform-dependent and usually breaks a cohesive art direction.
- Use emoji only when it is integral to player-authored text or an intentional,
  documented product/art choice. Test that exception across supported platforms,
  provide an accessible label or fallback, and never make the emoji the only
  carrier of state or meaning.
- Replace every placeholder/demo/template asset and string before release.
- Keep gameplay, menus, HUD, effects, rewards, failure states, splash, and
  thumbnail visually coherent and specific to this game.
- Treat clipping, overlap, unsafe tangencies, warped imagery, muddy hierarchy,
  unreadable contrast, inconsistent asset styles, generic component shells, and
  low-quality generated artifacts as blocking defects.
- Give important actions and outcomes a complete feedback chain: immediate
  visual response, animation/effect, sound, state change, reward/progress, and
  the next clear action.

### Sound and music

- Ship responsive sound effects for primary input, success, failure, rewards,
  purchases/value exchanges, and important transitions. Do not ship a silent
  game by accident.
- Provide music or intentional ambient audio that supports the game's tone. If
  silence is an artistic requirement, record that exception and still provide
  essential interaction/feedback SFX unless accessibility requires otherwise.
- Unlock audio from a player gesture where required, expose music and SFX mute
  or volume controls, persist settings, and pause/resume audio with host
  lifecycle changes.
- Normalize levels and verify there is no clipping, painful repetition, delayed
  response, or sound continuing behind pause/background states.

### Haptics

- Add restrained haptic feedback for meaningful supported interactions such as
  confirmed taps, impacts, merges, rewards, failures, or milestone moments.
- Capability-gate haptics, provide a persisted off setting, and never use them
  continuously or as the only feedback channel.
- Verify behavior on a real supported device. If the target host/device cannot
  provide haptics, record that verified capability limitation in the handoff.

### Phone layout, safe areas, and input

- Design touch-first for the declared orientation and keep critical gameplay,
  controls, HUD, dialogs, and monetization surfaces inside RUN safe areas.
- Treat full-viewport backdrop, playable frame, and safe interactive area as
  separate layers. On desktop/landscape, a portrait game must show intentional
  full-bleed backdrop art behind its centered playable frame; use aspect-ratio
  preserving `cover`, not distorted stretching. Create separate wide art when
  one portrait composition cannot crop well.
- Use at least 44×44 CSS-pixel interactive targets with pressed, disabled,
  focus, and loading states.
- Prevent accidental page scroll, selection, callout, zoom, and browser gestures
  on the game surface without breaking accessibility.
- Verify short and tall phones, at least one tablet size, desktop embedding,
  DPR 1–3, resize/orientation behavior, and background/foreground transitions.
- Block release for clipped controls, inaccessible close buttons, overlapping
  HUD, unreadable text, distorted art, or required content outside the viewport.

### Accessibility and comfort

- Maintain readable contrast and scalable text. **The absolute minimum effective
  rendered text size is 10 CSS pixels** at every supported viewport, after any
  DOM transform, canvas fit, Pixi stage scale, or bitmap-font scale. Treat 10px
  as a hard floor for noncritical metadata, not a default; controls,
  descriptions, instructions, and primary copy require larger role-based
  minimums.
- Never communicate state through color, sound, or haptics alone.
- Provide mute controls and respect reduced-motion preferences. Avoid flashing,
  excessive vibration, and motion that obscures interaction.
- Keep keyboard/focus behavior usable for DOM controls without weakening the
  touch-first design.

### Player-visible numbers

- Format every player-visible quantity through one locale-aware shared
  formatter. English must render `1000` as `1,000`; other locales use their
  expected grouping character.
- Apply grouping to scores, currency and prices, rewards, XP, damage, health,
  item counts, progress totals, levels, waves, ranks, stats, and share or
  notification copy. Numeric translation tokens must be preformatted or
  formatted automatically by the localization boundary.
- Keep values numeric in state, saves, calculations, analytics, authoritative
  SDK payloads, IDs, and route parameters. Versions, dates, clock/countdown
  components, room codes, phone/postal numbers, and zero-padded serials retain
  their semantic format.
- Do not scatter raw interpolation, `.toLocaleString()`, or compact `1K`/`1.2M`
  notation across UI code. Reflow constrained UI first; if an intentional
  abbreviation is approved, expose the full grouped value accessibly.
- Test at least `999`, `1,000`, a multi-million value, a negative value when
  relevant, and the largest legitimate saved/economy value. Confirm added
  separators do not clip, wrap, overlap, or shift critical controls.

Read `references/mobile-typography.md` whenever creating, adapting, or reviewing
text-bearing UI. Apply its role scale and rendered-size measurement rules to DOM,
Pixi/canvas, and bitmap text.

## Exception policy

Do not silently mark a missing item “not applicable.” Record an exception in the
project handoff with the omitted requirement, product/artistic/accessibility or
verified capability reason, compensating feedback, and evidence. Convenience,
schedule pressure, or “the starter did not include it” are not valid reasons.

## Required evidence

Before release:

1. Confirm the version was bumped for the latest change, appears in a safe-area
   corner on the first screen, and matches package/build/deployment metadata.
2. Inspect the actual thumbnail at 512×512 and a small tile preview.
3. Capture and review the final splash/loading, menu, core gameplay, reward,
   failure/results, settings, and any shop/ad screens at representative phone
   sizes after the last visual change. Record the smallest effective rendered
   text size and confirm it is at least 10 CSS pixels.
4. Verify every displayed image preserves its intended aspect ratio and crop
   contract across the device matrix; confirm no accidental platform emoji
   remains in production UI.
5. Exercise the complete first-session path with sound on and off, haptics on and
   off where supported, reduced motion, pause/resume, resize, and reload.
6. Confirm there are no placeholder/demo assets or template copy with a source
   search and visual inspection.
7. Report evidence, defects fixed, intentional exceptions, and anything that
   still requires a physical device or RUN host.

Use Kryl's relevant image, UI, music, and browser-testing skills when available.
Use RUN credit-priced generation only when explicitly requested and after an
estimate; local asset creation does not authorize paid generation.

Read `references/backdrops-orientation-safe-areas.md` for desktop/portrait,
landscape, both-orientation, and safe-area implementation/verification rules.
