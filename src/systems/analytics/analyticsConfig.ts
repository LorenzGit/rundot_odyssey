import { store } from "../../state/store.ts";
import { recordAnalytics, recordErrorLog, recordFunnelStep } from "../../sdk/runSdk.ts";
import packageJson from "../../../package.json";
import { countedSteps, createAnalytics } from "./analytics.ts";

/**
 * ADAPT: this is the game's funnel registry. Rename the steps to match the
 * derived game's actual first session — but keep the SHAPE:
 *
 *   - `ftue` has AT LEAST three steps: loaded -> first action -> first
 *     completion. A one-step boot funnel proves the app loaded and nothing
 *     else; it cannot show where onboarding loses players, which is the only
 *     reason to have a funnel. Prefer more, finer steps over fewer coarse ones.
 *   - `ftue` is `onceEver` so replays cannot re-fire step 1 and flatten the
 *     curve. Correct instrumentation reads monotonically decreasing.
 *   - Step names and numbers are FROZEN once deployed. Add new steps at the
 *     end; never renumber or rename a shipped one.
 */
export const analytics = createAnalytics({
    emitEvent: (name, payload) => {
        void recordAnalytics(name, { ...payload, build_version: packageJson.version });
    },
    emitErrorLog: recordErrorLog,
    emitFunnelStep: (step, name, funnel, order) => {
        // Return (not void) the promise: on onceEver funnels the lifetime mark
        // is only persisted once the SDK confirms delivery.
        return recordFunnelStep(step, name, funnel, order);
    },
    funnels: {
        /**
         * The loading phase itself, ahead of `ftue` (order 0 vs 1).
         *
         * `ftue` starts at "the game finished loading", so a player who closed
         * the tab during boot — or hit a load failure — never appeared in it at
         * all. That made a load regression look identical to a retention
         * problem. Step 1 fires on the first executable line, before any await,
         * and is buffered until the SDK transport is up.
         *
         * A separate funnel rather than steps prepended to `ftue`, because
         * `ftue` step numbers are frozen in games that already shipped.
         */
        load: {
            order: 0,
            onceEver: true,
            steps: [
                "load_started", // first line of script execution
                "load_sdk_ready", // host handshake resolved
                "load_save_ready", // progress restored
                "load_assets_ready", // playable frame reachable
            ],
        },
        ftue: {
            order: 1,
            onceEver: true,
            steps: [
                // Only CAUSALLY ORDERED beats belong in a funnel. `first_input`
                // was removed from this list: the demo ball bounces on its own,
                // so a player can score before ever tapping, and the funnel read
                // as non-monotonic — indistinguishable from broken
                // instrumentation. It still fires as a plain event, which is the
                // right home for a beat whose position in the sequence varies.
                "game_loaded", // boot complete
                "menu_viewed", // main menu actually painted, not just booted
                "first_level_started", // pressed play — the first real intent
                "first_score", // first point scored — the first feedback beat
                "first_level_completed", // first completion — the "I get it" beat
                "second_level_started", // came back for another round
            ],
        },
        // Repeatable: plots how deep players get across the first 12 plays.
        engagement: { order: 2, steps: countedSteps("level_completed_", 12) },
        purchase: {
            order: 3,
            steps: ["shop_opened", "item_selected", "checkout_started", "purchase_complete"],
        },
    },
    enrich: () => {
        const state = store.get();
        return {
            total_plays: state.totalPlays,
            level: state.level,
        };
    },
    marksKey: "odyssey_perfect_shot_funnel_marks",
    debug: import.meta.env.DEV,
});
