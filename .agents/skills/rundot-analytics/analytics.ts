/**
 * Drop-in RUN.game analytics wrapper.
 *
 * Copy into `src/analytics/analytics.ts`. Centralizes event naming, swallows
 * fire-and-forget rejections, and provides once-ever funnel dedup + crash capture.
 * Do NOT call RundotGameAPI.analytics directly elsewhere — go through these helpers.
 */
import RundotGameAPI from "@series-inc/rundot-game-sdk/api";

/** Analytics payloads are flat and queryable: scalar values only, snake_case keys. */
export type AnalyticsPayload = Record<string, string | number | boolean | null | undefined>;

/**
 * Analytics + funnel calls are fire-and-forget. The SDK swallows transport errors,
 * but guard anyway so a rejected promise never surfaces to the host as a RUNTIME_ERROR.
 */
function swallow(result: unknown): void {
    try {
        if (
            result != null &&
            typeof result === "object" &&
            "catch" in result &&
            typeof (result as Promise<unknown>).catch === "function"
        ) {
            (result as Promise<unknown>).catch(() => {});
        }
    } catch {
        // defensive: never let telemetry throw
    }
}

/** Record a custom event. `name` must be a stable snake_case identifier. */
export function trackEvent(name: string, payload?: AnalyticsPayload): void {
    swallow(RundotGameAPI.analytics.recordCustomEvent(name, payload));
}

/**
 * Record a funnel step. Step numbers are fixed once shipped; `funnelOrder`
 * positions this funnel in the overall journey (auth=0, ftue=1, purchase=2…)
 * and must be identical across every step of the same funnel.
 */
export function trackFunnel(
    step: number,
    name: string,
    funnel: string,
    funnelOrder?: number,
    payload?: AnalyticsPayload,
): void {
    swallow(RundotGameAPI.analytics.trackFunnelStep(step, name, funnel, funnelOrder));
    if (payload && Object.keys(payload).length > 0) {
        trackEvent(name, { funnel, funnel_step: step, ...payload });
    }
}

/** Convenience: a screen/menu was shown. */
export function trackScreenView(screen: string, payload?: AnalyticsPayload): void {
    trackEvent("screen_view", { screen, ...payload });
}

// ---------------------------------------------------------------------------
// Once-ever funnel dedup (FTUE / auth). Persists marks so reinstalls & replays
// don't re-fire first-session steps and inflate the funnel.
// ---------------------------------------------------------------------------

const MARKS_KEY = "analytics_funnel_marks";

function readMarks(): Set<string> {
    try {
        const raw = localStorage.getItem(MARKS_KEY);
        if (!raw) return new Set();
        const parsed = JSON.parse(raw) as unknown;
        if (!Array.isArray(parsed)) return new Set();
        return new Set(parsed.filter((e): e is string => typeof e === "string"));
    } catch {
        return new Set();
    }
}

/** Returns true if `mark` was newly recorded, false if it already existed. */
function markOnce(mark: string): boolean {
    const marks = readMarks();
    if (marks.has(mark)) return false;
    marks.add(mark);
    try {
        localStorage.setItem(MARKS_KEY, JSON.stringify([...marks]));
    } catch {
        // ignore quota / private mode
    }
    return true;
}

/** Fire a funnel step at most once across the player's lifetime (keyed by `mark`). */
export function trackFunnelStepOnce(
    step: number,
    name: string,
    funnel: string,
    mark: string,
    funnelOrder?: number,
    payload?: AnalyticsPayload,
): void {
    if (!markOnce(`${funnel}:${mark}`)) return;
    trackFunnel(step, name, funnel, funnelOrder, payload);
}

/** Reset all once-ever marks (call from a dev "reset progress" action). */
export function resetFunnelMarks(): void {
    try {
        localStorage.removeItem(MARKS_KEY);
    } catch {
        // ignore
    }
}

// ---------------------------------------------------------------------------
// Errors & crashes — queryable event + mobile support log.
// ---------------------------------------------------------------------------

/** Report a caught error: structured event for triage + support log for mobile. */
export function trackError(context: string, error: unknown, payload?: AnalyticsPayload): void {
    const message = error instanceof Error ? error.message : String(error);
    RundotGameAPI.error(`error:${context}`, error);
    trackEvent("error_occurred", { type: context, message, ...payload });
}

let errorCaptureInstalled = false;

/** Install global handlers so uncaught errors and rejections become `error_occurred`. Call once at startup. */
export function installErrorCapture(): void {
    if (errorCaptureInstalled || typeof window === "undefined") return;
    errorCaptureInstalled = true;

    window.addEventListener("error", (e) => {
        trackEvent("error_occurred", {
            type: "window_error",
            message: e.message,
            source: e.filename,
            line: e.lineno,
        });
        RundotGameAPI.error("window_error", e.message);
    });

    window.addEventListener("unhandledrejection", (e) => {
        const reason = e.reason instanceof Error ? e.reason.message : String(e.reason);
        trackEvent("error_occurred", { type: "unhandled_rejection", message: reason });
        RundotGameAPI.error("unhandled_rejection", reason);
    });
}

// ---------------------------------------------------------------------------
// Session bootstrap — call once when the game becomes playable.
// ---------------------------------------------------------------------------

/** Record session_start, optionally enriched with landing attribution (paid vs organic). */
export async function trackSessionStart(firstTimePlayer: boolean): Promise<void> {
    const attribution: AnalyticsPayload = {};
    try {
        const params = await RundotGameAPI.attribution.getAttributionParams();
        if (params) {
            for (const field of ["utm_source", "utm_medium", "utm_campaign", "fbclid", "gclid"] as const) {
                const value = (params as Record<string, unknown>)[field];
                if (typeof value === "string" && value !== "") attribution[field] = value;
            }
        }
    } catch {
        // attribution is a best-effort web-only signal
    }
    trackEvent("session_start", { first_time_player: firstTimePlayer, ...attribution });
}

/** Record an experiment exposure. Call immediately after resolving a non-null experiment. */
export function trackExperimentExposure(experiment: {
    name: string;
    value: Record<string, unknown>;
    groupName: string | null;
}): void {
    trackEvent("experiment_exposure", {
        experiment: experiment.name,
        variant: String(experiment.value.variant ?? "default"),
        group: experiment.groupName ?? "unassigned",
    });
}
