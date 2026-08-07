import type { Page } from "@playwright/test";
import { expect, test } from "./fixtures.ts";
import { generateLevel, FEATURE_DEPTH, requiredMightAt } from "../src/game/levelGenerator.ts";
import { ARROWS, getArrow } from "../src/game/arrows.ts";

interface Snapshot {
    gameState: "Loading" | "Aiming" | "Arrow Flying" | "Victory" | "Defeat";
    levelIndex: number;
    score: number;
    gatesCollected: number;
    gateCount: number;
    perfectShot: boolean;
    paused: boolean;
    courseScale: number;
    courseRect: { x: number; y: number; width: number; height: number };
    visibleRect: { x: number; y: number; width: number; height: number };
    arrowCount: number;
    groundBottom: number;
    simTime: number;
    resultOverlayCount: number;
}

declare global {
    interface Window {
        /** Instrumentation installed by `instrumentAudio` before the app boots. */
        __cueFrequencies?: number[];
        /** Set by the curtain test: was the curtain already lifted when it first appeared? */
        __curtainFirstSeenLifted?: boolean | null;
        __vibrations?: (number | number[])[];
    }
}

const DESIGN_WIDTH = 1920;
const DESIGN_HEIGHT = 1080;

/** The shaft a player would realistically hold at a depth. */
function arrowFor(depth: number) {
    const need = requiredMightAt(depth);
    return ARROWS.filter((arrow) => arrow.might >= need).sort((a, b) => a.cost - b.cost)[0] ?? getArrow("storm");
}

async function openReady(page: Page): Promise<void> {
    await page.goto("/?renderer=webgl&qa=1");
    // Product shell boots to the React main menu; enter a run before canvas QA.
    await expect(page.getByRole("button", { name: /^(play|continue)$/i })).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: /^(play|continue)$/i }).click();
    await page.waitForFunction(() => window.odysseyReady === true);
    await expect(page.locator("canvas[data-renderer='webgl']")).toHaveCount(1);
}

async function snapshot(page: Page): Promise<Snapshot> {
    return page.evaluate(() => {
        if (!window.__odysseyQa) throw new Error("Odyssey QA contract is unavailable");
        return window.__odysseyQa.snapshot();
    });
}

/** Jump to a depth with a shaft that can survive it. */
async function goToDepth(page: Page, depth: number): Promise<void> {
    await page.evaluate(
        ({ depth: to, arrowId }) => {
            window.__odysseyDev?.grantArrow(arrowId);
            window.__odysseyQa?.goToLevel(to - 1);
        },
        { depth, arrowId: arrowFor(depth).id },
    );
    await expect.poll(async () => (await snapshot(page)).levelIndex).toBe(depth - 1);
}

/**
 * Design → viewport mapping. The stage COVER-fits (see createStage), so the
 * scale is `max`, not `min`; using `min` here silently aimed every synthetic
 * click at the wrong pixel.
 */
async function clickStagePoint(page: Page, x: number, y: number): Promise<void> {
    const point = await page.locator("canvas").evaluate(
        (canvas, d) => {
            const bounds = canvas.getBoundingClientRect();
            const scale = Math.max(bounds.width / d.width, bounds.height / d.height);
            return {
                x: bounds.left + (bounds.width - d.width * scale) / 2 + d.x * scale,
                y: bounds.top + (bounds.height - d.height * scale) / 2 + d.y * scale,
            };
        },
        { x, y, width: DESIGN_WIDTH, height: DESIGN_HEIGHT },
    );
    await page.mouse.click(point.x, point.y);
}

test("a real pointer drag aims and fires exactly one arrow", async ({ page }) => {
    await page.setViewportSize({ width: 956, height: 440 });
    await openReady(page);
    expect((await snapshot(page)).gameState).toBe("Aiming");

    await page.mouse.move(250, 210);
    await page.mouse.down();
    await page.mouse.move(425, 120, { steps: 8 });
    await page.mouse.up();

    await expect.poll(async () => (await snapshot(page)).gameState).not.toBe("Aiming");
    expect((await snapshot(page)).arrowCount).toBe(1);
});

