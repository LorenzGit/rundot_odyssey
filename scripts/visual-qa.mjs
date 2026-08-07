#!/usr/bin/env node
/**
 * Headless visual QA for the template shell.
 *
 * Boots a dev server, walks every menu screen through the browser QA contract
 * (src/qa/browserContract.ts), and writes PNGs to `test-results/visual-qa/`.
 * It FAILS on any page or console error, because a renderer that throws while
 * building its scene leaves a blank canvas with the React shell still painted
 * on top, which is invisible to a glance. Element-overflow findings from
 * `layoutFit()` are reported alongside the screenshots.
 *
 * Every screen is captured in BOTH orientations at two phone sizes, because
 * reviewing portrait and fixing only portrait is how landscape kept breaking:
 * each layout fix to one orientation is a change to a shared stylesheet, and
 * the grid placements differ.
 *
 *   node scripts/visual-qa.mjs             all viewports
 *   node scripts/visual-qa.mjs --phone     just the tall portrait phone
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { createServer } from "vite";
import { chromium } from "@playwright/test";

const root = process.cwd();
const outputDir = path.join(root, "test-results", "visual-qa");
// 5183 is the interactive dev server and 9001 belongs to the RUN SDK's
// multiplayer companion; this port collides with neither.
const PORT = 5199;

const VIEWPORTS = [
    { name: "phone-portrait", width: 393, height: 852 },
    { name: "phone-landscape", width: 852, height: 393 },
    // A small phone too: layout bugs that need tight space hide on a 16 Pro.
    { name: "phone-sm-portrait", width: 375, height: 667 },
    { name: "phone-sm-landscape", width: 667, height: 375 },
];

/** Every menu screen, visited through the QA contract's navigation setters. */
const SCREENS = [
    { name: "01-main", screen: "main" },
    { name: "02-daily-rewards", screen: "daily-rewards", seedProgress: true },
    { name: "03-daily-quests", screen: "daily-quests", seedProgress: true },
    { name: "04-shop", screen: "shop", seedProgress: true },
    { name: "05-stats", screen: "stats", seedProgress: true },
    { name: "06-run-features", screen: "run-features" },
    { name: "07-rendering-lab", screen: "rendering-lab" },
    { name: "08-settings", screen: "settings" },
];

/**
 * Take a screenshot with animations frozen.
 *
 * `animations: "disabled"` is not cosmetic: Playwright waits for the page to
 * go quiet before capturing, so one infinite CSS animation makes the
 * screenshot hang until it times out. Freezing also makes every capture
 * byte-identical between runs, which is what lets these be diffed by eye.
 */
async function shoot(page, name) {
    await page.screenshot({ path: path.join(outputDir, name), animations: "disabled" });
}

async function openReady(page) {
    await page.goto(`http://localhost:${PORT}/?qa=1`, { waitUntil: "load" });
    await page.waitForFunction(() => globalThis.__gameQa !== undefined, null, { timeout: 15_000 });
    // The boot gate flips phase to "menu" only after critical assets warm.
    await page.waitForFunction(() => globalThis.__gameQa.snapshot().phase !== "loading", null, { timeout: 15_000 });
}

const onlyPhone = process.argv.includes("--phone");
const viewports = onlyPhone ? VIEWPORTS.slice(0, 1) : VIEWPORTS;

fs.mkdirSync(outputDir, { recursive: true });

const server = await createServer({
    configFile: path.join(root, "vite.config.js"),
    logLevel: "silent",
    server: { port: PORT, strictPort: true },
});
await server.listen();

let browser;
const problems = [];
const findings = [];
let shots = 0;

