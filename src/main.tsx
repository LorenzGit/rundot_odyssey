import React from "react";
import { createRoot } from "react-dom/client";
import App from "./ui/App.tsx";
import ErrorBoundary from "./ui/ErrorBoundary.tsx";
import { store } from "./state/store.ts";
import {
    applyRunSafeArea,
    getRunCapabilities,
    initSdk,
    readAttribution,
    registerLifecycles,
    requestHostExit,
} from "./sdk/runSdk.ts";
import { analytics } from "./systems/analytics/analyticsConfig.ts";
import { resolveReturnLaunch, returnReminders } from "./systems/retention/retentionConfig.ts";
import { warmAssets } from "./assets/preload.ts";
import { saveSystem } from "./systems/save.ts";
import { restoreLocale } from "./systems/localization.ts";
import { audioManager } from "./audio/audioManager.ts";
import { runtimeServices } from "./systems/runtimeServices.ts";
import { reconcilePendingPurchase, refreshCommerce } from "./systems/monetization/commerce.ts";
import { abandonOdysseyRun } from "./systems/runAnalytics.ts";
import { resumeFromHostPause, setHostPaused } from "./systems/hostPause.ts";
import { installBrowserQaContract } from "./qa/browserContract.ts";
import { installProgressionDevTools } from "./game/progression.ts";
import "./styles/app.css";

/** Settle any interrupted order, then re-read ownership and unspent packs. */
async function reconcileCommerce(): Promise<void> {
    try {
        await reconcilePendingPurchase();
        await refreshCommerce();
    } catch (error) {
        console.warn("[monetization] background reconciliation failed", error);
    }
}

function liftBootCover(): void {
    const cover = document.getElementById("boot-cover");
    if (!cover || cover.classList.contains("hidden")) return;
    cover.classList.add("hidden");
    cover.setAttribute("aria-busy", "false");
    window.setTimeout(() => cover.remove(), 400);
}

function setBootProgress(progress: number): void {
    const p = Math.max(0, Math.min(1, progress));
    const pct = Math.round(p * 100);
    store.patch({ loadProgress: p });

    const cover = document.getElementById("boot-cover");
    const fill = document.querySelector<HTMLElement>(".boot-fill");
    const copy = document.getElementById("boot-copy") ?? document.querySelector<HTMLElement>(".boot-status");
    if (cover) {
        cover.classList.add("is-determinate");
        cover.setAttribute("aria-valuenow", String(pct));
    }
    if (fill) {
        fill.style.width = `${Math.max(5, pct)}%`;
    }
    if (copy) {
        copy.textContent = pct >= 100 ? "READY" : `STRINGING THE BOW… ${pct}%`;
    }
}

// Fired at module scope, before boot() and before any await.
analytics.installErrorCapture();
analytics.funnelStep("load", 1);

async function boot() {
    const rootElement = document.getElementById("root");
    if (!rootElement) throw new Error("Missing required #root mount element");
    createRoot(rootElement).render(
        <React.StrictMode>
            <ErrorBoundary>
                <App />
            </ErrorBoundary>
        </React.StrictMode>,
    );

    setBootProgress(0.05);
    await Promise.all([
        initSdk().then(() => {
            analytics.markTransportReady();
            analytics.funnelStep("load", 2, { host: getRunCapabilities().host });
            applyRunSafeArea();
        }),
        saveSystem.load().then(() => {
            document.documentElement.dataset.reducedMotion = String(store.get().reducedMotion);
            document.documentElement.dataset.quality = store.get().quality;
            restoreLocale();
            audioManager.bind();
            analytics.funnelStep("load", 3);
        }),
    ]);
    setBootProgress(0.15);

    await warmAssets((p) => setBootProgress(0.15 + p * 0.85));

    // An order that survived a host kill, or a pack bought while the app was
    // backgrounded, must settle before the player can reach the shop — waiting
    // for them to open it is how a purchase ends up looking lost.
    void reconcileCommerce();

    setBootProgress(1);
    analytics.funnelStep("load", 4);
    store.patch({ phase: "menu", loadProgress: 1 });
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            liftBootCover();
        });
    });

    registerLifecycles({
        onPause: () => {
            setHostPaused("host_pause", true);
            void saveSystem.flush();
        },
        onResume: () => {
            setHostPaused("host_pause", false);
        },
        onSleep: () => {
            setHostPaused("host_sleep", true);
            void saveSystem.flush();
            void returnReminders.refreshPrimary();
            analytics.sessionPause();
        },
        onAwake: () => {
            setHostPaused("host_sleep", false);
            void reconcileCommerce();
        },
        onQuit: () => {
            void saveSystem.flush();
            void returnReminders.refreshPrimary();
            analytics.sessionEnd();
        },
        onIdentityChanged: (event) => {
            if (event.idChanged) window.location.reload();
            else runtimeServices.resume();
        },
        onBackButton: () => {
            const state = store.get();
            if (state.phase === "playing") {
                abandonOdysseyRun("menu_exit");
                resumeFromHostPause();
                store.patch({ phase: "menu", menuScreen: "main" });
                void saveSystem.flush();
            } else if (state.menuScreen !== "main") {
                store.patch({ menuScreen: "main" });
            } else {
                void requestHostExit();
            }
        },
    });

    runtimeServices.bootstrap();
    analytics.funnelStep("ftue", 1, { host: getRunCapabilities().host });
    analytics.funnelStep("ftue", 2);
    analytics.sessionStart(store.get().totalPlays === 0, await readAttribution());
    const returnReminderId = await resolveReturnLaunch();
    if (returnReminderId === "d1") store.patch({ menuScreen: "daily-rewards" });
    installBrowserQaContract();
    installProgressionDevTools();
}

function preventBrowserChrome(event: Event): void {
    event.preventDefault();
}

document.addEventListener("selectstart", preventBrowserChrome);
document.addEventListener("contextmenu", preventBrowserChrome);
document.addEventListener("dragstart", preventBrowserChrome);

window.addEventListener("unhandledrejection", (event) => {
    console.warn("[odyssey] guarded unhandled rejection", event.reason);
    event.preventDefault();
});

function start(): void {
    void boot().catch((error) => {
        console.error("[boot] fatal startup failure", error);
        analytics.trackError("boot_failure", error);
        analytics.markTransportReady();
        liftBootCover();
        const root = document.getElementById("root");
        if (!root) return;
        const message = document.createElement("main");
        message.className = "fatal-error";
        message.setAttribute("role", "alert");
        const heading = document.createElement("h1");
        heading.textContent = "Unable to start";
        const guidance = document.createElement("p");
        guidance.textContent = "Reload to try again.";
        message.append(heading, guidance);
        root.replaceChildren(message);
    });
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start, { once: true });
} else {
    start();
}