/**
 * The whole point of scaling the course down: a player must be able to see
 * every ring and the target while aiming, on the narrowest phone we ship to.
 * Deep courses are the long ones, so they are the ones that would overflow.
 */
for (const viewport of [
    { width: 956, height: 440, name: "iPhone 17 Pro Max landscape" },
    { width: 844, height: 390, name: "iPhone 12 landscape" },
    { width: 1024, height: 512, name: "small tablet landscape" },
]) {
    test(`courses fit the visible frame on ${viewport.name}`, async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await openReady(page);

        for (const depth of [1, 6, 12, 20, 34, 60]) {
            await goToDepth(page, depth);
            const { courseRect, visibleRect, courseScale } = await snapshot(page);
            const where = `course ${depth}`;
            expect(courseScale, `${where}: course was not scaled`).toBeGreaterThan(0);
            expect(courseRect.x, `${where}: starts left of the visible frame`).toBeGreaterThanOrEqual(
                visibleRect.x - 1,
            );
            expect(
                courseRect.x + courseRect.width,
                `${where}: runs past the right of the visible frame`,
            ).toBeLessThanOrEqual(visibleRect.x + visibleRect.width + 1);
            expect(courseRect.y, `${where}: starts above the visible frame`).toBeGreaterThanOrEqual(visibleRect.y - 1);
            expect(courseRect.y + courseRect.height, `${where}: runs below the visible frame`).toBeLessThanOrEqual(
                visibleRect.y + visibleRect.height + 1,
            );
        }
    });
}

/**
 * One test per sampled depth, spanning every mechanic the ladder introduces.
 * A failure names the depth that regressed instead of timing out inside a loop.
 */
for (const depth of [
    1,
    4,
    FEATURE_DEPTH.bumper,
    FEATURE_DEPTH.obsidian,
    FEATURE_DEPTH.orbit,
    FEATURE_DEPTH.iris,
    FEATURE_DEPTH.plate,
    40,
]) {
    test(`course ${depth} three-stars in the browser on its generated par`, async ({ page }) => {
        await page.setViewportSize({ width: 956, height: 440 });
        await openReady(page);
        await goToDepth(page, depth);

        const level = generateLevel(depth, arrowFor(depth));
        expect((await snapshot(page)).gateCount, "browser and node generated different courses").toBe(
            level.gates.length,
        );

        await page.evaluate((par) => {
            const qa = window.__odysseyQa;
            if (!qa) throw new Error("Odyssey QA contract is unavailable");
            qa.setAim(par.angle);
            qa.setPower(par.power);
            qa.fire();
        }, level.parShot);

        await expect.poll(async () => (await snapshot(page)).gameState, { timeout: 15_000 }).toBe("Victory");
        const result = await snapshot(page);
        expect(result.arrowCount, "more than one arrow existed").toBe(1);
        expect(result.gatesCollected, "par missed a ring").toBe(result.gateCount);
        expect(result.perfectShot, "par did not three-star the course").toBe(true);
    });
}

test("clearing a course advances the endless depth", async ({ page }) => {
    await page.setViewportSize({ width: 956, height: 440 });
    await openReady(page);
    await goToDepth(page, 3);

    const level = generateLevel(3, arrowFor(3));
    await page.evaluate((par) => {
        window.__odysseyQa?.setAim(par.angle);
        window.__odysseyQa?.setPower(par.power);
        window.__odysseyQa?.fire();
    }, level.parShot);
    await expect.poll(async () => (await snapshot(page)).gameState, { timeout: 15_000 }).toBe("Victory");

    await page.evaluate(() => window.__gameQa?.returnToMenu());
    await expect(page.getByText(/^4$/)).toBeVisible();
});

