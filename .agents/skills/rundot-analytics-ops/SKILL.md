---
name: rundot-analytics-ops
description: "Design and operate RUN.world game analytics: event taxonomy, funnels, retention/cohorts, dashboards, anomaly review, experiment measurement, data quality, and product decisions. Use for instrumentation, KPIs, analytics exports, dashboards, or live metric review."
---

# RUN.world analytics operations

Read local `analytics.md`, `logging.md`, `rate_limits.md`, and the target SDK
types before adding events. For monetization, read `rundot-monetization`; for
LiveOps tests, read `rundot-liveops`.

1. Complete `references/measurement-plan-template.md` before naming events.
   Define the decision, primary metric, denominator, guardrails, owner, and
   review cadence—not merely an event list.
2. Instrument FTUE, core loop, failure/retry, progression, retention trigger,
   performance/error context, and relevant ad/purchase/experiment funnels with
   stable names and bounded, non-sensitive properties.
3. Never send secrets, raw private text, payment data, or avoidable player PII.
   Analytics informs decisions; it never grants ownership, rewards, or access.
4. Validate events in development and real host conditions, then check volume,
   duplicate rate, missing properties, denominator consistency, and versioned
   changes before trusting a dashboard.
5. Review cohorts/trends and experiment health before interpreting results. Tie
   each finding to a decision, owner, expected effect, guardrail, and recheck
   date. Do not claim causality from a small, early, or contaminated sample.

Report metric definitions, data-quality caveats, observed outcomes, and actions
taken. Route release defects to `rundot-reliability-qa`.
