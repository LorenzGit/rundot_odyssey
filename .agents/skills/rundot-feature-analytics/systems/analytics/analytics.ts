// Fire-and-forget analytics for RUN games — funnels + custom events.
//
// Model: gameplay code calls small typed helpers on the system created by
// createAnalytics(); raw RundotGameAPI.analytics calls appear nowhere else.
// Every emit goes through one safe core: try/catch around the SDK call,
// .catch() on the returned promise, and no await anywhere — analytics can
// never stall a frame, block a save flush, or crash the game. In mock/local
// mode everything no-ops cleanly (flip `debug: true` to console-mirror
// emits instead).
//
// Two complementary surfaces, mirroring the SDK:
//
//   1. Funnels (analytics.trackFunnelStep) — ordered drop-off arcs. The
//      `funnels` config declares each funnel's name, journey order, and
//      step names ONCE, upfront (an SDK best practice: step numbers and
//      names must stay stable); call sites just say
//      funnelStep('cash_shop', 3).
//
//   2. Custom events (analytics.recordCustomEvent) — point-in-time
//      payloads that don't fit a strict ordering: spends, failures,
//      milestones, run summaries. event() merges the optional enrich()
//      cohort context into every payload so each row can be pivoted by
//      player lifecycle without dashboard joins.
//
// The module is deliberately STATELESS about dedupe:
//   - per session: the funnel backend treats each step as "ever reached",
//     so multi-fires within a session count once — call sites don't guard.
//   - per save: one-shot steps/milestones are gated by a save flag at the
//     call site. Keeping
//     that state out of this module means it needs no persistence, no
//     load order, and no boot step.

import RundotGameAPI from "@series-inc/rundot-game-sdk/api";

/**
 * A value allowed in an event payload: small flat scalars only. The SDK
 * itself accepts any `Record<string, any>` — this type is the payload-
 * hygiene rule made checkable (identifiers, not blobs; most backends
 * pivot poorly on nesting).
 */
export type EventPropValue = string | number | boolean | null | undefined;

/** A flat custom-event payload (also what `enrich()` returns). */
export type EventProps = Record<string, EventPropValue>;

/**
 * One funnel's declaration. `steps[i]` is the event name for step i+1
 * (SDK steps are 1-based); names should be stable snake_case. `order`
 * positions the funnel chronologically in the overall user journey so
 * multiple funnels compare side by side on one dashboard (SDK default
 * when omitted: 0).
 */
export interface FunnelDefinition {
    order?: number;
    steps: string[];
}

export interface AnalyticsConfig {
    /**
     * Funnel definitions: name -> { order, steps }. Declare every funnel
     * here — never renumber or rename shipped steps.
     */
    funnels?: Record<string, FunnelDefinition>;
    /**
     * Returns cohort-context props merged into EVERY custom-event payload
     * (e.g. games_played, prestige_count, tutorial_step — read live off the
     * save). Explicit event props win on key conflicts; exceptions are
     * swallowed. Keep it cheap and flat: it runs on every emit.
     */
    enrich?: () => EventProps;
    /**
     * Per-name kill switches, checked before any payload construction: set a
     * funnel name or custom-event name to `false` to fully suppress it (zero
     * SDK calls, zero payload churn). spend() additionally honors
     * per-currency switches: `'currency_spend_<currency>'`. Anything absent
     * defaults to enabled.
     */
    enabled?: Record<string, boolean>;
    /**
     * Mirror every emit to console.debug — the verification tool for
     * mock/local mode, where there is no host pipeline to deliver to.
     * Ship with it off.
     */
    debug?: boolean;
}

/** What purchaseFailure() records. */
export interface PurchaseFailureInfo {
    /** Which item failed — distinguishes one bad catalog entry from a global outage. */
    itemId?: string;
    /** 'bundle' | 'pack' | ... */
    kind?: string;
    /** Where it died, e.g. 'spend_call' | 'exception' | 'apply_grant' — lets on-call localize the break. */
    stage?: string;
    /** Raw error or string; clamped to 200 chars. */
    error?: unknown;
}

