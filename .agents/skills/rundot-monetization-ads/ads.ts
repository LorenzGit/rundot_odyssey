import RundotGameAPI from "@series-inc/rundot-game-sdk/api";

/**
 * Ad monetization helper for RUN games.
 *
 * - Rewarded ads: preflight + grant ONLY when the reward was actually earned.
 * - Interstitials: enforce a frequency cap so you never spam forced ads.
 * - Every placement is attributed (adDisplayId) and fires analytics.
 *
 * Ads do not show on Desktop and are hidden for platform subscribers — both
 * cases resolve `false`, so treat the boolean as your grant/shown gate, never
 * as "an ad definitely played".
 */

function track(name: string, payload?: Record<string, string | number | boolean>): void {
    try {
        void Promise.resolve(RundotGameAPI.analytics?.recordCustomEvent?.(name, payload)).catch(() => {});
    } catch {
        /* analytics must never break gameplay */
    }
}

// ---- Rewarded ads ---------------------------------------------------------

export async function isRewardedReady(): Promise<boolean> {
    try {
        return await RundotGameAPI.ads.isRewardedAdReadyAsync();
    } catch {
        return false;
    }
}

/**
 * Show a rewarded ad for a placement. Resolves `true` ONLY when the reward was
 * earned — call your grant logic on `true`, never otherwise.
 */
export async function showRewarded(placement: { id: string; name?: string }): Promise<boolean> {
    track("rewarded_ad_offered", { adDisplayId: placement.id });
    try {
        if (!(await RundotGameAPI.ads.isRewardedAdReadyAsync())) {
            track("rewarded_ad_unavailable", { adDisplayId: placement.id });
            return false;
        }
        const earned = await RundotGameAPI.ads.showRewardedAdAsync({
            adDisplayId: placement.id,
            adDisplayName: placement.name ?? placement.id,
        });
        track(earned ? "rewarded_ad_complete" : "rewarded_ad_abandoned", {
            adDisplayId: placement.id,
        });
        return earned;
    } catch {
        track("rewarded_ad_error", { adDisplayId: placement.id });
        return false;
    }
}

// ---- Interstitials (frequency-capped) -------------------------------------

/** Minimum seconds between interstitials. Tune per genre/audience. */
const MIN_INTERSTITIAL_INTERVAL_S = 75;
/** Suppress interstitials for the first N sessions to protect new players. */
const SUPPRESS_FIRST_SESSIONS = 2;

let lastInterstitialAt = 0;

function sessionCount(): number {
    try {
        const n = Number(localStorage.getItem("ad_session_count") ?? "0");
        return Number.isFinite(n) ? n : 0;
    } catch {
        return 0;
    }
}

/** Call once per session start (e.g. alongside your session_start event). */
export function noteSessionStart(): void {
    try {
        localStorage.setItem("ad_session_count", String(sessionCount() + 1));
    } catch {
        /* storage unavailable — non-fatal */
    }
}

/**
 * Show an interstitial at a natural break IF the frequency cap allows it.
 * Returns true if an ad was actually displayed.
 */
export async function maybeShowInterstitial(placement: { id: string; name?: string }): Promise<boolean> {
    if (sessionCount() <= SUPPRESS_FIRST_SESSIONS) return false;

    const now = Date.now();
    if (now - lastInterstitialAt < MIN_INTERSTITIAL_INTERVAL_S * 1000) return false;

    try {
        if (!(await RundotGameAPI.ads.isInterstitialAdReadyAsync())) return false;
        const shown = await RundotGameAPI.ads.showInterstitialAd({
            adDisplayId: placement.id,
            adDisplayName: placement.name ?? placement.id,
        });
        if (shown) {
            lastInterstitialAt = now;
            track("interstitial_shown", { adDisplayId: placement.id });
        }
        return shown;
    } catch {
        track("interstitial_error", { adDisplayId: placement.id });
        return false;
    }
}