test("an under-equipped shaft is blocked from an obsidian depth", async ({ page }) => {
    await page.setViewportSize({ width: 956, height: 440 });
    await page.goto("/?renderer=webgl&qa=1");
    await expect(page.getByRole("button", { name: /^(play|continue)$/i })).toBeVisible({ timeout: 30_000 });

    // Reed has might 1; the first obsidian depth demands 2.
    await page.evaluate((depth) => {
        window.__odysseyDev?.grantArrow("reed");
        window.__odysseyDev?.jumpToDepth(depth);
    }, FEATURE_DEPTH.obsidian);

    const play = page.getByRole("button", { name: /^(play|continue)$/i });
    await expect(play, "a might-1 shaft must not be able to enter an obsidian course").toBeDisabled();
    await expect(page.getByText(/OBSIDIAN GRADE/i)).toBeVisible();

    // Buying the heavier shaft clears the block.
    await page.evaluate(() => window.__odysseyDev?.grantArrow("bronze"));
    await expect(play).toBeEnabled();
});

test("pause, retry, and next-course transitions preserve the one-arrow rule", async ({ page }) => {
    await page.setViewportSize({ width: 844, height: 390 });
    await openReady(page);
    await page.evaluate(() => window.__odysseyQa?.pause());
    expect((await snapshot(page)).paused).toBe(true);
    await page.evaluate(() => window.__odysseyQa?.resume());
    expect((await snapshot(page)).paused).toBe(false);

    await page.evaluate(() => window.__odysseyQa?.fire());
    expect((await snapshot(page)).arrowCount).toBe(1);
    await page.evaluate(() => window.__odysseyQa?.retry());
    expect((await snapshot(page)).arrowCount).toBe(0);
    expect((await snapshot(page)).gameState).toBe("Aiming");
    await page.evaluate(() => window.__odysseyQa?.nextLevel());
    expect((await snapshot(page)).levelIndex).toBe(1);
});

test("defeat Retry removes its popup and returns to aiming", async ({ page }) => {
    await page.setViewportSize({ width: 844, height: 390 });
    await openReady(page);
    await page.evaluate(() => {
        window.__odysseyQa?.setAim(-10);
        window.__odysseyQa?.setPower(0.55);
        window.__odysseyQa?.fire();
    });
    await expect.poll(async () => (await snapshot(page)).gameState).toBe("Defeat");
    await expect.poll(async () => (await snapshot(page)).resultOverlayCount).toBe(1);

    // Defeat panel: RETRY sits left of centre, 75% down a 440-tall panel that is
    // centred on the visible frame (see showResult).
    const retry = await page.evaluate(
        (d) => {
            const insetTop = Math.max(
                0,
                (d.height - window.innerHeight / Math.max(window.innerWidth / d.width, window.innerHeight / d.height)) /
                    2,
            );
            const cy = (insetTop + (d.height - insetTop)) / 2;
            const panelH = Math.min(440, d.height - insetTop * 2 - 36);
            return { x: d.width / 2 - 165, y: cy - panelH / 2 + panelH * 0.75 };
        },
        { width: DESIGN_WIDTH, height: DESIGN_HEIGHT },
    );
    await clickStagePoint(page, retry.x, retry.y);

    await expect.poll(async () => (await snapshot(page)).gameState).toBe("Aiming");
    expect((await snapshot(page)).resultOverlayCount).toBe(0);
    expect((await snapshot(page)).arrowCount).toBe(0);
});

test("landscape fills the frame without overflow and portrait asks for rotation", async ({ page }) => {
    await page.setViewportSize({ width: 1024, height: 512 });
    await openReady(page);
    const layout = await page.evaluate(() => ({
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: window.innerWidth,
        canvas: document.querySelector("canvas")?.getBoundingClientRect().toJSON(),
        selection: getComputedStyle(document.body).userSelect,
    }));
    expect(layout.documentWidth).toBe(layout.viewportWidth);
    expect(layout.canvas?.width).toBeLessThanOrEqual(1024);
    expect(layout.canvas?.height).toBeLessThanOrEqual(512);
    expect(layout.selection).toBe("none");

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByText("TURN YOUR DEVICE")).toBeVisible();
});

