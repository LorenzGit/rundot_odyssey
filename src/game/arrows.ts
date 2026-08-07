/**
 * Buyable arrow types — each tweaks flight + scoring.
 * Owned/equipped progress is persisted via the versioned save (store).
 */

import { store } from "../state/store.ts";

export type ArrowId = "reed" | "bronze" | "silver" | "golden" | "feather" | "storm";

export interface ArrowDef {
    id: ArrowId;
    name: string;
    blurb: string;
    /** 0 = free starter. */
    cost: number;
    /** Shaft / head colors for the drawn arrow. */
    shaft: number;
    head: number;
    fletch: number;
    /** Flight modifiers (1 = baseline reed). */
    launchSpeed: number;
    gravity: number;
    /**
     * Multiplier on wind-zone acceleration.
     *
     * Now that the aim preview stops at a gust and the player judges the drift
     * themselves, a low value is a genuine advantage — a steady shaft barely
     * moves and is far easier to call — and a high one is a real cost. This is
     * a purchase decision, not flavour.
     */
    windScale: number;
    /** Multiplier on mid-flight steering. */
    steerScale: number;
    /**
     * How much obsidian this shaft can smash. A slab with `hardness` above this
     * stops the shot dead, which is the hard wall that makes deeper courses
     * require a better arrow rather than just more skill.
     */
    might: number;
    /** Ricochets the shaft survives before it shatters. */
    bounces: number;
    gateScoreMult: number;
    targetScoreMult: number;
    /** Trail particle hue. */
    trailHue: number;
}

export const ARROWS: readonly ArrowDef[] = [
    {
        id: "reed",
        name: "REED",
        blurb: "Starter shaft. One ricochet, drifts with any gust.",
        cost: 0,
        shaft: 0x6e3d1a,
        head: 0xffe58a,
        fletch: 0x1a7fd0,
        launchSpeed: 1300,
        gravity: 900,
        windScale: 1,
        steerScale: 1,
        might: 1,
        bounces: 1,
        gateScoreMult: 1,
        targetScoreMult: 1,
        trailHue: 48,
    },
    {
        id: "bronze",
        name: "BRONZE",
        blurb: "Heavy tip. Cracks obsidian, barely feels wind.",
        cost: 400,
        shaft: 0x5a3a18,
        head: 0xc48a3a,
        fletch: 0x8a4a18,
        launchSpeed: 1240,
        gravity: 980,
        windScale: 0.7,
        steerScale: 0.75,
        might: 2,
        bounces: 2,
        gateScoreMult: 1.1,
        targetScoreMult: 1.15,
        trailHue: 32,
    },
    {
        id: "silver",
        name: "SILVER",
        blurb: "Faster and flatter. Three ricochets, wind-neutral.",
        cost: 750,
        shaft: 0x7a8a9a,
        head: 0xe8f0ff,
        fletch: 0x90b0d0,
        launchSpeed: 1500,
        gravity: 780,
        windScale: 1.05,
        steerScale: 1.1,
        might: 2,
        bounces: 3,
        gateScoreMult: 1.15,
        targetScoreMult: 1.2,
        trailHue: 200,
    },
    {
        id: "feather",
        name: "FEATHER",
        blurb: "Whip-steers, four ricochets — but the wind throws it.",
        cost: 1100,
        shaft: 0x4a3020,
        head: 0xfff0c0,
        fletch: 0x40c878,
        launchSpeed: 1270,
        gravity: 860,
        windScale: 1.35,
        steerScale: 2.1,
        might: 3,
        bounces: 4,
        gateScoreMult: 1.2,
        targetScoreMult: 1.1,
        trailHue: 140,
    },
    {
        id: "golden",
        name: "GOLDEN",
        blurb: "Smashes grade 4, steady in wind, rings pay double.",
        cost: 1600,
        shaft: 0x8a6010,
        head: 0xffd24a,
        fletch: 0xfff0a0,
        launchSpeed: 1330,
        gravity: 900,
        windScale: 0.9,
        steerScale: 1,
        might: 4,
        bounces: 3,
        gateScoreMult: 1.75,
        targetScoreMult: 1.35,
        trailHue: 46,
    },
    {
        id: "storm",
        name: "STORM",
        blurb: "Grade 5, five ricochets, cuts straight through gusts.",
        cost: 2200,
        shaft: 0x1a3050,
        head: 0x70e0ff,
        fletch: 0x3060c0,
        launchSpeed: 1390,
        gravity: 840,
        windScale: 0.75,
        steerScale: 1.35,
        might: 5,
        bounces: 5,
        gateScoreMult: 1.4,
        targetScoreMult: 1.5,
        trailHue: 190,
    },
] as const;

export function getArrow(id: ArrowId): ArrowDef {
    const found = ARROWS.find((a) => a.id === id);
    return found ?? ARROWS[0]!;
}

export interface ArrowProgress {
    coins: number;
    owned: ArrowId[];
    equipped: ArrowId;
}

/** Legacy localStorage key (migrated into save on first load). */
export const LEGACY_ARROW_STORAGE_KEY = "odyssey.arrows.v1";

export function defaultArrowProgress(): ArrowProgress {
    return { coins: 0, owned: ["reed"], equipped: "reed" };
}

function asArrowId(value: string): ArrowId | null {
    return ARROWS.some((a) => a.id === value) ? (value as ArrowId) : null;
}

/** Read arrow inventory from the global store (save-backed). */
export function loadArrowProgress(): ArrowProgress {
    const state = store.get();
    const owned = state.ownedArrows.map(asArrowId).filter((id): id is ArrowId => id !== null);
    if (!owned.includes("reed")) owned.unshift("reed");
    const equipped = asArrowId(state.equippedArrow);
    return {
        coins: Math.max(0, Math.floor(state.coins)),
        owned,
        equipped: equipped && owned.includes(equipped) ? equipped : "reed",
    };
}

/**
 * Mirror arrow progress into the store. Persistence is the caller's job
 * (`saveSystem.flush`) so headless sims can import arrow defs without the SDK.
 */
export function saveArrowProgress(progress: ArrowProgress): void {
    store.patch({
        coins: Math.max(0, Math.floor(progress.coins)),
        ownedArrows: [...progress.owned],
        equippedArrow: progress.equipped,
    });
}

/** Convert run score into spendable drachmae (soft curve). */
export function scoreToCoins(score: number, stars: 1 | 2 | 3): number {
    const base = Math.floor(score * 0.12);
    const starBonus = stars === 3 ? 80 : stars === 2 ? 35 : 10;
    return Math.max(5, base + starBonus);
}

export function tryBuyArrow(progress: ArrowProgress, id: ArrowId): { ok: boolean; reason?: string } {
    const def = getArrow(id);
    if (progress.owned.includes(id)) return { ok: false, reason: "owned" };
    if (progress.coins < def.cost) return { ok: false, reason: "coins" };
    progress.coins -= def.cost;
    progress.owned.push(id);
    progress.equipped = id;
    saveArrowProgress(progress);
    return { ok: true };
}

export function equipArrow(progress: ArrowProgress, id: ArrowId): boolean {
    if (!progress.owned.includes(id)) return false;
    progress.equipped = id;
    saveArrowProgress(progress);
    return true;
}
