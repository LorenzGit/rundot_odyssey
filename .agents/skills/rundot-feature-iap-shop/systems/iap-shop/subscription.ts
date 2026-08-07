// Platform subscription wrapper for RUN games (e.g. a no-ads sub on the
// LITE tier).
//
// The platform is the source of truth for subscription state — the game
// never persists it. iap.isUserSubscribed(tier) is fetched at boot, on shop
// open, and after a successful purchase, and cached to a SYNCHRONOUS boolean
// so hot paths (every ad placement, every frame of a gated feature) never
// pay an SDK round-trip. The cache defaults to FALSE on any uncertainty:
// never grant the entitlement on a guess.
//
// Tier hierarchy: isUserSubscribed('LITE') is also true for holders of any
// higher tier (CORE/PLUS/...), which is usually what you want — any platform
// subscriber gets your perk.
//
// Availability ("should we render a sell card at all?") is deliberately
// strict: the host must allow subscriptions (capability flag) AND
// getSubscriptions must have returned a real package for our tier+interval.
// A card with a fallback price and a checkout that can't complete is worse
// than no card, so this gate requires a real package.
//
// Timeouts: platform IAP calls can hang when the host side is wedged. Status
// and price fetches are capped at 3s and fall back to "not subscribed" / "no
// price". The checkout sheet legitimately takes as long as the player needs,
// so purchase() gets a generous 5-minute cap — it only exists so a host that
// never answers can't wedge the buy button forever. If a checkout outlives
// the cap and later succeeds, no harm: isUserSubscribed is the truth and the
// next refreshStatus() picks it up.

import RundotGameAPI from "@series-inc/rundot-game-sdk/api";

// The SDK's /api entry doesn't re-export its subscription types (v5.23.0),
// so extract the slices we use from the iap method signatures themselves.
// If a newer SDK exports them, import those instead.
export type SubscriptionTier = Parameters<typeof RundotGameAPI.iap.isUserSubscribed>[0];
export type SubscriptionInterval = Parameters<typeof RundotGameAPI.iap.purchaseSubscription>[1];
type SubscriptionsResponse = Awaited<ReturnType<typeof RundotGameAPI.iap.getSubscriptions>>;
type SubscriptionRow = SubscriptionsResponse[string][number];

const STATUS_TIMEOUT_MS = 3000;
const PURCHASE_TIMEOUT_MS = 5 * 60 * 1000;

const INTERVAL_SUFFIX: Record<SubscriptionInterval, string> = { weekly: "/WK", monthly: "/MO", annual: "/YR" };

/** Resolve `p` or, after `ms`, the fallback. Never rejects. */
function withTimeout<T>(p: Promise<T>, fallback: T, ms: number): Promise<T> {
    return new Promise((resolve) => {
        let settled = false;
        const t = setTimeout(() => {
            if (settled) return;
            settled = true;
            resolve(fallback);
        }, ms);
        p.then((v) => {
            if (settled) return;
            settled = true;
            clearTimeout(t);
            resolve(v);
        }).catch(() => {
            if (settled) return;
            settled = true;
            clearTimeout(t);
            resolve(fallback);
        });
    });
}

/** capabilities.subscriptions from the host env — false where recurring
 *  billing is banned (e.g. Steam). Permissive when the field is missing
 *  (older SDK); the price-fetch gate still protects those hosts. SDK 5.23+
 *  mock mode explicitly reports subscription capability. */
function platformSubsCapability(): boolean {
    try {
        const env = RundotGameAPI.system.getEnvironment();
        return !(env && env.capabilities && env.capabilities.subscriptions === false);
    } catch (e) {
        return true;
    }
}

/** Passed to analytics.onPurchaseStarted. */
export interface SubPurchaseInfo {
    tier: SubscriptionTier;
    interval: SubscriptionInterval;
}

/** Passed to analytics.onPurchaseResult. */
export interface SubPurchaseResultInfo extends SubPurchaseInfo {
    success: boolean;
    /** Failure detail, truncated to 200 chars (thrown-exception path only). */
    error?: string;
}

/** All optional; exceptions in hooks are swallowed. */
export interface SubscriptionAnalyticsHooks {
    onPurchaseStarted?(info: SubPurchaseInfo): void;
    onPurchaseResult?(info: SubPurchaseResultInfo): void;
}

/** Cached platform price for the configured tier+interval. */
export interface SubscriptionPrice {
    price: number;
    currencyCode: string;
}

