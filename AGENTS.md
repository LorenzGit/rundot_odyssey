# RUN renderer and platform template

This repository is a reusable RUN foundation and renderer knowledge base. Its
default game is a 2D PixiJS, WebGPU-first demo. The lazy Rendering Lab also
shows a Three-only world/UI and a Three-world + Pixi-UI composition without
changing the one-command `npm run dev` workflow.

Treat every visible scene as proof, not prescription. Start a derived game from
its requested mechanic, audience, camera, interactions, and art direction;
select only the relevant Pixi, Three, or hybrid boundary; and delete the rest.
Never preserve the Pixel Foundry identity, demo loop, menu, economy, copy,
audio, IDs, or presentation merely because they exist here. Do not reproduce
another game’s distinctive mechanics or presentation by using this template as
a copy-paste source.

The reference menu intentionally uses original portrait and landscape PNG art
to establish the quality bar. Do not regress a derived game to anonymous CSS
gradients, emoji, or improvised placeholder shapes as its final presentation.
Write the game's own visual brief, replace both compositions, preserve image
aspect ratios, document crop-safe regions, and keep required UI independent
from raster art. Read [`docs/visual-assets.md`](docs/visual-assets.md) and
[`docs/multi-resolution.md`](docs/multi-resolution.md) before changing art or
its fit policy.

Every ship-track game derived from this template must implement both:

1. at least one game-appropriate product priced in **RB (Run Bits)** through
   RUN Shop + Entitlements; and
2. at least one game-appropriate player-facing ad placement.

The Run Bits item lives in `rundot/shop.config.json` with
`price.type: "bucks"` (`bucks` is the schema name), while player-facing copy
says “Run Bits” or “RB.” The game must fetch the catalog, display its resolved
RB price, open `shop.purchase()` only after direct player action, and reconcile
orders and entitlements. Direct-fiat products and subscriptions are optional
additions and do not replace the Run Bits requirement unless the owner
explicitly approves that substitution. Low-level `iap.spendCurrency` is a
prototype/accepted-risk exception, not the production default.

Infer the best product, value, RB price, ad format, placement, timing, limits,
and presentation from that game's audience, loop, economy, progression,
session shape, and natural breaks. Do not copy the template's example offers or
stop at SDK wrappers, placeholders, disabled UI, diagnostics, or
recommendations. A prototype may defer both channels until ship-track
promotion, and an explicit owner instruction may narrow or override the model.

Use the `NoiseRandom` class in `src/game/noiseRandom.ts` for ordinary random
numbers in game logic and procedural generation; never add `Math.random()` to
game source. Inject and persist its unsigned seed and position when a sequence
must replay or resume, and use stable salts for independent decisions. This
rule does not apply to cryptographic/security identifiers, which use Web
Crypto, or authoritative RUN SyncPlay code, which must use the SDK's
server-owned `ctx.random` and certified noise functions. Read
`docs/randomness.md` before adding game randomness.

Every player-visible quantity must go through the shared `formatNumber()`
boundary in `src/systems/localization.ts`; in English, `1000` renders as
`1,000`. Apply it to scores, currencies, prices, rewards, progress, levels,
ranks, stats, and numeric translation tokens. Keep state, saves, calculations,
analytics, IDs, route parameters, dates, timers, and other semantic digit
strings raw. Never interpolate numeric state directly into JSX or player copy,
and do not add one-off `.toLocaleString()` calls. Preserve the automated audit
and read [`docs/number-formatting.md`](docs/number-formatting.md) before adding
or adapting number-bearing UI.

Keep lifecycle, safe-area, accessibility, persistence, capability-gated RUN
integration, authoritative outcomes, and cleanup generic. Do not duplicate
those application services per renderer. A hybrid game uses one frame clock,
one resize/lifecycle coordinator, and explicit input ownership. Read
[`docs/rendering-architecture.md`](docs/rendering-architecture.md) before
changing renderer composition.

Level-, wave-, round-, and run-based games must instrument the real core-loop
entry, completion, restart, and explicit abandonment transitions. Start from
the pause-aware machinery in `src/systems/levelAnalytics.ts`, adapt the demo
call sites to the derived game's authoritative outcomes, and keep event names
and property meanings stable after release. Completion telemetry must include
active duration and attempt count; host pause/sleep, browser hiding, ads, and
game-owned waiting states must not inflate play time. Read
[`docs/analytics.md`](docs/analytics.md) before changing instrumentation.

