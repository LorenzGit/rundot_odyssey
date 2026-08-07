# Multi-resolution, orientation, and safe areas

A game is not multi-resolution-ready merely because its canvas fills the
window. It is ready when gameplay, menus, text, controls, images, and feedback
remain usable and visually intentional across the supported viewport sizes,
aspect ratios, orientations, device-pixel ratios, and device cutouts.

This is product correctness, not final polish. A layout that works only on the
developer's phone can hide controls behind a home indicator, make text
unreadable on a short screen, expose empty space on a tablet, stretch artwork,
or make landscape impossible to use. These failures affect onboarding,
retention, monetization, accessibility, and player trust.

## The three layout layers

Treat these as separate systems:

1. **Full-viewport backdrop:** decorative art behind the game on desktop,
   tablets, embeds, and unused side areas. It may crop intentionally with
   `cover`, but it must never stretch.
2. **Playable frame:** the canvas and game UI. Its scaling policy defines how
   much of the world is visible at each aspect ratio.
3. **Safe interactive area:** HUD, controls, dialogs, close buttons, purchase
   actions, and required information inset from notches, rounded corners,
   system bars, and home indicators.

Required UI belongs in the safe interactive area. The backdrop must never carry
instructions or controls, and extra screen space must not arbitrarily change
game balance.

## Use layout coordinates, not one device's pixels

CSS pixels describe layout size. Device-pixel ratio controls raster sharpness;
it does not make text, buttons, or gameplay physically larger. A 12 CSS-pixel
label remains 12 CSS pixels at DPR 1, 2, or 3.

For DOM and React UI:

- Prefer Grid, Flexbox, `minmax()`, and `clamp()` over fixed offsets.
- Use content-driven compact-height and narrow-width breakpoints.
- Allow long screens to reveal space without pushing critical actions away.
- Give content-heavy subscreens their own bounded `overflow-y: auto` region.
- Do not scale the entire DOM to make overflow disappear. Reflow, wrap,
  shorten, or scroll the content instead.
- Use dynamic viewport units such as `dvh` where mobile browser chrome can
  change the usable height.

For canvas gameplay, choose a stable layout coordinate policy:

- For Pixi, fit the fixed design width in portrait and the fixed design height
  in landscape, allowing the long design edge to vary.
- For Three.js, resize the renderer from the playable host, update camera
  aspect/projection, and re-anchor screen-space or orthographic UI.
- For a hybrid, feed the same logical width, height, DPR cap, pause state, and
  frame clock to both layers.
- Read both current design dimensions again after every renderer resize.
- Anchor HUD and required play objects to current edges or centers, not a
  hardcoded long edge.
- Preserve game state across rotation; re-layout or clamp positions instead of
  rebuilding the run.

The template implements this fixed-short-edge policy in
`src/game/stage.ts`. It keeps Pixi object scale stable while allowing different
aspect ratios to reveal more space on the long axis.
`src/rendering/createRendererLab.ts` and
`docs/rendering-architecture.md` provide the corresponding Three-only and
hybrid lifecycle reference.

## Safe-area contract

Safe areas are part of layout input, not optional decoration padding. Apply
them on all four sides because landscape turns portrait's top and bottom
hazards into left and right hazards.

This template uses the following source priority:

1. In ViewDeck, its selected device's oriented insets are authoritative,
   including over the SDK's local mock.
2. Otherwise, when attached to RUN,
   `RundotGameAPI.system.getSafeArea()` supplies the real host insets.
3. Outside either environment, CSS `env(safe-area-inset-*)` remains the browser
   fallback.
4. Ordinary design padding is added inside those insets.

`src/sdk/runSdk.ts` publishes attached-host values as `--safe-top`,
`--safe-right`, `--safe-bottom`, and `--safe-left`. `src/styles/app.css`
consumes those variables in the menu, subscreens, HUD, and toasts.

`src/ui/App.tsx` re-runs `applyRunSafeArea()` on `orientationchange`. ViewDeck
updates its dataset and `--viewdeck-safe-area-inset-*` properties before
dispatching that event. The stylesheet keeps a live reference to those
properties, so rotation flows through synchronously without copying a stale
snapshot, reloading the app, or resetting React/Pixi state. Outside ViewDeck,
the event re-reads attached RUN host values. The effect removes its listener on
unmount.

Do not use bare `env(safe-area-inset-*)` as the template fallback. Desktop
WKWebView cannot reliably rotate those values during device simulation. In
landscape that failure commonly leaves the portrait home-indicator inset at
the bottom while reporting zero on the sides: the result is a false bottom gap
and controls under the notch. Keep this exact chain for every edge:

```css
--safe-left: var(--viewdeck-safe-area-inset-left, env(safe-area-inset-left, 0px));
```

