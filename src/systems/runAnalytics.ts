/**
 * Run-session analytics for Odyssey shots. Mirrors the template demo analytics
 * shape so FTUE funnels stay monotonic: start → complete / abandon.
 */
import { store } from "../state/store.ts";
import { analytics } from "./analytics/analyticsConfig.ts";
import { createLevelAnalytics } from "./levelAnalytics.ts";
import { runtimeServices } from "./runtimeServices.ts";

let inputRecordedThisRun = false;

export const runLevelAnalytics = createLevelAnalytics({
    emit: (eventName, payload) => runtimeServices.track(eventName, payload),
});

export function startOdysseyRun(levelId: number): void {
    inputRecordedThisRun = false;
    const state = store.get();
    analytics.funnelStep("ftue", state.totalPlays <= 1 ? 3 : 6, { play_number: state.totalPlays, level: levelId });
    runLevelAnalytics.start({
        level_id: `odyssey_${levelId}`,
        level: levelId,
        mode: "perfect_shot",
        play_number: state.totalPlays,
        quality: state.quality,
        reduced_motion: state.reducedMotion,
    });
}

export function recordOdysseyShot(): void {
    if (inputRecordedThisRun) return;
    inputRecordedThisRun = true;
    analytics.event("first_input", { play_number: store.get().totalPlays });
    analytics.funnelStep("ftue", 4, { verb: "shot" });
}

export function completeOdysseyRun(score: number, stars: 1 | 2 | 3): void {
    analytics.funnelStep("ftue", 5, { score, stars });
    analytics.funnelStep("engagement", store.get().totalPlays, { score, stars });
    if (stars >= 3) {
        analytics.event("milestone_reached", { milestone: "three_star", value: score });
    }
    runLevelAnalytics.complete({ score, stars });
}

export function abandonOdysseyRun(exitReason: string): void {
    runLevelAnalytics.abandon(exitReason, { score: store.get().score });
}
