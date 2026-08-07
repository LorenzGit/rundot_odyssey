// RunBucks IAP shop for RUN games: client-defined catalog, one shared
// purchase pipeline, save-persisted ownership, limited-time + rotating offers.
//
// Model: this is the LOW-LEVEL RunBucks model. The catalog lives in game
// code/gamedata, purchases go through RundotGameAPI.iap.spendCurrency(id,
// costRB), and ownership is persisted in the game's own save
// (save.iapOwned = {bundleId: purchaseCount}). Two item kinds:
//   - bundles: recorded in iapOwned; one-time or stacking; may gate on
//     another bundle (`requires`) or ride the 24h limited window (`limited`).
//     Passive stat bonuses are NOT applied at purchase time — they are
//     re-derived from ownership counts by the game's own bonus recompute
//     (see forEachOwned + the README's re-derivation pattern).
//   - packs: consumable currency grants (gem packs), fully resolved at
//     purchase time by applyGrant and NEVER recorded in iapOwned.
//
// The platform also offers a HIGH-LEVEL server-config model
// (RundotGameAPI.shop.getCatalog() / shop.purchase(itemId, idempotencyKey)
// plus RundotGameAPI.entitlements.*): server-authoritative catalog and
// ownership, idempotency keys, refund windows. See the README for when to
// prefer it over this template.
//
// Known risk, stated honestly: spendCurrency returns no receipt or
// transaction id. If the app dies between a successful spend and the
// persisted grant, the RunBucks are gone with no client-side recovery.
// purchase() persists IMMEDIATELY after applying the grant to shrink that
// window to milliseconds; if the residual risk is unacceptable for your
// price points, use the server-config shop model instead.

import RundotGameAPI from "@series-inc/rundot-game-sdk/api";
import { serverNow } from "../../shared/serverTime";

// The SDK's /api entry doesn't re-export its iap result types (v5.23.0), so
// extract the ones we handle from the method signatures themselves. The
// pipeline widens them with `| undefined` for older/partial hosts — those
// runtime guards are deliberate, keep them.
type SpendCurrencyResult = Awaited<ReturnType<typeof RundotGameAPI.iap.spendCurrency>>;
type OpenStoreResult = Awaited<ReturnType<typeof RundotGameAPI.iap.openStore>>;

/**
 * A purchasable bundle: recorded in iapOwned; one-time or stacking. Grant
 * SEMANTICS live in config.applyGrant — machinery only reads the fields
 * typed here.
 */
export interface ShopBundle {
    id: string;
    name: string;
    costRB: number;
    /** Display copy for the storefront's perk list. */
    perks?: string[];
    /** Game-defined grant data, interpreted by config.applyGrant. */
    grants?: Record<string, any>;
    /** Bundle id that must be owned first; gated bundles are HIDDEN until then. */
    requires?: string;
    /** Rides the 24h limited-offer window. */
    limited?: boolean;
    /** Success toast override. */
    toast?: string;
    /** Games attach their own metadata to catalog entries (e.g. the bonus
     *  fields the README's re-derivation pattern reads off each bundle). */
    [extra: string]: any;
}

/**
 * A consumable currency pack (gem pack): fully resolved at purchase time by
 * config.applyGrant and NEVER recorded in iapOwned.
 */
export interface ShopPack {
    id: string;
    name?: string;
    costRB: number;
    /** Display quantity for the reference UI's bonus-badge math; if absent
     *  the UI falls back to the first numeric value in grants. */
    amount?: number;
    /** Game-defined grant data, interpreted by config.applyGrant. */
    grants: Record<string, any>;
    /** Success toast override. */
    toast?: string;
    /** Games attach their own metadata to catalog entries. */
    [extra: string]: any;
}

/** Anything the purchase pipeline can sell. */
export type ShopItem = ShopBundle | ShopPack;

/** Client-defined catalog, exposed on the shop for storefront rendering. */
export interface ShopCatalog {
    bundles: ShopBundle[];
    packs: ShopPack[];
}

/** 'bundle' records ownership in iapOwned; 'pack' resolves entirely via applyGrant. */
export type PurchaseKind = "bundle" | "pack";

