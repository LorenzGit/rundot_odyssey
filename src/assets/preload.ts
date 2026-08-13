/** Renderer-free loading for the one image required by the DOM main menu. */
import { MENU_BACKDROP } from "./manifest.ts";

const LOAD_TIMEOUT_MS = 15_000;
const MAX_ATTEMPTS = 2;
const RETRY_DELAY_MS = 350;

export type CriticalAssetEventName = "critical_asset_timeout" | "critical_asset_retry" | "critical_asset_failure";

export interface CriticalAssetEvent {
    name: CriticalAssetEventName;
    asset_id: string;
    attempt: number;
    elapsed_ms: number;
    reason: string;
    timeout_ms: number;
}

export interface WarmAssetsOptions {
    onProgress?: (progress: number) => void;
    onEvent?: (event: CriticalAssetEvent) => void;
}

class AssetTimeoutError extends Error {
    constructor(timeoutMs: number) {
        super(`Image download or decode timed out after ${timeoutMs}ms`);
        this.name = "AssetTimeoutError";
    }
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function wait(delayMs: number): Promise<void> {
    return new Promise((resolve) => window.setTimeout(resolve, delayMs));
}

/** Resolve only when the exact image the menu uses has downloaded and decoded. */
function loadDecodedImage(url: string, timeoutMs: number): Promise<void> {
    return new Promise((resolve, reject) => {
        const image = new Image();
        let settled = false;
        const finish = (error?: unknown) => {
            if (settled) return;
            settled = true;
            window.clearTimeout(timeout);
            image.onload = null;
            image.onerror = null;
            if (error) reject(error);
            else resolve();
        };
        const timeout = window.setTimeout(() => {
            image.src = "";
            finish(new AssetTimeoutError(timeoutMs));
        }, timeoutMs);

        image.decoding = "async";
        image.onload = () => {
            if (image.naturalWidth <= 0 || image.naturalHeight <= 0) {
                finish(new Error("Image decoded without usable dimensions"));
                return;
            }
            // `load` proves the image has a usable decoded frame in browsers
            // where decode() is absent or rejects after an already-valid load.
            if (typeof image.decode !== "function") {
                finish();
                return;
            }
            void image.decode().then(
                () => finish(),
                () => finish(),
            );
        };
        image.onerror = () => finish(new Error("Image request or decode failed"));
        image.src = url;
    });
}

/**
 * The full-resolution menu painting is a hard visual gate. A transient fetch
 * gets one bounded retry; a final failure rejects into the visible boot
 * recovery screen instead of revealing a half-painted menu.
 */
export async function warmAssets(options: WarmAssetsOptions = {}): Promise<void> {
    const onProgress = options.onProgress ?? (() => {});
    const onEvent = options.onEvent ?? (() => {});
    let lastError: unknown = new Error("Critical asset did not start");

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
        const startedAt = performance.now();
        try {
            onProgress(attempt === 1 ? 0.15 : 0.3);
            await loadDecodedImage(MENU_BACKDROP.url, LOAD_TIMEOUT_MS);
            onProgress(1);
            return;
        } catch (error) {
            lastError = error;
            const elapsedMs = Math.round(performance.now() - startedAt);
            const reason = errorMessage(error).slice(0, 200);
            if (error instanceof AssetTimeoutError) {
                onEvent({
                    name: "critical_asset_timeout",
                    asset_id: MENU_BACKDROP.id,
                    attempt,
                    elapsed_ms: elapsedMs,
                    reason,
                    timeout_ms: LOAD_TIMEOUT_MS,
                });
            }
            if (attempt < MAX_ATTEMPTS) {
                onEvent({
                    name: "critical_asset_retry",
                    asset_id: MENU_BACKDROP.id,
                    attempt,
                    elapsed_ms: elapsedMs,
                    reason,
                    timeout_ms: LOAD_TIMEOUT_MS,
                });
                await wait(RETRY_DELAY_MS);
                continue;
            }
            onEvent({
                name: "critical_asset_failure",
                asset_id: MENU_BACKDROP.id,
                attempt,
                elapsed_ms: elapsedMs,
                reason,
                timeout_ms: LOAD_TIMEOUT_MS,
            });
        }
    }

    throw lastError;
}
