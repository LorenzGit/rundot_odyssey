import { useEffect, useRef, useState } from "react";
import type { Application } from "pixi.js";
import {
    acquireRendererRuntime,
    type RendererLease,
    type RendererLifecycleScope,
} from "../rendering/rendererLifecycle.ts";
import { createOdysseyScene } from "./odysseyScene.ts";
import { createPixiApp } from "./pixiApp.ts";
import { createStage } from "./stage.ts";
import { analytics } from "../systems/analytics/analyticsConfig.ts";
import { store } from "../state/store.ts";

interface GameRenderer {
    app: Application;
}

async function initialize(scope: RendererLifecycleScope, host: HTMLElement): Promise<GameRenderer> {
    const app = await createPixiApp(scope, host);
    scope.throwIfCancelled();
    const stage = createStage(app);
    scope.manage(() => stage.destroy());
    const scene = await createOdysseyScene(app, stage);
    scope.throwIfCancelled();
    scope.manage(() => scene.destroy());
    return { app };
}

export default function GameCanvas() {
    const hostRef = useRef<HTMLDivElement | null>(null);
    // Building the Pixi app and scene is async, and #game-host is painted the
    // Aegean fill that stops black gutters. Between leaving the menu and the
    // first rendered frame that fill was the whole screen — a solid blue flash.
    // Hold a curtain over it until there is something to show.
    const [ready, setReady] = useState(false);
    const [failure, setFailure] = useState<string | null>(null);
    const [attempt, setAttempt] = useState(0);

    useEffect(() => {
        const host = hostRef.current;
        if (!host) return;
        const abortController = new AbortController();
        let lease: RendererLease<GameRenderer> | null = null;
        host.dataset.rendererAttempt = String(attempt + 1);
        setReady(false);
        setFailure(null);
        const watchdog = window.setTimeout(() => {
            if (abortController.signal.aborted) return;
            document.documentElement.dataset.odysseyError = "renderer_timeout";
            analytics.trackError("renderer_load_stalled", new Error("Renderer initialization exceeded 15 seconds"), {
                timeout_seconds: 15,
                attempt: attempt + 1,
            });
            setFailure("The course art is taking too long to arrive.");
            setReady(true);
        }, 15_000);

        void acquireRendererRuntime("odyssey-pixi", abortController.signal, (scope) => initialize(scope, host))
            .then((nextLease) => {
                lease = nextLease;
                window.clearTimeout(watchdog);
                if (!abortController.signal.aborted) {
                    delete document.documentElement.dataset.odysseyError;
                    setFailure(null);
                    setReady(true);
                }
            })
            .catch((error: unknown) => {
                window.clearTimeout(watchdog);
                if (abortController.signal.aborted || (error instanceof DOMException && error.name === "AbortError"))
                    return;
                console.error("[odyssey] renderer initialization failed", error);
                analytics.trackError("renderer_initialization", error, { attempt: attempt + 1 });
                document.documentElement.dataset.odysseyError = "renderer";
                // Never leave the curtain up on failure — the error surface
                // has to be reachable.
                setFailure("The course could not be prepared.");
                setReady(true);
            });

        return () => {
            window.clearTimeout(watchdog);
            abortController.abort();
            void lease?.release();
        };
    }, [attempt]);

    return (
        <>
            <div ref={hostRef} data-testid="odyssey-canvas-host" />
            <div className={`canvas-curtain${ready ? " is-lifted" : ""}`} aria-hidden="true" />
            {failure && (
                <section className="renderer-recovery" role="alert">
                    <p className="eyebrow">COURSE LOST IN FOG</p>
                    <h1>Odyssey is still here.</h1>
                    <p>{failure} Your progress is safe.</p>
                    <div>
                        <button type="button" className="ody-btn" onClick={() => setAttempt((value) => value + 1)}>
                            TRY AGAIN
                        </button>
                        <button
                            type="button"
                            className="ody-btn ody-btn-slate"
                            onClick={() => store.patch({ phase: "menu", menuScreen: "main" })}
                        >
                            MENU
                        </button>
                    </div>
                </section>
            )}
        </>
    );
}
