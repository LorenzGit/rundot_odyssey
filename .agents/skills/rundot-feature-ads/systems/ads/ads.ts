// Rewarded-ads core for RUN games: one chokepoint for every "watch an ad,
// get a bonus" placement, with a shared per-day watch cap, a no-ads-platform
// RunBucks fallback, and a no-ads-subscriber instant-grant path.
//
// The three-path grant flow (grantReward — the single entry point every
// bonus placement should call):
//   1. AD           — ads available on this platform: show a rewarded ad,
//                     grant on a true return, count toward the daily cap
//                     and the optional watch ladder.
//   2. SUBSCRIPTION — an active no-ads subscriber gets the reward INSTANTLY,
//                     no ad shown. Deliberately still counted as a real
//                     watch (cap + ladder), so a subscriber's economy is
//                     identical to a watcher's, minus the 30 seconds.
//   3. RUNBUCKS     — no-ads platform (capabilities.ads === false, e.g. a
//                     Steam channel): charge a small RunBucks price for the
//                     same bonus via iap.spendCurrency (host shows its own
//                     confirm dialog). EXEMPT from the daily cap — the
//                     player pays per grant, which is self-limiting — and
//                     by default does not advance the ladder; flip
//                     countFallbackAsWatch to change it.
//
// The daily cap is a game-wide budget shared by every placement, rolled
// over lazily at the trusted-clock local midnight (same "day" the
// daily-rewards calendar uses, so the word means one thing to the player).
//
// Capability detection is PERMISSIVE on unknown: an older SDK or unavailable
// environment is treated as "ads available" — only an explicit `false` from
// the host flips a placement to the RunBucks path. SDK 5.23+ mock mode reports
// ads available and completes a rewarded overlay with `true`; debugFakeAds is
// available when tests need to bypass that overlay.
//
// This module never imports the save, iap-shop, or subscription systems:
// state arrives via getState(), subscriber status and the fallback spend
// via optional injected functions.

import RundotGameAPI from "@series-inc/rundot-game-sdk/api";
// ADAPT: copy shared/serverTime.ts into the host alongside this file and fix
// this path to match the host's layout if it differs.
import { serverNow, localDayKey, msUntilNextLocalMidnight } from "../../shared/serverTime";

/** How a counted watch / granted reward was paid for. */
export type AdWatchMethod = "ad" | "subscription" | "debug" | "runbucks";

/**
 * Terminal failure reason passed to onFailed / analytics.onRewardFailed:
 * 'cap_reached' | 'ad_not_watched' | 'cancelled' | 'exception' | a raw spend
 * error string (server-side messages are not stable — don't branch on them).
 */
export type AdRewardFailReason = "cap_reached" | "ad_not_watched" | "cancelled" | "exception" | (string & {});

/**
 * The persisted daily-cap slice, living inside the host's save blob:
 * `ads: { watchedToday: 0, lastResetDay: null }`. Mutated in place.
 */
export interface AdsState {
    /** Watches counted toward today's cap (all placements share it). */
    watchedToday: number;
    /** localDayKey ('YYYY-MM-DD') of the last rollover; null on a fresh save. */
    lastResetDay: string | null;
}

/** Input to the (default or injected) no-ads-platform spend. */
export interface FallbackSpendRequest {
    productId: string;
    costRB: number;
    description: string;
}

/** Outcome of the (default or injected) no-ads-platform spend. */
export interface FallbackSpendResult {
    status: "purchased" | "cancelled" | "failed";
    error?: string;
}

/**
 * Host-side placement attribution for showRewardedAd, forwarded to the SDK
 * as adDisplayId/adDisplayName.
 */
export interface AdPlacement {
    id?: string;
    name?: string;
}

/**
 * All optional; exceptions swallowed. spendCurrency returns no receipt,
 * so on no-ads platforms these hooks are your spend audit trail.
 */
export interface AdsAnalyticsHooks {
    /**
     * Every successful grantReward; method 'ad'|'subscription'|'debug'|
     * 'runbucks' (split real watches from skips).
     */
    onRewardGranted?: (info: { trigger: string; method: AdWatchMethod }) => void;
    /**
     * Terminal failure: 'cap_reached' | 'ad_not_watched' | 'cancelled' |
     * 'exception' | a raw spend error.
     */
    onRewardFailed?: (info: { trigger: string; reason: AdRewardFailReason }) => void;
    /** Every fallback attempt's outcome: {productId, costRB, status, error?}. */
    onFallbackSpend?: (info: {
        productId: string;
        costRB: number;
        status: FallbackSpendResult["status"];
        error?: string;
    }) => void;
}

