---
name: rundot-game-design
description: "Design RUN.world games from the core loop through FTUE, difficulty, pacing, economy, content cadence, controls, failure states, and measurable player value. Use for new game concepts, gameplay changes, balancing, onboarding, retention design, or feature prioritization."
---

# RUN.world game design

Design the player experience before implementing systems. Read the starter
README, `rundot-player-systems`, `rundot-monetization`, and
`rundot-game-quality` for every new game; bring in `rundot-analytics-ops` before
locking measurements. For onboarding, return hooks, appointment mechanics, or
notification strategy, read `references/retention-design.md` completely.

## Design contract

Complete `references/game-design-brief-template.md` before choosing a renderer,
save schema, economy, content format, or monetization surface.

1. Define the player fantasy, target session length, one-sentence core loop,
   first meaningful action, short-/medium-/long-term goal ladder, failure/retry
   loop, and exact next-session promise. Make the game understandable without
   tutorial text where possible.
2. Map the first ten minutes: welcome, control discovery, first success, first
   decision, first challenge/failure, recovery, reward, progression reveal, and
   next-session hook. Deliver a meaningful early win, teach through play, and do
   not bury the game under modal copy.
3. Specify the difficulty curve, accessibility/comfort choices, skill versus RNG
   balance, pacing, content cadence, and fail states. Ensure retry is quick,
   clear, and emotionally fair.
4. Design the economy as sources, sinks, caps, timing, and player choice. Keep a
   useful non-payer path; route paid/ads/RB mechanics through
   `rundot-monetization` before implementation.
5. Create small playable vertical slices and test them with representative
   players/devices. Use evidence to revise the loop before scaling content.
6. Define event/content seams early (stable IDs, typed configs, save migration),
   but do not turn every design value into LiveOps or a monetization lever.

## Balance and measurement

Instrument the design contract: FTUE completion, time to first value, first
failure/retry, session completion, progression stalls, return behavior, and
player-trust guardrails. Measure reasons and reminders separately so a weak
return goal is not mistaken for a notification-delivery problem. Use
`rundot-analytics-ops` to validate data before making balance claims. Preserve
deterministic/reproducible test scenarios for critical curves and rewards.

## Verify and hand off

Report the design brief, vertical-slice evidence, decisions changed by testing,
known balance risks, non-payer promise, accessibility choices, and the next
player test or metric review date.