/**
 * Wind has to be the player's problem, not the preview's.
 *
 * This is the test that was missing when wind shipped "working": it measures
 * the force in the LIVE game rather than in a Node re-simulation, and it proves
 * the preview stops predicting at the gust — because a preview that predicts
 * the wind perfectly makes the wind a no-op no matter how correct the physics.
 */
test("wind measurably pushes the arrow, and the preview stops at the gust", async ({ page }) => {
    await page.setViewportSize({ width: 956, height: 440 });
    await openReady(page);

    // The first depth whose generated course actually carries a wind band.
    let windy = 0;
    for (let depth = FEATURE_DEPTH.wind; depth <= FEATURE_DEPTH.wind + 12; depth += 1) {
        if ((generateLevel(depth, arrowFor(depth)).windZones?.length ?? 0) > 0) {
            windy = depth;
            break;
        }
    }
    expect(windy, "no course in the ladder carries a wind band").toBeGreaterThan(0);
    await goToDepth(page, windy);

    const level = generateLevel(windy, arrowFor(windy));
    const zones = (await snapshot(page)).windZones;
    expect(zones.length, "the running game did not receive the course's wind zones").toBeGreaterThan(0);

    // Fly par and sample the live tip through the band.
    const samples = await page.evaluate(async (par) => {
        const qa = window.__odysseyQa!;
        qa.setAim(par.angle);
        qa.setPower(par.power);
        qa.fire();
        const out: { x: number; y: number; vy: number; t: number }[] = [];
        const start = performance.now();
        for (let i = 0; i < 400; i += 1) {
            const state = qa.snapshot();
            if (state.gameState === "Arrow Flying") {
                out.push({ x: state.arrowX, y: state.arrowY, vy: state.arrowVelocityY, t: performance.now() - start });
            } else if (out.length > 0) {
                break;
            }
            await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
        }
        return out;
    }, level.parShot);

    const arrow = arrowFor(windy);
    let measuredAZone = false;
    for (const zone of zones) {
        const inside = samples.filter((s) => s.x >= zone.x && s.x <= zone.x + zone.width);
        if (inside.length < 3) continue;
        measuredAZone = true;
        const first = inside[0]!;
        const last = inside[inside.length - 1]!;
        const seconds = (last.t - first.t) / 1000;
        const observed = (last.vy - first.vy) / Math.max(0.001, seconds);
        const expected = 900 + zone.accelY * arrow.windScale;
        // Generous band: rAF sampling is coarser than the physics tick.
        expect(
            Math.abs(observed - expected),
            `inside the gust the tip accelerated at ${Math.round(observed)} px/s² but the zone plus gravity ` +
                `should give ${Math.round(expected)} (gravity alone is 900) — the wind is not reaching the arrow`,
        ).toBeLessThan(Math.max(320, Math.abs(expected) * 0.45));
    }
    expect(measuredAZone, "par never crossed a wind band, so nothing was measured").toBe(true);

    // Acceleration being right is not the same as the player seeing anything.
    // The gust has to turn the arrow enough to read as a change of direction,
    // and it competes with gravity, which is already bending the path — so
    // measure the heading change across the band and require it to be steep.
    const heading = (a: (typeof samples)[number], b: (typeof samples)[number]) =>
        (Math.atan2(b.y - a.y, b.x - a.x) * 180) / Math.PI;
    let steepestBend = 0;
    for (const zone of zones) {
        const inside = samples.filter((s) => s.x >= zone.x && s.x <= zone.x + zone.width);
        if (inside.length < 4) continue;
        const entry = heading(inside[0]!, inside[1]!);
        const exit = heading(inside[inside.length - 2]!, inside[inside.length - 1]!);
        steepestBend = Math.max(steepestBend, Math.abs(exit - entry));
    }
    expect(
        steepestBend,
        `the steepest gust only turned the arrow ${Math.round(steepestBend)}° — gravity alone bends the path ` +
            `that much, so the wind reads as "the arrow is falling" rather than as a force`,
    ).toBeGreaterThan(18);
});

