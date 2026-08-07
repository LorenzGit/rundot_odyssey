/**
 * Monetary operations are deliberately exported functions, never startup work.
 * Playground purchases are real and persistent. Reconcile server state before
 * granting durable game value.
 */
import { api, guarded, requireConfiguredId, requireExplicitAction } from "./guards";

export async function inspectDirectPurchaseCatalog(gameId: string) {
    return guarded("direct-purchase catalog", () =>
        api.iap.listDirectPurchaseSkus(requireConfiguredId(gameId, "Game ID")),
    );
}

export async function spendHardCurrency(productId: string, amount: number, playerTapped: boolean) {
    requireExplicitAction(playerTapped, "Currency spend");
    return guarded("currency spend", () =>
        api.iap.spendCurrency(requireConfiguredId(productId, "Product ID"), Math.max(1, Math.floor(amount)), {
            screenName: "feature-lab",
            description: "Template demo purchase",
        }),
    );
}

export async function purchaseRunSubscription(playerTapped: boolean) {
    requireExplicitAction(playerTapped, "Subscription purchase");
    return guarded("subscription purchase", () => api.iap.purchaseSubscription("CORE", "monthly"));
}

export async function consumeEntitlement(entitlementId: string, quantity: number, referenceId: string) {
    return guarded("entitlement consumption", () =>
        api.entitlements.consumeEntitlement(
            requireConfiguredId(entitlementId, "Entitlement ID"),
            Math.max(1, Math.floor(quantity)),
            undefined,
            "template-demo",
            referenceId,
        ),
    );
}
