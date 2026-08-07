# Standard Event Catalog

The recommended baseline taxonomy for a RUN title. Apply these names as-is so data is comparable across games; add game-specific events using the same `snake_case` + ID-payload conventions. New event names must be shared with the RUN Operators team before they appear in dashboards.

## Session & lifecycle

| Event | When | Key payload |
|---|---|---|
| `session_start` | App opened / first playable frame | `first_time_player`, attribution fields |
| `session_pause` | `lifecycles.onSleep` / `onPause` | `elapsed_sec` |
| `session_end` | `lifecycles.onQuit` | `elapsed_sec`, `screens_viewed` |
| `screen_view` | Any screen/menu shown | `screen` |

## Auth funnel (`funnel: 'auth'`, funnelOrder 0)

Only if the game has a gated entry (login, age gate, consent). Dedup once-ever.

| Step | Name | Meaning |
|---|---|---|
| 1 | `auth_prompt_shown` | Entry gate displayed |
| 2 | `auth_started` | User began sign-in/consent |
| 3 | `auth_complete` | Passed the gate |
| 4 | `auth_failed` | Failed/abandoned (payload `reason`) |

## FTUE funnel (`funnel: 'ftue'`, funnelOrder 1)

The FTUE funnel is the single most important funnel in a new game — it shows exactly where first-time players quit. Instrument it with these three rules:

1. **As granular as possible.** Every discrete beat of the first session is its own step: each tutorial text shown AND dismissed, the first enemy spawning AND dying, the first currency earned, the first button tapped. Do not collapse "the tutorial" into one step — break it into `ftue_tutorial_01_shown`, `ftue_tutorial_01_dismissed`, `ftue_tutorial_02_shown`, … The finer the steps, the more precisely you locate the drop-off.
2. **Strictly linear.** Steps happen in a fixed order, numbered sequentially with no branches. Step N+1 can only fire after step N.
3. **Fire once, ever.** Each step fires the first time it happens and never again (`trackFunnelStepOnce`), so reinstalls and replays don't pollute it.

When instrumented correctly the step counts are **monotonically decreasing** — a clean funnel shape. If a later step has more hits than an earlier one, the ordering or dedup is wrong.

Example (adapt names to the game's actual first session — expect 15–40+ steps, not a handful):

| Step | Name | Meaning |
|---|---|---|
| 1 | `ftue_load_complete` | Assets loaded, first playable moment (await attribution here) |
| 2 | `ftue_tutorial_01_shown` | First tutorial text shown |
| 3 | `ftue_tutorial_01_dismissed` | First tutorial text dismissed |
| 4 | `ftue_first_action` | First core interaction (tap/place/move) |
| 5 | `ftue_tutorial_02_shown` | Second tutorial text shown |
| 6 | `ftue_tutorial_02_dismissed` | Second tutorial text dismissed |
| 7 | `ftue_first_enemy_spawned` | First enemy/obstacle appears |
| 8 | `ftue_first_enemy_defeated` | First enemy defeated |
| 9 | `ftue_first_reward` | First currency/reward earned |
| 10 | `ftue_first_round_complete` | First round/wave/level finished |
| 11 | `ftue_first_end_screen` | First results screen (`result`) |
| 12 | `ftue_first_win` | First success |
| … | … | Continue for every beat through the end of onboarding |

## Core gameplay

| Event | Key payload |
|---|---|
| `level_start` | `level_id`, `level_number` |
| `level_complete` | `level_id`, `score`, `time_elapsed_sec` |
| `level_failed` | `level_id`, `reason`, `progress_pct` |
| `level_abandoned` | `level_id`, `progress_pct` |
| `first_win` | `level_id` |
| `milestone_reached` | `milestone`, `value` |
| `reward_granted` | `amount`, `currency`, `source` |

## Monetization

Cross-reference the `rundot-monetization-iap` and `rundot-monetization-ads` skills for design.

| Event | Key payload |
|---|---|
| `ad_requested` | `placement`, `type` (`rewarded`/`interstitial`) |
| `ad_shown` | `placement`, `type` |
| `ad_reward_granted` | `placement`, `reward_id` |
| `ad_failed` | `placement`, `reason` |
| Purchase funnel (`funnel: 'purchase'`, order 2) | steps below |
| 1 `shop_opened` | `source` |
| 2 `item_selected` | `item_id`, `price` |
| 3 `checkout_started` | `item_id` |
| 4 `purchase_complete` | `item_id`, `price`, `currency` |
| `purchase_failed` | `item_id`, `reason` |

## Errors & crashes

| Event | When | Key payload |
|---|---|---|
| `error_occurred` | try/catch, `window.error`, `unhandledrejection` | `type`, `message`, `source`, `line` |

Always fire `error_occurred` for queryable triage AND `RundotGameAPI.error(...)` for the mobile support log. `installErrorCapture()` wires the global listeners.

## Experiments

| Event | When | Key payload |
|---|---|---|
| `experiment_exposure` | Immediately after `getExperiment` resolves non-null | `experiment`, `variant`, `group` |
| `feature_flag_read` | Optional, when a flag gates meaningful UI | `flag`, `enabled` |

```typescript
const exp = await RundotGameAPI.getExperiment({ experimentName: 'shop_layout' })
if (exp) {
  trackEvent('experiment_exposure', {
    experiment: exp.name,
    variant: String(exp.value.variant),
    group: exp.groupName ?? 'unassigned',
  })
}
```

## Attribution enrichment (recommended)

Read landing UTM/campaign params once at startup and merge them into early events (`session_start`, `ftue_load_complete`) so paid vs. organic cohorts are separable:

```typescript
const params = await RundotGameAPI.attribution.getAttributionParams()
// merge utm_source / utm_medium / utm_campaign / fbclid / gclid into the payload
```

## Payload conventions

- `snake_case` keys, scalar values only (`string | number | boolean | null`).
- IDs over names for joins (`level_id`), human names optional alongside.
- Durations in seconds with a `_sec` suffix; percentages 0–100 with `_pct`.
- Currency amounts as integers with an explicit `currency` field.
