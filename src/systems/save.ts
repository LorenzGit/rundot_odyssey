import { getRunCapabilities, readAppStorage, writeAppStorage } from "../sdk/runSdk.ts";
import { store, type AppState, type PendingPurchaseIntentSnapshot } from "../state/store.ts";

const SAVE_KEY = "odyssey-perfect-shot-save";
/** Pre-shell arrow inventory lived only in this key. */
const LEGACY_ARROW_KEY = "odyssey.arrows.v1";
const LEGACY_SAVE_KEYS = ["rundot_template-save", "template-pixi-webgpu-save", "template-pixi-webgpu.save"] as const;
export const SAVE_VERSION = 4;
/**
 * Mix level of the synthesized motif the Hermes Map track replaced.
 *
 * A save still holding this exact value never had the slider touched, so it is
 * the old default rather than a choice, and re-pointing it at the new track's
 * quieter default is right. Any other value is the player's and is kept.
 */
const LEGACY_SYNTH_MUSIC_VOLUME = 0.42;

export interface GameSaveV4 {
    version: 4;
    settings: Pick<
        AppState,
        | "musicEnabled"
        | "musicVolume"
        | "sfxEnabled"
        | "sfxVolume"
        | "notificationsEnabled"
        | "notificationsConsent"
        | "hapticsEnabled"
        | "reducedMotion"
        | "locale"
        | "quality"
    >;
    progress: Pick<
        AppState,
        | "score"
        | "coins"
        | "level"
        | "totalPlays"
        | "totalCompletions"
        | "depth"
        | "bestDepth"
        | "leaderboardSubmittedDepth"
        | "bestStars"
        | "ownedArrows"
        | "equippedArrow"
    >;
    retention: Pick<
        AppState,
        | "dailyRewardLastClaimDay"
        | "dailyRewardStreak"
        | "dailyRewardClaimIds"
        | "dailyQuestDay"
        | "dailyQuestProgress"
        | "dailyQuestClaimIds"
        | "likePromptShown"
    >;
    /** Interrupted-checkout intent and the last authoritative ownership read */
    commerce: Pick<AppState, "pendingPurchaseIntent" | "ownedProductIds">;
}

/** @deprecated Use GameSaveV4 — kept for migrate() typing of older blobs. */
export type GameSaveV3 = Omit<GameSaveV4, "version"> & { version: 3 };

export type SaveSource = "run" | "local" | "defaults";

function readLocalSave(): { key: string; value: string } | null {
    try {
        for (const key of [SAVE_KEY, ...LEGACY_SAVE_KEYS]) {
            const value = window.localStorage.getItem(key);
            if (value !== null) return { key, value };
        }
        return null;
    } catch (error) {
        console.warn("[save] local fallback read failed", error);
        return null;
    }
}

function clamp01(value: unknown, fallback: number): number {
    return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : fallback;
}

function booleanOr(value: unknown, fallback: boolean): boolean {
    return typeof value === "boolean" ? value : fallback;
}

function enumOr<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
    return typeof value === "string" && allowed.includes(value as T) ? (value as T) : fallback;
}

function nonNegativeInteger(value: unknown, fallback = 0): number {
    const number = Number(value);
    return Number.isFinite(number) ? Math.min(Number.MAX_SAFE_INTEGER, Math.max(0, Math.floor(number))) : fallback;
}

