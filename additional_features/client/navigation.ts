/** Disruptive host navigation patterns kept out of the active demo. */
import { api, guarded, requireConfiguredId, requireExplicitAction } from "./guards";

export async function navigateToAnotherGame(targetGameId: string, playerTapped: boolean) {
    requireExplicitAction(playerTapped, "Game navigation");
    return guarded("game navigation", () =>
        api.navigateToGame(requireConfiguredId(targetGameId, "Target game ID"), {
            launchContext: { source: "template-demo" },
            returnContext: { route: "menu" },
        }),
    );
}

export async function pushCompanionApp(targetAppId: string, playerTapped: boolean) {
    requireExplicitAction(playerTapped, "App-stack navigation");
    return guarded("app-stack push", () =>
        api.pushAppAsync(requireConfiguredId(targetAppId, "Target app ID"), {
            contextData: { source: "template-demo" },
        }),
    );
}

export async function popCompanionApp(playerTapped: boolean) {
    requireExplicitAction(playerTapped, "App-stack navigation");
    return guarded("app-stack pop", () => api.popAppAsync());
}

export function inspectAppStack() {
    return api.getStackInfo();
}

export async function exitToHost(playerTapped: boolean) {
    requireExplicitAction(playerTapped, "Exit");
    return guarded("host exit", () => api.requestPopOrQuit());
}

/** Invoke only after all asynchronous quit/teardown work has settled. */
export async function notifyHostCleanupComplete() {
    return guarded("cleanup completion", async () => {
        api.notifyCleanupComplete();
    });
}