All renderer creation and destruction must go through the realm-wide manager in
`src/rendering/rendererLifecycle.ts`. It serializes initialization, fallback,
cancellation cleanup, and teardown so React StrictMode, route changes, HMR, and
ViewDeck lifecycle events cannot overlap runtimes. A runtime may own one Pixi
application, one Three renderer, or an intentional coordinated pair; never
create another renderer owner or call `Application.destroy()` /
`renderer.dispose()` outside that manager. Forced `?renderer=webgpu` QA is
strict and unexpected rendering errors or device loss are failures. Preserve
the regression coverage and read the complete contract in
[`docs/rendering-architecture.md`](docs/rendering-architecture.md).

When a derived game selects:

- **Pixi only:** keep `src/game/`; remove the Rendering Lab and `three` when no
  Three imports remain.
- **Three only, including UI:** adapt `src/rendering/three/`; replace the
  reference scene; remove the Pixi demo and `pixi.js` when no Pixi imports
  remain.
- **Three + Pixi:** adapt the layered host and shared coordinator; never create
  independent loops or parallel RUN/save/audio systems.

Follow the parent RUN workspace instructions and the source-of-truth order
defined there before changing SDK or CLI integration.

## Project-local skills

`.agents/skills/` holds the authoring skills that ship with this template;
`.claude/skills` is a symlink to it, so Claude Code picks them up unchanged.

**Check `rundot skills list` first.** The RUN CLI ships its own skills — the
SDK reference, deploy, monetization, marketing, a new-game scaffold, and eleven
`rundot-feature-*` systems (save, ads, stats, iap-shop, tutorial, daily
rewards/quests, notifications, analytics, localization). Install those with
`rundot skills install <name>`; they are versioned with the CLI and always take
precedence. The skills below deliberately do **not** duplicate any of them.

- Platform and ops: `rundot-cli-ops`, `rundot-liveops`, `rundot-multiplayer`,
  `rundot-phaser`.
- Product: `rundot-game-design`, `rundot-analytics-ops`,
  `rundot-safety-support`, `rundot-reliability-qa` (bundles the release gate:
  `scripts/audit-game-readiness.sh` and
  `references/GAME_READINESS_CHECKLIST.md`).
- Assets and quality: `rundot-game-quality`, `rundot-visual-assets`,
  `rundot-audio`, `img2threejs`, plus local asset tools that spend no RUN
  credits — `grok-image-video` (Grok Build Imagine image/video tools in-session),
  `codex-image-gen` (OpenAI Codex CLI image generation),
  `bg-removal-softshadows` (cutouts that preserve soft contact shadows), and
  `compress-mp3-audio` (FFmpeg presets for web delivery). Codex / cutout /
  audio tools need local tooling (a Codex CLI, Python/FFmpeg) that this template
  does not install; `grok-image-video` uses Grok session tools only. Each
  SKILL.md states its own prerequisites.

Skills must stay machine-independent. `npm run test` fails on any absolute
home-directory path or private Codex reference inside them.

- Use [`.agents/skills/rundot-multiplayer/SKILL.md`](.agents/skills/rundot-multiplayer/SKILL.md)
  for any shared room, world, match, turn order, economy, synchronized
  simulation, matchmaking, competitive result, or reconnectable session. Read
  its source map first, then the references and installed SDK documents routed
  for the selected architecture.
- Use [`.agents/skills/img2threejs/SKILL.md`](.agents/skills/img2threejs/SKILL.md)
  when a reference image must become a code-only, procedural Three.js model,
  sculpt specification, or staged reconstruction plan. Read that file
  completely, follow its quality gates, and load its referenced `forge/` and
  `grimoire/` resources as directed.
- `img2threejs` is optional authoring tooling. It produces Three.js code, not a
  Pixi display object, and is not a runtime dependency of the renderer
  examples. Do not use it for ordinary 2D Pixi artwork or imply that its output
  renders in Pixi without a deliberate Three.js integration or conversion
  step.
- Using the local skill does not authorize RUN-billed 3D generation, external
  asset downloads, deployment, publication, or other remote mutations.
- Preserve the vendored skill's Apache-2.0 license and its entry in
  `THIRD_PARTY_NOTICES.md` when copying or redistributing this template.

## Verification

Run `npm run check:all` after template changes. The invariant suite verifies
that project-local skills retain their instructions and required resources.
Install the local Chromium binary once with `npx playwright install chromium`.
Use `?screen=<id>` for direct visual review, `?debug=1` for development-only
runtime diagnostics and session tuning, and `?qa=1` for semantic browser
automation. Read `docs/verification.md` before selecting a smaller focused
check. Run `npm run simulate` for deterministic gameplay proofs and
`npm run audit:public` before publishing or redistributing the repository.

The preview, diagnostics, tuning, and QA contracts must remain development-only.
They may set up local test state but must never fabricate a successful RUN ad,
purchase, entitlement, notification, profile, or privileged outcome.