function dayKeyOrNull(value: unknown): string | null {
    return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function recentStrings(value: unknown, limit: number): string[] {
    if (!Array.isArray(value)) return [];
    return value.filter((entry): entry is string => typeof entry === "string" && entry.length <= 160).slice(-limit);
}

function productIds(value: unknown): string[] {
    if (!Array.isArray(value)) return [];
    return value
        .filter((entry): entry is string => typeof entry === "string" && /^[a-z][a-z0-9_]{0,63}$/.test(entry))
        .slice(0, 64);
}

/** A malformed intent is dropped whole: a partial one could never reconcile. */
function pendingIntentOrNull(value: unknown): PendingPurchaseIntentSnapshot | null {
    if (!value || typeof value !== "object") return null;
    const intent = value as Partial<PendingPurchaseIntentSnapshot>;
    return typeof intent.productId === "string" &&
        intent.productId.length > 0 &&
        typeof intent.catalogItemId === "string" &&
        intent.catalogItemId.length > 0 &&
        typeof intent.idempotencyKey === "string" &&
        intent.idempotencyKey.length > 0 &&
        intent.idempotencyKey.length <= 160 &&
        Number.isFinite(intent.startedAt)
        ? {
              productId: intent.productId,
              catalogItemId: intent.catalogItemId,
              idempotencyKey: intent.idempotencyKey,
              startedAt: nonNegativeInteger(intent.startedAt),
          }
        : null;
}

const KNOWN_ARROWS = new Set(["reed", "bronze", "silver", "golden", "feather", "storm"]);

function arrowIds(value: unknown): string[] {
    if (!Array.isArray(value)) return ["reed"];
    const owned = value.filter((entry): entry is string => typeof entry === "string" && KNOWN_ARROWS.has(entry));
    if (!owned.includes("reed")) owned.unshift("reed");
    return owned.slice(0, 16);
}

function equippedArrowOr(value: unknown, owned: string[]): string {
    return typeof value === "string" && owned.includes(value) ? value : "reed";
}

/** Pull coins/owned/equipped from the pre-shell localStorage arrow bag, if any. */
function readLegacyArrowBag(): { coins: number; ownedArrows: string[]; equippedArrow: string } | null {
    try {
        const raw = window.localStorage.getItem(LEGACY_ARROW_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as { coins?: unknown; owned?: unknown; equipped?: unknown };
        const ownedArrows = arrowIds(parsed.owned);
        return {
            coins: nonNegativeInteger(parsed.coins),
            ownedArrows,
            equippedArrow: equippedArrowOr(parsed.equipped, ownedArrows),
        };
    } catch {
        return null;
    }
}

function snapshot(): GameSaveV4 {
    const state = store.get();
    return {
        version: SAVE_VERSION,
        settings: {
            musicEnabled: state.musicEnabled,
            musicVolume: state.musicVolume,
            sfxEnabled: state.sfxEnabled,
            sfxVolume: state.sfxVolume,
            notificationsEnabled: state.notificationsEnabled,
            notificationsConsent: state.notificationsConsent,
            hapticsEnabled: state.hapticsEnabled,
            reducedMotion: state.reducedMotion,
            locale: state.locale,
            quality: state.quality,
        },
        progress: {
            score: state.score,
            coins: state.coins,
            level: state.level,
            totalPlays: state.totalPlays,
            totalCompletions: state.totalCompletions,
            depth: state.depth,
            bestDepth: state.bestDepth,
            leaderboardSubmittedDepth: state.leaderboardSubmittedDepth,
            bestStars: state.bestStars,
            ownedArrows: state.ownedArrows,
            equippedArrow: state.equippedArrow,
        },
        retention: {
            dailyRewardLastClaimDay: state.dailyRewardLastClaimDay,
            dailyRewardStreak: state.dailyRewardStreak,
            dailyRewardClaimIds: state.dailyRewardClaimIds,
            dailyQuestDay: state.dailyQuestDay,
            dailyQuestProgress: state.dailyQuestProgress,
            dailyQuestClaimIds: state.dailyQuestClaimIds,
            likePromptShown: state.likePromptShown,
        },
        commerce: {
            pendingPurchaseIntent: state.pendingPurchaseIntent,
            ownedProductIds: state.ownedProductIds,
        },
    };
}

function migrate(raw: unknown): GameSaveV4 | null {
    if (!raw || typeof raw !== "object") return null;
    const candidate = raw as Omit<Partial<GameSaveV4>, "version"> & { version?: number };
    if (
        (candidate.version !== 1 &&
            candidate.version !== 2 &&
            candidate.version !== 3 &&
            candidate.version !== SAVE_VERSION) ||
        !candidate.settings ||
        !candidate.progress
    )
        return null;
    const defaults = snapshot();
    const retention =
        candidate.retention && typeof candidate.retention === "object" ? candidate.retention : defaults.retention;
    const commerce =
        candidate.commerce && typeof candidate.commerce === "object" ? candidate.commerce : defaults.commerce;
    const ownedArrows = arrowIds(
        "ownedArrows" in candidate.progress ? candidate.progress.ownedArrows : defaults.progress.ownedArrows,
    );
    return {
        version: SAVE_VERSION,
        settings: {
            musicEnabled: booleanOr(candidate.settings.musicEnabled, defaults.settings.musicEnabled),
            musicVolume:
                candidate.settings.musicVolume === LEGACY_SYNTH_MUSIC_VOLUME
                    ? defaults.settings.musicVolume
                    : clamp01(candidate.settings.musicVolume, defaults.settings.musicVolume),
            sfxEnabled: booleanOr(candidate.settings.sfxEnabled, defaults.settings.sfxEnabled),
            sfxVolume: clamp01(candidate.settings.sfxVolume, defaults.settings.sfxVolume),
            hapticsEnabled: booleanOr(candidate.settings.hapticsEnabled, defaults.settings.hapticsEnabled),
            reducedMotion: booleanOr(candidate.settings.reducedMotion, defaults.settings.reducedMotion),
            locale: enumOr(
                candidate.settings.locale,
                ["English", "PortugueseBR", "SpanishLA"] as const,
                defaults.settings.locale,
            ),
            quality: enumOr(candidate.settings.quality, ["high", "low"] as const, defaults.settings.quality),
            notificationsConsent: enumOr(
                candidate.settings.notificationsConsent,
                ["unknown", "granted", "denied"] as const,
                defaults.settings.notificationsConsent,
            ),
            notificationsEnabled:
                candidate.settings.notificationsConsent === "granted" &&
                candidate.settings.notificationsEnabled === true,
        },
        progress: {
            score: nonNegativeInteger(candidate.progress.score),
            coins: nonNegativeInteger(candidate.progress.coins),
            level: Math.max(1, nonNegativeInteger(candidate.progress.level, 1)),
            totalPlays: nonNegativeInteger(candidate.progress.totalPlays),
            // Older saves predate a distinct completion counter. bestDepth is
            // the honest lower bound and avoids replaying already-reached
            // engagement steps after migration.
            totalCompletions: nonNegativeInteger(
                candidate.progress.totalCompletions,
                nonNegativeInteger(candidate.progress.bestDepth),
            ),
            // A save written before endless mode has no depth at all, which
            // correctly reads as "start at course one".
            depth: Math.max(1, nonNegativeInteger(candidate.progress.depth, 1)),
            bestDepth: nonNegativeInteger(candidate.progress.bestDepth),
            leaderboardSubmittedDepth: nonNegativeInteger(candidate.progress.leaderboardSubmittedDepth),
            bestStars: Math.min(3, nonNegativeInteger(candidate.progress.bestStars)),
            ownedArrows,
            equippedArrow: equippedArrowOr(
                "equippedArrow" in candidate.progress ? candidate.progress.equippedArrow : undefined,
                ownedArrows,
            ),
        },
        retention: {
            dailyRewardLastClaimDay: dayKeyOrNull(retention.dailyRewardLastClaimDay),
            dailyRewardStreak: nonNegativeInteger(retention.dailyRewardStreak),
            dailyRewardClaimIds: recentStrings(retention.dailyRewardClaimIds, 90),
            dailyQuestDay: dayKeyOrNull(retention.dailyQuestDay),
            dailyQuestProgress:
                retention.dailyQuestProgress && typeof retention.dailyQuestProgress === "object"
                    ? Object.fromEntries(
                          Object.entries(retention.dailyQuestProgress)
                              .filter(
                                  ([key, value]) =>
                                      ["shots", "plays", "coins", "bullseyes", "bounces"].includes(key) &&
                                      typeof value === "number" &&
                                      Number.isFinite(value),
                              )
                              .map(([key, value]) => [key, nonNegativeInteger(value)]),
                      )
                    : {},
            dailyQuestClaimIds: recentStrings(retention.dailyQuestClaimIds, 180),
            likePromptShown: booleanOr(retention.likePromptShown, false),
        },
        commerce: {
            pendingPurchaseIntent: pendingIntentOrNull(commerce.pendingPurchaseIntent),
            ownedProductIds: productIds(commerce.ownedProductIds),
        },
    };
}

function parse(raw: string | null): GameSaveV4 | null {
    if (!raw) return null;
    try {
        return migrate(JSON.parse(raw));
    } catch {
        return null;
    }
}

function apply(save: GameSaveV4): void {
    store.patch({ ...save.settings, ...save.progress, ...save.retention, ...save.commerce });
}

function applyLegacyArrowBagIfNeeded(hadSave: boolean): void {
    const legacy = readLegacyArrowBag();
    if (!legacy) return;
    const state = store.get();
    // Only fill blanks: never clobber a real save's wallet/inventory.
    if (!hadSave || state.coins === 0) {
        store.patch({
            coins: Math.max(state.coins, legacy.coins),
            ownedArrows: legacy.ownedArrows.length > state.ownedArrows.length ? legacy.ownedArrows : state.ownedArrows,
            equippedArrow: state.equippedArrow === "reed" ? legacy.equippedArrow : state.equippedArrow,
        });
    }
}

let lastSaved = "";
let pendingSave: string | null = null;
let flushInFlight: Promise<boolean> | null = null;

function usesRunStorage(): boolean {
    const capabilities = getRunCapabilities();
    return capabilities.host && !capabilities.mock;
}

async function persist(serialized: string): Promise<boolean> {
    if (usesRunStorage()) return writeAppStorage(SAVE_KEY, serialized);
    try {
        window.localStorage.setItem(SAVE_KEY, serialized);
        return true;
    } catch (error) {
        console.warn("[save] local fallback write failed", error);
        return false;
    }
}

export const saveSystem = {
    async load(): Promise<SaveSource> {
        if (!usesRunStorage()) {
            const stored = readLocalSave();
            const save = parse(stored?.value ?? null);
            if (save) apply(save);
            applyLegacyArrowBagIfNeeded(Boolean(save));
            lastSaved = JSON.stringify(snapshot());
            if (save && stored?.key !== SAVE_KEY) {
                try {
                    window.localStorage.setItem(SAVE_KEY, lastSaved);
                } catch (error) {
                    console.warn("[save] local key migration failed", error);
                }
            }
            return save ? "local" : "defaults";
        }

        for (const key of [SAVE_KEY, ...LEGACY_SAVE_KEYS]) {
            const remote = await readAppStorage(key);
            if (!remote.ok) {
                applyLegacyArrowBagIfNeeded(false);
                lastSaved = JSON.stringify(snapshot());
                return "defaults";
            }
            const save = parse(remote.value);
            if (!save) continue;

            apply(save);
            applyLegacyArrowBagIfNeeded(true);
            lastSaved = JSON.stringify(snapshot());
            if (key !== SAVE_KEY) await writeAppStorage(SAVE_KEY, lastSaved);
            return "run";
        }

        applyLegacyArrowBagIfNeeded(false);
        lastSaved = JSON.stringify(snapshot());
        return "defaults";
    },

    async flush(): Promise<boolean> {
        const serialized = JSON.stringify(snapshot());
        if (serialized === lastSaved && pendingSave === null) return true;
        pendingSave = serialized;
        if (flushInFlight) return flushInFlight;

        // Serialize remote writes and coalesce rapid settings/gameplay changes.
        // An older, slower RPC can never complete after and overwrite a newer one.
        flushInFlight = (async () => {
            let allSucceeded = true;
            while (pendingSave !== null) {
                const next = pendingSave;
                pendingSave = null;
                if (next === lastSaved) continue;
                const saved = await persist(next);
                if (saved) lastSaved = next;
                else allSucceeded = false;
            }
            return allSucceeded;
        })().finally(() => {
            flushInFlight = null;
        });
        return flushInFlight;
    },
};
