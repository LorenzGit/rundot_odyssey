import { useEffect, useState } from "react";
import { audioManager } from "../audio/audioManager.ts";
import { DRACHMAE_PACKS, drachmaePackBonusPercent } from "../config/platform.ts";
import { getRunCapabilities } from "../sdk/runSdk.ts";
import { formatNumber, t } from "../systems/localization.ts";
import {
    catalogResolved,
    productView,
    purchaseProduct,
    reconcilePendingPurchase,
    refreshCommerce,
    validateCatalogInDevelopment,
    type ProductView,
} from "../systems/monetization/commerce.ts";
import { PRODUCT_BLURBS, type ProductId } from "../systems/monetization/config.ts";
import { runtimeServices } from "../systems/runtimeServices.ts";
import { store, useStore } from "../state/store.ts";
import MenuScreenLayout from "./MenuScreenLayout.tsx";

/** Every drachmae pack, in ladder order, paired with its client-side payout. */
const PACK_PRODUCTS: readonly { productId: ProductId; drachmae: number; bonusPercent: number }[] = [
    { productId: "ships_purse", ...packFacts(0) },
    { productId: "talent_of_troy", ...packFacts(1) },
    { productId: "hoard_of_ithaca", ...packFacts(2) },
];

function packFacts(index: number): { drachmae: number; bonusPercent: number } {
    const pack = DRACHMAE_PACKS[index];
    if (!pack) return { drachmae: 0, bonusPercent: 0 };
    return { drachmae: pack.drachmae, bonusPercent: drachmaePackBonusPercent(pack) };
}

/**
 * The RB price shown is always the one the live catalog resolved. When it has
 * not arrived there is no price to show — the card says so rather than
 * inventing the number from `DRACHMAE_PACKS`, which only exists to compute the
 * value-per-Bit label.
 */
function priceLabel(view: ProductView): string {
    if (view.price === null) return "PRICE NOT SYNCED";
    const numeric = Number(view.price);
    return Number.isFinite(numeric) ? `${formatNumber(numeric)} RB` : view.price;
}

