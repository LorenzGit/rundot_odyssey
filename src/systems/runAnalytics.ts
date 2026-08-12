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
    // Steps 3 and 6 share this call site: the once-ever marks make the second
    // start count as "came back for another run" on its own. Step 6 is also
    // gated on step 5 having fired — an abandon-then-restart otherwise put
    // more players at "second run" than at "first completion", the exact
    // non-monotonic shape that reads as broken instrumentation.
    if (state.totalPlays <= 1) {
        analytics.funnelStep("ftue", 3, { play_number: state.totalPlays, level: levelId });
    } else if (!analytics.isFirstTime("ftue", 5)) {
        analytics.funnelStep("ftue", 6, { play_number: state.totalPlays, level: levelId });
    }
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

export function completeOdysseyRun(score: number, stars: 1 | 2 | 3) {
    const completionNumber = store.get().totalCompletions + 1;
    store.patch({ totalCompletions: completionNumber });
    analytics.funnelStep("ftue", 5, { score, stars });
    // This funnel is one step per COMPLETION, not one step per menu launch.
    // Next/Replay happen inside Pixi and never revisit the React menu; keying
    // this to totalPlays produced 205 rows at step 1 and only two at step 2.
    analytics.funnelStep("engagement", completionNumber, { score, stars });
    if (stars >= 3) {
        analytics.event("milestone_reached", { milestone: "three_star", value: score });
    }
    return runLevelAnalytics.complete({ score, stars });
}

/** Restart the active course as another measured attempt, not another play. */
export function restartOdysseyRun(): void {
    inputRecordedThisRun = false;
    runLevelAnalytics.restart({ score: store.get().score });
}

export function abandonOdysseyRun(exitReason: string): void {
    runLevelAnalytics.abandon(exitReason, { score: store.get().score });
}
