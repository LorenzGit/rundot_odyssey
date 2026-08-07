# Renderer architecture: Pixi, Three.js, or both

This repository contains one RUN foundation and several rendering patterns. It
is a proof of how the pieces can fit together, not a prescription for how every
game should look or a game to copy wholesale.

The default Pixel Foundry demo remains Pixi-first because it is a small 2D
example. Open **RUN Features → Rendering Lab** after `npm run dev` to compare:

- **Three only:** Three.js renders the perspective world and a second
  orthographic scene renders the geometry HUD.
- **Three + Pixi:** Three.js renders the world; a transparent Pixi canvas
  renders the 2D HUD above it.

The lab is lazy. Three.js and its scene code are not requested until that route
opens, and the normal `npm run dev` / `npm run build` workflow does not change.

## Choose from the game, not from the template

| Composition | Good fit | Keep | Remove |
| --- | --- | --- | --- |
| Pixi only | 2D gameplay, sprite-heavy scenes, canvas UI | `src/game/`, the shared RUN foundation | Rendering Lab and `three` when no 3D workflow remains |
| Three only | A 3D world whose HUD is also rendered in Three | `src/rendering/three/` as a lifecycle reference | Pixi game/lab modules and `pixi.js` after all imports are gone |
| Three + Pixi | A 3D world with a substantial 2D canvas HUD | Three world, Pixi overlay, and one composition coordinator | The reference scene and every system the real design does not use |

React/DOM UI remains a valid fourth boundary for semantic menus, forms, and
accessible text. “Three only” means the game presentation can use only Three;
it does not forbid a small DOM host or require a custom 3D control system when
the product would be clearer and more accessible with DOM controls.

Choose one composition deliberately. Do not run two renderers merely because
both are installed, and do not duplicate saves, audio, SDK access, analytics,
safe-area handling, or app state for each renderer. Those are application
services, not renderer services.

## Reference boundaries

| File | Responsibility |
| --- | --- |
| `src/rendering/three/createThreeReference.ts` | WebGPU-first Three renderer, WebGL 2 retry, world, optional Three HUD, cameras, resize, resource disposal |
| `src/rendering/pixi/createPixiOverlay.ts` | Transparent Pixi HUD with no private ticker |
| `src/rendering/createRendererLab.ts` | Lazy module loading, one animation loop, one resize observer, visibility/pause behavior, ordered cleanup |
| `src/ui/RenderingLabScreen.tsx` | React route, mode controls, status, and accessible explanation |

The coordinator is the important hybrid pattern. The lower Three canvas and
upper transparent Pixi canvas fill the same positioned host. Both receive the
same logical width, height, DPR cap, elapsed time, pause state, reduced-motion
setting, and teardown. The reference overlay ignores pointer events; a real
game should add one explicit input coordinator rather than allowing overlapping
layers to compete for the same gesture.

## Lifecycle contract

Any renderer adopted by a derived game must:

1. acquire one runtime through `src/rendering/rendererLifecycle.ts`;
2. initialize asynchronously and expose the backend that actually succeeded;
3. size from its playable host rather than a hardcoded phone resolution;
4. cap device-pixel ratio according to the quality setting;
5. update cameras, viewports, hit regions, and HUD layout on every host resize;
6. keep state during live resize and orientation changes;
7. stop decorative work for RUN pause, hidden tabs, and reduced motion;
8. use one frame clock when multiple renderers share a presentation; and
9. register listeners, canvases, display objects, geometries, materials,
   textures, and renderer resources with the lifecycle scope for ordered
   teardown.

### Serialized renderer ownership

- Maintain at most one active renderer runtime per JavaScript realm. A runtime
  may own one PixiJS `Application`, one Three.js renderer, or—only for the
  deliberate hybrid architecture—one of each, coordinated and destroyed as one
  unit. Never overlap two runtimes or two Pixi applications.
- Serialize initialization, backend fallback, cancellation cleanup, and
  destruction through the same realm-stable promise queue. Lock initialization
  itself; waiting only for the previous teardown does not prevent two
  asynchronous initializers from overlapping.
- Treat cancellation logically. Renderer initialization is not guaranteed to
  be abortable, so a cancelled request waits for initialization to settle,
  destroys any partial or complete renderer inside the queue, and only then
  allows the next request to initialize.