export interface AdsConfig {
    /**
     * Returns the LIVE persisted `{watchedToday, lastResetDay}` object (e.g.
     * `() => game.save.ads`). Mutated in place on every counted watch and on
     * day rollover, so it must be the object inside the save blob, not a copy.
     */
    getState: () => AdsState | null | undefined;
    /** Game-wide daily rewarded-watch budget shared by every placement. Default 15. */
    maxPerDay?: number;
    /**
     * Persist the save, e.g. `() => saveSystem.save()`. Called after every
     * counted watch (the counter must survive an immediate app kill).
     */
    persist?: () => void;
    /**
     * Synchronous no-ads-subscriber check, e.g. `() => sub.isActive()` from
     * systems/iap-shop/subscription.ts. Must be a cached/sync read (it runs on
     * every placement). Default: nobody subscribes. Exceptions = false.
     */
    isSubscriber?: () => boolean;
    /**
     * Override for the no-ads-platform spend. Default implementation calls
     * RundotGameAPI.iap.spendCurrency(productId, costRB, {description}) and
     * maps USER_CANCELLED to 'cancelled'. Inject to route through the host's
     * own purchase pipeline instead.
     */
    fallbackSpend?: (req: FallbackSpendRequest) => Promise<FallbackSpendResult>;
    /** RunBucks price of one bonus on no-ads platforms. */
    fallbackCostRB?: number;
    /**
     * When true, a successful RunBucks fallback also fires onWatchCounted —
     * letting no-ads platforms advance the watch ladder (which is otherwise
     * unreachable there). Never counts toward the daily cap either way.
     * Default false.
     */
    countFallbackAsWatch?: boolean;
    /**
     * Fired once per counted watch, BEFORE persist() — wire the ladder here
     * (`() => adLadder.recordWatch()`) so one persist covers both counters.
     */
    onWatchCounted?: (method: AdWatchMethod) => void;
    /**
     * ADAPT(testing only): skip the SDK and treat every show as watched, so
     * the post-ad flow can be exercised in local dev. MUST be false in
     * production.
     */
    debugFakeAds?: boolean;
    analytics?: AdsAnalyticsHooks;
}

export interface GrantRewardOptions {
    /**
     * Platform catalog id for the RunBucks fallback (e.g.
     * 'bonus_gameover_coins'); unused on ad platforms. Confirm the ids
     * exist in the live platform catalog before a no-ads build ships.
     */
    productId: string;
    /** Copy for the host's spend-confirm dialog (fallback path only). */
    description?: string;
    /**
     * Placement id for attribution + analytics ('gameover_coins',
     * 'dmg_boost', …). Forwarded to the SDK as adDisplayId.
     */
    trigger?: string;
    /** Human-readable placement name (SDK adDisplayName). */
    name?: string;
    /**
     * Apply the reward: mutate the save, persist, refresh HUD.
     * Exceptions are contained (the payment already happened —
     * grantReward still resolves true; fix the bug, don't re-charge).
     */
    onReward?: () => void;
    /**
     * Terminal failure for the UX layer. 'cancelled' (player declined
     * the spend dialog) is not worth a toast; the rest may be.
     */
    onFailed?: (reason: AdRewardFailReason) => void;
}

