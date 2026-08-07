# Verification workflow

Use the smallest check that can reliably detect the failure introduced by a
change, then retain the broader release gates. Report what changed, what was
run, which viewports or host conditions were exercised, and what remains
unverified.

| Change | Minimum reliable check |
| --- | --- |
| Copy, spacing, color, or one-screen layout | Real browser inspection at each affected viewport |
| Pure rules, math, parsing, validation, or deterministic state | Focused unit or simulation test |
| Persistence, timers, queues, lifecycle, or shared state | State integration test with failure and reload paths |
| Navigation, scrolling, onboarding, rotation, or cross-screen behavior | Browser E2E test |
| RUN SDK, ads, purchases, storage, notifications, or profiles | Browser E2E plus RUN Playground or production-host verification |
| Renderer, template, build, or dependency change | Full template checks and production builds |
| Release or public repository preparation | Full checks, public audit, readiness review, and final visual evidence |

## Local visual review

Development-only screen deep links avoid repetitive navigation:

```text
?screen=main
?screen=daily-rewards
?screen=daily-quests
?screen=shop
?screen=stats
?screen=run-features
?screen=rendering-lab
?screen=settings
?screen=game
```

Add `debug=1` to display FPS, renderer, viewport, DPR, orientation, current
route, safe-area values, and session-only quality, reduced-motion, and simulated
safe-area controls:

```text
http://localhost:5183/?screen=rendering-lab&debug=1
```

These tools exist only in development builds. A derived game should replace the
screen IDs and retain only useful controls.

## Browser smoke suite

```bash
npm run test:e2e
npm run test:e2e:headed
```

The suite exercises representative portrait, landscape, tablet, and desktop
viewports; direct screen previews; scroll reachability; orientation-change
safe-area refresh; state preservation; StrictMode and route-change renderer
serialization; hybrid renderer ownership; and console, page, GPU, and critical
request failures. Assertions use visible UI, lifecycle diagnostics, and the
development-only semantic QA contract.

With `?qa=1`, `__gameQa.setPaused(true)` reproduces an unmatched host pause
without a device. Every derived game that consumes lifecycle pause should keep
an equivalent DEV-only control and an E2E assertion that the visible pause
surface can clear it. This tests the escape path only; real callback delivery
and host-owned ad/checkout presentation still require Playground or device QA.

Browser tests never prove a real ad, purchase, entitlement, notification,
profile, or host capability. Verify those separately through the opt-in RUN
Playground and the final RUN host, without fabricating successful outcomes.

## Public repository audit

```bash
npm run audit:public
```

The zero-dependency audit checks required community/license files, accidental
publication settings, sensitive filenames, repository-escaping symlinks,
developer-specific paths, workspace-relative dependencies, and common
credential shapes. Intentional `REPLACE_WITH_*` template placeholders are
reported rather than treated as secrets; derived games must replace them before
deployment.
