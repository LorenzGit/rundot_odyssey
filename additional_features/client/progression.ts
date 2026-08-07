/** Authoritative progression writes and simulation patterns. */
import { api, guarded, requireConfiguredId } from "./guards";

export async function inspectSimulationState() {
    return guarded("simulation state", async () =>
        api.simulation.isEnabled() ? await api.simulation.getStateAsync() : null,
    );
}

export async function submitStat(statId: string, authoritativeValue: number) {
    return guarded("stat submit", () => api.stats.submit(statId, authoritativeValue));
}

export async function submitLeaderboardScore(score: number, durationSeconds: number, mode = "default") {
    return guarded("leaderboard submit", async () => {
        const token = await api.leaderboard.createScoreToken(mode);
        return api.leaderboard.submitScore({
            token: token.token,
            score,
            duration: durationSeconds,
            mode,
            telemetry: { source: "template-demo" },
        });
    });
}

export async function inspectLeaderboard(mode = "default", period = "alltime") {
    return guarded("leaderboard reads", async () => ({
        rank: await api.leaderboard.getMyRank({ mode, period }),
        top: await api.leaderboard.getPagedScores({ mode, period, limit: 10 }),
    }));
}

export async function executeSimulationRecipe(recipeId: string, inputs: Record<string, unknown> = {}) {
    return guarded("simulation recipe", () =>
        api.simulation.executeRecipeAsync(requireConfiguredId(recipeId, "Recipe ID"), inputs),
    );
}

export async function claimVipCollectible(seriesId: string, cardId: string) {
    return guarded("VIP collectible claim", () =>
        api.collectibles.claimVipCard(
            requireConfiguredId(seriesId, "Series ID"),
            requireConfiguredId(cardId, "Card ID"),
        ),
    );
}
