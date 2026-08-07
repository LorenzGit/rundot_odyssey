# RUN.world game readiness checklist

Run this checklist before any release, public visibility change, or claim that a
game is complete. Mark every item `PASS`, `FAIL`, `N/A`, or `BLOCKED`, with a
link, screenshot, command output, or named reviewer as evidence. `N/A` needs a
specific product or verified-capability reason—not schedule pressure.

Run the objective preflight first:

```bash
bash .agents/skills/rundot-reliability-qa/scripts/audit-game-readiness.sh /path/to/game
```

That preflight is advisory. It cannot verify gameplay, art, safety, or a real
RUN host; complete the evidence table below as well.

| Gate | Have we done this? | Evidence / exception |
| --- | --- | --- |
| Design | Core loop, first ten minutes, fail/retry path, progression, difficulty, and return reason are documented and playtested. | |
| FTUE and accessibility | Controls are discoverable; touch targets are at least 44×44 CSS px; no text renders below the absolute 10 CSS px floor after DOM/canvas/Pixi/bitmap scaling; larger role minimums, readable contrast, reduced motion, mute, and non-color/non-audio feedback work. | |
| Save and progression | Versioned save, migration/defaults, checkpoint/reload, server-time gates, duplicate-claim protection, and recovery behavior are tested. | |
| Monetization | A ship-track game has both required channels: (1) at least one active, game-appropriate Shop + Entitlements product in `rundot/shop.config.json` with `price.type: "bucks"`, a final evidence-backed RB price, resolved-catalog price UI, direct-intent checkout, and order/entitlement reconciliation; and (2) at least one player-facing ad placement with an exact trigger transition and exclusion/no-fill/no-ads policy. An ambiguous purchase cannot permanently lock checkout: background reconciliation is read-only, and a later direct tap for the same item retries the original logical order with the same idempotency key. Player copy says Run Bits/RB. Fiat IAP or subscriptions do not replace the Run Bits product without an explicit owner-approved exception. `none` is allowed only on the prototype track. No disabled example, placeholder, hidden diagnostic, QA/TBD price, or recommendation list counts as implementation. | |
| LiveOps | Event/config defaults, safe fallback, experiment/rollback owner, and cleanup path exist where LiveOps is used. | |
| Visual quality | Original 512×512 `public/thumbnail.jpg`, branded splash/loading, named art direction, no placeholders, and final screenshot review pass. Every image preserves its intended aspect ratio with deliberate `cover`/`contain` cropping and orientation variants where needed. Production UI uses project-owned icons instead of platform emoji except for documented, cross-platform-tested exceptions. Full-bleed desktop/tablet backdrop is intentional while play/UI remain in their safe frame. | |
| Audio and haptics | Music/SFX/voice behavior, persisted controls, gesture unlock, lifecycle pause/resume, mix review, and supported haptic feedback pass. | |
| Assets and catalog | Asset paths/load strategy are verified; catalog name, description, keywords, orientation, thumbnail, version/tag, and visibility target are correct. | |
| Localization | Player-facing copy is centralized; selected languages, fallback, long-text/font review, and localized notifications are checked. Every player-visible quantity uses the shared locale-aware formatter (`1000` → `1,000` in English), including translation tokens, and large-value separators do not clip or overlap. | |
| Reliability | Typecheck/lint/tests/production build pass; error/rate-limit/slow-load paths, memory/assets, resize, lifecycle, and device matrix are tested. | |
| Reproducible QA | Browser-driven semantic QA covers release-critical paths, console errors, state assertions, and named screenshots/baselines where the game warrants it. | |
| Multiplayer / authority | If applicable: authoritative boundary, reconnection, invalid input, multi-client test, rewards/results, and protocol compatibility are verified. | |
| Analytics | FTUE/core loop/progression/error/monetization events are validated; KPI definitions, dashboards, data quality, and review owner are recorded. | |
| Safety and support | UGC/reporting/moderation (if used), notification consent, minimal-data handling, recovery/support path, and incident owner are documented. | |
| Release operations | Game ID/environment/build folder, deploy plan, changelog, rollback/known issues, and post-release read-back are confirmed. | |

## Ship decision

**Decision:** `ship` / `do not ship` / `ship with approved exception`
**Game, environment, version/tag:**
**Reviewer and date:**
**Open risks, approved exceptions, owner, and follow-up date:**