export interface SubscriptionConfig {
    /**
     * Platform tier, e.g. 'LITE' (the entry tier — weekly-only on current
     * platform builds; higher tiers satisfy the check too).
     */
    tier: SubscriptionTier;
    /** Billing interval — the SDK requires LOWERCASE (normalized here). */
    interval: SubscriptionInterval;
    /**
     * Kill switch for SELLING. false hides every upsell surface but leaves
     * isActive() working, so existing subscribers keep their entitlement —
     * you stop selling, you never revoke. Default true.
     */
    enabled?: boolean;
    /** Card title copy, e.g. 'NO ADS SUBSCRIPTION'. */
    name?: string;
    /** Card perk lines. */
    perks?: string[];
    /**
     * Button label while the live price hasn't landed. Only reachable with
     * debugShow (availability otherwise requires a fetched price); the real
     * checkout sheet always shows the true platform price regardless.
     */
    fallbackPriceLabel?: string;
    /** Toast copy after a completed checkout. */
    successToast?: string;
    /**
     * Force the sell card visible when no price is available. MUST be false
     * in production. Default false.
     */
    debugShow?: boolean;
    /** Fired when the cached active state flips (boot fetch, purchase, lapse). */
    onStatusChanged?: ((active: boolean) => void) | null;
    analytics?: SubscriptionAnalyticsHooks;
}

export interface Subscription {
    tier: SubscriptionTier;
    /** Normalized (lowercase) billing interval. */
    interval: SubscriptionInterval;
    name: string;
    perks: string[];
    successToast: string;
    /** True when the player holds the tier (or any higher tier). Synchronous
     *  cache; defaults false until a refreshStatus() lands. */
    isActive(): boolean;
    /** Should upsell surfaces render at all? */
    isAvailable(): boolean;
    /** Refresh cached status + price from the platform. Never throws. */
    refreshStatus(): Promise<boolean>;
    /** Buy-button label from the cached platform price. */
    priceLabel(): string;
    /** Run the platform checkout sheet; true only after a completed purchase. */
    purchase(): Promise<boolean>;
    /** Expose window.<probeName>() — async console diagnostic, safe to ship. */
    exposeProbe(probeName: string): void;
}

