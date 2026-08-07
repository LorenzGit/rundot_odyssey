import process from "node:process";
import { createServer } from "vite";

const SESSION_COUNT = 600;
const BASE_SEED = 0x5eed1234;

// Execute the same TypeScript source that ships in the game. This keeps the
// headless proof honest without maintaining a second JavaScript implementation.
const sourceLoader = await createServer({
    appType: "custom",
    configFile: false,
    logLevel: "silent",
    server: { middlewareMode: true },
});
const { NoiseRandom } = await sourceLoader.ssrLoadModule("/src/game/noiseRandom.ts");
const { createLevelAnalytics } = await sourceLoader.ssrLoadModule("/src/systems/levelAnalytics.ts");
await sourceLoader.close();

/** Shared deterministic RNG for simulations, replays, and reproducible tests. */
export function createSeededRandom(seed) {
    const random = new NoiseRandom(seed >>> 0, 0);
    return () => random.nextDouble();
}

/**
 * Neutral risk/reward model used only to demonstrate a headless proof loop.
 * Replace this model with the derived game's real deterministic core.
 */
export function simulateSession(seed) {
    const random = createSeededRandom(seed);
    const turns = 16;
    const targetProgress = 26;
    let progress = 0;
    let score = 0;
    let lives = 3;

    for (let turn = 0; turn < turns && lives > 0 && progress < targetProgress; turn += 1) {
        const remainingTurns = turns - turn;
        const progressNeeded = targetProgress - progress;
        const mustPush = progressNeeded > remainingTurns;
        const push = mustPush || random() < 0.46;
        const pressure = turn / turns;
        const failureChance = (push ? 0.2 : 0.08) + pressure * 0.08;

        if (random() < failureChance) {
            lives -= 1;
            continue;
        }

        const gain = push ? 2 + Math.floor(random() * 3) : 1 + Math.floor(random() * 2);
        progress += gain;
        score += gain * 100 + (push ? 50 : 0);
    }

    return {
        seed,
        won: progress >= targetProgress,
        progress,
        score,
        lives,
    };
}

export function runBatch(count = SESSION_COUNT, baseSeed = BASE_SEED) {
    const results = Array.from({ length: count }, (_, index) => simulateSession((baseSeed + index) >>> 0));
    const wins = results.filter((result) => result.won).length;
    const scores = results.map((result) => result.score);
    return {
        sessions: count,
        baseSeed,
        wins,
        winRate: wins / count,
        averageScore: scores.reduce((sum, score) => sum + score, 0) / count,
        minScore: Math.min(...scores),
        maxScore: Math.max(...scores),
        uniqueScores: new Set(scores).size,
    };
}

function verify() {
    const first = simulateSession(BASE_SEED);
    const replay = simulateSession(BASE_SEED);
    if (JSON.stringify(first) !== JSON.stringify(replay)) {
        throw new Error("Identical seeds must produce identical sessions");
    }

    const summary = runBatch();
    if (summary.winRate < 0.25 || summary.winRate > 0.85) {
        throw new Error(`Reference model win rate ${summary.winRate.toFixed(3)} is outside its review band`);
    }
    if (summary.uniqueScores < 20) {
        throw new Error(`Reference model produced only ${summary.uniqueScores} unique scores`);
    }
    verifyLevelAnalytics();
    return summary;
}

function verifyLevelAnalytics() {
    let now = 0;
    const events = [];
    const analytics = createLevelAnalytics({
        now: () => now,
        emit: (eventName, payload) => events.push({ eventName, payload }),
    });

    analytics.start({ level_id: "template_demo_1", level: 1, mode: "bounce_demo" });
    now = 1_000;
    analytics.setPaused("host_pause", true);
    now = 2_000;
    analytics.setPaused("document_hidden", true);
    now = 3_000;
    analytics.setPaused("host_pause", false);
    now = 6_000;
    analytics.setPaused("document_hidden", false);
    now = 8_000;
    analytics.restart({ score: 4 });
    now = 10_000;
    analytics.complete({ score: 10 });
    analytics.start({ level_id: "template_demo_2", level: 2, mode: "bounce_demo" });
    now = 11_000;
    analytics.abandon("menu_exit", { score: 3 });

    const restart = events.find((event) => event.eventName === "level_restarted");
    const completion = events.find((event) => event.eventName === "level_completed");
    const abandonment = events.find((event) => event.eventName === "level_abandoned");
    if (events[0]?.eventName !== "level_started" || events[0]?.payload.level !== 1) {
        throw new Error("Level analytics must emit stable start context");
    }
    if (
        restart?.payload.duration_seconds !== 3 ||
        restart?.payload.attempt_duration_seconds !== 3 ||
        restart?.payload.next_attempt !== 2
    ) {
        throw new Error("Level restart timing must exclude overlapping pause reasons");
    }
    if (
        completion?.payload.duration_seconds !== 5 ||
        completion?.payload.attempt_duration_seconds !== 2 ||
        completion?.payload.attempts !== 2
    ) {
        throw new Error("Level completion must report active total and attempt time");
    }
    if (
        abandonment?.payload.duration_seconds !== 1 ||
        abandonment?.payload.exit_reason !== "menu_exit" ||
        abandonment?.payload.score !== 3
    ) {
        throw new Error("Level abandonment must preserve active time, reason, and progress");
    }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
    const summary = verify();
    console.log(
        JSON.stringify(
            {
                ...summary,
                winRate: Number(summary.winRate.toFixed(3)),
                averageScore: Math.round(summary.averageScore),
            },
            null,
            2,
        ),
    );
}