try {
    browser = await chromium.launch();

    for (const viewport of viewports) {
        const context = await browser.newContext({
            viewport: { width: viewport.width, height: viewport.height },
            deviceScaleFactor: 2,
        });
        const page = await context.newPage();
        page.on("pageerror", (error) => problems.push(`${viewport.name}: page error: ${error.message}`));
        page.on("console", (message) => {
            if (message.type() !== "error") return;
            problems.push(`${viewport.name}: console error: ${message.text()}`);
        });

        await openReady(page);

        for (const shot of SCREENS) {
            // Navigate through the contract, exercising the named setters where
            // they exist so a game that breaks one is caught here, not by the
            // next harness that relies on it.
            await page.evaluate((screen) => {
                const qa = globalThis.__gameQa;
                if (screen === "main") qa.returnToMenu();
                else if (screen === "settings") qa.openSettings();
                else if (screen === "run-features") qa.openRunFeatures();
                else if (screen === "rendering-lab") qa.openRendererLab();
                else qa.openScreen(screen);
            }, shot.screen);
            // Value-gated surfaces hide themselves for a brand-new player, so a
            // default profile would photograph an empty shop on every run and
            // the real product cards would never be reviewed at all.
            if (shot.seedProgress) {
                await page.evaluate(() => globalThis.__gameQa.seedProgress(12, 1_450));
            }
            await page.waitForTimeout(600);
            await shoot(page, `${viewport.name}-${shot.name}.png`);
            shots += 1;

            for (const entry of await page.evaluate(() => globalThis.__gameQa.layoutFit())) {
                if (entry.width > entry.viewport) {
                    findings.push(
                        `${viewport.name} ${shot.name}: "${entry.name}" is ${entry.width}px wide in a ${entry.viewport}px frame`,
                    );
                }
            }

            // Long screens hide their tail below the fold; photograph the
            // bottom too, or half of a scrolling screen is never reviewed.
            const scrolled = await page.evaluate(() => {
                const region = document.querySelector("[data-testid='screen-scroll-region']");
                if (!region || region.scrollHeight <= region.clientHeight + 8) return false;
                region.scrollTop = region.scrollHeight;
                return true;
            });
            if (scrolled) {
                await page.waitForTimeout(250);
                await shoot(page, `${viewport.name}-${shot.name}-end.png`);
                shots += 1;
            }
        }

        // --- the game scene, mounted and rendering --------------------------
        await page.evaluate(() => globalThis.__gameQa.startRun());
        await page.waitForFunction(() => document.querySelector("canvas") !== null, null, { timeout: 15_000 });
        await page.waitForFunction(
            () => document.documentElement.dataset.renderer && document.documentElement.dataset.renderer !== "pending",
            null,
            { timeout: 15_000 },
        );
        await page.waitForTimeout(800);
        await shoot(page, `${viewport.name}-09-game.png`);
        shots += 1;

        // A tap the harness would make on the HUD menu button must actually
        // land on it — guessed coordinates pass happily while hitting felt.
        const hit = await page.evaluate(() => {
            const button = document.querySelector(".hud-menu");
            if (!button) return { error: "no .hud-menu button" };
            const rect = button.getBoundingClientRect();
            return globalThis.__gameQa.hitTest(rect.x + rect.width / 2, rect.y + rect.height / 2);
        });
        if (hit?.error) problems.push(`${viewport.name}: ${hit.error}`);
        else if (hit?.className !== "hud-menu pointer-events-auto") {
            problems.push(
                `${viewport.name}: a tap on the HUD menu button would land on <${hit?.tag ?? "nothing"} class="${hit?.className ?? ""}"> instead`,
            );
        }

        const snapshot = await page.evaluate(() => globalThis.__gameQa.snapshot());
        console.log(`  ${viewport.name}: renderer=${snapshot.renderer} phase=${snapshot.phase}`);

        await context.close();
    }
} finally {
    await browser?.close();
    await server.close();
}

console.log(`\nWrote ${shots} screenshots to ${path.relative(root, outputDir)}`);
if (findings.length > 0) {
    console.log(`\nLayout findings (${findings.length}) — elements wider than their frame:`);
    for (const finding of findings) console.log(`- ${finding}`);
} else {
    console.log("Layout: nothing overflows its frame.");
}
if (problems.length > 0) {
    console.error(`\nVisual QA failed (${problems.length}):`);
    for (const problem of problems) console.error(`- ${problem}`);
    process.exit(1);
}
console.log("Visual QA passed: every screen rendered in both orientations without an error.");