export interface Analytics {
    /** Emit a custom event with enrich() context merged UNDER `props`. Fire-and-forget: never throws, never awaited. */
    event(name: string, props?: EventProps): void;
    /** Fire step `step` (1-based) of a declared funnel; undeclared/out-of-range silently no-op. `props` rides on a parallel custom event named after the step. */
    funnelStep(funnelName: string, step: number, props?: EventProps): void;
    /** Record a currency spend ('currency_spend'). Call AFTER subtracting from the save. */
    spend(currency: string, amount: number, sink: string, itemId?: string, balanceAfter?: number): void;
    /** Record an IAP failure ('iap_failure'); `error` is stringified and clamped to 200 chars. */
    purchaseFailure(info: PurchaseFailureInfo): void;
    /** Record the first-ever successful IAP ('first_iap_purchase'); once-per-save dedupe is the CALLER's job. */
    firstPurchase(props?: EventProps): void;
    /** Record a completed tutorial sequence ('tutorial_dismissed'). */
    tutorialDismissed(id: string, cardCount: number, durationMs: number): void;
}

export function createAnalytics(config: AnalyticsConfig = {}): Analytics {
    const { funnels = {}, enrich = null, enabled = {}, debug = false } = config;

    function isOff(name: string): boolean {
        return enabled[name] === false;
    }

    function log(kind: string, ...args: unknown[]): void {
        if (!debug) return;
        try {
            console.debug("[analytics]", kind, ...args);
        } catch {
            /* consoleless env */
        }
    }

    // ── The safe-call core ──────────────────────────────────────────────
    // Three failure modes, all swallowed: the SDK/namespace may be absent
    // (mock mode, pre-init), the call itself may throw, and the returned
    // promise may reject. The SDK docs say analytics failures are caught
    // internally (unlike storage/iap), but this posture also covers older
    // SDKs, pre-init calls, and mock hosts — keep it.

    function sdkFunnel(step: number, name: string, funnel: string, order: number): void {
        try {
            const a = RundotGameAPI && RundotGameAPI.analytics;
            const p = a && a.trackFunnelStep(step, name, funnel, order);
            if (p && typeof p.catch === "function") p.catch(() => {});
        } catch {
            /* analytics must never break gameplay */
        }
    }

    function sdkCustom(name: string, payload: EventProps): void {
        try {
            const a = RundotGameAPI && RundotGameAPI.analytics;
            const p = a && a.recordCustomEvent(name, payload);
            if (p && typeof p.catch === "function") p.catch(() => {});
        } catch {
            /* analytics must never break gameplay */
        }
    }

    // Safe integer coercion for payload numbers. Deliberately NOT `| 0`:
    // bitwise ops wrap at 32 bits, corrupting large balances (idle-game
    // currencies) and epoch-ms timestamps — the same overflow class
    // documented in systems/iap-shop ("the `| 0` timestamp bug").
    function num(v: unknown): number {
        const n = Math.round(Number(v));
        return Number.isFinite(n) ? n : 0;
    }

    const sys: Analytics = {
        /**
         * Emit a custom event, with enrich() context merged UNDER `props`.
         * Fire-and-forget: returns nothing, never throws, never awaited.
         * Names: stable snake_case describing what happened
         * ('boss_defeated', not 'event_1'). Payloads: small and flat —
         * identifiers, not blobs; most backends pivot poorly on nesting.
         * @param name  stable snake_case event name
         * @param props  event-specific payload; wins over enrich() keys
         */
        event(name: string, props?: EventProps): void {
            if (isOff(name)) return;
            const payload: EventProps = {};
            if (enrich) {
                try {
                    Object.assign(payload, enrich() || {});
                } catch {
                    /* enrich must not block the event */
                }
            }
            if (props) Object.assign(payload, props);
            log("event", name, payload);
            sdkCustom(name, payload);
        },

        /**
         * Fire step `step` (1-based) of a declared funnel. Silently no-ops
         * when the funnel isn't declared or the step is out of range — a
         * feature, not a bug: it's how "track the first N only" contracts
         * are enforced (declare N step names; higher counts fall off the
         * end — see countedSteps()).
         *
         * trackFunnelStep carries no payload, so `props` (when given)
         * rides on a parallel custom event named after the step, letting
         * the dashboard join WHICH item/context onto the abstract
         * drop-off curve.
         *
         * Fire steps on PLAYER ACTION (click handlers, onDone callbacks),
         * never from boot-time state loads — the event must mean "the
         * player progressed", not "the save has this value".
         * @param funnelName  key into config.funnels
         * @param step  1-based step number (steps[step-1] names it)
         * @param props  optional context for the parallel custom event
         */
        funnelStep(funnelName: string, step: number, props?: EventProps): void {
            if (isOff(funnelName)) return;
            const def = funnels[funnelName];
            if (!def || !Array.isArray(def.steps)) return;
            const n = num(step);
            const name = def.steps[n - 1];
            if (!name) return;
            log("funnel", funnelName, n, name);
            sdkFunnel(n, name, funnelName, num(def.order));
            if (props) sys.event(name, props);
        },

        /**
         * Record a currency spend ('currency_spend'). One schema across
         * every currency, so the whole economy reads off a single event:
         * where each currency drains, per-item drilldowns, and (via
         * balance_after) rolling per-session balances with no income
         * events to join. Call AFTER subtracting from the save (so
         * balanceAfter is the post-spend state); never blocks the save
         * flush. Honors 'currency_spend' plus the per-currency switch
         * 'currency_spend_<currency>' — silence a high-volume in-battle
         * currency while keeping the premium ones.
         * @param currency  canonical currency key, e.g. 'gems'
         * @param amount  spend magnitude (positive, unsigned)
         * @param sink  low-cardinality category, e.g. 'card_draw',
         *   'upgrade', 'shop_bundle' — the enum the dashboard groups by
         * @param itemId  specific item id ('' when the spend has
         *   no specific target, e.g. a reroll)
         * @param balanceAfter  post-spend balance of `currency`
         */
        spend(currency: string, amount: number, sink: string, itemId?: string, balanceAfter?: number): void {
            if (isOff("currency_spend")) return;
            if (isOff("currency_spend_" + currency)) return;
            sys.event("currency_spend", {
                currency: String(currency || ""),
                amount: num(amount),
                sink: String(sink || ""),
                item_id: itemId || "",
                balance_after: num(balanceAfter),
            });
        },

        /**
         * Record an IAP failure ('iap_failure') — the live-ops canary.
         * Failures are otherwise invisible (the shop toasts generic copy
         * and stays put), so a spike here flags a broken purchase pipeline
         * long before the revenue dashboard would. `error` is stringified
         * and truncated to 200 chars HERE so no call site can ship an
         * unbounded platform error string into a payload.
         */
        purchaseFailure(info: PurchaseFailureInfo): void {
            const i = info || {};
            sys.event("iap_failure", {
                item_id: i.itemId || "",
                kind: i.kind || "",
                stage: i.stage || "",
                error: String(i.error == null ? "" : i.error).slice(0, 200),
            });
        },

        /**
         * Record the first-ever successful IAP ('first_iap_purchase') — a
         * once-per-save-lifetime milestone. Dedupe is the CALLER's job via
         * a save flag; systems/iap-shop's onFirstPurchase hook already
         * fires exactly once per save, so wiring it straight through is
         * safe. With enrich() providing games_played etc., the dashboard
         * answers "how many games does the average first-buyer play before
         * paying?" for free.
         * @param props  e.g. { item_id, kind, cost_rb }
         */
        firstPurchase(props?: EventProps): void {
            sys.event("first_iap_purchase", props || {});
        },

        /**
         * Record a completed tutorial sequence ('tutorial_dismissed').
         * Long durations flag confusing copy; instant dismissals on
         * important tutorials flag players clicking through info they
         * need — both actionable when crossed with downstream funnel
         * rates. Matches systems/tutorial's onDismiss(id, cardCount,
         * durationMs) hook argument-for-argument.
         * @param id  tutorial sequence id
         * @param cardCount  cards in the sequence
         * @param durationMs  first card shown → last card dismissed
         */
        tutorialDismissed(id: string, cardCount: number, durationMs: number): void {
            sys.event("tutorial_dismissed", {
                tutorial_id: id || "unknown",
                cards: num(cardCount),
                duration_ms: num(durationMs),
            });
        },
    };

    return sys;
}

/**
 * Build the step-name array for a "counted" funnel — one step per integer
 * value of a progression counter:
 *
 *   countedSteps('games_played_', 20)
 *   // -> ['games_played_1', ..., 'games_played_20']
 *
 * Pair with funnelStep: fire funnelStep('engagement', newTotal) after each
 * increment and the funnel plots retention across the first `count` values;
 * counts past the end no-op via the out-of-range rule, which is exactly how
 * a host can enforce a "track only the first 20 games" contract —
 * the dashboard targeted early-game drop-off, and everything past 20 was
 * intentionally untracked.
 * @param prefix  snake_case stem, e.g. 'games_played_'
 * @param count  highest counter value tracked
 */
export function countedSteps(prefix: string, count: number): string[] {
    const steps: string[] = [];
    for (let i = 1; i <= count; i++) steps.push(prefix + i);
    return steps;
}
