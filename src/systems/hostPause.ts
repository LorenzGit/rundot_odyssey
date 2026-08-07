import { audioManager } from "../audio/audioManager.ts";
import { store } from "../state/store.ts";
import { runLevelAnalytics } from "./runAnalytics.ts";
import { runtimeServices } from "./runtimeServices.ts";

export type HostPauseReason = "host_pause" | "host_sleep";

const activeReasons = new Set<HostPauseReason>();

function applyPauseState(): void {
    const paused = activeReasons.size > 0;
    if (store.get().paused !== paused) store.patch({ paused });
    audioManager.setPaused(paused);
    if (!paused) runtimeServices.resume();
}

/**
 * Reconcile one paired RUN lifecycle reason without letting onResume clear an
 * overlapping onSleep (or vice versa).
 */
export function setHostPaused(reason: HostPauseReason, paused: boolean): void {
    runLevelAnalytics.setPaused(reason, paused);
    if (paused) activeReasons.add(reason);
    else activeReasons.delete(reason);
    applyPauseState();
}

/**
 * Player escape hatch for an unmatched host pause. Reaching the button proves
 * no host-owned surface is covering the game, because that surface would own
 * the input instead.
 */
export function resumeFromHostPause(): void {
    for (const reason of activeReasons) runLevelAnalytics.setPaused(reason, false);
    activeReasons.clear();
    applyPauseState();
}
