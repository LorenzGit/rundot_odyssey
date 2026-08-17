/**
 * Purchases and ownership for the template shop.
 *
 * Two rules run through everything here. Ownership is asserted from an
 * authoritative entitlement read — and when that read fails (`null`, distinct
 * from `[]`), the save's last authoritative record stands rather than being
 * revoked. And every checkout goes through the purchase coordinator, so an
 * interrupted order is reconciled against order history instead of being
 * charged twice or silently lost.
 */
import RundotGameAPI from "@series-inc/rundot-game-sdk/api";
import type { ShopOrderHistoryResponse } from "@series-inc/rundot-game-sdk";
import packageJson from "../../../package.json";
import { DRACHMAE_PACK_VALUE, isConfiguredPlatformId } from "../../config/platform.ts";
import { loadArrowProgress, saveArrowProgress } from "../../game/arrows.ts";
import {
    consumeEntitlement,
    getRunCapabilities,
    listEntitlements,
    purchaseVerifiedShopItem,
    readShopPrice,
    recordAnalytics,
    withTimeout,
    type OwnedEntitlement,
    type ShopCheckoutResult,
} from "../../sdk/runSdk.ts";
import { store } from "../../state/store.ts";
import { formatNumber } from "../localization.ts";
import { runtimeServices } from "../runtimeServices.ts";
import { saveSystem } from "../save.ts";
import {
    declineReasonForCode,
    type DeclineReason,
    verdictForCode,
    verdictForMessage,
} from "./checkoutClassification.ts";
import { PATRONAGE_PRODUCT_ID, PRODUCT_NAMES, type ProductId, products } from "./config.ts";
import { createMonetizationTelemetry } from "./monetizationTelemetry.ts";
import { createPurchaseCoordinator, type PurchaseOutcome } from "./purchaseCoordinator.ts";

export const monetizationTelemetry = createMonetizationTelemetry({
    analytics: { recordCustomEvent: (name, payload) => recordAnalytics(name, payload) },
    // ADAPT: add platform, progression, payer state, and experiment context.
    context: () => ({ build_version: packageJson.version }),
    debug: import.meta.env.DEV,
});

/** False whenever ownership could not be read; it never means "owns nothing". */
let entitlementsAuthoritative = false;
const livePrices = new Map<ProductId, string>();
/**
 * Catalog item ids the live storefront actually offers, or `null` while that
 * has never been read successfully.
 *
 * Checkout is gated on this. Capability + LiveOps + a non-placeholder id only
 * prove the game is *configured* to sell something; they say nothing about
 * whether the server has the item. Opening a host checkout for an id the
 * storefront does not carry is asking the host to price something that does
 * not exist, and `null` (unknown) must fail closed exactly like absent.
 */
let liveCatalogItemIds: Set<string> | null = null;

export function catalogResolved(): boolean {
    return liveCatalogItemIds !== null;
}

export function entitlementsReady(): boolean {
    return entitlementsAuthoritative;
}

async function syncEntitlements(): Promise<void> {
    const entitlements = await listEntitlements();
    if (entitlements === null) {
        // null ≠ []: an unreachable host must never revoke the save's last
        // authoritative ownership record, so the store is left untouched.
        entitlementsAuthoritative = false;
        return;
    }
    entitlementsAuthoritative = true;
    const active = new Set(entitlements.map((entry) => entry.id));
    // Only durables can be "owned". A consumable's grant is transient — it is
    // spent below, not held — and treating an unspent one as ownership would
    // set `purchasable: false` and make the drachmae packs unbuyable for as
    // long as the grant sat there. (`[].every(...)` is vacuously true, so a
    // consumable with no expected entitlement would be permanently "owned"
    // the moment entitlements resolve. That only ever happens with a live
    // host, so local testing never sees it.)
    const owned = products
        .all()
        .filter((product) => product.kind !== "consumable")
        .filter((product) => product.expectedEntitlementIds.every((id) => active.has(id)))
        .map((product) => product.id)
        .sort();
    const previous = store.get().ownedProductIds;
    if (owned.length !== previous.length || owned.some((id, index) => id !== previous[index])) {
        store.patch({ ownedProductIds: owned });
        void saveSystem.flush();
    }
    monetizationTelemetry.record("entitlement_synced", { count: active.size });
    await redeemDrachmaePacks(entitlements);
}

