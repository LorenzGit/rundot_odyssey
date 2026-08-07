# RUN.world LiveOps event brief

Complete this before a scheduled event, configuration push, or experiment.

```md
# <Event / experiment name>

## Intent
- Player value and non-player value:
- Hypothesis and primary metric:
- Guardrails and stop conditions:

## Scope
- Game ID / environment / target tag:
- Owner and rollback owner:
- Start and end in UTC (full ISO 8601 with timezone):
- Eligible player state and deliberate exclusions:

## Configuration
- Base-value defaults and safe behavior if config is unavailable:
- Keys changed, types, and consumer location:
- Override precedence / overlap decision:
- Server-authoritative systems affected (if any):
- Linked save, daily-reward, entitlement, Shop, or monetization decision:

## Experiment (or `none`)
- Experiment ID, salt, immutable variants, weights, and planned ramp:
- Meaningful-view event (if exposure alone is insufficient):
- Decision date/minimum evidence and exit criteria:

## Operations
- Local/mock and Playground cases tested:
- Deployed state inspected before change:
- Rollback snapshot/config and exact rollback command to verify at execution:
- End-of-event cleanup and post-event review date:
```

Do not include secrets or security decisions in client config or this brief.
