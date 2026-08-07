/**
 * Platform identifier registry — the single source of truth for every id that
 * crosses the RUN boundary.
 *
 * Where each id comes from:
 * - `gameId` is written by `rundot init` (and mirrored in game.config.prod.json).
 * - Ad placement ids are SELF-AUTHORED plain strings passed as `adDisplayId` to
 *   showRewardedAdAsync/showInterstitialAd. There is NO platform-side
 *   "create a placement" step — invent a stable name and ship it.
 * - Shop item / entitlement ids are the ones declared in
 *   `rundot/shop.config.json`, which registers the catalog at deploy. The
 *   strings below must match that file exactly.
 *
 * `REPLACE_WITH_*` values fail closed: `isConfiguredPlatformId` returns false
 * and the surface stays hidden rather than offering something that cannot
 * complete. Only `gameId` is still a placeholder — `rundot init` fills it in
 * when the game is first created remotely.
 */
export const PLATFORM_IDS = Object.freeze({
    gameId: "REPLACE_WITH_RUN_GAME_ID",

    // ------------------------------------------------------------ rewarded ads
    /** Victory results: double the drachmae the cleared course just paid. */
    rewardedResultsBonus: "odyssey_results_bonus_rewarded",

    // ---------------------------------------------------------- durable goods
    /** +25% drachmae, the results bounty without a video, Meltemi fletching. */
    patronageItem: "odyssey_navigators_patronage",
    patronageEntitlement: "odyssey_navigators_patronage",

    // ------------------------------------------------------- drachmae packs
    shipsPurseItem: "odyssey_ships_purse",
    shipsPurseEntitlement: "odyssey_ships_purse",
    talentOfTroyItem: "odyssey_talent_of_troy",
    talentOfTroyEntitlement: "odyssey_talent_of_troy",
    hoardOfIthacaItem: "odyssey_hoard_of_ithaca",
    hoardOfIthacaEntitlement: "odyssey_hoard_of_ithaca",
});

/**
 * The consumable drachmae ladder.
 *
 * `drachmae` is the client-side payout for one unit of the entitlement.
 * `bits` mirrors the RB price in `rundot/shop.config.json` and is used only to
 * compute the "+x% more per Run Bit" label — the price actually charged and
 * displayed always comes from the live catalog, never from this table.
 */
export interface DrachmaePack {
    itemId: string;
    entitlementId: string;
    drachmae: number;
    bits: number;
}

export const DRACHMAE_PACKS: readonly DrachmaePack[] = Object.freeze([
    {
        itemId: PLATFORM_IDS.shipsPurseItem,
        entitlementId: PLATFORM_IDS.shipsPurseEntitlement,
        drachmae: 1_200,
        bits: 400,
    },
    {
        itemId: PLATFORM_IDS.talentOfTroyItem,
        entitlementId: PLATFORM_IDS.talentOfTroyEntitlement,
        drachmae: 4_000,
        bits: 1_200,
    },
    {
        itemId: PLATFORM_IDS.hoardOfIthacaItem,
        entitlementId: PLATFORM_IDS.hoardOfIthacaEntitlement,
        drachmae: 9_000,
        bits: 2_400,
    },
]);

/**
 * How many drachmae one unit of each pack entitlement is worth.
 *
 * The server grants quantity 1 per purchase; the client consumes whatever
 * quantity is outstanding and multiplies by this table, so buying the same
 * pack twice before the app reconnects still pays out twice.
 */
export const DRACHMAE_PACK_VALUE: Readonly<Record<string, number>> = Object.freeze(
    Object.fromEntries(DRACHMAE_PACKS.map((pack) => [pack.entitlementId, pack.drachmae])),
);

/** Drachmae-per-RB uplift of a pack versus the entry pack, rounded for display. */
export function drachmaePackBonusPercent(pack: DrachmaePack): number {
    const base = DRACHMAE_PACKS[0];
    if (!base || pack === base) return 0;
    return Math.round((pack.drachmae / pack.bits / (base.drachmae / base.bits) - 1) * 100);
}

/** What the Navigator's Patronage multiplies every course payout by. */
export const PATRONAGE_EARNINGS_MULTIPLIER = 1.25;

export function isConfiguredPlatformId(value: string): boolean {
    return value.length > 0 && !value.startsWith("REPLACE_WITH_");
}