export default function ShopScreen() {
    useStore(
        (state) =>
            `${state.locale}:${state.coins}:${state.ownedProductIds.join(",")}:${state.pendingPurchaseIntent?.idempotencyKey ?? ""}:${state.runtimeReady}`,
    );
    const [busyProduct, setBusyProduct] = useState<ProductId | null>(null);
    const [, setCommerceSync] = useState(0);

    useEffect(() => {
        let disposed = false;
        // An interrupted checkout reconciles before the player can tap a card
        // again; ownership, unredeemed packs and live prices all refresh on
        // every shop open.
        void (async () => {
            await reconcilePendingPurchase();
            await refreshCommerce();
            await validateCatalogInDevelopment();
            if (!disposed) setCommerceSync((count) => count + 1);
        })();
        return () => {
            disposed = true;
        };
    }, []);

    const patronage = productView("navigators_patronage");
    const packs = PACK_PRODUCTS.map((pack) => ({ ...pack, view: productView(pack.productId) }));
    const capabilities = getRunCapabilities();
    // One honest reason the card cannot be tapped, never a placeholder claim.
    const blockedReason = (view: ProductView): string => {
        if (!capabilities.purchases || capabilities.mock) return t("SettingsUnavailable");
        if (!runtimeServices.config.shopEnabled) return "SHOP CLOSED";
        // The storefront answered and does not carry this item, or never
        // answered at all. Either way there is nothing to check out.
        return catalogResolved() && !view.offered ? "NOT IN STORE" : "PRICE NOT SYNCED";
    };

    const buy = async (view: ProductView) => {
        // Deliberately NOT awaiting audioManager.unlock() here. Opening a host
        // checkout needs no audio, and unlocking first builds the AudioContext
        // and starts the music element microseconds before withHostOverlay
        // pauses and suspends the very same context — a pointless round trip
        // through the platform's most fragile API on the way to a payment.
        setBusyProduct(view.productId);
        const outcome = await purchaseProduct(view.productId);
        setBusyProduct(null);
        // The outcome can belong to a still-live order on ANOTHER card: the
        // coordinator reports that rather than opening a second checkout, and
        // saying "SHIP'S PURSE OWNED" for a tap on the Patronage would be a lie.
        const settledView =
            outcome && outcome.intent.productId !== view.productId
                ? productView(outcome.intent.productId as ProductId)
                : view;
        if (!outcome) {
            store.patch({ toast: "PURCHASE NOT STARTED" });
        } else if (outcome.status === "confirmed") {
            // Consumables are credited by the entitlement redemption inside
            // refreshCommerce, which raises its own "+N DRACHMAE BANKED" toast.
            if (!settledView.consumable) {
                store.patch({ toast: `${settledView.name} UNLOCKED` });
            }
            audioManager.play("reward");
            void runtimeServices.haptic("success");
        } else if (outcome.status === "cancelled") {
            store.patch({ toast: "CHECKOUT CANCELLED" });
        } else if (outcome.status === "unknown") {
            // The order may still settle; the pending intent survives and
            // reconciles on the next shop open, on resume, and at boot. Name
            // the order, because a live intent on another card is reported
            // here rather than opening a second checkout.
            store.patch({ toast: `${settledView.name} ORDER PENDING — CHECKING AGAIN SOON` });
        } else {
            store.patch({ toast: "PURCHASE FAILED" });
            audioManager.play("error");
        }
        setCommerceSync((count) => count + 1);
    };

    const buyButton = (view: ProductView, label: string) => (
        <button
            type="button"
            disabled={busyProduct !== null || view.owned || !view.purchasable}
            onClick={() => void buy(view)}
        >
            {busyProduct === view.productId
                ? "OPENING CHECKOUT..."
                : view.owned
                  ? "OWNED"
                  : view.purchasable
                    ? view.pendingReconciliation
                        ? "RETRY LAST ORDER"
                        : label
                    : blockedReason(view)}
        </button>
    );

    return (
        <MenuScreenLayout title={t("MenuShop")} kicker="AGORA">
            <p className="menu-wallet" style={{ textAlign: "center" }}>
                DRACHMAE {formatNumber(store.get().coins)}
            </p>

            <article className="shop-card">
                <p className="eyebrow">PATRON</p>
                <h3>{patronage.name}</h3>
                <p>{PRODUCT_BLURBS.navigators_patronage}</p>
                <p className="shop-price">
                    {patronage.owned
                        ? patronage.ownedFromSave
                            ? // The host could not be asked, so ownership rests on the
                              // save's last authoritative read — never revoked by a
                              // failed entitlement sync.
                              "OWNED · SAVED RECORD"
                            : "OWNED"
                        : priceLabel(patronage)}
                </p>
                {patronage.pendingReconciliation && !patronage.owned ? <p>LAST ORDER STILL SETTLING</p> : null}
                {buyButton(patronage, "BECOME A PATRON")}
            </article>

            <p className="shop-heading">DRACHMAE</p>
            {packs.map(({ productId, drachmae, bonusPercent, view }) => (
                <article className="shop-card" key={productId}>
                    <p className="eyebrow">
                        {bonusPercent > 0 ? `+${formatNumber(bonusPercent)}% PER RUN BIT` : "DRACHMAE PACK"}
                    </p>
                    <h3>{view.name}</h3>
                    <p>
                        {formatNumber(drachmae)} DRACHMAE · {PRODUCT_BLURBS[productId]}
                    </p>
                    <p className="shop-price">{priceLabel(view)}</p>
                    {view.pendingReconciliation ? <p>LAST ORDER STILL SETTLING</p> : null}
                    {buyButton(view, `BUY · ${priceLabel(view)}`)}
                </article>
            ))}

            <p className="safety-note">
                Prices are read from the live RUN catalog and charged in Run Bits. Ownership is asserted only from RUN
                entitlements or the save's last authoritative read of them; this screen never grants anything locally.
                Every shaft and every course can be reached on drachmae earned from play.
            </p>
        </MenuScreenLayout>
    );
}
