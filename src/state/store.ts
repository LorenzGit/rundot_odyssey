/**
 * Global UI state for the template shell.
 *
 * This store intentionally mirrors the same shape you need for feature-rich
 * RUN prototypes: phase routing, selected menu screen, monetization badges,
 * settings, and a few gameplay counters shared between the React HUD and
 * Pixi scene.
 */
import { useSyncExternalStore } from "react";

export type MenuScreen = "main" | "daily-rewards" | "daily-quests" | "shop" | "arrows" | "stats" | "settings";

/** A checkout the host may still be settling; keyed by its idempotency key. */
export interface PendingPurchaseIntentSnapshot {
    productId: string;
    catalogItemId: string;
    idempotencyKey: string;
    startedAt: number;
}

export interface AppState {
    /** Boot and navigation state */
    phase: "loading" | "menu" | "playing";
    /** Progress bar state while critical assets warm */
    loadProgress: number;
    /** Game is paused by host lifecycle */
    paused: boolean;
    /** Selected menu screen (inside phase === 'menu') */
    menuScreen: MenuScreen;

    /** Core gameplay counters shown in HUD / menus */
    score: number;
    /** Soft currency (drachmae) — shared by daily rewards, IAP shop, arrow shop */
    coins: number;
    level: number;
    totalPlays: number;
    /** Completed courses, independent from starts/retries; drives the engagement funnel. */
    totalCompletions: number;
    /** Endless course the player is on (1-based). */
    depth: number;
    /** Deepest course ever cleared — the number the menu brags about. */
    bestDepth: number;
    /** Deepest career score confirmed submitted (or already held) by RUN. */
    leaderboardSubmittedDepth: number;
    /** Best star rating earned on any course. */
    bestStars: number;
    /** Buyable arrow shafts (persisted with save, not a separate localStorage key) */
    ownedArrows: string[];
    equippedArrow: string;

    /** Player settings mirrored from save */
    musicEnabled: boolean;
    musicVolume: number;
    sfxEnabled: boolean;
    sfxVolume: number;
    notificationsEnabled: boolean;
    notificationsConsent: "unknown" | "granted" | "denied";
    hapticsEnabled: boolean;
    reducedMotion: boolean;
    locale: string;
    quality: "high" | "low";

    /** One-time toasts surfaced from systems/purchases/tutorials */
    toast: string | null;
    /**
     * Bumped every time a toast is SET. The auto-hide timer compares this, not
     * the text: setting the same message twice leaves the selected string
     * equal, React skips the re-render, and the first timer kills the second.
     */
    toastSeq: number;

    /** Commerce state mirrored from save */
    pendingPurchaseIntent: PendingPurchaseIntentSnapshot | null;
    /** Last authoritative entitlement read; a failed read never clears this */
    ownedProductIds: string[];

    /** Retention state */
    dailyRewardLastClaimDay: string | null;
    dailyRewardStreak: number;
    dailyRewardClaimIds: string[];
    dailyQuestDay: string | null;
    dailyQuestProgress: Record<string, number>;
    dailyQuestClaimIds: string[];
    /** True only after the host actually displayed Odyssey's one-time Like prompt. */
    likePromptShown: boolean;
    runtimeReady: boolean;
    runtimeConfigVersion: string | null;
    trustedTimeReady: boolean;
}

const listeners = new Set<() => void>();

let state: AppState = {
    phase: "loading",
    loadProgress: 0,
    paused: false,
    menuScreen: "main",

    score: 0,
    coins: 0,
    level: 1,
    totalPlays: 0,
    totalCompletions: 0,
    depth: 1,
    bestDepth: 0,
    leaderboardSubmittedDepth: 0,
    bestStars: 0,
    ownedArrows: ["reed"],
    equippedArrow: "reed",

    musicEnabled: true,
    musicVolume: 0.2,
    sfxEnabled: true,
    sfxVolume: 0.7,
    notificationsEnabled: false,
    notificationsConsent: "unknown",
    hapticsEnabled: true,
    reducedMotion:
        typeof window !== "undefined"
            ? (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false)
            : false,
    locale: "English",
    quality: "high",

    toast: null,
    toastSeq: 0,
    pendingPurchaseIntent: null,
    ownedProductIds: [],
    dailyRewardLastClaimDay: null,
    dailyRewardStreak: 0,
    dailyRewardClaimIds: [],
    dailyQuestDay: null,
    dailyQuestProgress: {},
    dailyQuestClaimIds: [],
    likePromptShown: false,
    runtimeReady: false,
    runtimeConfigVersion: null,
    trustedTimeReady: false,
};

export const store = {
    get(): AppState {
        return state;
    },

    patch(partial: Partial<AppState>): void {
        // Stamp toastSeq whenever a toast is set so every producer gets the
        // repeat-safe behavior without changing its call site.
        state =
            typeof partial.toast === "string"
                ? { ...state, ...partial, toastSeq: state.toastSeq + 1 }
                : { ...state, ...partial };
        for (const l of listeners) l();
    },

    subscribe(l: () => void): () => void {
        listeners.add(l);
        return () => listeners.delete(l);
    },
};

export function useStore<T = AppState>(selector: (s: AppState) => T = (s) => s as unknown as T): T {
    return useSyncExternalStore(store.subscribe, () => selector(state));
}
