/**
 * Screen router. One phase visible at a time; the 'playing' phase stacks a
 * thin React HUD above the Pixi canvas (game HUD stays in Pixi).
 *
 * #app-frame is the playable frame: landscape-first for Odyssey, with a
 * portrait "rotate device" gate. Everything interactive lives inside the frame.
 */
import { useEffect } from "react";
import GameCanvas from "../game/GameCanvas.tsx";
import { applyRunSafeArea } from "../sdk/runSdk.ts";
import { audioManager } from "../audio/audioManager.ts";
import { store, useStore } from "../state/store.ts";
import ArrowsScreen from "./ArrowsScreen.tsx";
import DailyQuestsScreen from "./DailyQuestsScreen.tsx";
import DailyRewardsScreen from "./DailyRewardsScreen.tsx";
import Hud from "./Hud.tsx";
import LoadingScreen from "./LoadingScreen.tsx";
import MainMenu from "./MainMenu.tsx";
import SettingsScreen from "./SettingsScreen.tsx";
import ShopScreen from "./ShopScreen.tsx";
import StatsScreen from "./StatsScreen.tsx";
import { useButtonFeedback } from "./useButtonFeedback.ts";

const TOAST_AUTO_HIDE_MS = 4_000;

function useOrientationSafeArea(): void {
    useEffect(() => {
        const refreshSafeArea = () => {
            applyRunSafeArea();
        };
        let pending = 0;
        const refreshOnResize = () => {
            window.cancelAnimationFrame(pending);
            pending = window.requestAnimationFrame(refreshSafeArea);
        };
        window.addEventListener("orientationchange", refreshSafeArea);
        window.addEventListener("resize", refreshOnResize, { passive: true });
        return () => {
            window.removeEventListener("orientationchange", refreshSafeArea);
            window.removeEventListener("resize", refreshOnResize);
            window.cancelAnimationFrame(pending);
        };
    }, []);
}

/**
 * Web Audio starts suspended until a real user gesture resumes it. Unlock on
 * the FIRST interaction anywhere — never only from specific screens.
 */
function useAudioUnlock(): void {
    useEffect(() => {
        const unlock = () => {
            void audioManager.unlock();
        };
        const options = { once: true, capture: true } as const;
        window.addEventListener("pointerdown", unlock, options);
        window.addEventListener("keydown", unlock, options);
        return () => {
            window.removeEventListener("pointerdown", unlock, options);
            window.removeEventListener("keydown", unlock, options);
        };
    }, []);
}

function MenuRoute() {
    const screen = useStore((state) => state.menuScreen);
    if (screen === "daily-rewards") return <DailyRewardsScreen />;
    if (screen === "daily-quests") return <DailyQuestsScreen />;
    if (screen === "shop") return <ShopScreen />;
    if (screen === "arrows") return <ArrowsScreen />;
    if (screen === "stats") return <StatsScreen />;
    if (screen === "settings") return <SettingsScreen />;
    return <MainMenu />;
}

export default function App() {
    useOrientationSafeArea();
    useAudioUnlock();
    useButtonFeedback();
    const phase = useStore((s) => s.phase);

    // Drop the HTML boot cover once we leave loading.
    useEffect(() => {
        if (phase === "loading") return;
        const cover = document.getElementById("boot-cover");
        if (!cover) return;
        cover.classList.add("hidden");
        const t = window.setTimeout(() => cover.remove(), 400);
        return () => window.clearTimeout(t);
    }, [phase]);

    return (
        <div id="app-frame">
            {phase === "loading" && <LoadingScreen />}
            {phase === "menu" && <MenuRoute />}
            {phase === "playing" && (
                <div className="play-surface">
                    <div id="game-host">
                        <GameCanvas />
                    </div>
                    <Hud />
                </div>
            )}
            <section className="rotate-message" aria-live="polite">
                <div className="rotate-icon" aria-hidden="true" />
                <strong>TURN YOUR DEVICE</strong>
                <span>Ulysses needs a wider horizon.</span>
            </section>
            <Toast />
        </div>
    );
}

function Toast() {
    const toast = useStore((state) => state.toast);

    useEffect(() => {
        if (!toast) return;
        const timer = window.setTimeout(() => store.patch({ toast: null }), TOAST_AUTO_HIDE_MS);
        return () => window.clearTimeout(timer);
    }, [toast]);

    if (!toast) return null;
    return (
        <button type="button" className="toast" onClick={() => store.patch({ toast: null })}>
            {toast}
        </button>
    );
}