test("the shop sells the real Run Bits catalog and invents no price", async ({ page }) => {
    await page.setViewportSize({ width: 956, height: 440 });
    await page.goto("/?renderer=webgl&qa=1");
    await expect(page.getByRole("button", { name: /^(play|continue)$/i })).toBeVisible({ timeout: 30_000 });
    await page.getByRole("button", { name: /^shop$/i }).click();

    // One card per registry entry, named as the catalog names them.
    for (const name of ["NAVIGATOR'S PATRONAGE", "SHIP'S PURSE", "TALENT OF TROY", "HOARD OF ITHACA"]) {
        await expect(page.getByRole("heading", { name })).toBeVisible();
    }

    const body = (await page.locator(".screen, main, body").first().innerText()).toUpperCase();
    // The template's placeholders must be gone: a disabled example card, a
    // stand-in product, or "placeholder soft currency" is not implementation.
    for (const ghost of ["PLACEHOLDER", "STARTER BUNDLE", "REPLACE_WITH", "LIVEOPS +", "DEMO"]) {
        expect(body, `the shop still shows template placeholder copy: ${ghost}`).not.toContain(ghost);
    }

    // Without a RUN host there is no live catalog, so every card must say the
    // price did not sync rather than print a number this client made up. The
    // RB figures in src/config/platform.ts exist only to compute the
    // value-per-Bit label and must never reach a price row.
    const prices = await page.locator(".shop-price").allInnerTexts();
    expect(prices.length, "every product card needs a price row").toBe(4);
    for (const price of prices) {
        expect(price.trim(), `"${price}" is not a resolved catalog price`).toMatch(/^(PRICE NOT SYNCED|[\d,]+ RB)$/);
    }
    for (const invented of ["900", "400", "1,200", "2,400"]) {
        expect(prices.join(" "), `card price row printed the local RB constant ${invented}`).not.toContain(invented);
    }

    // Fail closed, and name the real reason: no RUN host to buy from, or a
    // catalog LiveOps has switched off. Never "IDS NOT CONFIGURED".
    const buttons = page.locator(".shop-card button");
    await expect(buttons).toHaveCount(4);
    for (const label of await buttons.allInnerTexts()) {
        expect(label.trim()).toMatch(/^(UNAVAILABLE OUTSIDE RUN HOST|SHOP CLOSED)$/);
    }
    await expect(buttons.first()).toBeDisabled();
});

/**
 * Design-space centre of the results bounty button.
 *
 * Mirrors `attachResultsBounty`: `cx + 230`, and 150px above the action row,
 * which is itself `row(0.89)` of a panel capped at 700 inside the visible band.
 */
async function bountyPoint(page: Page): Promise<{ x: number; y: number }> {
    const frame = (await snapshot(page)).visibleRect;
    const panelH = Math.min(700, frame.height - 36);
    const top = frame.y + frame.height / 2 - panelH / 2;
    return { x: DESIGN_WIDTH / 2 + 230, y: top + panelH * 0.89 - 150 };
}

async function clearCourseOne(page: Page): Promise<void> {
    const level = generateLevel(1, getArrow("reed"));
    await page.evaluate((par) => {
        window.__odysseyQa?.setAim(par.angle);
        window.__odysseyQa?.setPower(par.power);
        window.__odysseyQa?.fire();
    }, level.parShot);
    await expect.poll(async () => (await snapshot(page)).gameState, { timeout: 20_000 }).toBe("Victory");
}

