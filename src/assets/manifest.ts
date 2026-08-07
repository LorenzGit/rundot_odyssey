/**
 * Asset manifest — the single place that lists what gets loaded and when.
 * Imported assets live under src/assets/ so Vite fingerprints them and
 * resolves deployment-safe URLs. Use public/ only for files that require an
 * exact, stable name.
 *
 * Boot contract:
 *   1. Loader visible immediately
 *   2. 'critical' awaited under the loader = only main-menu files
 *   3. Menu shows when critical is ready
 *   4. 'deferred' trickles after menu — never block first interaction
 *   5. Never put videos / heavy cutscenes in either gate bundle as preloads
 *
 * Keep 'critical' small: every asset here delays the main menu.
 */
import type { AssetsManifest, UnresolvedAsset } from "pixi.js";
import shoreBackdropUrl from "./art/odyssey/level-1.png";
import templeBackdropUrl from "./art/odyssey/level-2.png";
import heightsBackdropUrl from "./art/odyssey/level-3.png";

/**
 * A narrowing of Pixi's AssetsManifest: Pixi also allows `assets` to be a
 * record, but this template keeps it an array so the tier filters below can
 * check `assets.length`. Still assignable to AssetsManifest (Assets.init).
 */
export interface Manifest extends AssetsManifest {
    bundles: { name: string; assets: UnresolvedAsset[] }[];
}

export const MANIFEST: Manifest = {
    bundles: [
        {
            name: "critical",
            // The Olive Shore painting is both the menu backdrop (app.css uses
            // the same URL, so one fetch serves both) and the first course a
            // player enters. Nothing else is needed before the menu shows.
            assets: [{ alias: "menu-backdrop", src: shoreBackdropUrl }],
        },
        {
            name: "deferred",
            // The other two course paintings. Warming them after the menu is
            // interactive means Temple Crossing does not pop in mid-run.
            assets: [
                { alias: "backdrop-temple", src: templeBackdropUrl },
                { alias: "backdrop-heights", src: heightsBackdropUrl },
            ],
        },
    ],
};

// Empty bundles are skipped so an unused tier never errors.
export const CRITICAL_BUNDLES: string[] = MANIFEST.bundles
    .filter((b) => b.name !== "deferred" && b.assets.length > 0)
    .map((b) => b.name);

export const DEFERRED_BUNDLES: string[] = MANIFEST.bundles
    .filter((b) => b.name === "deferred" && b.assets.length > 0)
    .map((b) => b.name);