/** Terminal state of one purchase() call. */
export type PurchaseResult = "purchased" | "insufficient" | "cancelled" | "failed" | "busy";

/** UI state for a limited bundle — see limitedOfferState(). */
export type LimitedOfferState = "active" | "owned" | "expired" | "none";

/**
 * Save fields this system owns. Merge into the game's defaultSave() (see
 * systems/save) — additive, so old saves back-fill automatically.
 * defaults() returns exactly this object.
 */
export interface IapShopSaveSlice {
    /** {bundleId: purchaseCount} */
    iapOwned: Record<string, number>;
    /** epoch ms of first-ever IAP (0 = never) */
    firstPurchaseAt: number;
    /** 24h offer window start (0 = not seen) */
    limitedOfferStartMs: number;
}

/**
 * The host game's live save object as the shop sees it: the host owns the
 * rest of the shape (inherently untyped here — same posture as LegacySave in
 * systems/save), and the shop's three fields are Partial because a save that
 * predates the defaults() merge may lack them — ownedMap() auto-creates
 * iapOwned on first touch.
 */
export type IapShopHostSave = Record<string, any> & Partial<IapShopSaveSlice>;

/**
 * Terminal state of every purchase attempt, passed to analytics.onSpendResult.
 * ('busy' never reaches this hook — a swallowed double-tap isn't an attempt.)
 */
export interface SpendResultInfo {
    item: ShopItem;
    kind: PurchaseKind;
    costRB: number;
    status: "purchased" | "insufficient" | "cancelled" | "failed";
    /** Where a failure surfaced: the spendCurrency result or a thrown exception. */
    stage?: "spend_call" | "exception";
    /** Failure detail, truncated to 200 chars. Not a stable API — log only. */
    error?: string;
    /** Post-purchase balance (null = unknown); present on 'purchased'. */
    balanceAfter?: number | null;
}

/** Passed to analytics.onFirstPurchase — once per save lifetime, any item kind. */
export interface FirstPurchaseInfo {
    item: ShopItem;
    kind: PurchaseKind;
    costRB: number;
    /** serverNow() when the milestone was stamped (= save.firstPurchaseAt). */
    at: number;
}

/**
 * All optional; exceptions in hooks are swallowed. Because spendCurrency
 * returns no receipt, these hooks ARE your purchase audit trail — wire
 * them to your analytics events.
 */
export interface ShopAnalyticsHooks {
    /** Every purchase() entry (funnel step). */
    onBuyTapped?(item: ShopItem, kind: PurchaseKind): void;
    /** Right before spendCurrency (records intent even if the platform UI hangs). */
    onSpendAttempt?(item: ShopItem, kind: PurchaseKind): void;
    /** Terminal state of every attempt. */
    onSpendResult?(info: SpendResultInfo): void;
    /** Once per save lifetime, any item kind. */
    onFirstPurchase?(info: FirstPurchaseInfo): void;
    /** The 24h window just started. */
    onLimitedOfferStamped?(bundle: ShopBundle | null): void;
}

export interface ShopUiHooks {
    /** Success/failure messages. */
    toast?: (msg: string) => void;
    /** Re-render the storefront if visible (called after purchases, top-ups,
     *  and icon arrival). */
    refresh?: () => void;
}