/**
 * Pay out every outstanding drachmae pack.
 *
 * The server grants the entitlement; the wallet is only credited once the
 * server confirms the quantity was consumed, so an interrupted redemption
 * retries on the next sync instead of paying twice or vanishing. Two purchases
 * that stacked before the app reconnected arrive as one grant of quantity 2
 * and are paid at 2× the pack value.
 */
async function redeemDrachmaePacks(entitlements: readonly OwnedEntitlement[]): Promise<void> {
    const redeemable = entitlements.filter(
        (entry) => entry.consumable && entry.quantity > 0 && DRACHMAE_PACK_VALUE[entry.id] !== undefined,
    );
    if (redeemable.length === 0) return;

    let credited = 0;
    for (const entry of redeemable) {
        const perUnit = DRACHMAE_PACK_VALUE[entry.id] ?? 0;
        const payout = perUnit * entry.quantity;
        if (payout <= 0) continue;
        const consumed = await consumeEntitlement(
            entry.id,
            entry.quantity,
            () => {
                const progress = loadArrowProgress();
                progress.coins += payout;
                saveArrowProgress(progress);
            },
            "drachmae-pack",
        );
        if (!consumed) continue;
        credited += payout;
        monetizationTelemetry.record("reward_claimed", {
            source: "drachmae_pack",
            entitlement_id: entry.id,
            quantity: entry.quantity,
            drachmae: payout,
        });
    }
    if (credited > 0) {
        await saveSystem.flush();
        store.patch({ toast: `+${formatNumber(credited)} DRACHMAE BANKED` });
    }
}

/** True when the player holds the durable that changes how the game pays out. */
export function ownsPatronage(): boolean {
    return store.get().ownedProductIds.includes(PATRONAGE_PRODUCT_ID);
}

/** Thrown when the checkout facade reports a non-verified result. */
class CheckoutFacadeError extends Error {
    readonly outcome: Exclude<ShopCheckoutResult, { result: "verified" }>;

    constructor(outcome: Exclude<ShopCheckoutResult, { result: "verified" }>) {
        super(outcome.result === "rejected" ? outcome.message : `RUN checkout reported "${outcome.result}"`);
        this.outcome = outcome;
    }
}

const purchaseCoordinator = createPurchaseCoordinator<ShopCheckoutResult, ShopOrderHistoryResponse>({
    shop: {
        async purchase(itemId, idempotencyKey) {
            const outcome = await purchaseVerifiedShopItem(itemId, idempotencyKey);
            if (outcome.result !== "verified") throw new CheckoutFacadeError(outcome);
            return outcome;
        },
        async getOrderHistory() {
            // Order history exists only to reconcile an interrupted checkout,
            // so its facade lives with the coordinator wiring instead of on
            // src/sdk/runSdk.ts. Throwing here is safe and deliberate: the
            // coordinator preserves the pending intent when the read fails.
            if (!getRunCapabilities().purchases) throw new Error("RUN shop is unavailable");
            return withTimeout(RundotGameAPI.shop.getOrderHistory({ limit: 25 }), 4_000, "shop.getOrderHistory");
        },
    },
    pending: {
        load: () => {
            const saved = store.get().pendingPurchaseIntent;
            return saved
                ? {
                      intentId: saved.idempotencyKey,
                      productId: saved.productId,
                      catalogItemId: saved.catalogItemId,
                      idempotencyKey: saved.idempotencyKey,
                      createdAtMs: saved.startedAt,
                  }
                : null;
        },
        async save(intent) {
            store.patch({
                pendingPurchaseIntent: {
                    productId: intent.productId,
                    catalogItemId: intent.catalogItemId,
                    idempotencyKey: intent.idempotencyKey,
                    startedAt: intent.createdAtMs,
                },
            });
            // If the intent cannot be persisted, an interrupted checkout would
            // be unrecoverable — refuse to open it at all.
            if (!(await saveSystem.flush())) throw new Error("PURCHASE INTENT COULD NOT BE SAVED");
        },
        async clear() {
            store.patch({ pendingPurchaseIntent: null });
            await saveSystem.flush();
        },
    },
    findConfirmedOrder(history, intent) {
        if (!history.success) return null;
        return (
            history.orders.find(
                (order) =>
                    order.itemId === intent.catalogItemId &&
                    order.idempotencyKey === intent.idempotencyKey &&
                    order.status === "fulfilled",
            ) ?? null
        );
    },
    syncEntitlements,
    classifyError(error) {
        if (error instanceof CheckoutFacadeError) {
            const { outcome } = error;
            // The checkout never opened — nothing can have been charged.
            if (outcome.result === "unavailable") return "failed";
            if (outcome.result === "rejected") {
                const verdict = verdictForCode(outcome.code);
                return verdict === "unknown" ? verdictForMessage(outcome.message) : verdict;
            }
        }
        // Anything else — a transport failure, a timeout, or an order that came
        // back unsettled — could have charged the player. Reconcile against
        // order history, and preserve the intent when that read also fails.
        return "unknown";
    },
});

