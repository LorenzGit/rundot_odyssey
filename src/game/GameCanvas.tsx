import { useEffect, useRef } from "react";
import type { Application } from "pixi.js";
import {
    acquireRendererRuntime,
    type RendererLease,
    type RendererLifecycleScope,
} from "../rendering/rendererLifecycle.ts";
import { createOdysseyScene } from "./odysseyScene.ts";
import { createPixiApp } from "./pixiApp.ts";
import { createStage } from "./stage.ts";

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

    useEffect(() => {
        const host = hostRef.current;
        if (!host) return;
        const abortController = new AbortController();
        let lease: RendererLease<GameRenderer> | null = null;

        void acquireRendererRuntime("odyssey-pixi", abortController.signal, (scope) => initialize(scope, host))
            .then((nextLease) => {
                lease = nextLease;
            })
            .catch((error: unknown) => {
                if (abortController.signal.aborted || (error instanceof DOMException && error.name === "AbortError"))
                    return;
                console.error("[odyssey] renderer initialization failed", error);
                document.documentElement.dataset.odysseyError = "renderer";
            });

        return () => {
            abortController.abort();
            void lease?.release();
        };
    }, []);

    return <div ref={hostRef} data-testid="odyssey-canvas-host" />;
}
