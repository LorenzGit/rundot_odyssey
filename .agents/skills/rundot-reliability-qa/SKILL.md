---
name: rundot-reliability-qa
description: "Make RUN.world games reliable and release-ready through performance budgets, loading strategy, memory/asset review, error handling, rate-limit recovery, device/lifecycle QA, test automation, and release evidence. Use for performance, bugs, QA, CI, or release readiness."
---

# RUN.world reliability and QA

Read local `error-handling.md`, `rate_limits.md`, `runtime-environment.md`,
`lifecycles.md`, `preloader.md`, `assets.md`, and the target project’s build and
test setup before changing behavior.

## Build for failure

1. Set measurable budgets for initial download, boot time, scene load, memory,
   texture/audio/video size, frame responsiveness, and network requests.
2. Classify every platform call: optional/read-only calls get bounded retries or
   an honest fallback; grants, purchases, scores, and destructive work must not
   be retried into duplicate outcomes. A persisted ambiguous Shop purchase is
   the exception that requires a safe retry contract: background reconciliation
   stays read-only, and a new direct tap retries the same logical order with its
   original idempotency key.
3. Handle structured errors and rate limits; respect retry delays, back off, and
   surface recovery instead of spinning/retrying per frame.
4. Load optional/large CDN assets progressively, cancel/clean up discarded blob
   assets, and keep a playable local/mock path.
5. Pause/resume timers, audio, input, and network-facing work with host
   lifecycle events. Save at safe checkpoints; never rely on quit.

## Release evidence

Run typecheck/lint/tests/production build plus a device matrix: short/tall phone,
tablet, desktop embed, DPR variation, slow/failing asset/API path, reload,
pause/resume, resize/orientation, fresh save/migration, and core loop. Capture
the measured budget/result, regressions, unresolved risk, and required real-host
tests. Do not call a release ready merely because it builds.

Route visual/audio/safe-area acceptance to `rundot-game-quality`; route metrics
 and error trend review to `rundot-analytics-ops`.

For reproducible release evidence, read
`references/browser-visual-qa.md` and add a test-only semantic browser-QA
contract rather than relying on manual screenshots alone.

Before shipping to a device, read `references/host-reality-gap.md`. It covers
the defects that are invisible in local dev, headless Chrome, and ViewDeck
because the local environment supplies a benign default where the host supplies
something hostile or absent — safe-area insets, keyboard focus after an ad,
host-gated UI that hides itself from your own layout tests, and consumables that
report as owned, plus persisted purchase intents that can permanently lock
checkout. Every item in it reached a real handset through a gate that already
ran invariants, a headless simulation, and a screenshot pass.

For a complete cross-functional handoff, run
`bash scripts/audit-game-readiness.sh <project-dir>` from this skill's
directory and complete `references/GAME_READINESS_CHECKLIST.md`. The script is
advisory; evidence in the checklist decides readiness.