/** Why the last checkout ended, for player-facing copy. Never invents a reason. */
export function checkoutDeclineReason(error: unknown): DeclineReason | null {
    if (!(error instanceof CheckoutFacadeError) || error.outcome.result !== "rejected") return null;
    return declineReasonForCode(error.outcome.code);
}

export interface ProductView {
    productId: ProductId;
    name: string;
    /** Repeatable packs are never owned; only durables can be. */
    consumable: boolean;
    /** The live storefront is currently carrying this item. */
    offered: boolean;
    owned: boolean;
    /** True when `owned` rests on the save's last authoritative read, not a live one. */
    ownedFromSave: boolean;
    purchasable: boolean;
    /** An interrupted checkout is awaiting reconciliation for this product. */
    pendingReconciliation: boolean;
    /** Live catalog price value, or null when it has not resolved. Never invent one. */
    price: string | null;
}

export function productView(productId: ProductId): ProductView {
    const definition = products.get(productId);
    if (!definition) throw new Error(`Unknown commerce product ${productId}`);

    const capabilities = getRunCapabilities();
    const configured =
        isConfiguredPlatformId(definition.catalogItemId) &&
        definition.expectedEntitlementIds.every((id) => isConfiguredPlatformId(id));
    // LiveOps gating is runtimeServices' existing fail-closed shop switch —
    // reused rather than duplicated here.
    const hostReady = configured && runtimeServices.config.shopEnabled && capabilities.purchases && !capabilities.mock;
    // The storefront must be carrying this exact item, right now, with a price
    // we could read. Without this the shop happily opened a host checkout for
    // an id the catalog had never heard of.
    const offered = liveCatalogItemIds?.has(definition.catalogItemId) === true;

    const consumable = definition.kind === "consumable";
    const owned = !consumable && store.get().ownedProductIds.includes(productId);
    return {
        productId,
        name: PRODUCT_NAMES[productId],
        consumable,
        owned,
        ownedFromSave: owned && !entitlementsAuthoritative,
        offered,
        purchasable: hostReady && offered && livePrices.get(productId) != null && !owned,
        pendingReconciliation: store.get().pendingPurchaseIntent?.productId === productId,
        price: livePrices.get(productId) ?? null,
    };
}

/** Read the live storefront so checkout can be gated on what it really offers. */
async function syncCatalog(): Promise<void> {
    if (!getRunCapabilities().purchases) return;
    try {
        const catalog = await withTimeout(RundotGameAPI.shop.getCatalog(), 4_000, "shop.getCatalog");
        const live = new Set<string>();
        for (const item of catalog.items) {
            if (item.active === false) continue;
            live.add(item.itemId);
            const product = products.byCatalogItemId(item.itemId);
            const value = (item.price as { value?: unknown } | undefined)?.value;
            if (product && (typeof value === "string" || typeof value === "number")) {
                livePrices.set(product.id as ProductId, String(value));
            }
        }
        liveCatalogItemIds = live;
    } catch (error) {
        // Leave the previous answer in place; a failed read is not evidence
        // that the storefront is empty, and never widens what is purchasable.
        console.warn("[monetization] live catalog unavailable", error);
    }
}