export interface IapShopConfig {
    /** Client-defined catalog. Grant SEMANTICS live in applyGrant — machinery
     *  only reads the fields typed on ShopBundle/ShopPack. */
    catalog: ShopCatalog;
    /**
     * Returns the live save object. The shop reads/writes three fields on it
     * (see defaults()): iapOwned, firstPurchaseAt, limitedOfferStartMs.
     */
    getSave: () => IapShopHostSave;
    /**
     * Override for the ownership map (must return the LIVE mutable map —
     * purchase() bumps counts on it). Default: getSave().iapOwned.
     */
    getOwned?: (() => Record<string, number>) | null;
    /**
     * Apply one-shot grants to the save (add gems, unlock a speed, grant a
     * relic). Bumping the ownership count is the machinery's job — do NOT
     * apply passive stat bonuses here either; re-derive those from ownership
     * counts in recomputeBonuses.
     */
    applyGrant?: ((item: ShopItem, kind: PurchaseKind) => void) | null;
    /**
     * Persist the save, e.g. `() => saveSystem.save()`. Called immediately
     * after every grant (the crash-window mitigation) and after offer stamps.
     */
    persist?: () => void;
    /**
     * Re-derive passive IAP bonuses from ownership counts (via forEachOwned).
     * Called after every successful bundle/pack purchase.
     */
    recomputeBonuses?: (() => void) | null;
    /** Fired whenever the cached balance updates (null = not fetched or failed). */
    onBalanceChanged?: ((balance: number | null) => void) | null;
    /** Player messaging / storefront repaint hooks. */
    ui?: ShopUiHooks;
    /**
     * Because spendCurrency returns no receipt, these hooks ARE your purchase
     * audit trail — wire them to your analytics events.
     */
    analytics?: ShopAnalyticsHooks;
    /** Limited-offer window length. Default 24h. */
    limitedOfferDurationMs?: number;
}

export interface IapShop {
    /** The client-defined catalog, exposed for storefront rendering. */
    catalog: ShopCatalog;

    /** Cached RunBucks balance. null = unknown (not yet fetched or fetch
     *  failed) — render '--', never 0. */
    balance: number | null;

    /** Currency icon data URL; null until fetchCurrencyIcon() lands.
     *  UI renders a text "RB" chip until then (and keeps it as a hidden
     *  fallback sibling after — see shopScreen.applyCurrencyIcon). */
    iconUrl: string | null;

    /** This session's rotating special-offer bundle (or null). Set by
     *  pickSessionOffer() once per app launch. */
    sessionOffer: ShopBundle | null;

    /** Double-tap guard: true while a purchase() is in flight. */
    _purchasing: boolean;

    /** Save fields this system owns — merge into the game's defaultSave(). */
    defaults(): IapShopSaveSlice;
    /** How many times a bundle has been purchased (0 if never). */
    ownedCount(id: string): number;
    /** True while a bundle's prerequisite is unowned (gated = hidden). */
    isGated(bundle: ShopBundle | null | undefined): boolean;
    /** Bundles the storefront should render right now. */
    visibleBundles(): ShopBundle[];
    /** Iterate owned bundles: fn(bundle, count) for every count > 0. */
    forEachOwned(fn: (bundle: ShopBundle, count: number) => void): void;
    /** The full purchase pipeline, shared by bundles and packs. */
    purchase(item: ShopItem, kind?: PurchaseKind): Promise<PurchaseResult>;
    /** Refresh the cached RunBucks balance. Never throws. */
    refreshBalance(): Promise<number | null>;
    /** Fetch + cache the platform's RunBucks icon as a data URL. */
    fetchCurrencyIcon(): Promise<string | null>;
    /** Start the 24h offer window iff it hasn't started; true if stamped now. */
    stampLimitedOfferIfUnset(): boolean;
    /** Remaining ms in the offer window; 0 if unstamped or elapsed. */
    limitedOfferRemainingMs(): number;
    /** UI state for a limited bundle. */
    limitedOfferState(bundle: ShopBundle | null | undefined): LimitedOfferState;
    /** Pick + cache this session's rotating special-offer bundle. */
    pickSessionOffer(): ShopBundle | null;
}

