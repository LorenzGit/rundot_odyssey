import packageJson from "../../package.json";
import { PLATFORM_IDS, isConfiguredPlatformId } from "../config/platform.ts";
import {
    fetchLiveOps,
    getRunCapabilities,
    isRewardedAdReady,
    cancelLocalNotification,
    recordAnalytics,
    recordFunnelStep,
    showVerifiedRewardedAd,
    triggerHaptic,
    type HapticStyle,
    type VerifiedActionResult,
} from "../sdk/runSdk.ts";
import { refreshServerTime } from "./serverTime.ts";
import { store } from "../state/store.ts";
import { returnReminders } from "./retention/retentionConfig.ts";

export interface RuntimeConfig {
    dailyRewardsEnabled: boolean;
    dailyQuestsEnabled: boolean;
    notificationDelaySeconds: number;
    adsEnabled: boolean;
    shopEnabled: boolean;
}

const DEFAULTS: Readonly<RuntimeConfig> = Object.freeze({
    dailyRewardsEnabled: true,
    dailyQuestsEnabled: true,
    notificationDelaySeconds: 86_400,
    adsEnabled: false,
    shopEnabled: false,
});

const RETURN_REMINDER_ID = "odyssey-perfect-shot-return-reminder";
const LEGACY_RETURN_REMINDER_ID = "rundot-template-return-reminder";

let config: RuntimeConfig = { ...DEFAULTS };
let nextRefreshTimer = 0;

function clearScheduledRefresh(): void {
    if (!nextRefreshTimer) return;
    window.clearTimeout(nextRefreshTimer);
    nextRefreshTimer = 0;
}

function normalize(values: Record<string, unknown>): RuntimeConfig {
    const root =
        values.runtime && typeof values.runtime === "object" ? (values.runtime as Record<string, unknown>) : values;
    const monetization =
        root.monetization && typeof root.monetization === "object"
            ? (root.monetization as Record<string, unknown>)
            : {};
    const delay = Number(root.notificationDelaySeconds);
    return {
        dailyRewardsEnabled: typeof root.dailyRewardsEnabled === "boolean" ? root.dailyRewardsEnabled : true,
        dailyQuestsEnabled: typeof root.dailyQuestsEnabled === "boolean" ? root.dailyQuestsEnabled : true,
        notificationDelaySeconds: Number.isFinite(delay) ? Math.max(3_600, Math.min(delay, 604_800)) : 86_400,
        adsEnabled: monetization.adsEnabled === true && isConfiguredPlatformId(PLATFORM_IDS.rewardedResultsBonus),
        // The gate is the catalog as a whole: if the durable's ids are not
        // configured the deploy never registered `rundot/shop.config.json`,
        // and no product in it can complete. Per-product configuration is
        // still re-checked in `productView`.
        shopEnabled:
            monetization.shopEnabled === true &&
            isConfiguredPlatformId(PLATFORM_IDS.patronageItem) &&
            isConfiguredPlatformId(PLATFORM_IDS.patronageEntitlement),
    };
}

async function refreshLiveOps(): Promise<void> {
    clearScheduledRefresh();
    const snapshot = await fetchLiveOps();
    if (!snapshot) {
        config = { ...DEFAULTS };
        store.patch({ runtimeReady: true, runtimeConfigVersion: null });
        return;
    }
    config = normalize(snapshot.values);
    store.patch({ runtimeReady: true, runtimeConfigVersion: snapshot.configVersion });
    if (snapshot.nextChangeAt) {
        const delay = Math.max(1_000, Math.min(snapshot.nextChangeAt - Date.now() + 500, 2_147_000_000));
        nextRefreshTimer = window.setTimeout(() => startRefreshCycle(), delay);
    }
}

async function refreshTime(): Promise<void> {
    store.patch({ trustedTimeReady: await refreshServerTime() });
}

/**
 * Re-anchor the whole 24/48/72h return cadence to now.
 *
 * This replaced a single 24h reminder. One ping gives a player exactly one
 * chance to come back; a short cadence gives three without becoming spam, and
 * stopping at 72h is deliberate — a fourth converts nobody and costs the
 * notification permission the first three depend on.
 */
async function rearmNotifications(): Promise<void> {
    const state = store.get();
    if (!state.notificationsEnabled || state.notificationsConsent !== "granted") return;
    // The pre-cadence reminder used its own id; leave it scheduled and the
    // player gets the old generic ping alongside the new specific ones.
    for (const legacy of [RETURN_REMINDER_ID, LEGACY_RETURN_REMINDER_ID]) {
        await cancelLocalNotification(legacy);
    }
    await returnReminders.refreshAll();
}

async function refreshRuntime(): Promise<void> {
    await Promise.allSettled([refreshTime(), refreshLiveOps()]);
    await rearmNotifications();
}

function startRefreshCycle(): void {
    void refreshRuntime().catch((error) => {
        console.warn("[runtime] background refresh failed", error);
    });
}

export const runtimeServices = {
    get config(): Readonly<RuntimeConfig> {
        return config;
    },
    bootstrap(): void {
        startRefreshCycle();
        this.track("game_boot", { version: packageJson.version, host: getRunCapabilities().host });
    },
    resume(): void {
        startRefreshCycle();
    },
    rearmNotifications(): void {
        void rearmNotifications().catch((error) => {
            console.warn("[runtime] notification refresh failed", error);
        });
    },
    track(eventName: string, payload: Record<string, unknown> = {}): void {
        void recordAnalytics(eventName, { ...payload, build_version: packageJson.version });
    },
    funnel(step: number, name: string, funnel: string, funnelOrder = 0): void {
        void recordFunnelStep(step, name, funnel, funnelOrder);
    },
    async haptic(style: HapticStyle): Promise<boolean> {
        return store.get().hapticsEnabled ? triggerHaptic(style) : false;
    },
    /**
     * Can the results bounty actually be offered right now?
     *
     * The victory card asks this before it draws the button, so a player never
     * taps a doubler that has no inventory behind it. Readiness is a cached
     * host answer, not a network round trip.
     */
    async resultsAdReady(): Promise<boolean> {
        if (store.get().totalPlays < 1) return false;
        if (!config.adsEnabled || !isConfiguredPlatformId(PLATFORM_IDS.rewardedResultsBonus)) return false;
        return isRewardedAdReady();
    },
    async watchResultsAd(): Promise<VerifiedActionResult> {
        if (store.get().totalPlays < 1) return "unavailable";
        if (!config.adsEnabled || !isConfiguredPlatformId(PLATFORM_IDS.rewardedResultsBonus)) return "unavailable";
        // Offered and complete are both required: offered-without-complete is a
        // reward-or-copy problem, no-offer-at-all is an inventory one, and only
        // the pair tells them apart. Only a verified result earned the reward —
        // "cancelled" means the player closed the video early.
        this.track("rewarded_ad_offered", {
            ad_display_id: PLATFORM_IDS.rewardedResultsBonus,
            placement: "results_bonus",
        });
        const result = await showVerifiedRewardedAd(PLATFORM_IDS.rewardedResultsBonus, "Results Bonus");
        if (result === "verified") {
            this.track("rewarded_ad_complete", {
                ad_display_id: PLATFORM_IDS.rewardedResultsBonus,
                placement: "results_bonus",
            });
        }
        return result;
    },
};