export interface AdsSystem {
    /** Daily budget, exposed so UIs can render "N/15 today". */
    maxPerDay: number;
    /**
     * Fresh default state for the host's defaultSave() merge:
     * `ads: ads.defaults()` (or inline the literal).
     */
    defaults(): AdsState;
    /**
     * The live cap state, day-rolled lazily: if the trusted clock says a
     * new local day started, the counter resets in place. Idempotent on
     * the same day; called by every check below. A missing/invalid
     * getState() yields a detached fresh object (mock/fresh-save safety:
     * counting won't persist, but nothing crashes).
     */
    state(): AdsState;
    /** Watches still available today (0..maxPerDay). Cheap sync check. */
    remainingToday(): number;
    /** Capped for the day? Cheap sync check — no SDK call. */
    capReached(): boolean;
    /** Ms until the cap resets (next local midnight, trusted clock). */
    msUntilCapReset(): number;
    /**
     * True when rewarded ads exist on this platform. Permissive default:
     * only an explicit `capabilities.ads === false` from the host (e.g.
     * Steam) flips placements to the RunBucks path — an older SDK with no
     * capability field keeps the ad-based behavior. SDK 5.23+ mock mode
     * explicitly reports ads available. Honors the debug override.
     */
    adsCapability(): boolean;
    /**
     * Debug-only: force the capability so both paths are testable on one
     * device. Never call from production UI — wire it to a debug-only
     * button if the host has one.
     */
    setAdsOverride(mode: "platform" | "ads" | "noads"): void;
    /** Current override as a mode string, for a debug button's label. */
    getAdsOverride(): "platform" | "ads" | "noads";
    /**
     * Ad-path availability probe: cap + SDK readiness. Drives button
     * disabled states ("No ad available") — check adsCapability() FIRST
     * and skip this on no-ads platforms (the fallback needs no probe;
     * the host's confirm dialog handles everything). Subscribers never
     * need host ad fill — the placement grants instantly — so their
     * buttons never gray out; the cap check still applies to them.
     */
    isAvailable(): Promise<boolean>;
    /**
     * Show a rewarded ad (or skip it for subscribers / debugFakeAds).
     * Resolves true iff the player earned the reward — the SDK's boolean
     * is the grant gate: false covers both "never shown" and "closed
     * early", and there is no separate "shown" signal. On true, the
     * daily counter increments, onWatchCounted fires (ladder), and the
     * save persists. Use directly for pure watch placements (ladder
     * watch button, watch-an-ad quests); bonus placements should go
     * through grantReward instead.
     */
    showRewardedAd(placement?: AdPlacement): Promise<boolean>;
    /**
     * THE three-path chokepoint (see header). Grants a bonus paid by a
     * rewarded ad where ads exist (instant for subscribers), or by a
     * small RunBucks charge where they don't. onReward fires ONLY when
     * the player actually paid (watched / skipped-as-subscriber /
     * spent); grant + persist your reward inside it. Never rejects.
     * Re-entrant calls while one is in flight resolve false — pair with
     * disabling the button (the reference screen does both).
     * Resolves true iff the reward was granted.
     */
    grantReward(opts: GrantRewardOptions): Promise<boolean>;
}

