# Deterministic gameplay simulation

Prove important gameplay behavior without loading React, Pixi, Three.js, or the
RUN host. A derived game should keep its rules in pure TypeScript and let the
renderer translate state into presentation.

The template includes a deliberately neutral reference model:

```bash
npm run simulate
```

It demonstrates:

- the shared, position-based `NoiseRandom` generator for ordinary game logic;
- byte-stable replay from the same seed;
- hundreds of headless sessions in one command;
- basic outcome, score-distribution, and variety guardrails;
- a machine-readable summary suitable for CI.

Replace the reference session with the actual game's rules. Do not preserve its
numbers or risk/reward behavior simply because the example exists.

## What to measure

Select measurements that can invalidate the design:

- completion, failure, and retry rates;
- score, reward, and session-length distributions;
- difficulty separation between authored tiers;
- impossible, unwinnable, or degenerate states;
- economy sources, sinks, caps, and time-to-goal;
- bot or strategy diversity;
- replay determinism for multiplayer, ghosts, challenges, and support cases.

Keep test seeds with every regression. For procedural content, test both a
curated seed set and a broad deterministic sweep.

Read [`randomness.md`](randomness.md) before adding random decisions.
Single-player and local game logic uses `NoiseRandom`; authoritative RUN
SyncPlay simulations use the SDK's server-owned deterministic random and noise
surfaces instead.

## Limits

A simulation can prove arithmetic, invariants, reproducibility, and modeled
outcomes. It cannot prove that a mechanic is understandable, satisfying,
accessible, or fun. Pair it with real-device play, representative players,
browser verification, and analytics after launch.