- React StrictMode mount → cleanup → mount, route changes, and HMR must use
  lifecycle leases. Scene code may destroy its own display objects and GPU
  resources through registered lifecycle cleanup, but it must never directly
  call `Application.destroy()`, `renderer.destroy()`, or `renderer.dispose()`.
- Prefer resetting the stage or scene while the same loaded build retains the
  same backend and canvas owner. A real reload or new deployment creates a new
  JavaScript realm and therefore a new lifecycle manager.
- PixiJS uses module-level program caches and may use shared Assets and
  textures. Treat one live Pixi application per realm as a project invariant;
  do not assume overlapping applications and their resource ownership are
  isolated.

### Strict WebGPU QA and failures

Production may deliberately fall back to WebGL. WebGPU QA must use
`?renderer=webgpu`, verify the backend that actually initialized, and fail
instead of silently falling back. This applies to Pixi, Three, and every layer
of a hybrid runtime.

Treat uncaught render errors, uncaptured GPU errors, and unexpected
`GPUDevice.lost` while a renderer is active as test failures. Device loss whose
reason is `destroyed` after manager-owned teardown is expected. Validate
repeated game launch/exit, renderer-lab entry/exit, mode switching, StrictMode
remounts, HMR, ViewDeck reload/redeploy, orientation changes, and
background/foreground cycles. At every checkpoint:

- lifecycle diagnostics report no more than one active runtime and one
  concurrent initializer;
- the DOM contains only the canvas layers owned by that runtime;
- no renderer failure event or error reaches the console; and
- teardown finishes before another initialization starts.

The app-level safe area wraps the Rendering Lab host, so its required controls
stay out of cutouts. A full-canvas derived game must also translate
`--safe-top`, `--safe-right`, `--safe-bottom`, and `--safe-left` into its
canvas HUD layout. Re-read them after `orientationchange`; do not assume
portrait’s top/bottom hazards stay on those edges in landscape.

Canvas text follows the same minimums as DOM text. Measure the final CSS-pixel
result after camera, container, bitmap-font, and DPR scaling. Nothing may
render below 10 CSS pixels; compact controls need at least 12 CSS pixels and
body/instruction copy at least 14 CSS pixels.

## Using Three for UI

The Three-only reference uses an orthographic scene for fixed-screen interface
geometry and renders it after clearing depth from the perspective world. A
production game can extend this boundary with:

- signed-distance-field or multi-channel signed-distance-field text;
- planes using reviewed UI atlas textures;
- instanced bars, markers, reticles, and panels; or
- camera-attached world-space controls when depth and scale are intentional.

Do not rasterize tiny labels and rely on DPR to rescue them. Preserve aspect
ratios for UI textures, keep required controls within all four safe-area
insets, provide semantic alternatives where needed, and keep hit testing in the
same coordinate system as the visible interface.

## Derive; do not copy

Start with the requested game’s mechanic, audience, camera, interaction model,
and art direction. Then select the smallest relevant foundation:

1. retain the shared RUN lifecycle and safety contracts;
2. adapt one renderer boundary or the hybrid composition;
3. replace the Pixel Foundry scene, HUD, layout, copy, audio, economy, and IDs;
4. remove the Rendering Lab route from the shipped game unless it has genuine
   player or developer value;
5. uninstall every renderer and dependency no longer imported; and
6. verify the result as its own game in portrait, landscape, safe-area, DPR,
   pause/resume, reduced-motion, and fallback-backend cases.

The presence of an example is evidence that a technique is possible, not a
requirement to include that technique. A derived game should not resemble this
demo—or another game—unless the new design independently calls for the same
decision.

## Verification

Run the full repository gate:

```sh
npm run check:all
```

For visual review, start `npm run dev`, open the Rendering Lab, switch modes,
and test portrait → landscape → portrait without leaving the route. Verify
that the backend badge is honest, canvases do not duplicate, motion pauses,
the current mode survives resize, and navigating back releases both canvases.
Then repeatedly enter and leave the game and Rendering Lab under React
StrictMode and confirm the lifecycle snapshot never exceeds one active runtime
or concurrent initializer.