let refreshInFlight: Promise<void> | null = null;

/** Refresh ownership and live prices. Safe to call on every shop open. */
export async function refreshCommerce(): Promise<void> {
    if (refreshInFlight) return refreshInFlight;
    refreshInFlight = (async () => {
        await Promise.all([
            syncEntitlements(),
            syncCatalog(),
            ...products.all().map(async (product) => {
                const price = await readShopPrice(product.catalogItemId);
                if (price !== null) livePrices.set(product.id as ProductId, price);
            }),
        ]);
    })().finally(() => {
        refreshInFlight = null;
    });
    return refreshInFlight;
}

/**
 * The store surface was shown, with these offers on it.
 *
 * `offer_clicked` and the purchase outcome were already recorded, but without
 * an impression the funnel has no denominator — a low purchase count reads
 * identically whether the store is never opened or never converts. Call once
 * per store open, not per render.
 */
export function recordStoreOpened(productIds: readonly string[], placement = "shop"): void {
    monetizationTelemetry.record("store_opened", { placement, offers: productIds.length });
    for (const productId of productIds) {
        monetizationTelemetry.record("offer_shown", { product_id: productId, placement });
    }
}

export async function purchaseProduct(productId: ProductId): Promise<PurchaseOutcome<ShopCheckoutResult> | null> {
    const definition = products.get(productId);
    if (!definition || !productView(productId).purchasable) return null;

    monetizationTelemetry.record("offer_clicked", { product_id: productId, placement: "shop" });
    monetizationTelemetry.record("iap_purchase_started", { product_id: productId, placement: "shop" });
    try {
        const outcome = await purchaseCoordinator.purchase(productId, definition.catalogItemId);
        monetizationTelemetry.record(outcome.status === "confirmed" ? "iap_purchase_complete" : "iap_purchase_failed", {
            product_id: productId,
            placement: "shop",
            result: outcome.status,
        });
        return outcome;
    } catch (error) {
        // The pending store refused to persist the intent, so no checkout was
        // opened and nothing can have been charged.
        console.warn("[monetization] checkout could not start", error);
        monetizationTelemetry.record("checkout_result", {
            product_id: productId,
            placement: "shop",
            result: "not_started",
        });
        return null;
    }
}

/**
 * An interrupted checkout must not stay in limbo. The template invokes this
 * whenever the shop opens; ADAPT: also call it from your resume lifecycle
 * (the `onAwake` handler passed to `registerLifecycles`) so a checkout that
 * survived a host kill reconciles before the player reaches the shop.
 */
export async function reconcilePendingPurchase(): Promise<void> {
    const pending = purchaseCoordinator.pendingIntent();
    if (!pending) return;
    const outcome = await purchaseCoordinator.reconcilePending();
    if (!outcome) return;
    monetizationTelemetry.record(outcome.status === "confirmed" ? "iap_purchase_complete" : "iap_purchase_failed", {
        product_id: pending.productId,
        placement: "resume_reconciliation",
        result: outcome.status,
    });
}

/** Development-only sanity check that the live catalog matches the registry. */
export async function validateCatalogInDevelopment(): Promise<void> {
    if (!import.meta.env.DEV || !getRunCapabilities().purchases) return;
    try {
        const catalog = await withTimeout(RundotGameAPI.shop.getCatalog(), 4_000, "shop.getCatalog");
        const issues = products.validateCatalog(
            catalog.items.map((item) => ({
                id: item.itemId,
                active: item.active,
                price: item.price,
                entitlements: item.entitlements,
            })),
        );
        for (const issue of issues) {
            console.warn(`[monetization] ${issue.severity}: ${issue.productId} ${issue.message}`);
        }
    } catch (error) {
        console.warn("[monetization] catalog validation skipped", error);
    }
}