/** Drachmae the save has actually banked — the payout's authoritative record. */
async function bankedDrachmae(page: Page): Promise<number> {
    return page.evaluate(() => {
        const save = JSON.parse(localStorage.getItem("odyssey-perfect-shot-save") ?? "{}");
        return Number(save?.progress?.coins ?? 0);
    });
}

test("the results bounty pays only after a completed rewarded video", async ({ page }) => {
    await page.setViewportSize({ width: 956, height: 440 });
    await openReady(page);
    await clearCourseOne(page);
    const beforeAd = await bankedDrachmae(page);
    expect(beforeAd, "clearing a course paid nothing").toBeGreaterThan(0);

    const point = await bountyPoint(page);
    await clickStagePoint(page, point.x, point.y);

    // The host's rewarded video opens; completing it is what earns the coin.
    const close = page.getByRole("button", { name: /close ad/i });
    await expect(close, "tapping the bounty did not open a rewarded video").toBeVisible({ timeout: 15_000 });
    await close.click();

    // The bounty doubles what the course paid, so the wallet lands on exactly 2x.
    await expect.poll(() => bankedDrachmae(page), { timeout: 10_000 }).toBe(beforeAd * 2);

    // Tapping the same spot again must not pay twice — the offer is replaced by
    // its receipt and `resultBountyClaimed` refuses a repeat.
    await clickStagePoint(page, point.x, point.y);
    await page.waitForTimeout(1_500);
    await expect(page.getByRole("button", { name: /close ad/i })).toBeHidden();
    expect(await bankedDrachmae(page), "the bounty paid twice for one video").toBe(beforeAd * 2);
});

test("a patron is paid more and is never shown the video", async ({ page }) => {
    await page.setViewportSize({ width: 956, height: 440 });
    await page.goto("/?renderer=webgl&qa=1");
    await page.waitForFunction(() => !!window.__odysseyDev, null, { timeout: 30_000 });
    await page.evaluate(() => window.__odysseyDev?.grantProduct("navigators_patronage"));
    await page.getByRole("button", { name: /^(play|continue)$/i }).click();
    await page.waitForFunction(() => window.odysseyReady === true, null, { timeout: 30_000 });
    await clearCourseOne(page);

    // 25% uplift on the clear, plus the bounty banked outright: 2.5x what a
    // player who watches nothing takes home, and 1.25x an ad-watcher.
    const banked = await bankedDrachmae(page);
    expect(banked, "the patron's bounty was not banked automatically").toBeGreaterThan(0);

    const point = await bountyPoint(page);
    await clickStagePoint(page, point.x, point.y);
    await page.waitForTimeout(1_500);
    await expect(
        page.getByRole("button", { name: /close ad/i }),
        "a patron was shown the video they paid to skip",
    ).toBeHidden();
    expect(await bankedDrachmae(page), "the patron's card paid again on a stray tap").toBe(banked);
});

/**
 * Every synthesized cue is exactly one oscillator, and every haptic is one
 * `navigator.vibrate` off-host — so instrumenting both before boot measures
 * what the player actually gets, not what the code intended to send.
 */
async function instrumentAudio(page: Page): Promise<void> {
    await page.addInitScript(() => {
        window.__cueFrequencies = [];
        window.__vibrations = [];
        const createOscillator = AudioContext.prototype.createOscillator;
        AudioContext.prototype.createOscillator = function instrumented(this: AudioContext) {
            const oscillator = createOscillator.call(this);
            const setValueAtTime = oscillator.frequency.setValueAtTime.bind(oscillator.frequency);
            oscillator.frequency.setValueAtTime = (value: number, time: number) => {
                window.__cueFrequencies?.push(Math.round(value));
                return setValueAtTime(value, time);
            };
            return oscillator;
        };
        (navigator as Navigator & { vibrate: (p: number | number[]) => boolean }).vibrate = (pattern) => {
            window.__vibrations?.push(pattern);
            return true;
        };
    });
}