export function createAds(config: AdsConfig): AdsSystem {
    const {
        getState,
        maxPerDay = 15,
        persist = () => {},
        isSubscriber = () => false,
        fallbackSpend = null,
        fallbackCostRB = 1,
        countFallbackAsWatch = false,
        onWatchCounted = null,
        debugFakeAds = false,
        analytics = {},
    } = config;

    // Memoized capability read — the host flags don't change within a session.
    let _caps: { ads: boolean } | null = null;
    // Debug-only override so both paths can be exercised on one device:
    // null = follow the platform, true = force ads, false = force no-ads.
    let _adsOverride: boolean | null = null;
    let _granting = false;

    // Integrator hooks must never break the grant pipeline.
    function hook(name: keyof AdsAnalyticsHooks, info: unknown): void {
        const fn = analytics[name] as ((info: unknown) => void) | undefined;
        if (typeof fn === "function") {
            try {
                fn(info);
            } catch {
                /* swallow */
            }
        }
    }

    function subscriberActive(): boolean {
        try {
            return !!isSubscriber();
        } catch {
            return false;
        }
    }

    /** Default no-ads spend: a direct RunBucks charge. The host shows its own
     *  spend-confirm dialog; USER_CANCELLED (the only stable error string)
     *  means the player declined it. Never throws. */
    async function defaultFallbackSpend({
        productId,
        costRB,
        description,
    }: FallbackSpendRequest): Promise<FallbackSpendResult> {
        try {
            const result = await RundotGameAPI.iap.spendCurrency(productId, costRB, { description });
            if (result && result.success) return { status: "purchased" };
            const err = (result && result.error) || "spend_failed";
            if (err === "USER_CANCELLED") return { status: "cancelled" };
            return { status: "failed", error: String(err).slice(0, 200) };
        } catch (e: any) {
            return { status: "failed", error: String((e && e.message) || e).slice(0, 200) };
        }
    }

    const sys: AdsSystem = {
        /** Daily budget, exposed so UIs can render "N/15 today". */
        maxPerDay,

        /**
         * Fresh default state for the host's defaultSave() merge:
         * `ads: ads.defaults()` (or inline the literal).
         */
        defaults(): AdsState {
            return { watchedToday: 0, lastResetDay: null };
        },

        /**
         * The live cap state, day-rolled lazily: if the trusted clock says a
         * new local day started, the counter resets in place. Idempotent on
         * the same day; called by every check below. A missing/invalid
         * getState() yields a detached fresh object (mock/fresh-save safety:
         * counting won't persist, but nothing crashes).
         */
        state(): AdsState {
            let st = getState();
            if (!st || typeof st !== "object") st = sys.defaults();
            const todayKey = localDayKey(serverNow());
            if (st.lastResetDay !== todayKey) {
                st.watchedToday = 0;
                st.lastResetDay = todayKey;
            }
            return st;
        },

        /** Watches still available today (0..maxPerDay). Cheap sync check. */
        remainingToday(): number {
            return Math.max(0, maxPerDay - (sys.state().watchedToday || 0));
        },

        /** Capped for the day? Cheap sync check — no SDK call. */
        capReached(): boolean {
            return sys.remainingToday() <= 0;
        },

        /** Ms until the cap resets (next local midnight, trusted clock). */
        msUntilCapReset(): number {
            return msUntilNextLocalMidnight(serverNow());
        },

        /**
         * True when rewarded ads exist on this platform. Permissive default:
         * only an explicit `capabilities.ads === false` from the host (e.g.
         * Steam) flips placements to the RunBucks path — an older SDK with no
         * capability field keeps the ad-based behavior. SDK 5.23+ mock mode
         * explicitly reports ads available. Honors the debug override.
         */
        adsCapability(): boolean {
            if (_adsOverride !== null) return _adsOverride;
            if (_caps === null) {
                let ads = true;
                try {
                    const env = RundotGameAPI.system.getEnvironment();
                    if (env && env.capabilities) ads = env.capabilities.ads !== false;
                } catch {
                    /* unavailable environment — keep permissive default */
                }
                _caps = { ads };
            }
            return _caps.ads;
        },

        /**
         * Debug-only: force the capability so both paths are testable on one
         * device. Never call from production UI — wire it to a debug-only
         * button if the host has one.
         */
        setAdsOverride(mode: "platform" | "ads" | "noads"): void {
            _adsOverride = mode === "ads" ? true : mode === "noads" ? false : null;
        },

        /** Current override as a mode string, for a debug button's label. */
        getAdsOverride(): "platform" | "ads" | "noads" {
            return _adsOverride === null ? "platform" : _adsOverride ? "ads" : "noads";
        },

        /**
         * Ad-path availability probe: cap + SDK readiness. Drives button
         * disabled states ("No ad available") — check adsCapability() FIRST
         * and skip this on no-ads platforms (the fallback needs no probe;
         * the host's confirm dialog handles everything). Subscribers never
         * need host ad fill — the placement grants instantly — so their
         * buttons never gray out; the cap check still applies to them.
         */
        async isAvailable(): Promise<boolean> {
            if (sys.capReached()) return false;
            if (subscriberActive()) return true;
            if (debugFakeAds) return true;
            try {
                return !!(await RundotGameAPI.ads.isRewardedAdReadyAsync());
            } catch {
                return false;
            }
        },

        /**
         * Show a rewarded ad (or skip it for subscribers / debugFakeAds).
         * Resolves true iff the player earned the reward — the SDK's boolean
         * is the grant gate: false covers both "never shown" and "closed
         * early", and there is no separate "shown" signal. On true, the
         * daily counter increments, onWatchCounted fires (ladder), and the
         * save persists. Use directly for pure watch placements (ladder
         * watch button, watch-an-ad quests); bonus placements should go
         * through grantReward instead.
         */
        async showRewardedAd(placement?: AdPlacement): Promise<boolean> {
            if (sys.capReached()) return false;
            let watched = false;
            let method: AdWatchMethod = "ad";
            if (subscriberActive()) {
                // Instant grant, but counted as a real watch (see header).
                watched = true;
                method = "subscription";
            } else if (debugFakeAds) {
                watched = true;
                method = "debug";
            } else {
                try {
                    watched = !!(await RundotGameAPI.ads.showRewardedAdAsync(
                        placement && placement.id
                            ? {
                                  adDisplayId: placement.id,
                                  adDisplayName: placement.name || placement.id,
                              }
                            : undefined,
                    ));
                } catch {
                    watched = false;
                }
            }
            if (watched) countWatch(method);
            return watched;
        },

        /**
         * THE three-path chokepoint (see header). Grants a bonus paid by a
         * rewarded ad where ads exist (instant for subscribers), or by a
         * small RunBucks charge where they don't. onReward fires ONLY when
         * the player actually paid (watched / skipped-as-subscriber /
         * spent); grant + persist your reward inside it. Never rejects.
         * Re-entrant calls while one is in flight resolve false — pair with
         * disabling the button (the reference screen does both).
         * Resolves true iff the reward was granted.
         */
        async grantReward(opts: GrantRewardOptions): Promise<boolean> {
            const { productId, description, trigger, name, onReward, onFailed } = opts || ({} as GrantRewardOptions);
            if (_granting) return false; // double-tap guard
            _granting = true;
            const tr = trigger || "unknown";

            function fail(reason: AdRewardFailReason): void {
                hook("onRewardFailed", { trigger: tr, reason });
                if (onFailed) {
                    try {
                        onFailed(reason);
                    } catch {
                        /* swallow */
                    }
                }
            }
            function grant(method: AdWatchMethod): void {
                if (onReward) {
                    try {
                        onReward();
                    } catch (e) {
                        console.warn("[ads] onReward threw:", e);
                    }
                }
                hook("onRewardGranted", { trigger: tr, method });
            }

            try {
                if (sys.adsCapability()) {
                    if (sys.capReached()) {
                        fail("cap_reached");
                        return false;
                    }
                    // Method resolved BEFORE the await so the analytics event
                    // can't misattribute a mid-ad subscription change.
                    const method: AdWatchMethod = subscriberActive() ? "subscription" : debugFakeAds ? "debug" : "ad";
                    const watched = await sys.showRewardedAd({ id: tr, name });
                    if (watched) {
                        grant(method);
                        return true;
                    }
                    fail("ad_not_watched");
                    return false;
                }

                // No-ads platform: charge RunBucks for the same bonus. The
                // host shows a spend-confirm dialog; nothing to preflight.
                const spend = fallbackSpend || defaultFallbackSpend;
                let res: FallbackSpendResult | null = null;
                try {
                    res = await spend({
                        productId,
                        costRB: fallbackCostRB,
                        description: description || "",
                    });
                } catch (e: any) {
                    res = { status: "failed", error: String((e && e.message) || e).slice(0, 200) };
                }
                const status = (res && res.status) || "failed";
                hook("onFallbackSpend", {
                    productId,
                    costRB: fallbackCostRB,
                    status,
                    error: (res && res.error) || undefined,
                });
                if (status === "purchased") {
                    grant("runbucks");
                    // Cap-exempt by design (paid per grant); optionally still
                    // advances the ladder so no-ads platforms can reach it.
                    if (countFallbackAsWatch && onWatchCounted) {
                        try {
                            onWatchCounted("runbucks");
                        } catch {
                            /* swallow */
                        }
                        persist();
                    }
                    return true;
                }
                fail(status === "cancelled" ? "cancelled" : (res && res.error) || "spend_failed");
                return false;
            } catch {
                fail("exception");
                return false;
            } finally {
                _granting = false;
            }
        },
    };

    /** Count one successful watch: bump the day counter (re-read via state()
     *  in case the day ticked over mid-ad), feed the ladder, persist once. */
    function countWatch(method: AdWatchMethod): void {
        const st = sys.state();
        st.watchedToday = (st.watchedToday || 0) + 1;
        if (onWatchCounted) {
            try {
                onWatchCounted(method);
            } catch {
                /* swallow */
            }
        }
        persist();
    }

    return sys;
}
