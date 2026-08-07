import RundotGameAPI from "@series-inc/rundot-game-sdk/api";

export const api = RundotGameAPI;

export function requireExplicitAction(confirmed: boolean, label: string): void {
    if (!confirmed) throw new Error(`${label} requires an explicit player action`);
}

export function requireConfiguredId(id: string, label: string): string {
    if (!id || id.startsWith("REPLACE_WITH_")) {
        throw new Error(`${label} is not configured`);
    }
    return id;
}

export async function guarded<T>(label: string, operation: () => Promise<T>): Promise<T> {
    if (!api.isAvailable() && !api.isMock()) {
        throw new Error(`${label} requires the RUN host or explicit mock/Playground mode`);
    }
    try {
        return await operation();
    } catch (error) {
        console.warn(`[RUN additional feature] ${label} failed`, error);
        throw error;
    }
}