ViewDeck's safe-area guide is visual only; it does not move the game. A passing
layout must consume the exposed variables itself. Do not use **Force page
inside safe area** to hide missing game-side inset handling.

Do not blindly add both host padding and browser padding. Some hosts already
reserve space for native chrome, particularly above the game. Confirm the
container contract, choose one authoritative value for each edge, and test the
result in the actual host. Double-padding can be as damaging as no padding.

Every required action must remain fully visible and reachable with simulated
nonzero insets. This includes back and close controls, ad and purchase actions,
settings, toast dismissal, and paused-state controls.

## Images and aspect ratios

Multi-resolution support must preserve the intended shape of every image.
Higher resolution does not compensate for the wrong aspect ratio.

- Use uniform sprite scaling; never force unrelated width and height values.
- Use `cover` only for decorative images that may crop.
- Use `contain` for characters, logos, products, tutorials, and must-see art.
- Record the crop-safe region of backdrops and thumbnails.
- Create separate portrait, square, and landscape compositions when one asset
  cannot survive every crop.
- Treat stretched circles, distorted characters, clipped focal subjects, and
  unstable crops as blocking defects.

## Text and touch targets

Do not solve a small viewport by making the interface too small to use.

- No text may render below **10 CSS pixels** after every DOM, canvas, Pixi, or
  bitmap-font scaling layer.
- Compact controls require at least 12 CSS-pixel text; body copy and
  instructions require at least 14 CSS pixels.
- Interactive targets must be at least **44×44 CSS pixels**.
- Long localized strings must wrap or reflow without covering adjacent
  controls.
- Required state cannot be communicated by color, sound, or haptics alone.

Measure effective rendered size. Design-space units and DPR are not proof that
the final text is large enough.

## Resize and rotation behavior

Rotation and live resizing are state transitions, not fresh launches. A robust
game:

- recomputes layout from the new usable frame;
- re-reads host safe areas on `orientationchange`;
- keeps the current run, score, timers, and selections intact;
- clamps movable objects into valid bounds;
- updates camera, effects, hit regions, and HUD anchors together;
- keeps dialogs and menus scrollable;
- does not flash, duplicate canvases, leak listeners, or restart audio; and
- continues to respect pause, reduced motion, and host lifecycle state.

Debounce expensive asset or world work when necessary, but do not delay
critical layout and input corrections.

## Required test matrix

Use the project's documented minimum viewport. When none exists, include a
320-CSS-pixel-wide portrait viewport and the corresponding short landscape
case.

| Case | Representative viewport | What to verify |
| --- | --- | --- |
| Small portrait phone | 320×568 | No horizontal overflow; minimum text and targets hold |
| Tall portrait phone | 390×844 | Long-edge anchors and bottom actions remain intentional |
| Short landscape phone | 568×320 | Compact layout fits; safe left/right controls remain reachable |
| Modern landscape phone | 844×390 | Wide composition uses space without stretching the portrait UI |
| Tablet portrait | 768×1024 | Frame, backdrop, modal widths, and text line lengths remain controlled |
| Tablet landscape | 1024×768 | Reflow and safe areas work without oversized UI |
| Desktop embed | 1440×900 | Backdrop/frame separation and pointer/focus behavior remain intentional |
| Live resize/rotation | portrait → landscape → portrait | State persists and every layout recomputes correctly |

Repeat critical cases at DPR 1, 2, and 3 for raster sharpness and memory
behavior. Test with nonzero safe-area values on every edge, longer localized
copy, reduced motion, browser zoom where supported, and the real RUN host.

Review the menu, loading state, gameplay HUD, pause state, every subscreen,
dialogs, toasts, error states, ads, and purchase surfaces. A single clean title
screen is not multi-resolution evidence.

## Common failure patterns

- Locking a landscape viewport to a narrow 9:16 portrait column.
- Hardcoding the current phone's long edge in scene logic.
- Scaling the entire DOM until it fits.
- Treating renderer resolution or DPR as layout scale.
- Applying only the bottom safe area.
- Reading bare browser `env()` values in ViewDeck instead of preferring its
  oriented `--viewdeck-safe-area-inset-*` variables.
- Reading viewport or safe-area values once and never responding to resize.
- Stretching a portrait backdrop across a wide screen.
- Hiding clipped content while also disabling the only useful scroll region.
- Shrinking labels below their role minimum instead of reflowing the layout.

## Definition of done

A multi-resolution implementation is ready only when:

- supported orientations have intentional layouts;
- the backdrop, playable frame, and safe interactive area remain distinct;
- all four safe-area edges are honored without double-padding;
- Pixi and DOM layouts update after resize without losing state;
- text and touch targets meet their effective CSS-pixel minimums;
- images retain their aspect-ratio contract;
- content-heavy views scroll intentionally;
- representative phone, tablet, desktop, DPR, and rotation cases pass; and
- final screenshots are reviewed after the last visual change.