export function createSubscription(config: SubscriptionConfig): Subscription {
    const {
        tier,
        interval,
        enabled = true,
        name = "SUBSCRIPTION",
        perks = [],
        fallbackPriceLabel = "SUBSCRIBE",
        successToast = "Subscribed!",
        debugShow = false,
        onStatusChanged = null,
        analytics = {},
    } = config;

    const intervalLc = String(interval).toLowerCase() as SubscriptionInterval;

    // Memoized platform truth. _price carries {price, currencyCode} from
    // getSubscriptions so the button shows the platform-configured price,
    // not a hardcoded figure; null until the fetch lands (or if it fails).
    let _active = false;
    let _price: SubscriptionPrice | null = null;
    let _purchasing = false;

    function hook<K extends keyof SubscriptionAnalyticsHooks>(
        fnName: K,
        info: Parameters<NonNullable<SubscriptionAnalyticsHooks[K]>>[0],
    ): void {
        const fn = analytics[fnName] as ((info: any) => void) | undefined;
        if (typeof fn === "function") {
            try {
                fn(info);
            } catch (e) {
                /* swallow */
            }
        }
    }

    const sub: Subscription = {
        tier,
        interval: intervalLc,
        name,
        perks,
        successToast,

        /** True when the player holds the tier (or any higher tier).
         *  Synchronous — reads the cache; defaults false until a
         *  refreshStatus() lands. Safe for hot paths. */
        isActive(): boolean {
            return _active;
        },

        /**
         * Should upsell surfaces render at all? enabled kill switch, then:
         * active subscribers always pass (the ACTIVE card is confirmation),
         * otherwise the host must allow subscriptions AND the live price
         * must have been fetched — proof this game's product is actually
         * purchasable here. Hide the section entirely when this is false:
         * no card is better than a broken card.
         */
        isAvailable(): boolean {
            if (!enabled) return false;
            if (debugShow) return true;
            if (_active) return true;
            if (!platformSubsCapability()) return false;
            return _price !== null;
        },

        /**
         * Refresh cached status + price from the platform. Never throws;
         * every failure path leaves the safe defaults (inactive / no price).
         * Call fire-and-forget at boot, on shop open, and after purchase.
         * Resolves to the (possibly updated) active state.
         */
        async refreshStatus(): Promise<boolean> {
            const wasActive = _active;
            try {
                _active = !!(await withTimeout(RundotGameAPI.iap.isUserSubscribed(tier), false, STATUS_TIMEOUT_MS));
            } catch (e) {
                _active = false;
            }

            // Price fetch is best-effort and independent — a failure just
            // means the label stays on the fallback / previous value.
            try {
                const res = await withTimeout<SubscriptionsResponse | null>(
                    RundotGameAPI.iap.getSubscriptions(tier),
                    null,
                    STATUS_TIMEOUT_MS,
                );
                // Typed SubscriptionRow[] by the SDK, but an older host
                // can hand back anything — Partial<> keeps the .find guard.
                const rows: Partial<SubscriptionRow[]> = (res && res[tier]) || [];
                const row = rows.find ? rows.find((r) => r && r.interval === intervalLc) : null;
                if (row && typeof row.price === "number") {
                    _price = { price: row.price, currencyCode: row.currencyCode || "USD" };
                }
            } catch (e) {
                /* keep previous _price (or null) */
            }

            if (onStatusChanged && wasActive !== _active) {
                try {
                    onStatusChanged(_active);
                } catch (e) {
                    /* swallow */
                }
            }
            return _active;
        },

        /**
         * Buy-button label from the cached platform price ("$0.99/WK" for
         * USD, "0.99 EUR/WK" otherwise). refreshStatus() populates the
         * cache; before it lands this returns fallbackPriceLabel.
         */
        priceLabel(): string {
            if (_price && typeof _price.price === "number") {
                const p = _price.price.toFixed(2);
                const suffix = INTERVAL_SUFFIX[intervalLc] || "";
                return _price.currencyCode === "USD" ? "$" + p + suffix : p + " " + _price.currencyCode + suffix;
            }
            return fallbackPriceLabel;
        },

        /**
         * Run the platform checkout sheet. Resolves true only after a
         * completed purchase (cached state already refreshed, so the very
         * next isActive() reflects it). Never throws. Re-entrant calls
         * while a sheet is up resolve false — pair with disabling the buy
         * button (the reference shopScreen does both).
         */
        async purchase(): Promise<boolean> {
            if (_purchasing || !enabled) return false;
            _purchasing = true;
            hook("onPurchaseStarted", { tier, interval: intervalLc });
            try {
                // The SDK types the response as just {success}; the wider
                // annotation admits the timeout fallback's `error` field.
                const res = await withTimeout<{ success: boolean; error?: string }>(
                    RundotGameAPI.iap.purchaseSubscription(tier, intervalLc),
                    { success: false, error: "timeout" },
                    PURCHASE_TIMEOUT_MS,
                );
                const success = !!(res && res.success);
                if (!success) {
                    // Published response type is just {success}, but hosts may
                    // pass through richer failure fields — log whatever came
                    // back so a broken checkout is diagnosable from a console.
                    console.warn("[sub] purchase did not complete:", res);
                }
                hook("onPurchaseResult", { tier, interval: intervalLc, success });
                if (success) await sub.refreshStatus();
                return success;
            } catch (e: any) {
                console.warn("[sub] purchase threw:", e);
                hook("onPurchaseResult", {
                    tier,
                    interval: intervalLc,
                    success: false,
                    error: String((e && e.message) || e).slice(0, 200),
                });
                return false;
            } finally {
                _purchasing = false;
            }
        },

        /**
         * Expose window.<name>() — an async console probe that snapshots
         * everything the subscription depends on (capabilities, live
         * packages for the tier, current subscribed state). Safe to ship;
         * run it on a DEPLOYED build to verify the platform-side product
         * configuration without a redeploy.
         */
        exposeProbe(probeName: string): void {
            if (typeof window === "undefined") return;
            (window as any)[probeName] = async () => {
                const out: Record<string, any> = {};
                try {
                    const env = RundotGameAPI.system.getEnvironment();
                    out.platform = env && env.platform;
                    out.capabilities = env && env.capabilities;
                } catch (e) {
                    out.environment_error = String(e);
                }
                try {
                    out.subscriptions = await RundotGameAPI.iap.getSubscriptions(tier);
                } catch (e) {
                    out.subscriptions_error = String(e);
                }
                try {
                    out.isUserSubscribed = await RundotGameAPI.iap.isUserSubscribed(tier);
                } catch (e) {
                    out.isUserSubscribed_error = String(e);
                }
                console.log("[sub probe]", out);
                return out;
            };
        },
    };

    return sub;
}
