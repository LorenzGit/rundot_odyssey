/** Non-player storage scopes and shared assets. Never store credentials or PII. */
import { api, guarded, requireConfiguredId, requireExplicitAction } from "./guards";

export async function readStorageScopes(key: string) {
    return guarded("storage reads", async () => ({
        deviceCache: await api.deviceCache.getItem(key),
        owner: await api.ownerStorage.getItem(key),
    }));
}

export async function writeDisposableCache(key: string, value: unknown): Promise<void> {
    await guarded("device cache write", () =>
        api.deviceCache.setItem(key, JSON.stringify({ schemaVersion: 1, value })),
    );
}

export async function useSharedStorage(targetAppId: string, namespace: string, key: string) {
    const appId = requireConfiguredId(targetAppId, "Target app ID");
    return guarded("shared storage", async () => {
        const writer = api.sharedStorage.open({ appId, namespace });
        const reader = api.sharedStorage.read({ appId, namespace });
        await writer.setItem(key, "demo");
        return reader.getAllForKey(key);
    });
}

export async function loadSharedAssetBundle(sourceGame: string, bundleKey: string) {
    return guarded("shared asset bundle", () => api.sharedAssets.loadAssetsBundle(sourceGame, bundleKey));
}

export async function removeTemplateStorageValue(
    scope: "app" | "device" | "owner",
    key: string,
    playerConfirmed: boolean,
) {
    requireExplicitAction(playerConfirmed, "Storage deletion");
    if (!key.startsWith("template-")) throw new Error("Refusing to remove a non-template storage key");
    return guarded("storage deletion", () => {
        if (scope === "app") return api.appStorage.removeItem(key);
        if (scope === "device") return api.deviceCache.removeItem(key);
        return api.ownerStorage.removeItem(key);
    });
}
