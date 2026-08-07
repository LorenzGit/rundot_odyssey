import RundotGameAPI from "@series-inc/rundot-game-sdk/api";

/**
 * Shop purchase helper for RUN games.
 *
 * Wraps `RundotGameAPI.shop.purchase` with:
 *  - an idempotency key (prevents double charges on retry),
 *  - automatic stale-catalog re-fetch + one retry,
 *  - client-side analytics funnel events.
 *
 * The platform records server-side purchase/refund analytics automatically;
 * these client events cover the store *conversion funnel* (view → click → buy).
 */

function track(name: string, payload?: Record<string, string | number | boolean>): void {
    try {
        void Promise.resolve(RundotGameAPI.analytics?.recordCustomEvent?.(name, payload)).catch(() => {});
    } catch {
        /* analytics must never break the store */
    }
}

function isStaleCatalogError(err: unknown): boolean {
    const msg = (err as Error)?.message?.toLowerCase() ?? "";
    return msg.includes("stale") || msg.includes("config");
}

export interface BuyResult {
    success: boolean;
    order?: Awaited<ReturnType<typeof RundotGameAPI.shop.purchase>>["order"];
    reason?: "cancelled" | "failed" | "error";
    error?: unknown;
}

/** Fire when the player opens an item's detail view. */
export function trackItemViewed(item: { itemId: string; name?: string; category?: string; price?: string }): void {
    track("shop_item_viewed", {
        item_id: item.itemId,
        item_name: item.name ?? item.itemId,
        ...(item.category ? { item_category: item.category } : {}),
        ...(item.price ? { price: item.price } : {}),
    });
}

/**
 * Buy a catalog item. Handles idempotency, one stale-catalog retry, and
 * funnel analytics. Returns a normalized result — never throws.
 */
export async function buyItem(itemId: string, priceLabel?: string): Promise<BuyResult> {
    track("shop_item_click_purchase", { item_id: itemId, ...(priceLabel ? { price: priceLabel } : {}) });

    const attempt = async (): Promise<Awaited<ReturnType<typeof RundotGameAPI.shop.purchase>>> => {
        const idempotencyKey = crypto.randomUUID();
        return RundotGameAPI.shop.purchase(itemId, idempotencyKey);
    };

    try {
        let result;
        try {
            result = await attempt();
        } catch (err) {
            if (!isStaleCatalogError(err)) throw err;
            // Catalog changed under us — refresh and retry once.
            await RundotGameAPI.shop.getCatalog();
            result = await attempt();
        }

        if (result.success) {
            track("shop_purchase_client_ok", { item_id: itemId });
            return { success: true, order: result.order };
        }
        track("shop_item_cancel_purchase", { item_id: itemId });
        return { success: false, reason: "failed" };
    } catch (err) {
        track("shop_purchase_client_error", { item_id: itemId });
        return { success: false, reason: "error", error: err };
    }
}

/**
 * Show a cheap, generous first-time offer only to players who have never paid.
 * Returns true if the player is a candidate for the starter-pack offer.
 */
export async function shouldOfferStarterPack(): Promise<boolean> {
    try {
        return !(await RundotGameAPI.iap.hasUserMadePurchase());
    } catch {
        return false;
    }
}
