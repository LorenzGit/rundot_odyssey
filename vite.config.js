import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { rundotGameLibrariesPlugin } from "@series-inc/rundot-game-sdk/vite";

export default defineConfig({
    // REQUIRED for RUN: deployed builds are served from a subdirectory, so all
    // asset URLs must be relative. Do not change this.
    base: "./",
    plugins: [rundotGameLibrariesPlugin(), react(), tailwindcss()],
    server: {
        allowedHosts: true,
        port: 5188,
    },
    build: {
        // Top-level await in the RUN SDK needs a modern target.
        target: "es2022",
        // Do not turn the lazy gameplay chunk and Pixi into cold-boot
        // modulepreloads. The menu intentionally warms them after first paint.
        modulePreload: {
            polyfill: false,
            resolveDependencies(filename, dependencies) {
                if (filename.includes("GameCanvas")) return [];
                return dependencies;
            },
        },
        chunkSizeWarningLimit: 650,
        rollupOptions: {
            output: {
                // React ships with the shell and the SDK with the platform
                // integration; neither changes when game code does. Splitting
                // them keeps the entry chunk inside its size budget and lets a
                // gameplay-only redeploy reuse both from cache.
                manualChunks(id) {
                    // Keep Vite's dynamic-import helper out of the Pixi chunk;
                    // otherwise the shell statically imports 550 KB of Pixi
                    // merely to call the helper before any gameplay exists.
                    if (id.includes("vite/preload-helper")) return "preload-helper";
                    if (id.includes("/node_modules/pixi.js/")) return "pixi";
                    if (id.includes("/node_modules/react/") || id.includes("/node_modules/react-dom/")) return "react";
                },
            },
        },
    },
    esbuild: { target: "es2022" },
    optimizeDeps: {
        esbuildOptions: {
            target: "es2022",
        },
    },
});
