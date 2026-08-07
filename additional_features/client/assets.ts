/** RUN-hosted asset loader and cache patterns. Pixi's manifest remains the active default. */
import { api, guarded } from "./guards";

export async function loadRunHostedAsset(url: string) {
    return guarded("RUN asset load", () =>
        api.loadAsset(url, {
            cache: true,
            streaming: false,
            timeout: 10_000,
        }),
    );
}

export async function preloadRunHostedAssets(urls: string[], onProgress: (progress: number) => void = () => {}) {
    return guarded("RUN asset preload", () =>
        api.preloadAssets(
            urls.map((url) => ({ url, isOptional: false })),
            { onProgress: (progress) => onProgress(progress) },
        ),
    );
}

export function readCachedRunAsset(url: string): string | null {
    return api.assetLoader.getCached(url);
}

/** Call only when the scene/game no longer needs any loader-owned object URLs. */
export async function cleanupRunAssets() {
    return guarded("RUN asset cleanup", async () => {
        api.cleanupAssets();
    });
}
