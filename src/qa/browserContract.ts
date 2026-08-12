/**
 * Development-only semantic browser contract for headless harnesses
 * (scripts/visual-qa.mjs and the Playwright smoke suite).
 *
 * `hitTest` exists because of one specific failure mode: a harness that taps
 * guessed screen coordinates passes happily while hitting nothing but felt.
 * So a harness never guesses — it asks what is actually under the point it is
 * about to tap, taps, and then asserts the snapshot changed.
 *
 * Never present in production: gated on both `import.meta.env.DEV` and `?qa=1`.
 */
import packageJson from "../../package.json";
import { audioManager } from "../audio/audioManager.ts";
import { getRunCapabilities, hostOverlayInFlight } from "../sdk/runSdk.ts";
import { store, type AppState, type MenuScreen } from "../state/store.ts";
import { rendererLifecycleSnapshot } from "../rendering/rendererLifecycle.ts";
import { setHostPaused } from "../systems/hostPause.ts";
import { saveSystem } from "../systems/save.ts";
import { localDayKey, serverNow } from "../systems/serverTime.ts";
import { selectLocale } from "../systems/localization.ts";

interface HitTestReport {
    tag: string;
    id: string | null;
    className: string | null;
    testId: string | null;
    text: string | null;
}

interface LayoutFitEntry {
    name: string;
    width: number;
    viewport: number;
}

interface TemplateGameQa {
    snapshot(): Record<string, unknown>;
    startRun(): void;
    openSettings(): void;
    openShop(): void;
    openDailyRewards(): void;
    /** Generic navigation setter; the named setters above stay for existing harnesses. */
    openScreen(screen: MenuScreen): void;
    returnToMenu(): void;
    setPaused(paused: boolean): void;
    /**
     * What a tap at viewport coordinates would actually land on, so a harness
     * can prove a tap connects before making it instead of discovering later
     * that it was swallowed by an overlay or a mispositioned neighbour.
     */
    hitTest(x: number, y: number): HitTestReport | null;
    /** Widths of the elements most likely to overflow a narrow phone. */
    layoutFit(): LayoutFitEntry[];
    setSetting(key: keyof AppState, value: unknown): Promise<void>;
    /**
     * Give the player some history so value-gated surfaces are reviewable.
     * This moves LOCAL progression only — it cannot grant an entitlement, so a
     * seeded shop still shows unowned products at their real gate.
     */
    seedProgress(plays: number, coins: number): Promise<void>;
}

declare global {
    // Development-only semantic browser contract. Never present in production.
    var __gameQa: TemplateGameQa | undefined;
}

export function installBrowserQaContract(): void {
    if (!import.meta.env.DEV || new URLSearchParams(window.location.search).get("qa") !== "1") return;
    document.documentElement.dataset.qaContract = "ready";
    globalThis.__gameQa = {
        snapshot() {
            const state = store.get();
            return {
                version: packageJson.version,
                phase: state.phase,
                menuScreen: state.menuScreen,
                paused: state.paused,
                score: state.score,
                coins: state.coins,
                level: state.level,
                totalPlays: state.totalPlays,
                totalCompletions: state.totalCompletions,
                depth: state.depth,
                bestDepth: state.bestDepth,
                leaderboardSubmittedDepth: state.leaderboardSubmittedDepth,
                renderer: document.documentElement.dataset.renderer ?? "pending",
                rendererLifecycle: rendererLifecycleSnapshot(),
                host: getRunCapabilities().host,
                hostOverlayInFlight: hostOverlayInFlight(),
                audio: audioManager.debugSnapshot(),
            };
        },
        startRun() {
            store.patch({ phase: "playing", menuScreen: "main" });
        },
        openSettings() {
            store.patch({ phase: "menu", menuScreen: "settings" });
        },
        openShop() {
            store.patch({ phase: "menu", menuScreen: "shop" });
        },
        openDailyRewards() {
            store.patch({ phase: "menu", menuScreen: "daily-rewards" });
        },
        openScreen(screen) {
            store.patch({ phase: "menu", menuScreen: screen });
        },
        returnToMenu() {
            store.patch({ phase: "menu", menuScreen: "main" });
        },
        setPaused(paused) {
            setHostPaused("host_pause", paused);
        },
        hitTest(x, y) {
            const element = document.elementFromPoint(x, y);
            if (!element) return null;
            return {
                tag: element.tagName.toLowerCase(),
                id: element.id || null,
                className: element.getAttribute("class"),
                testId: element.getAttribute("data-testid"),
                text: element.textContent?.trim().slice(0, 60) || null,
            };
        },
        layoutFit() {
            const frame = document.getElementById("app-frame");
            const viewport = frame?.clientWidth ?? window.innerWidth;
            const measured: LayoutFitEntry[] = [];
            // The shell's fixed-content rows: the display logo, the summary
            // strip, the menu tile grid, and the subscreen header are the
            // elements that carry enough intrinsic width to overflow a
            // 360px-wide phone.
            for (const [name, selector] of [
                ["menu-logo", ".menu-logo"],
                ["player-strip", ".player-strip"],
                ["play-button", ".play-button"],
                ["menu-grid", ".menu-grid"],
                ["subscreen-header", ".subscreen-header"],
                ["hud", ".game-hud"],
            ] as const) {
                const element = document.querySelector(selector);
                if (!element) continue;
                measured.push({ name, width: Math.ceil(element.getBoundingClientRect().width), viewport });
            }
            return measured;
        },
        async setSetting(key, value) {
            if (key === "locale") {
                selectLocale(String(value));
                await saveSystem.flush();
                return;
            }
            store.patch({ [key]: value } as Partial<AppState>);
            // Mirror the DOM side effects SettingsScreen/boot apply for these keys.
            if (key === "reducedMotion") document.documentElement.dataset.reducedMotion = String(value === true);
            if (key === "quality") document.documentElement.dataset.quality = String(value);
            await saveSystem.flush();
        },
        async seedProgress(plays, coins) {
            const state = store.get();
            const today = localDayKey(serverNow());
            const yesterday = localDayKey(serverNow() - 86_400_000);
            store.patch({
                coins,
                totalPlays: Math.max(state.totalPlays, plays),
                totalCompletions: Math.max(state.totalCompletions, plays),
                level: Math.max(state.level, Math.floor(plays / 3) + 1),
                score: Math.max(state.score, plays * 150),
                // A mid-streak player: yesterday claimed, today still open.
                dailyRewardStreak: 3,
                dailyRewardLastClaimDay: yesterday,
                dailyRewardClaimIds: [`daily-reward:${yesterday}`],
                // One quest complete-but-unclaimed and the rest mid-progress,
                // so the quests screen shows every card state in one visit.
                dailyQuestDay: today,
                dailyQuestProgress: { bounces: 10, plays: Math.min(plays, 2), coins: 60 },
            });
            await saveSystem.flush();
        },
    };
}