export function createIapShop(config: IapShopConfig): IapShop {
    const {
        catalog,
        getSave,
        getOwned = null,
        applyGrant = null,
        persist = () => {},
        recomputeBonuses = null,
        onBalanceChanged = null,
        ui = {},
        analytics = {},
        limitedOfferDurationMs = 24 * 60 * 60 * 1000,
    } = config;

    // Live mutable ownership map; auto-created on the save so a fresh save
    // that predates defaults() still works.
    function ownedMap(): Record<string, number> {
        if (getOwned) return getOwned() || {};
        const s = getSave();
        if (!s.iapOwned) s.iapOwned = {};
        return s.iapOwned;
    }

    // Integrator hooks must never break the purchase pipeline.
    function hook<K extends keyof ShopAnalyticsHooks>(
        name: K,
        ...args: Parameters<NonNullable<ShopAnalyticsHooks[K]>>
    ): void {
        const fn = analytics[name] as ((...hookArgs: any[]) => void) | undefined;
        if (typeof fn === "function") {
            try {
                fn(...args);
            } catch (e) {
                /* swallow */
            }
        }
    }
    function toast(msg: string): void {
        try {
            ui.toast && ui.toast(msg);
        } catch (e) {
            /* swallow */
        }
    }
    function refreshUi(): void {
        try {
            ui.refresh && ui.refresh();
        } catch (e) {
            /* swallow */
        }
    }
    function notifyBalance(): void {
        if (onBalanceChanged) {
            try {
                onBalanceChanged(sys.balance);
            } catch (e) {
                /* swallow */
            }
        }
    }

    const sys: IapShop = {
        catalog,

        balance: null,

        iconUrl: null,

        sessionOffer: null,

        _purchasing: false,

        /**
         * Save fields this system owns. Merge into the game's defaultSave()
         * (see systems/save) — additive, so old saves back-fill automatically.
         */
        defaults(): IapShopSaveSlice {
            return {
                iapOwned: {}, // {bundleId: purchaseCount}
                firstPurchaseAt: 0, // epoch ms of first-ever IAP (0 = never)
                limitedOfferStartMs: 0, // 24h offer window start (0 = not seen)
            };
        },

        /** How many times a bundle has been purchased (0 if never). */
        ownedCount(id: string): number {
            return ownedMap()[id] || 0;
        },

        /** True while a bundle's prerequisite is unowned — gated bundles
         *  are hidden entirely, not shown disabled. */
        isGated(bundle: ShopBundle | null | undefined): boolean {
            return !!(bundle && bundle.requires && sys.ownedCount(bundle.requires) <= 0);
        },

        /** Bundles the storefront should render right now: ungated, and
         *  limited bundles only while 'active' (buyable) or 'owned'
         *  (permanent purchase history). Expired-unpurchased = gone. */
        visibleBundles(): ShopBundle[] {
            return (catalog.bundles || []).filter((b) => {
                if (!b || sys.isGated(b)) return false;
                if (b.limited) {
                    const st = sys.limitedOfferState(b);
                    return st === "active" || st === "owned";
                }
                return true;
            });
        },

        /**
         * Iterate owned bundles: fn(bundle, count) for every catalog bundle
         * with ownedCount > 0. This is the input to the bonus re-derivation
         * pattern (see README) — passive stat bonuses are recomputed from
         * counts here, never applied incrementally at purchase time.
         * Ids in iapOwned with no catalog entry (retired bundles) are skipped.
         */
        forEachOwned(fn: (bundle: ShopBundle, count: number) => void): void {
            for (const b of catalog.bundles || []) {
                if (!b) continue;
                const count = sys.ownedCount(b.id);
                if (count > 0) fn(b, count);
            }
        },

        /**
         * The full purchase pipeline, shared by bundles and packs.
         * `kind` defaults to 'bundle': 'bundle' records ownership in
         * iapOwned; 'pack' resolves entirely via applyGrant.
         *
         * Steps: buy-tapped hook -> balance check -> if short, openStore and
         * BAIL (never spend on the same tap that topped up) -> spendCurrency
         * -> on success: bump ownership + applyGrant + persist IMMEDIATELY ->
         * recompute bonuses -> re-fetch balance (spendCurrency returns none)
         * -> refresh UI -> toast -> analytics. USER_CANCELLED stays quiet.
         */
        async purchase(item: ShopItem, kind?: PurchaseKind): Promise<PurchaseResult> {
            const k: PurchaseKind = kind === "pack" ? "pack" : "bundle";
            const cost = Number(item.costRB) || 0;
            if (sys._purchasing) return "busy"; // double-tap guard
            sys._purchasing = true;
            hook("onBuyTapped", item, k);
            try {
                // Typed Promise<number> by the SDK, but older/partial hosts can
                // resolve undefined — widen so the guards below stay honest.
                const balance: number | undefined = await RundotGameAPI.iap.getHardCurrencyBalance();
                sys.balance = typeof balance === "number" ? balance : null;
                notifyBalance();

                // Insufficient funds: deep-link the platform store and bail.
                // The player tops up there; they tap BUY again afterwards.
                // (An unknown balance — unavailable host data — falls through
                // and lets spendCurrency decide.)
                if (typeof balance === "number" && balance < cost) {
                    try {
                        const store: OpenStoreResult | undefined = await RundotGameAPI.iap.openStore();
                        if (store && typeof store.newBalance === "number") {
                            sys.balance = store.newBalance; // authoritative — skip the re-fetch
                            notifyBalance();
                        } else {
                            await sys.refreshBalance();
                        }
                    } catch (e) {
                        await sys.refreshBalance();
                    }
                    refreshUi();
                    hook("onSpendResult", { item, kind: k, costRB: cost, status: "insufficient" });
                    return "insufficient";
                }

                // Fired BEFORE the SDK call so the funnel records intent
                // even if the platform purchase UI hangs or errors.
                hook("onSpendAttempt", item, k);
                const result: SpendCurrencyResult | undefined = await RundotGameAPI.iap.spendCurrency(item.id, cost);

                if (result && result.success) {
                    // Grant + persist FIRST, before any await. The spend has
                    // already happened platform-side; every ms before the save
                    // lands is a window where a crash loses real money.
                    if (k === "bundle") {
                        const owned = ownedMap();
                        owned[item.id] = (owned[item.id] || 0) + 1;
                    }
                    if (applyGrant) applyGrant(item, k);

                    // First-ever IAP milestone: a dedicated stamp rather than
                    // walking iapOwned, because pack purchases never write to
                    // iapOwned and would slip through.
                    const save = getSave();
                    let firstEver = false;
                    if (!(Number(save.firstPurchaseAt) > 0)) {
                        save.firstPurchaseAt = serverNow();
                        firstEver = true;
                    }
                    persist();
                    if (recomputeBonuses) recomputeBonuses();

                    // spendCurrency returns no balance — re-fetch so the
                    // header reflects the post-purchase state immediately.
                    await sys.refreshBalance();
                    refreshUi();
                    toast(item.toast || "Purchased: " + (item.name || item.id));
                    hook("onSpendResult", {
                        item,
                        kind: k,
                        costRB: cost,
                        status: "purchased",
                        balanceAfter: sys.balance,
                    });
                    if (firstEver) {
                        hook("onFirstPurchase", {
                            // Non-null: firstEver ⇒ the stamp landed above.
                            item,
                            kind: k,
                            costRB: cost,
                            at: save.firstPurchaseAt!,
                        });
                    }
                    return "purchased";
                }

                // USER_CANCELLED is the ONLY stable error string. The player
                // declined the platform confirm — they know; stay quiet.
                const err = result && result.error;
                if (err === "USER_CANCELLED") {
                    hook("onSpendResult", { item, kind: k, costRB: cost, status: "cancelled" });
                    return "cancelled";
                }

                // Anything else: generic copy only. Never branch on (or show)
                // other error strings — they are not a stable API.
                toast("Purchase failed");
                hook("onSpendResult", {
                    item,
                    kind: k,
                    costRB: cost,
                    status: "failed",
                    stage: "spend_call",
                    error: String(err || "unknown").slice(0, 200),
                });
                return "failed";
            } catch (e: any) {
                toast("Purchase failed");
                hook("onSpendResult", {
                    item,
                    kind: k,
                    costRB: cost,
                    status: "failed",
                    stage: "exception",
                    error: String((e && e.message) || e).slice(0, 200),
                });
                return "failed";
            } finally {
                sys._purchasing = false;
            }
        },

        /**
         * Refresh the cached RunBucks balance. Never throws; failure leaves it
         * null ("unknown", rendered as '--').
         * Call on shop open and at boot (fire-and-forget).
         */
        async refreshBalance(): Promise<number | null> {
            try {
                // Widened for the same older/partial-host reason as in purchase().
                const bal: number | undefined = await RundotGameAPI.iap.getHardCurrencyBalance();
                sys.balance = typeof bal === "number" ? bal : null;
            } catch (e) {
                sys.balance = null;
            }
            notifyBalance();
            return sys.balance;
        },

        /**
         * Fetch the platform's RunBucks icon once per session and cache it as
         * a data URL on .iconUrl. getCurrencyIcon() returns { base64Data } —
         * RAW base64, so we prefix data:image/png;base64,. Also tolerates a
         * bare-string return from older SDK builds. On success, ui.refresh()
         * fires so an already-rendered storefront can swap its text chips.
         */
        async fetchCurrencyIcon(): Promise<string | null> {
            if (sys.iconUrl) return sys.iconUrl;
            try {
                // SDK typings say { base64Data } (v5.23.0), but older SDK
                // builds returned the base64 string bare and partial hosts can
                // return nothing — type the union we actually handle.
                const result = (await RundotGameAPI.iap.getCurrencyIcon()) as
                    | string
                    | { base64Data?: string }
                    | null
                    | undefined;
                const raw = typeof result === "string" ? result : result && result.base64Data;
                if (raw) {
                    sys.iconUrl =
                        raw.startsWith("data:") || raw.startsWith("http") ? raw : "data:image/png;base64," + raw;
                    refreshUi();
                }
            } catch (e) {
                /* unavailable icon: keep the "RB" text fallback */
            }
            return sys.iconUrl;
        },

        // ── Limited-time offer (starter pack) ─────────────────────────────
        //
        // The 24h clock starts the FIRST time the player sees the shop, not
        // at install — the offer should never be half-expired before it was
        // ever visible. The stamp is immutable per save: once expired, the
        // offer never returns (that scarcity is the point).

        /**
         * Stamp save.limitedOfferStartMs = serverNow() iff it's still 0.
         * Call from the shop's render path (the reference shopScreen does).
         * Uses the trusted clock so a device-clock rollback can't extend the
         * window. Returns true if the stamp was made this call.
         */
        stampLimitedOfferIfUnset(): boolean {
            const save = getSave();
            if (!save) return false;
            // Plain Number() coercion — NEVER `| 0` an epoch-ms timestamp.
            // ~1.77e12 overflows a 32-bit signed int and wraps to garbage,
            // which can make the offer "expire" the instant it is stamped.
            const current = Number(save.limitedOfferStartMs) || 0;
            if (current > 0) return false;
            save.limitedOfferStartMs = serverNow();
            persist();
            hook("onLimitedOfferStamped", (catalog.bundles || []).find((b) => b && b.limited) || null);
            return true;
        },

        /** Remaining ms in the offer window; 0 if unstamped or elapsed.
         *  Ignores ownership — pair with limitedOfferState for UI decisions. */
        limitedOfferRemainingMs(): number {
            const start = Number(getSave().limitedOfferStartMs) || 0; // never | 0
            if (start <= 0) return 0;
            return Math.max(0, limitedOfferDurationMs - (serverNow() - start));
        },

        /**
         * UI state for a limited bundle:
         *   'active'  — stamped, unowned, time remaining: show with countdown
         *   'owned'   — purchased: show as permanent OWNED history
         *   'expired' — window closed unpurchased: hide entirely
         *   'none'    — not a limited bundle, or window not yet stamped
         */
        limitedOfferState(bundle: ShopBundle | null | undefined): LimitedOfferState {
            if (!bundle || !bundle.limited) return "none";
            if (sys.ownedCount(bundle.id) > 0) return "owned";
            const start = Number(getSave().limitedOfferStartMs) || 0;
            if (start <= 0) return "none";
            return sys.limitedOfferRemainingMs() > 0 ? "active" : "expired";
        },

        /**
         * Rotating special offer: pick one random unpurchased, ungated,
         * non-limited bundle for this session's menu promo. Call once at
         * boot after the save loads; the pick is cached on .sessionOffer and
         * stays fixed for the whole app launch. Returns null when everything
         * is owned (hide the promo surface).
         */
        pickSessionOffer(): ShopBundle | null {
            const pool = (catalog.bundles || []).filter(
                (b) => b && !b.limited && sys.ownedCount(b.id) === 0 && !sys.isGated(b),
            );
            sys.sessionOffer = pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)] : null;
            return sys.sessionOffer;
        },
    };

    return sys;
}
