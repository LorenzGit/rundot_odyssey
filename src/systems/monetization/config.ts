/**
 * Odyssey's monetization decisions, in code.
 *
 * Nothing else in the game may invent a product id, a price, or an unlock
 * gate — if it is not here, it does not exist. The ids below are the ones
 * declared in `rundot/shop.config.json`; the RB prices live only there and in
 * the live catalog, never in this file.
 */
import { PLATFORM_IDS } from "../../config/platform.ts";
import { createMonetizationPlan } from "./monetizationPlan.ts";
import { createProductRegistry } from "./productRegistry.ts";

export const monetizationPlan = createMonetizationPlan({
    model: "hybrid",
    nonPayerPromise:
        "Every arrow, every course and every star is reachable on drachmae earned from play alone — the endless ladder never gates on a purchase. Run Bits buy time, not reach: the packs front-load drachmae the loop already pays out, and the Patronage speeds that up while removing the rewarded video. No product changes shot physics, scoring, ring layouts, or course difficulty.",
    purchaseArchitecture: "shop-entitlements",
    architectureRationale:
        "A durable unlock must survive a reinstall or device change, which needs the platform's entitlement record and order ledger; a client-owned flag would be lost the first time a player moved devices. The drachmae packs use consumable entitlements for the same reason — the grant is only paid out once the server confirms it was consumed.",
    firstExposure: {
        // The armory is the reason to want drachmae, and it means nothing until
        // the player has felt a course they could not clear with the reed.
        valueMoment:
            "The player has cleared at least one course and seen a payout, so drachmae and the armory both mean something.",
        minCompletedSessions: 1,
        minProgression: 1,
    },
    primaryKpis: ["game_payer_conversion"],
    guardrails: {
        retention: "D1/D7 retention split by shop-exposure cohort",
        sessionHealth: "courses attempted per session before and after the first shop visit",
        economyHealth: "share of drachmae from rewarded videos and packs versus cleared courses",
        reliability: "purchase and ad error rate excluding player cancellation",
    },
});

export const products = createProductRegistry([
    {
        id: "navigators_patronage",
        catalogItemId: PLATFORM_IDS.patronageItem,
        kind: "durable",
        expectedEntitlementIds: [PLATFORM_IDS.patronageEntitlement],
        unique: true,
        unlockDescription: "Offered once the player has cleared at least one course",
    },
    {
        id: "ships_purse",
        catalogItemId: PLATFORM_IDS.shipsPurseItem,
        kind: "consumable",
        expectedEntitlementIds: [PLATFORM_IDS.shipsPurseEntitlement],
        unique: false,
        unlockDescription: "Drachmae pack — always available, repeatable",
    },
    {
        id: "talent_of_troy",
        catalogItemId: PLATFORM_IDS.talentOfTroyItem,
        kind: "consumable",
        expectedEntitlementIds: [PLATFORM_IDS.talentOfTroyEntitlement],
        unique: false,
        unlockDescription: "Drachmae pack — always available, repeatable",
    },
    {
        id: "hoard_of_ithaca",
        catalogItemId: PLATFORM_IDS.hoardOfIthacaItem,
        kind: "consumable",
        expectedEntitlementIds: [PLATFORM_IDS.hoardOfIthacaEntitlement],
        unique: false,
        unlockDescription: "Drachmae pack — always available, repeatable",
    },
]);

export type ProductId = "navigators_patronage" | "ships_purse" | "talent_of_troy" | "hoard_of_ithaca";

/** Fallback display names for when the live catalog has not resolved. */
export const PRODUCT_NAMES: Readonly<Record<ProductId, string>> = {
    navigators_patronage: "NAVIGATOR'S PATRONAGE",
    ships_purse: "SHIP'S PURSE",
    talent_of_troy: "TALENT OF TROY",
    hoard_of_ithaca: "HOARD OF ITHACA",
};

/** One line of player-facing copy per product, for the shop cards. */
export const PRODUCT_BLURBS: Readonly<Record<ProductId, string>> = {
    navigators_patronage:
        "Every cleared course pays 25% more, the results bounty banks itself without a video, and your shaft flies the white Meltemi fletching.",
    ships_purse: "A purse of drachmae for the armory.",
    talent_of_troy: "Bronze, silver and feather in one payment.",
    hoard_of_ithaca: "More than the whole armory costs.",
};

/** The durable that changes how the game plays for its owner. */
export const PATRONAGE_PRODUCT_ID: ProductId = "navigators_patronage";
