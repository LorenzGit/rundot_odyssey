/**
 * Drop-in onboarding / tutorial-step controller for a RUN.game title.
 *
 * Copy into `src/onboarding/onboarding.ts`. Tracks which first-session beats a
 * player has completed — once ever, persisted via appStorage — so tutorial UI
 * shows only the first time and a linear sequence can advance safely across
 * sessions. Pair each beat with a granular FTUE funnel step (rundot-analytics).
 */
import RundotGameAPI from "@series-inc/rundot-game-sdk/api";

const STORAGE_KEY = "onboarding_progress";

export class OnboardingController {
    private completed = new Set<string>();
    private loaded = false;

    /** Load persisted progress. Call once before showing any onboarding UI. */
    async load(): Promise<void> {
        try {
            const raw = await RundotGameAPI.appStorage.getItem(STORAGE_KEY);
            if (raw) {
                const parsed = JSON.parse(raw) as unknown;
                if (Array.isArray(parsed)) {
                    this.completed = new Set(parsed.filter((e): e is string => typeof e === "string"));
                }
            }
        } catch {
            // first run / unavailable storage → empty progress
        }
        this.loaded = true;
    }

    /** Whether a beat has already been completed by this player. */
    isComplete(stepId: string): boolean {
        return this.completed.has(stepId);
    }

    /** Whether a beat should show now: progress loaded and not yet completed. */
    shouldShow(stepId: string): boolean {
        return this.loaded && !this.completed.has(stepId);
    }

    /**
     * Mark a beat complete (persisted, idempotent). `onFirst` runs only on the
     * first completion — the place to fire this beat's FTUE funnel step.
     * Returns true if this was a new completion.
     */
    async complete(stepId: string, onFirst?: () => void): Promise<boolean> {
        if (this.completed.has(stepId)) return false;
        this.completed.add(stepId);
        onFirst?.();
        try {
            await RundotGameAPI.appStorage.setItem(STORAGE_KEY, JSON.stringify([...this.completed]));
        } catch (err) {
            RundotGameAPI.error("onboarding: failed to persist progress", err);
        }
        return true;
    }

    /** First not-yet-completed step from an ordered list, or null when finished. */
    nextStep(orderedStepIds: string[]): string | null {
        return orderedStepIds.find((id) => !this.completed.has(id)) ?? null;
    }

    /** True once every step in the sequence is complete. */
    isFinished(orderedStepIds: string[]): boolean {
        return orderedStepIds.every((id) => this.completed.has(id));
    }

    /** Clear all progress (wire to a dev "reset onboarding" action). */
    async reset(): Promise<void> {
        this.completed = new Set();
        try {
            await RundotGameAPI.appStorage.removeItem(STORAGE_KEY);
        } catch {
            // ignore
        }
    }
}
