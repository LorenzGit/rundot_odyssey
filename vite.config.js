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
        chunkSizeWarningLimit: 650,
        rollupOptions: {
            output: {
                // React ships with the shell and the SDK with the platform
                // integration; neither changes when game code does. Splitting
                // them keeps the entry chunk inside its size budget and lets a
                // gameplay-only redeploy reuse both from cache.
                manualChunks: {
                    pixi: ["pixi.js"],
                    react: ["react", "react-dom", "react-dom/client"],
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