test("the music track streams at 20% and replaced the synthesized loop", async ({ page }) => {
    await page.setViewportSize({ width: 956, height: 440 });
    const trackRequests: string[] = [];
    page.on("request", (request) => {
        if (request.url().includes(".mp3")) trackRequests.push(request.url());
    });
    await instrumentAudio(page);
    await openReady(page);

    // Streamed from a real file, not scheduled from oscillator chord tables.
    await expect.poll(() => trackRequests.length, { timeout: 15_000 }).toBeGreaterThan(0);
    expect(trackRequests.some((url) => /hermes-map/.test(url))).toBe(true);

    const audio = await page.evaluate(() => window.__gameQa?.snapshot?.().audio);
    expect(audio?.contextState, "audio context never resumed").toBe("running");
    expect(audio?.musicRunning, "the music track is not playing").toBe(true);
    await expect
        .poll(async () => (await page.evaluate(() => window.__gameQa?.snapshot?.().audio))?.musicTime ?? 0, {
            timeout: 10_000,
        })
        .toBeGreaterThan(0.5);

    expect(
        await page.evaluate(
            () => JSON.parse(localStorage.getItem("odyssey-perfect-shot-save") ?? "{}")?.settings?.musicVolume,
        ),
        "the music is not mixed at 20%",
    ).toBe(0.2);

    // The retired loop drove its bass from this Cmaj7 table; nothing may still
    // be scheduling those pitches.
    const cues = (await page.evaluate(() => window.__cueFrequencies ?? [])) as number[];
    for (const chordTone of [131, 110, 87, 98]) {
        expect(cues, `the synthesized music loop is still scheduling ${chordTone} Hz`).not.toContain(chordTone);
    }
});

test("threading a ring and hitting the target each sound and buzz", async ({ page }) => {
    await page.setViewportSize({ width: 956, height: 440 });
    await instrumentAudio(page);
    await openReady(page);
    await page.evaluate(() => {
        window.__cueFrequencies = [];
        window.__vibrations = [];
    });

    await clearCourseOne(page);
    await page.waitForTimeout(600);

    const { cues, vibrations, rings } = await page.evaluate(() => ({
        cues: window.__cueFrequencies ?? [],
        vibrations: window.__vibrations ?? [],
        rings: window.__odysseyQa?.snapshot().gatesCollected ?? 0,
    }));
    expect(rings, "par threaded no rings, so nothing was measured").toBeGreaterThan(1);

    // One ring cue per ring, each a semitone above the last (784 Hz base).
    const ringCues = cues.filter((hz) => hz >= 780 && hz <= 1_100);
    expect(ringCues.length, "a ring was threaded without sounding").toBe(rings);
    for (let i = 1; i < ringCues.length; i += 1) {
        expect(ringCues[i]!, "the ring run did not rise in pitch").toBeGreaterThan(ringCues[i - 1]!);
    }

    // The target's own low thud, distinct from any ring.
    expect(
        cues.some((hz) => hz >= 210 && hz <= 260),
        "hitting the target made no sound",
    ).toBe(true);

    // One light buzz per ring, then a distinct success pattern for the target.
    const light = vibrations.filter((pattern) => pattern === 10);
    expect(light.length, "rings did not buzz once each").toBe(rings);
    expect(
        vibrations.some((pattern) => Array.isArray(pattern)),
        "hitting the target produced no haptic",
    ).toBe(true);
});

/**
 * The ground haze is drawn in world units but has to reach the bottom of the
 * FRAME, and the world scale changes with every course fit. A fixed world
 * depth stopped short on shallower fits and ended at its strongest alpha in
 * open air, stamping a hard bright bar across the painting a few pixels above
 * the canvas edge — reported from a phone, invisible at the viewport this
 * suite happened to use.
 */
