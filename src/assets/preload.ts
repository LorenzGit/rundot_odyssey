/**
 * Asset warming via Pixi Assets.
 *
 * Boot gate: await only the critical (main-menu) bundle with progress.
 * Deferred bundles start as fire-and-forget after the gate — they must not
 * delay the main menu. Never put video preloads on this path.
 *
 * Failure posture: a missing asset must never brick boot. Errors are logged
 * and boot continues.
 */
import { Assets } from "pixi.js";
import { MANIFEST, CRITICAL_BUNDLES, DEFERRED_BUNDLES } from "./manifest.ts";

async function withDeadline<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const deadline = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
    });
    try {
        return await Promise.race([promise, deadline]);
    } finally {
        if (timer !== undefined) clearTimeout(timer);
    }
}

/**
 * @param onProgress 0..1, called as the critical bundle loads; always ends
 *   with a final call at 1.
 */
export async function warmAssets(onProgress: (progress: number) => void = () => {}): Promise<void> {
    try {
        await withDeadline(Assets.init({ manifest: MANIFEST }), 4_000, "asset manifest");
        if (CRITICAL_BUNDLES.length > 0) {
            await withDeadline(Assets.loadBundle(CRITICAL_BUNDLES, onProgress), 12_000, "critical asset bundle");
        }
        if (DEFERRED_BUNDLES.length > 0) {
            // Deliberately NOT Assets.backgroundLoadBundle: its internal queue
            // has no rejection handling, so one flaky fetch silently wedges
            // every remaining deferred asset for the session. Sequential loads
            // with a catch keep the trickle alive past a failure, and Assets
            // dedupes if a later explicit load needs one of these sooner.
            void (async () => {
                for (const bundle of DEFERRED_BUNDLES) {
                    try {
                        await Assets.loadBundle(bundle);
                    } catch (error) {
                        console.warn(`[preload] deferred bundle "${bundle}" failed — skipping`, error);
                    }
                }
            })();
        }
    } catch (err) {
        console.warn("[preload] asset warm failed — continuing without", err);
    }

    // Wait for @font-face fonts so the first painted screen doesn't swap
    // fonts mid-frame. (No custom fonts by default; harmless either way.)
    try {
        await withDeadline(document.fonts.ready, 1_500, "font warmup");
    } catch {
        /* older engines */
    }

    onProgress(1);
}
