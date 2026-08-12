/**
 * Pixi v8 Application factory. One place owns renderer options so the rest of
 * the game never touches them.
 */
import { Application } from "pixi.js";
import {
    monitorPixiWebGpuDevice,
    ownPixiApplication,
    type RendererLifecycleScope,
} from "../rendering/rendererLifecycle.ts";

type RendererPreference = "webgpu" | "webgl";

/**
 * Sticky once WebGPU has failed to initialize or draw this session. Later
 * acquires (replay, StrictMode remount, screen change) go straight to WebGL
 * instead of failing the same way again.
 */
let webGpuProvenBroken = false;

function rendererBackend(app: Application): RendererPreference {
    // Never detect via constructor.name: minification renames the class, so prod
    // builds would always report "webgl". Pixi's renderer.name is the literal
    // backend string on both backends.
    return app.renderer.name.toLowerCase().includes("webgpu") ? "webgpu" : "webgl";
}

async function initializeRenderer(
    scope: RendererLifecycleScope,
    host: HTMLElement,
    preference: RendererPreference,
): Promise<Application> {
    const app = new Application();
    const ownership = ownPixiApplication(scope, app);
    try {
        await app.init({
            preference,
            resizeTo: host,
            resolution: Math.min(window.devicePixelRatio || 1, 2),
            autoDensity: true,
            // Match Aegean sky so any edge/clear never reads as a black crop bar.
            background: "#3aa6e0",
            antialias: true,
        });
        scope.throwIfCancelled();
        const initializedBackend = rendererBackend(app);
        if (initializedBackend !== preference) {
            throw new Error(`Pixi initialized ${initializedBackend} while strict ${preference} was requested`);
        }
        // `init` resolving is NOT proof the backend works. On iOS WebKit in
        // particular, WebGPU detection can pass, an adapter and device can be
        // handed out, and then nothing ever draws — which reads to the player
        // as a dead canvas with no error to catch. Force one real frame so a
        // broken backend fails here, while it can still be swapped out.
        app.renderer.render(app.stage);
        // Pixi injects a 1px mobile accessibility activation button at
        // (-1000, -1000) even when this canvas has no accessible children.
        // It is not part of Odyssey's UI and trips viewport audits.
        document.querySelectorAll('button[title="select to enable accessibility for this content"]').forEach((hook) => {
            hook.remove();
        });
        if (initializedBackend === "webgpu") monitorPixiWebGpuDevice(scope, app, "Pixi game");
        return app;
    } catch (error) {
        await ownership.dispose();
        throw error;
    }
}

/**
 * Create and mount a Pixi app inside a host element. The canvas auto-resizes
 * to the host (the playable-frame div), so the game is sized by CSS — the same
 * orientation-aware `--game-w` frame that sizes the DOM UI.
 *
 * @param host element the canvas fills (position: relative/absolute)
 */
export async function createPixiApp(scope: RendererLifecycleScope, host: HTMLElement): Promise<Application> {
    const rendererQuery = new URLSearchParams(window.location.search).get("renderer");
    let app: Application;
    if (rendererQuery === "webgl" || rendererQuery === "webgpu") {
        // Forced modes are strict so QA can prove each backend independently.
        app = await initializeRenderer(scope, host, rendererQuery);
    } else if (webGpuProvenBroken) {
        app = await initializeRenderer(scope, host, "webgl");
    } else {
        try {
            // Pixi feature detection can pass even when adapter/device creation
            // later fails in a WebView. That failure is not auto-retried.
            app = await initializeRenderer(scope, host, "webgpu");
        } catch (webGpuError) {
            scope.throwIfCancelled();
            webGpuProvenBroken = true;
            console.warn("[renderer] WebGPU unusable; falling back to WebGL", webGpuError);
            app = await initializeRenderer(scope, host, "webgl");
        }
    }
    const rendererName = rendererBackend(app);
    document.documentElement.dataset.renderer = rendererName;
    app.canvas.dataset.renderer = rendererName;
    app.canvas.setAttribute("aria-label", "Odyssey archery game canvas");
    // Full-bleed: never leave CSS letterbox gutters around the buffer.
    app.canvas.style.position = "absolute";
    app.canvas.style.inset = "0";
    app.canvas.style.width = "100%";
    app.canvas.style.height = "100%";
    app.canvas.style.display = "block";
    host.appendChild(app.canvas);
    return app;
}