for (const viewport of [
    { width: 758, height: 460, name: "RUN host landscape" },
    { width: 956, height: 440, name: "iPhone 17 Pro Max landscape" },
    { width: 844, height: 390, name: "iPhone 12 landscape" },
    { width: 1024, height: 512, name: "small tablet landscape" },
    { width: 740, height: 360, name: "short landscape" },
]) {
    test(`the ground haze reaches the frame bottom on ${viewport.name}`, async ({ page }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        await openReady(page);

        for (const depth of [1, 8, 14, 20, 40]) {
            await goToDepth(page, depth);
            const { groundBottom } = await snapshot(page);
            expect(
                groundBottom,
                `course ${depth}: the haze ends at design y ${Math.round(groundBottom)}, ` +
                    `short of the ${DESIGN_HEIGHT}px frame — it will print a hard bar there`,
            ).toBeGreaterThanOrEqual(DESIGN_HEIGHT);
        }
    });
}

test("entering a course never flashes the bare canvas host", async ({ page }) => {
    await page.setViewportSize({ width: 758, height: 460 });
    // Watch the DOM from before load instead of sampling after the fact: on a
    // warm cache the scene builds in a few frames, so any polled assertion
    // races the curtain's own fade rather than testing it.
    await page.addInitScript(() => {
        window.__curtainFirstSeenLifted = null;
        new MutationObserver(() => {
            const el = document.querySelector(".canvas-curtain");
            if (el && window.__curtainFirstSeenLifted === null) {
                window.__curtainFirstSeenLifted = el.classList.contains("is-lifted");
            }
        }).observe(document, { childList: true, subtree: true, attributes: true });
    });

    await page.goto("/?renderer=webgl&qa=1");
    await page.getByRole("button", { name: /^(play|continue)$/i }).click();
    await page.waitForFunction(() => window.odysseyReady === true, null, { timeout: 30_000 });

    // The host div is painted a flat Aegean so a slipped frame is never black,
    // but for the whole length of a scene build that fill WAS the screen — a
    // full-frame blue flash on every entry into a course.
    expect(
        await page.evaluate(() => window.__curtainFirstSeenLifted),
        "no curtain ever covered the canvas host, or it was already lifted when it appeared",
    ).toBe(false);

    const curtain = page.locator(".canvas-curtain");
    await expect(curtain, "the curtain never lifted, so the course is hidden behind it").toHaveClass(/is-lifted/);
    await expect.poll(async () => curtain.evaluate((el) => getComputedStyle(el).opacity), { timeout: 5_000 }).toBe("0");
});

test("moving rings do not jump when the arrow is released", async ({ page }) => {
    await page.setViewportSize({ width: 956, height: 440 });
    await openReady(page);
    await goToDepth(page, FEATURE_DEPTH.orbit);

    // Aim for a while so the course clock is meaningfully past zero, which is
    // exactly the state the bug needed: rings were drawn on the course clock
    // while aiming, then sampled from ZERO the instant the arrow left, so every
    // drifting ring teleported and the timing the player had just judged was
    // discarded.
    await page.waitForTimeout(2_500);
    const before = (await snapshot(page)).simTime;
    expect(before, "the course clock never advanced, so nothing was tested").toBeGreaterThan(1);

    const level = generateLevel(FEATURE_DEPTH.orbit, arrowFor(FEATURE_DEPTH.orbit));
    await page.evaluate((par) => {
        window.__odysseyQa?.setAim(par.angle);
        window.__odysseyQa?.setPower(par.power);
        window.__odysseyQa?.fire();
    }, level.parShot);

    const after = (await snapshot(page)).simTime;
    expect(
        after,
        `the ring clock went backwards on release (${before.toFixed(2)}s -> ${after.toFixed(2)}s), ` +
            "so every drifting ring snapped to a different position",
    ).toBeGreaterThanOrEqual(before - 0.05);
});
