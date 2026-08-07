import {
    Assets,
    Container,
    Graphics,
    Rectangle,
    Sprite,
    type Application,
    type FederatedPointerEvent,
    type Text,
    type Texture,
    type Ticker,
} from "pixi.js";
import { createParticleEmitter, type ParticleEmitter } from "./particles.ts";
import { NoiseRandom } from "./noiseRandom.ts";
import {
    advanceShot,
    clampAimAngle,
    clampPower,
    createShot,
    isPerfectShot,
    sampleTrajectory,
    starRating,
    targetScoreForHit,
    SHOT_CONFIG,
} from "./physics.ts";
import { advanceDepth, currentLevel } from "./progression.ts";
import { featureIntroducedAt } from "./levelGenerator.ts";
import type { DefeatReason, GameState, ShotState } from "./types.ts";
import { PLAY_BOTTOM, PLAY_TOP } from "./types.ts";
import type { Stage } from "./stage.ts";
import {
    createAimReadout,
    createArrow,
    createButton,
    createGate,
    createHudBar,
    createLevelBanner,
    createObstacle,
    createHitRingDiagram,
    createPanel,
    createPauseButton,
    createStarRating,
    createStatChip,
    createTarget,
    createUlysses,
    labelText,
    outlinedText,
    GOLD,
    type GateView,
    type TargetView,
    type UiButton,
    type UlyssesView,
} from "./art.ts";
import { createScenery, verticalGradient, type SceneryLayers } from "./scenery.ts";
import { ODYSSEY_ART, type UlyssesRig } from "./artAssets.ts";
import ulyssesRigJson from "../assets/art/odyssey/ulysses-rig.json";
import { formatNumber } from "./formatNumber.ts";
import {
    getArrow,
    loadArrowProgress,
    saveArrowProgress,
    scoreToCoins,
    type ArrowId,
    type ArrowProgress,
} from "./arrows.ts";
import { store } from "../state/store.ts";
import { audioManager } from "../audio/audioManager.ts";
import { PATRONAGE_EARNINGS_MULTIPLIER } from "../config/platform.ts";
import { ownsPatronage } from "../systems/monetization/commerce.ts";
import { runtimeServices } from "../systems/runtimeServices.ts";
import { dailySystems } from "../systems/dailySystems.ts";
import { abandonOdysseyRun, completeOdysseyRun, recordOdysseyShot } from "../systems/runAnalytics.ts";
import { saveSystem } from "../systems/save.ts";

export interface Scene {
    destroy(): void;
}

/** Wind band art with its own streaming animation. */
interface WindZoneArt {
    root: Container;
    update(elapsed: number): void;
}

interface OdysseyQaSnapshot {
    gameState: GameState;
    levelIndex: number;
    levelId: string;
    score: number;
    combo: number;
    gatesCollected: number;
    gateCount: number;
    perfectShot: boolean;
    paused: boolean;
    /** Uniform scale applied to the course so all of it fits on screen. */
    courseScale: number;
    /** Design-space rect the course occupies after the fit. */
    courseRect: { x: number; y: number; width: number; height: number };
    /** Design-space rect the player can actually see. */
    visibleRect: { x: number; y: number; width: number; height: number };
    arrowCount: number;
    arrowX: number;
    arrowY: number;
    arrowVelocityY: number;
    windZones: { x: number; width: number; accelY: number; accelX: number }[];
    /** Design-space y where the ground haze ends; must reach the frame bottom. */
    groundBottom: number;
    /** Course-animation clock driving drifting rings, irises and the target. */
    simTime: number;
    /** Rendered design-space y of each ring's opening centre, in course order. */
    gateCenters: number[];
    aimAngle: number;
    power: number;
    resultOverlayCount: number;
}

interface OdysseyQaApi {
    snapshot(): OdysseyQaSnapshot;
    setAim(angle: number): void;
    setPower(power: number): void;
    fire(): void;
    retry(): void;
    nextLevel(): void;
    /** Jump straight to a course; `nextLevel()` alone can't address one. */
    goToLevel(index: number): void;
    pause(): void;
    resume(): void;
    play?(): void;
}

declare global {
    interface Window {
        odysseyReady?: boolean;
        __odysseyQa?: OdysseyQaApi;
    }
}

const DESIGN_WIDTH = 1920;
const DESIGN_HEIGHT = 1080;
/**
 * Screen space the HUD owns, in design px, measured from the visible edges.
 *
 * The course is scaled to fit what is left, so a gate can never end up behind
 * the stat bar or the aim plate.
 */
const HUD_TOP_RESERVE = 132;
const HUD_BOTTOM_RESERVE = 172;
/** Breathing room at the left and right ends of a course. */
const COURSE_SIDE_PAD = 20;
/** Degrees of aim per pixel of vertical drag (up = higher angle). */
const AIM_DRAG_SENSITIVITY = 0.11;
/** Draw-power change per pixel of horizontal drag (right = more speed). */
const POWER_DRAG_SENSITIVITY = 0.0028;
const AIM_SMOOTH = 14;
const POWER_SMOOTH = 16;
const FIRE_MIN_DRAG_PX = 10;
const FIRE_MIN_HOLD_MS = 70;
/**
 * Physics runs on a fixed tick, decoupled from the render frame.
 *
 * A browser delivers whatever dt it feels like, and this game is precision
 * enough — ricochets especially — that integrating on the render dt makes the
 * same shot land differently on different devices, and makes any fixed-rate
 * proof a lie. Stepping a constant 1/120 s and carrying the remainder means the
 * shot the generator verified is exactly the shot the player flies.
 */
const PHYSICS_STEP = 1 / 120;
/** Equal-tempered semitone, for walking the ring cue up a run. */
const SEMITONE = 2 ** (1 / 12);
/** Where the ground haze starts, in world units. */
const GROUND_TOP = PLAY_BOTTOM - 40;
/** Shortest the haze is ever drawn, before it is stretched to the frame edge. */
const GROUND_MIN_DEPTH = 320;
/** Extra world units past the frame edge, so rounding can never expose a gap. */
const GROUND_OVERSHOOT = 80;
/** Patron-only fletching colour — cosmetic, applied over any equipped shaft. */
const MELTEMI_FLETCH = 0xf4f8ff;
/** Never simulate more than this much real time in one frame (tab-switch guard). */
const MAX_PHYSICS_CATCHUP = 0.25;

export async function createOdysseyScene(app: Application, stage: Stage): Promise<Scene> {
    const backdropUrls = [ODYSSEY_ART.level1, ODYSSEY_ART.level2, ODYSSEY_ART.level3];
    const [backgroundTextures, ulyssesUpper, ulyssesLower, ulyssesBelt, targetTexture, pillarTexture, rockTexture] =
        await Promise.all([
            Promise.all(backdropUrls.map((src) => Assets.load<Texture>({ src, data: { resolution: 1 } }))),
            Assets.load<Texture>({ src: ODYSSEY_ART.ulyssesUpper, data: { resolution: 1 } }),
            Assets.load<Texture>({ src: ODYSSEY_ART.ulyssesLower, data: { resolution: 1 } }),
            Assets.load<Texture>({ src: ODYSSEY_ART.ulyssesBelt, data: { resolution: 1 } }),
            Assets.load<Texture>({ src: ODYSSEY_ART.target, data: { resolution: 1 } }),
            Assets.load<Texture>({ src: ODYSSEY_ART.pillar, data: { resolution: 1 } }),
            Assets.load<Texture>({ src: ODYSSEY_ART.rock, data: { resolution: 1 } }),
        ]);
    const propTextures = { pillar: pillarTexture, rock: rockTexture };
    const backdropByUrl = new Map(backdropUrls.map((url, index) => [url, backgroundTextures[index]!]));
    const ulyssesTextures = {
        upper: ulyssesUpper,
        lower: ulyssesLower,
        belt: ulyssesBelt,
        rig: ulyssesRigJson as UlyssesRig,
    };
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    // backdrop fills the frame, world is scaled to fit the whole course inside
    // the HUD-free area, ui is unscaled chrome. Keeping the backdrop out of the
    // scaled container is what stops the painting shrinking with the course.
    const backdrop = new Container();
    const world = new Container();
    const ui = new Container();
    stage.root.addChild(backdrop, world, ui);
    stage.root.eventMode = "static";
    stage.root.hitArea = new Rectangle(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT);

    let level = currentLevel();
    let gameState: GameState = "Menu";
    let paused = false;
    let aimAngle = level.initialAimAngle;
    let aimDisplay = aimAngle;
    let power: number = SHOT_CONFIG.defaultPower;
    let powerDisplay: number = power;
    let shot: ShotState | null = null;
    let arrow: Container | null = null;
    let trajectory = new Graphics();
    let ulysses: UlyssesView | null = null;
    let gateViews: GateView[] = [];
    let target: TargetView | null = null;
    /** Aim/power signature the current trajectory dots were built from. */
    let trajectoryKey = "";
    let particleEmitter: ParticleEmitter | null = null;
    let scenery: SceneryLayers | null = null;
    let windArt: WindZoneArt | null = null;
    let elapsed = 0;
    let levelTime = 0;
    let aimingPointer = false;
    let aimStartY = 0;
    let aimStartX = 0;
    let aimStartAngle = 0;
    let aimStartPower: number = SHOT_CONFIG.defaultPower;
    let aimPointerDownAt = 0;
    let aimMaxDrag = 0;
    let steeringPointer = false;
    let steeringStartX = 0;
    let steering = 0;
    let instructionsVisible = true;
    let resultOverlay: Container | null = null;
    let pauseOverlay: Container | null = null;
    let impactPulse: Graphics | null = null;
    let courseGround: Sprite | null = null;
    let impactTime = 0;
    /** Delay defeat overlay so the stuck arrow is visible. */
    let defeatHold = 0;
    let pendingDefeatReason: DefeatReason | null = null;
    let destroyed = false;
    let arrowProgress: ArrowProgress = loadArrowProgress();
    let trailTick = 0;
    /** Unsimulated real time carried between render frames. */
    let physicsAccumulator = 0;
    /** Set on a first-time clear so the result panel can announce the unlock. */
    /** Depth reached after a clear, for the result panel's next-course button. */
    let clearedDepth = 0;
    /** Drachmae the cleared course paid, and the bounty that can double it. */
    let resultEarned = 0;
    let resultBounty = 0;
    let resultBountyClaimed = false;

    /**
     * The shaft in the player's hand right now.
     *
     * Read from the store on every call, not cached: `arrowProgress` is a
     * snapshot taken when the scene was built, so a shaft bought in the React
     * shop and equipped mid-session was silently ignored — the player kept
     * flying their old arrow and kept bouncing off obsidian they had just paid
     * to be able to break.
     */
    function equippedArrow() {
        return getArrow(store.get().equippedArrow as Parameters<typeof getArrow>[0]);
    }

    // Compact HUD — roomy chips, high-contrast type.
    // Positions are set by layoutHud() so cover-crop and the device safe area
    // never clip them; nothing here uses a hard-coded screen coordinate.
    const HUD_PAD = 24;
    const statBar = createHudBar([220, 170, 180]);
    // HUD type: keep ≥ ~26 design px so cover-fit on short phones stays ≥ 10 CSS px.
    const scoreLabel = labelText("SCORE", 22, 0xffe9a8);
    const scoreText = outlinedText("0", 42, 0xfff0c8);
    const comboLabel = labelText("COMBO", 22, 0xffe9a8);
    const comboText = outlinedText("×1", 42, 0xffc0e8);
    const gatesLabel = labelText("RINGS", 22, 0xffe9a8);
    const gatesText = outlinedText("0/5", 42, 0xa8f0ff);

    const levelBanner = createLevelBanner();
    const aimReadout = createAimReadout();
    aimReadout.set(level.initialAimAngle, power, SHOT_CONFIG.minimumPower, SHOT_CONFIG.maximumPower);
    const pauseButton = createPauseButton(() => setPaused(true));

    function layoutHud(): void {
        const crop = stage.coverInsets();
        const left = crop.left + HUD_PAD;
        const top = crop.top + HUD_PAD;
        const right = DESIGN_WIDTH - crop.right - HUD_PAD;
        const bottom = DESIGN_HEIGHT - crop.bottom - HUD_PAD;
        // Centre chrome on the visible frame, not on the design frame: an
        // asymmetric safe area (notch left, home indicator right) shifts it.
        const midX = (crop.left + (DESIGN_WIDTH - crop.right)) / 2;

        statBar.root.position.set(left, top);
        const cell = (index: number) => left + statBar.cellX(index) + 22;
        scoreLabel.position.set(cell(0), top + 12);
        scoreText.position.set(cell(0), top + 30);
        comboLabel.position.set(cell(1), top + 12);
        comboText.position.set(cell(1), top + 30);
        gatesLabel.position.set(cell(2), top + 12);
        gatesText.position.set(cell(2), top + 30);

        // Title card clears the score row rather than sitting over the course.
        levelBanner.root.position.set(midX, top + 108);
        pauseButton.position.set(right - 48, top + 44);
        // One plate at the bottom — nothing to overlap with.
        aimReadout.root.position.set(midX, bottom - aimReadout.height);
    }
    layoutHud();
    const unsubHudLayout = stage.onResize(() => {
        layoutHud();
        // The fit depends on the visible frame, so a rotate or resize must
        // re-derive it or half the course drops off the edge.
        layoutCourse();
    });

    const hudLayer = new Container();
    hudLayer.addChild(
        statBar.root,
        scoreLabel,
        scoreText,
        comboLabel,
        comboText,
        gatesLabel,
        gatesText,
        levelBanner.root,
        aimReadout.root,
        pauseButton,
    );
    hudLayer.visible = false;
    ui.addChild(hudLayer);

    const shotEvents = {
        onGate(index: number) {
            gateViews[index]?.collect();
            if (shot) {
                const gate = level.gates[index];
                const gold = gate?.kind === "gold";
                particleEmitter?.burst(shot.position.x, shot.position.y, {
                    style: gold ? "goldGate" : "gate",
                    hue: gold ? 46 : 185,
                    burst: gold ? 30 : 22,
                });
                // Each ring in a run sounds a semitone above the last, so a
                // clean four-ring thread reads as a rising phrase. A gold or
                // crown ring is worth more, and rings a fifth higher to say so.
                const step = Math.min(shot.collectedCount, 8) - 1;
                const kindLift = gate?.kind === "crown" ? 2 : gate?.kind === "gold" ? 1.5 : 1;
                audioManager.play("ring", SEMITONE ** Math.max(0, step) * kindLift);
                void runtimeServices.haptic("light");
            }
            updateHud();
        },
        onVictory() {
            gameState = "Victory";
            ulysses?.setFlying(false);
            impactTime = reducedMotion ? 0.01 : 0.55;
            const tx = level.target.x + level.target.width * 0.15;
            const ty = shot?.position.y ?? level.target.y + level.target.height * 0.5;
            impactPulse = new Graphics().circle(tx, ty, 22).stroke({ color: 0xffdd54, width: 12, alpha: 0.95 });
            world.addChild(impactPulse);
            const bull = shot?.targetHit === "bullseye";
            particleEmitter?.burst(tx, ty, {
                style: bull ? "bullseye" : "impact",
                hue: bull ? 48 : 30,
                burst: bull ? 52 : 32,
            });
            if (bull && !reducedMotion) {
                particleEmitter?.burst(tx, ty, { style: "confetti", hue: 50, burst: 40 });
            }
            // The arrow biting the target, then a flourish only a bullseye earns.
            audioManager.play("impact", bull ? 1.15 : 1);
            void runtimeServices.haptic(bull ? "success" : "medium");
            if (bull) audioManager.play("reward");
            // Award drachmae for shop + career counters
            if (shot) {
                const stars = starRating(shot, level);
                const base = scoreToCoins(shot.score, stars);
                const patron = ownsPatronage();
                // The Patronage pays 25% more on every clear and banks the
                // results bounty outright, so its owner never sits through the
                // video a free player watches for the same coin.
                resultEarned = patron ? Math.round(base * PATRONAGE_EARNINGS_MULTIPLIER) : base;
                resultBounty = resultEarned;
                resultBountyClaimed = patron;
                const payout = resultEarned + (patron ? resultBounty : 0);
                arrowProgress.coins += payout;
                saveArrowProgress(arrowProgress);
                const best = Math.max(store.get().score, shot.score);
                store.patch({ score: best, coins: arrowProgress.coins });
                // Clearing banks the depth and arms the next course.
                clearedDepth = advanceDepth(stars);
                dailySystems.recordQuestProgress("bounces");
                dailySystems.recordQuestProgress("coins", payout);
                completeOdysseyRun(shot.score, stars);
                void saveSystem.flush();
            }
            showResult(true);
            publishState();
        },
        onBounce(point: { x: number; y: number }, _obstacleId: string, bouncesLeft: number) {
            particleEmitter?.burst(point.x, point.y, {
                style: "impact",
                hue: bouncesLeft > 0 ? 150 : 8,
                burst: 20,
            });
            impactPulse = new Graphics()
                .circle(point.x, point.y, 16)
                .stroke({ color: bouncesLeft > 0 ? 0x7cf0c0 : 0xff7a5a, width: 8, alpha: 0.95 });
            world.addChild(impactPulse);
            impactTime = reducedMotion ? 0.12 : 0.4;
        },
        onShatter(point: { x: number; y: number }) {
            particleEmitter?.burst(point.x, point.y, { style: "goldGate", hue: 280, burst: 34 });
            impactPulse = new Graphics()
                .circle(point.x, point.y, 20)
                .stroke({ color: 0xc9a8ff, width: 10, alpha: 0.95 });
            world.addChild(impactPulse);
            impactTime = reducedMotion ? 0.12 : 0.45;
        },
        onDefeat(reason: DefeatReason | null) {
            gameState = "Defeat";
            ulysses?.setFlying(false);
            // A miss still pays out for the rings it threaded. Without this a
            // player walled by an obsidian grade could never earn the drachmae
            // for the shaft that would get them past it.
            if (shot && shot.collectedCount > 0) {
                const consolation = Math.max(4, Math.round(shot.score * 0.05));
                arrowProgress.coins += consolation;
                saveArrowProgress(arrowProgress);
                store.patch({ coins: arrowProgress.coins });
                dailySystems.recordQuestProgress("coins", consolation);
                void saveSystem.flush();
            }
            const px = shot?.position.x ?? 0;
            const py = shot?.position.y ?? 0;
            if (reason === "gate_cap" || reason === "too_weak" || reason === "shattered") {
                particleEmitter?.burst(px, py, { style: "goldGate", hue: 42, burst: 26 });
                impactPulse = new Graphics().circle(px, py, 18).stroke({ color: 0xffd24a, width: 10, alpha: 0.95 });
                world.addChild(impactPulse);
                impactTime = reducedMotion ? 0.15 : 0.55;
                defeatHold = reducedMotion ? 0.2 : 0.65;
                pendingDefeatReason = reason;
            } else {
                particleEmitter?.burst(px, py, { style: "defeat", hue: 210, burst: 18 });
                showResult(false, reason);
            }
            publishState();
        },
    };

    function setHudVisible(visible: boolean): void {
        hudLayer.visible = visible;
    }

    function updateHud(): void {
        scoreText.text = formatNumber(shot?.score ?? 0);
        comboText.text = `×${formatNumber(shot?.combo ?? 1)}`;
        gatesText.text = `${formatNumber(shot?.collectedCount ?? 0)}/${formatNumber(level.gates.length)}`;
    }

    function publishState(): void {
        document.documentElement.dataset.gameState = gameState;
        document.documentElement.dataset.odysseyLevel = String(level.depth);
        document.documentElement.dataset.odysseyReady = gameState === "Loading" ? "false" : "true";
    }

    function clearWorld(): void {
        particleEmitter?.destroy();
        particleEmitter = null;
        for (const child of world.removeChildren()) child.destroy({ children: true });
        for (const child of backdrop.removeChildren()) child.destroy({ children: true });
        gateViews = [];
        courseGround = null;
        scenery = null;
        windArt = null;
        ulysses = null;
        arrow = null;
        impactPulse = null;
        // `trajectory` was just destroyed with the world; drop the dangling
        // reference so a stray draw can't touch a destroyed Graphics.
        trajectory = new Graphics();
    }

    function destroyOverlay(overlay: Container | null): null {
        overlay?.destroy({ children: true });
        return null;
    }

    /**
     * Leave the canvas and hand the player back to the React product shell.
     * The Pixi title screen and Pixi arrow shop that used to live here were a
     * second, differently-styled copy of screens React already owns; the defeat
     * panel was the only way to reach them, so the same button produced two
     * different menus depending on how you got there.
     */
    function exitToMenu(reason: "menu_exit"): void {
        abandonOdysseyRun(reason);
        store.patch({ phase: "menu", menuScreen: "main" });
        void saveSystem.flush();
    }

    function loadLevel(nextDepth?: number): void {
        if (nextDepth !== undefined) store.patch({ depth: Math.max(1, Math.floor(nextDepth)) });
        // Re-read the wallet and inventory: a purchase made between courses
        // must be in hand for this one.
        arrowProgress = loadArrowProgress();
        level = currentLevel();
        clearedDepth = 0;
        resultOverlay = destroyOverlay(resultOverlay);
        pauseOverlay = destroyOverlay(pauseOverlay);
        clearWorld();
        levelTime = 0;
        aimAngle = level.initialAimAngle;
        aimDisplay = aimAngle;
        // Each course opens on its own draw so the meter is not always 100%.
        power = clampPower(level.initialPower);
        powerDisplay = power;
        aimReadout.set(aimDisplay, power, SHOT_CONFIG.minimumPower, SHOT_CONFIG.maximumPower);
        aimReadout.root.visible = true;
        shot = null;
        defeatHold = 0;
        pendingDefeatReason = null;
        paused = false;
        gameState = "Aiming";
        instructionsVisible = true;
        aimReadout.setHintVisible(true);
        pauseButton.visible = true;
        setHudVisible(true);
        levelBanner.show(level.depth, featureIntroducedAt(level.depth), level.name, level.tagline);

        const backgroundTexture = backdropByUrl.get(level.backgroundUrl) ?? backgroundTextures[0];
        if (!backgroundTexture) throw new Error(`Missing backdrop for course ${level.depth}`);
        scenery = createScenery(level, backgroundTexture);
        backdrop.addChild(scenery.root);

        courseGround = createCourseGround(level.scenery.ledgeColor, level.worldWidth);
        world.addChild(courseGround);
        windArt = level.windZones ? createWindZoneArt(level.windZones) : null;
        if (windArt) world.addChild(windArt.root);
        for (const obstacle of level.obstacles) world.addChild(createObstacle(obstacle, propTextures));
        gateViews = level.gates.map((gate) => createGate(gate));
        for (const gateView of gateViews) {
            gateView.setSimTime(0);
            world.addChild(gateView.root);
        }
        target = createTarget(level.target, targetTexture);
        world.addChild(target.root);
        ulysses = createUlysses(ulyssesTextures);
        ulysses.root.position.set(level.ulysses.x, level.ulysses.y);
        ulysses.setAim(aimDisplay);
        world.addChild(createStandingLedge(level.ulysses.x, level.ulysses.y, level.scenery.ledgeColor));
        world.addChild(ulysses.root);
        trajectory = new Graphics();
        world.addChild(trajectory);
        trajectoryKey = "";
        drawTrajectory();
        particleEmitter = createParticleEmitter(world, new NoiseRandom(0x0d155e + level.depth));
        layoutCourse();
        updateHud();
        publishState();
    }

    /**
     * Wind bands, drawn only across the play band so the chevrons read as a
     * gust corridor rather than as a full-height curtain over the scenery.
     */
    /**
     * Wind bands.
     *
     * The physics was always working — a gust moves the arc 45–500px — but the
     * old band was a 12%-alpha rectangle with six static chevrons, which read
     * as decoration rather than as a force. Streaming chevrons that actually
     * travel the way the gust pushes, a stronger tint, lit edges and a named
     * label make the effect legible: the player can see the dotted preview kink
     * inside the band and attribute it to the right cause.
     */
    function createWindZoneArt(zones: readonly NonNullable<typeof level.windZones>[number][]): WindZoneArt {
        const root = new Container();
        const streams: { graphics: Graphics; zone: (typeof zones)[number]; horizontal: boolean }[] = [];

        for (const zone of zones) {
            const lifting = zone.accelY < 0;
            const horizontal = (zone.accelX ?? 0) !== 0 && zone.accelY === 0;
            const tintFill = horizontal ? 0xb48cff : lifting ? 0x5ab6ff : 0xff9a54;
            const tintLine = horizontal ? 0xe8dcff : lifting ? 0xc4ecff : 0xffe0b8;
            const top = PLAY_TOP - 40;
            const height = PLAY_BOTTOM - PLAY_TOP + 80;

            const band = new Graphics();
            band.roundRect(zone.x, top, zone.width, height, 26).fill({ color: tintFill, alpha: 0.22 });
            // Lit edges so the corridor has a mouth you can see the arc enter.
            band.rect(zone.x, top, 5, height).fill({ color: tintLine, alpha: 0.7 });
            band.rect(zone.x + zone.width - 5, top, 5, height).fill({ color: tintLine, alpha: 0.7 });
            root.addChild(band);

            // No text label: a name placed anywhere inside the band collides
            // with a ring capital, and colour plus a chevron that travels the
            // way the gust pushes already says it without the clutter.
            const stream = new Graphics();
            root.addChild(stream);
            streams.push({ graphics: stream, zone, horizontal });
        }

        return {
            root,
            update(elapsed) {
                for (const { graphics, zone, horizontal } of streams) {
                    graphics.clear();
                    const lifting = zone.accelY < 0;
                    const tintLine = horizontal ? 0xe8dcff : lifting ? 0xc4ecff : 0xffe0b8;
                    // Chevrons scroll in the push direction; speed tracks strength
                    // so a violent gust visibly rips and a gentle one drifts.
                    const magnitude = Math.abs(horizontal ? (zone.accelX ?? 0) : zone.accelY);
                    const speed = 60 + magnitude * 0.16;
                    const spacing = 132;
                    const cx = zone.x + zone.width / 2;
                    if (horizontal) {
                        const dir = (zone.accelX ?? 0) < 0 ? -1 : 1;
                        const travel = ((elapsed * speed) % spacing) * dir;
                        for (let i = -1; i < 7; i += 1) {
                            const cy = PLAY_TOP + 20 + i * ((PLAY_BOTTOM - PLAY_TOP) / 6);
                            for (const lane of [-1, 1]) {
                                const x = cx + lane * (zone.width * 0.22) + travel;
                                if (x < zone.x || x > zone.x + zone.width) continue;
                                graphics
                                    .moveTo(x - dir * 15, cy - 19)
                                    .lineTo(x + dir * 17, cy)
                                    .lineTo(x - dir * 15, cy + 19)
                                    .stroke({ color: tintLine, width: 5, alpha: 0.85 });
                            }
                        }
                        return;
                    }
                    // Apex on the side the gust pushes towards: an updraft's
                    // chevrons point up and travel up. Deriving both from one
                    // signed `dir` is what kept getting this inverted.
                    const apex = lifting ? -17 : 17;
                    const wing = lifting ? 15 : -15;
                    const travel = ((elapsed * speed) % spacing) * (lifting ? -1 : 1);
                    for (let i = -1; i < 8; i += 1) {
                        const cy = PLAY_TOP - 20 + i * spacing + travel;
                        if (cy < PLAY_TOP - 40 || cy > PLAY_BOTTOM + 40) continue;
                        for (const lane of [-1, 0, 1]) {
                            const x = cx + lane * (zone.width * 0.3);
                            graphics
                                .moveTo(x - 21, cy + wing)
                                .lineTo(x, cy + apex)
                                .lineTo(x + 21, cy + wing)
                                .stroke({ color: tintLine, width: 5, alpha: 0.85 });
                        }
                    }
                }
            },
        };
    }

    /**
     * Ground haze along the course floor.
     *
     * The course is scaled and seated independently of the painting, so its
     * floor line no longer coincides with the painted foreground. A soft band
     * fading down from PLAY_BOTTOM gives obstacles and the target something to
     * stand on without stamping a hard UI-looking bar across the art.
     */
    function createCourseGround(color: number, worldWidth: number): Sprite {
        // One canvas gradient, not a stack of translucent rects: overlapping
        // translucent bands double-composite and print a line at every
        // boundary, which is the lesson already written into scenery.ts.
        const ground = verticalGradient(worldWidth + 400, GROUND_MIN_DEPTH, [
            { at: 0, color, alpha: 0 },
            { at: 0.55, color, alpha: 0.18 },
            { at: 1, color, alpha: 0.6 },
        ]);
        ground.label = "course-ground";
        ground.position.set(-200, GROUND_TOP);
        return ground;
    }

    /**
     * The outcrop Ulysses stands on.
     *
     * The course is scaled and seated independently of the painting, so his
     * footing has to be drawn in world space. It is deliberately stone-coloured
     * rather than the course's mood colour: tinting it fully turned the plinth
     * into a saturated slab that read as a rendering artefact on the darker
     * courses, so the level colour only tints it slightly.
     */
    function createStandingLedge(x: number, y: number, moodColor: number): Graphics {
        const STONE = 0x8b8375;
        const g = new Graphics();
        const left = x - 170;
        const right = x + 150;
        const deep = PLAY_BOTTOM + 220;
        // Irregular silhouette reads as rock; a plain rectangle read as a bug.
        g.moveTo(left, y)
            .lineTo(right, y)
            .lineTo(right - 26, y + 120)
            .lineTo(right - 4, y + 260)
            .lineTo(right - 60, deep)
            .lineTo(left - 40, deep)
            .lineTo(left - 14, y + 180)
            .closePath()
            .fill({ color: STONE, alpha: 0.97 });
        // A thin wash of the level's light so it belongs to this course.
        g.moveTo(left, y)
            .lineTo(right, y)
            .lineTo(right - 26, y + 120)
            .lineTo(right - 4, y + 260)
            .lineTo(right - 60, deep)
            .lineTo(left - 40, deep)
            .lineTo(left - 14, y + 180)
            .closePath()
            .fill({ color: moodColor, alpha: 0.38 });
        // Shaded face, so the plinth has a light direction like the painting.
        g.moveTo(x + 40, y)
            .lineTo(right, y)
            .lineTo(right - 26, y + 120)
            .lineTo(right - 4, y + 260)
            .lineTo(right - 60, deep)
            .lineTo(x + 10, deep)
            .closePath()
            .fill({ color: 0x0a1a28, alpha: 0.22 });
        // Stone cap and its lit lip.
        g.roundRect(left - 10, y - 20, right - left + 24, 30, 14).fill({ color: 0xd9cdb2, alpha: 0.95 });
        g.roundRect(left - 10, y - 20, right - left + 24, 12, 8).fill({ color: 0xfff2d2, alpha: 0.6 });
        // Contact shadow under his feet.
        g.ellipse(x + 8, y - 2, 150, 22).fill({ color: 0x081c2c, alpha: 0.26 });
        return g;
    }

    /**
     * Scale and place the course so the WHOLE of it is on screen at once.
     *
     * The camera used to follow the arrow down a course wider than the frame,
     * which meant a player could never see where they were shooting — they
     * aimed at gates that were off the right-hand edge. Fitting the course
     * instead makes this a plan-the-arc game: everything the shot will touch is
     * visible while you aim.
     *
     * Width almost always binds (courses are 2400–2950 wide against ~1700 of
     * usable design px), giving roughly a 0.6–0.7 scale. The band is anchored to
     * the bottom of the usable area rather than centred, so the floor line stays
     * low against the painted foreground instead of floating in the sea.
     */
    function layoutCourse(): void {
        const crop = stage.coverInsets();
        const left = crop.left + COURSE_SIDE_PAD;
        const right = DESIGN_WIDTH - crop.right - COURSE_SIDE_PAD;
        const top = crop.top + HUD_TOP_RESERVE;
        const bottom = DESIGN_HEIGHT - crop.bottom - HUD_BOTTOM_RESERVE;
        const availableWidth = Math.max(1, right - left);
        const availableHeight = Math.max(1, bottom - top);
        const bandHeight = PLAY_BOTTOM - PLAY_TOP;

        const scale = Math.min(availableWidth / level.worldWidth, availableHeight / bandHeight);
        world.scale.set(scale);
        world.x = left + (availableWidth - level.worldWidth * scale) / 2;
        // Seat PLAY_BOTTOM on the bottom of the usable area, then make sure the
        // very top of the world still starts below the visible edge so a high
        // lob is not clipped by the frame.
        world.y = Math.max(crop.top, bottom - PLAY_BOTTOM * scale);
        // The haze is drawn in world units but has to reach the bottom of the
        // FRAME, and the world scale changes with every course. A fixed depth
        // stopped short on shallower fits and ended at full strength in open
        // air — a hard bright bar across the painting. Stretch it past the
        // frame edge and let the stage mask do the cutting.
        if (courseGround) {
            const toFrameBottom = (DESIGN_HEIGHT - world.y) / scale - GROUND_TOP;
            courseGround.height = Math.max(GROUND_MIN_DEPTH, toFrameBottom + GROUND_OVERSHOOT);
        }
    }

    function drawTrajectory(): void {
        if (gameState !== "Aiming") {
            trajectory.clear();
            trajectoryKey = "";
            return;
        }
        // The GDD asks for a preview that only rebuilds when the aim changes;
        // it used to rebuild ~25 filled circles every frame regardless. The
        // release phase is part of the key now — a drifting capital can
        // intercept an arc that a moment earlier was clear — but quantized to
        // ~8 Hz so a still thumb does not rebuild 25 dots every frame.
        const phaseTick = Math.round(levelTime * 12);
        const key = `${aimDisplay.toFixed(2)}|${powerDisplay.toFixed(3)}|${arrowProgress.equipped}|${phaseTick}`;
        if (key === trajectoryKey) return;
        trajectoryKey = key;
        trajectory.clear();
        const arrowDef = equippedArrow();
        const { points, certainUntil } = sampleTrajectory(level, aimDisplay, 22, arrowDef, powerDisplay, levelTime);
        // Hotter color when overdrawn
        const hot = powerDisplay > 1.15;
        const warm = hot ? 0xff8a4a : arrowDef.head;
        // Every dot gets a dark rim. A pale dot on a pale sky is invisible, and
        // the aim preview is the one thing that must always be readable.
        for (let index = 0; index < points.length; index += 1) {
            const point = points[index];
            if (!point) continue;
            const fade = index / Math.max(1, points.length - 1);
            const radius = 9.5 - fade * 3.5;
            if (index < certainUntil) {
                trajectory
                    .circle(point.x, point.y, radius + 2.5)
                    .fill({ color: 0x0a1c2c, alpha: (0.98 - fade * 0.35) * 0.55 })
                    .circle(point.x, point.y, radius)
                    .fill({ color: index % 2 === 0 ? warm : 0xffffff, alpha: 0.98 - fade * 0.35 });
                continue;
            }
            // Past the first gust these are the WIND-FREE line, not a
            // prediction: hollow, so they can never be mistaken for one, but
            // still legible — they are the reference the player measures the
            // drift against, and a whisper-faint ring is no use for that.
            trajectory
                .circle(point.x, point.y, radius * 0.95 + 2)
                .stroke({ color: 0x0a1c2c, width: 4, alpha: 0.4 })
                .circle(point.x, point.y, radius * 0.95)
                .stroke({ color: 0xdff2ff, width: 3.5, alpha: 0.9 - fade * 0.25 });
        }

        // Mark exactly where certainty ends, so the cut reads as deliberate.
        const cut = points[certainUntil];
        if (cut && certainUntil < points.length) {
            // A dashed gate across the arc: past this the dots are a reference,
            // not a promise. Drawn dashed so it never reads as a solid barrier.
            for (let offset = -60; offset < 60; offset += 22) {
                trajectory
                    .moveTo(cut.x, cut.y + offset)
                    .lineTo(cut.x, cut.y + offset + 12)
                    .stroke({ color: 0xdff2ff, width: 4, alpha: 0.85 });
            }
            trajectory.circle(cut.x, cut.y, 13).stroke({ color: 0xdff2ff, width: 3.5, alpha: 0.9 });
        }

        // A brighter head marks where the shot begins, so the arc has direction.
        const first = points[0];
        if (first) {
            trajectory.circle(first.x, first.y, 15).stroke({ color: warm, width: 3, alpha: 0.55 });
        }
    }

    function setAim(angle: number): void {
        if (gameState !== "Aiming") return;
        aimAngle = clampAimAngle(angle);
        publishState();
    }

    function setPower(next: number): void {
        if (gameState !== "Aiming") return;
        power = clampPower(next);
        publishState();
    }

    /**
     * Collapse the aim/power easing onto its target.
     *
     * `fire()` shoots `aimDisplay`/`powerDisplay`, which chase `aimAngle`/`power`
     * over a few frames. A player always sees that catch up before releasing,
     * but a programmatic setAim → fire in the same tick would otherwise shoot
     * the *previous* aim, which made the QA contract fire a different shot from
     * the one it asked for.
     */
    function snapAimToTarget(): void {
        aimDisplay = aimAngle;
        powerDisplay = power;
        aimReadout.set(aimDisplay, powerDisplay, SHOT_CONFIG.minimumPower, SHOT_CONFIG.maximumPower);
        ulysses?.setAim(aimDisplay);
        drawTrajectory();
    }

    function fire(): void {
        if (gameState !== "Aiming") return;
        const holdMs = performance.now() - aimPointerDownAt;
        if (aimMaxDrag < FIRE_MIN_DRAG_PX && holdMs < FIRE_MIN_HOLD_MS) {
            // Accidental tap — keep aiming.
            return;
        }
        const arrowDef = equippedArrow();
        const firePower = powerDisplay;
        // Released into the motion the player was looking at.
        shot = createShot(level, aimDisplay, arrowDef, firePower, levelTime);
        physicsAccumulator = 0;
        // The Patronage's only visible effect on the shot: white Meltemi
        // fletching over whatever shaft is equipped. Cosmetic — it touches no
        // flight value.
        arrow = createArrow({
            shaft: arrowDef.shaft,
            head: arrowDef.head,
            fletch: ownsPatronage() ? MELTEMI_FLETCH : arrowDef.fletch,
        });
        arrow.position.set(shot.position.x, shot.position.y);
        arrow.rotation = shot.rotation;
        world.addChild(arrow);
        trajectory.clear();
        trajectoryKey = "";
        gameState = "Arrow Flying";
        recordOdysseyShot();
        instructionsVisible = false;
        aimReadout.root.visible = false;
        trailTick = 0;
        particleEmitter?.burst(shot.position.x, shot.position.y, {
            style: "gate",
            hue: arrowDef.trailHue,
            burst: 10,
            direction: shot.rotation,
            speedScale: 0.55,
        });
        ulysses?.playRelease();
        ulysses?.setFlying(true);
        publishState();
    }

    /** Centre and height budget of the frame the player can actually see. */
    function visibleFrame(): { cx: number; cy: number; height: number } {
        const crop = stage.coverInsets();
        return {
            cx: (crop.left + (DESIGN_WIDTH - crop.right)) / 2,
            cy: (crop.top + (DESIGN_HEIGHT - crop.bottom)) / 2,
            height: DESIGN_HEIGHT - crop.top - crop.bottom,
        };
    }

    /**
     * The results bounty: watch a short video, double what the course paid.
     *
     * The offer is only drawn once the host confirms a rewarded video is
     * actually loaded, so a player never taps a doubler with no inventory
     * behind it, and it is never drawn adjacent to REPLAY/COURSE — a mis-tap
     * must not open an ad. A Patron's bounty was already banked in `onVictory`,
     * so they see the receipt instead of the offer.
     *
     * `y` is measured up from the action row rather than as a fraction of the
     * panel, so the gap above REPLAY/COURSE is the same on any panel height.
     * On a panel too short to hold the extra row the offer is dropped outright
     * — losing an impression beats stacking it onto the stat chips.
     */
    function attachResultsBounty(overlay: Container, cx: number, y: number, panelH: number, coinLine: Text): void {
        if (resultBounty <= 0 || panelH < 580) return;
        if (resultBountyClaimed) {
            const banked = outlinedText(`PATRON'S BOUNTY  +${formatNumber(resultBounty)}`, 24, 0x8ef0a8);
            banked.anchor.set(0.5);
            banked.position.set(cx + 230, y);
            overlay.addChild(banked);
            return;
        }

        const bounty: UiButton = createButton(
            `WATCH · +${formatNumber(resultBounty)}`,
            380,
            () => {
                if (resultBountyClaimed) return;
                bounty.setEnabled(false);
                void (async () => {
                    const result = await runtimeServices.watchResultsAd();
                    // Only a verified view earned it — "cancelled" means the
                    // player closed the video early and nothing is owed.
                    if (result !== "verified") {
                        if (resultOverlay === overlay) bounty.setEnabled(true);
                        store.patch({
                            toast: result === "cancelled" ? "BOUNTY NOT EARNED" : "NO VIDEO AVAILABLE",
                        });
                        return;
                    }
                    resultBountyClaimed = true;
                    arrowProgress.coins += resultBounty;
                    saveArrowProgress(arrowProgress);
                    store.patch({ coins: arrowProgress.coins });
                    dailySystems.recordQuestProgress("coins", resultBounty);
                    void saveSystem.flush();
                    // The overlay can have been torn down while the video
                    // played; the coin is banked either way.
                    if (resultOverlay !== overlay) return;
                    coinLine.text = `+${formatNumber(resultEarned + resultBounty)} DRACHMAE`;
                    bounty.root.visible = false;
                    const banked = outlinedText(`BOUNTY  +${formatNumber(resultBounty)}`, 24, 0x8ef0a8);
                    banked.anchor.set(0.5);
                    banked.position.set(cx + 230, y);
                    overlay.addChild(banked);
                    audioManager.play("reward");
                })();
            },
            0x2f9e6a,
        );
        bounty.root.position.set(cx + 230, y);
        // Hidden until the host says a video is loaded; revealing later is
        // safe because nothing else occupies this column.
        bounty.root.visible = false;
        overlay.addChild(bounty.root);
        void runtimeServices.resultsAdReady().then((ready) => {
            if (ready && resultOverlay === overlay && !resultBountyClaimed) bounty.root.visible = true;
        });
    }

    function showResult(victory: boolean, reason: DefeatReason | null = null): void {
        pauseButton.visible = false;
        setHudVisible(false);
        resultOverlay = destroyOverlay(resultOverlay);
        const overlay = new Container();
        overlay.label = "result-overlay";
        const frame = visibleFrame();
        const cx = frame.cx;
        const shade = new Graphics().rect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT).fill({ color: 0x021018, alpha: 0.7 });
        // Never taller than the visible band, so buttons cannot fall off a phone.
        const panelH = Math.min(victory ? 700 : 440, frame.height - 36);
        const panel = createPanel(940, panelH);
        panel.position.set(cx, frame.cy);

        const quality = victory && shot ? shot.targetHit : null;
        const stars = victory && shot ? starRating(shot, level) : 1;
        const titleText = !victory
            ? "SHOT LOST"
            : quality === "bullseye"
              ? "BULLSEYE!"
              : quality === "inner"
                ? "INNER RING!"
                : "OUTER RING!";
        const titleColor = !victory
            ? 0x9ad8ff
            : quality === "bullseye"
              ? 0xffd24a
              : quality === "inner"
                ? 0xffb0b0
                : 0xf0e8d8;
        // Rows are fractions of the panel so a shorter panel compresses evenly
        // instead of pushing its last row through the bottom rim.
        const topY = frame.cy - panelH / 2;
        const row = (fraction: number) => topY + panelH * fraction;
        const title = outlinedText(titleText, 56, titleColor);
        title.anchor.set(0.5);
        title.position.set(cx, row(0.1));
        overlay.addChild(shade, panel, title);

        if (victory && shot && quality) {
            const rating = createStarRating(stars);
            rating.position.set(cx, row(0.22));
            const starHint = outlinedText(
                stars === 3
                    ? "EVERY RING + BULLSEYE"
                    : stars === 2
                      ? "EVERY RING · NOW FIND THE CENTRE"
                      : "TARGET HIT · THREAD MORE RINGS",
                25,
                0xd0e4f4,
            );
            starHint.anchor.set(0.5);
            starHint.position.set(cx, row(0.31));

            const arrowDef = getArrow((shot.arrowId as ArrowId) ?? "reed");
            const targetPts = targetScoreForHit(quality, arrowDef.targetScoreMult);
            const chipY = row(0.46);
            const gatesChip = createStatChip(
                "RINGS",
                `${formatNumber(shot.collectedCount)}/${formatNumber(level.gates.length)}`,
                0xffe9a8,
            );
            gatesChip.position.set(cx - 250, chipY);
            const targetChip = createStatChip(
                quality === "bullseye" ? "BULLSEYE" : quality === "inner" ? "INNER" : "OUTER",
                `+${formatNumber(targetPts)}`,
                quality === "bullseye" ? 0xffd24a : 0xffe9a8,
            );
            targetChip.position.set(cx, chipY);
            const totalChip = createStatChip("TOTAL", formatNumber(shot.score), 0xfff0c8);
            totalChip.position.set(cx + 250, chipY);

            // The scoring key sits in the left column beside the diagram, two
            // short lines rather than one long one, so the right column is
            // free for the bounty offer.
            const diagram = createHitRingDiagram(quality);
            diagram.position.set(cx - 330, row(0.7));
            const ringKeyTop = outlinedText(
                `OUTER +${formatNumber(SHOT_CONFIG.targetOuterScore)}   ·   INNER +${formatNumber(SHOT_CONFIG.targetInnerScore)}`,
                19,
                0xb8c8d8,
            );
            ringKeyTop.anchor.set(0, 0.5);
            ringKeyTop.position.set(cx - 262, row(0.635));
            const ringKeyBottom = outlinedText(
                `BULLSEYE +${formatNumber(SHOT_CONFIG.targetBullseyeScore)}`,
                19,
                0xb8c8d8,
            );
            ringKeyBottom.anchor.set(0, 0.5);
            ringKeyBottom.position.set(cx - 262, row(0.695));
            const coinLine = outlinedText(`+${formatNumber(resultEarned)} DRACHMAE`, 28, GOLD);
            coinLine.anchor.set(0, 0.5);
            coinLine.position.set(cx - 262, row(0.78));

            overlay.addChild(rating, starHint, gatesChip, targetChip, totalChip, diagram, ringKeyTop, ringKeyBottom);
            overlay.addChild(coinLine);

            const nextFeature = featureIntroducedAt(clearedDepth);
            if (nextFeature) {
                const teaser = outlinedText(`NEXT: ${nextFeature}`, 24, 0x8ef0a8);
                teaser.anchor.set(0.5);
                teaser.position.set(cx, row(0.365));
                overlay.addChild(teaser);
            }

            attachResultsBounty(overlay, cx, row(0.89) - 150, panelH, coinLine);

            const replay = createButton("REPLAY", 250, () => loadLevel(level.depth), 0x1f7db8);
            replay.root.position.set(cx - 175, row(0.89));
            const next = createButton(`COURSE ${formatNumber(clearedDepth)}`, 340, () => loadLevel(clearedDepth));
            next.root.position.set(cx + 175, row(0.89));
            overlay.addChild(replay.root, next.root);
        } else {
            const arrowDef = equippedArrow();
            const reasonText =
                reason === "gate_cap"
                    ? "A CAPITAL STOPPED THE ARROW"
                    : reason === "obstacle"
                      ? "THE STONE BROKE THE ARC"
                      : reason === "too_weak"
                        ? `OBSIDIAN GRADE ${formatNumber(shot?.blockedHardness ?? 2)} HELD`
                        : reason === "shattered"
                          ? "THE SHAFT SHATTERED"
                          : "THE ARROW LEFT THE COURSE";
            const copy = outlinedText(reasonText, 27, reason === "too_weak" ? 0xc9a8ff : 0xe8f4fa);
            copy.anchor.set(0.5);
            copy.position.set(cx, row(0.3));
            const tip = outlinedText(
                reason === "too_weak"
                    ? `${arrowDef.name} has might ${formatNumber(arrowDef.might)} — you need ${formatNumber(shot?.blockedHardness ?? 2)}. Buy a heavier shaft.`
                    : reason === "shattered"
                      ? `${arrowDef.name} survives ${formatNumber(arrowDef.bounces)} ricochet${arrowDef.bounces === 1 ? "" : "s"} — a springier shaft lasts longer`
                      : reason === "obstacle"
                        ? "Change the angle, or the draw — go over it"
                        : "Thread the open light, not the solid capitals",
                22,
                0xb8c8d8,
            );
            tip.anchor.set(0.5);
            tip.position.set(cx, row(0.44));
            const retry = createButton("RETRY", 280, () => loadLevel());
            retry.root.position.set(cx - 165, row(0.75));
            const menu = createButton("MENU", 240, () => exitToMenu("menu_exit"), 0x3a5a78);
            menu.root.position.set(cx + 165, row(0.75));
            overlay.addChild(copy, tip, retry.root, menu.root);
        }
        overlay.alpha = reducedMotion ? 1 : 0;
        ui.addChild(overlay);
        resultOverlay = overlay;
    }

    function setPaused(nextPaused: boolean): void {
        if (gameState === "Victory" || gameState === "Defeat" || gameState === "Loading" || gameState === "Menu")
            return;
        paused = nextPaused;
        if (!paused) {
            pauseOverlay = destroyOverlay(pauseOverlay);
            setHudVisible(true);
            pauseButton.visible = true;
            aimReadout.root.visible = gameState === "Aiming";
            aimReadout.setHintVisible(instructionsVisible);
            publishState();
            return;
        }
        // The whole HUD goes with it: the title card in particular froze
        // mid-fade behind the pause panel, since its timer runs on the clock
        // that pausing stops.
        setHudVisible(false);
        pauseButton.visible = false;
        aimReadout.root.visible = false;
        const overlay = new Container();
        overlay.label = "pause-overlay";
        const frame = visibleFrame();
        const shade = new Graphics().rect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT).fill({ color: 0x021018, alpha: 0.7 });
        // The three buttons and the title used to be placed at fixed Y values
        // that put MENU below the panel's own bottom rim.
        const panelH = Math.min(560, frame.height - 36);
        const panel = createPanel(660, panelH);
        panel.position.set(frame.cx, frame.cy);
        const topY = frame.cy - panelH / 2;
        const row = (fraction: number) => topY + panelH * fraction;
        const title = outlinedText("PAUSED", 60, 0xffd249);
        title.anchor.set(0.5);
        title.position.set(frame.cx, row(0.14));
        const resume = createButton("RESUME", 320, () => setPaused(false));
        resume.root.position.set(frame.cx, row(0.4));
        const restart = createButton("RESTART", 320, () => loadLevel(), 0x1f7db8);
        restart.root.position.set(frame.cx, row(0.62));
        // Leave the canvas shell — React owns the product main menu.
        const menu = createButton("MENU", 320, () => exitToMenu("menu_exit"), 0x3a5a78);
        menu.root.position.set(frame.cx, row(0.84));
        overlay.addChild(shade, panel, title, resume.root, restart.root, menu.root);
        ui.addChild(overlay);
        pauseOverlay = overlay;
        publishState();
    }

    function onPointerDown(event: FederatedPointerEvent): void {
        if (gameState === "Menu" || paused || gameState === "Victory" || gameState === "Defeat") return;
        if (gameState === "Aiming") {
            aimingPointer = true;
            const p = event.getLocalPosition(stage.root);
            aimStartY = p.y;
            aimStartX = p.x;
            aimStartAngle = aimAngle;
            aimStartPower = power;
            aimPointerDownAt = performance.now();
            aimMaxDrag = 0;
            return;
        }
        if (gameState === "Arrow Flying") {
            steeringPointer = true;
            steeringStartX = event.getLocalPosition(stage.root).x;
        }
    }

    function onPointerMove(event: FederatedPointerEvent): void {
        if (paused || gameState === "Menu") return;
        if (aimingPointer && gameState === "Aiming") {
            const p = event.getLocalPosition(stage.root);
            const dy = aimStartY - p.y; // drag up ⇒ higher arc
            const dx = p.x - aimStartX; // drag right ⇒ more power / speed
            aimMaxDrag = Math.max(aimMaxDrag, Math.abs(dy), Math.abs(dx));
            setAim(aimStartAngle + dy * AIM_DRAG_SENSITIVITY);
            setPower(aimStartPower + dx * POWER_DRAG_SENSITIVITY);
            return;
        }
        if (steeringPointer && gameState === "Arrow Flying") {
            const point = event.getLocalPosition(stage.root);
            steering = Math.max(-1, Math.min(1, (point.x - steeringStartX) / 130));
        }
    }

    function onPointerUp(): void {
        if (aimingPointer && gameState === "Aiming") fire();
        aimingPointer = false;
        steeringPointer = false;
        steering = 0;
    }

    function update(ticker: Ticker): void {
        if (destroyed) return;
        const deltaSeconds = Math.min(0.05, ticker.deltaMS / 1000);
        elapsed += deltaSeconds;

        if (paused) return;

        levelTime += deltaSeconds;
        levelBanner.update(deltaSeconds, reducedMotion);
        if (!reducedMotion) windArt?.update(elapsed);

        if (instructionsVisible && elapsed > 6 && !aimingPointer) {
            instructionsVisible = false;
            aimReadout.setHintVisible(false);
        }

        // Smooth aim + power display toward targets
        if (gameState === "Aiming") {
            const kAim = reducedMotion ? 1 : 1 - Math.exp(-AIM_SMOOTH * deltaSeconds);
            const kPow = reducedMotion ? 1 : 1 - Math.exp(-POWER_SMOOTH * deltaSeconds);
            aimDisplay += (aimAngle - aimDisplay) * kAim;
            if (Math.abs(aimDisplay - aimAngle) < 0.02) aimDisplay = aimAngle;
            powerDisplay += (power - powerDisplay) * kPow;
            if (Math.abs(powerDisplay - power) < 0.004) powerDisplay = power;
            aimReadout.set(aimDisplay, powerDisplay, SHOT_CONFIG.minimumPower, SHOT_CONFIG.maximumPower);
            aimReadout.root.visible = true;
            ulysses?.setAim(aimDisplay);
            drawTrajectory();
        }

        ulysses?.update(elapsed, deltaSeconds, reducedMotion);
        // One clock for the whole course: rings drift while the player aims and
        // keep drifting through the shot, continuous across release.
        const simTime = gameState === "Arrow Flying" && shot ? shot.startTime + shot.elapsed : levelTime;
        for (const gate of gateViews) {
            if (gameState === "Aiming" || gameState === "Arrow Flying") {
                gate.setSimTime(simTime);
            }
            gate.update(elapsed, deltaSeconds, reducedMotion);
        }
        if (gameState === "Aiming" || gameState === "Arrow Flying") target?.setSimTime(simTime);
        particleEmitter?.update(deltaSeconds);

        if (gameState === "Arrow Flying" && shot && arrow) {
            const arrowDef = equippedArrow();
            if (!shot.stuck) {
                physicsAccumulator = Math.min(MAX_PHYSICS_CATCHUP, physicsAccumulator + deltaSeconds);
                while (physicsAccumulator >= PHYSICS_STEP && shot.outcome === "flying" && !shot.stuck) {
                    advanceShot(shot, level, PHYSICS_STEP, steering, shotEvents, arrowDef);
                    physicsAccumulator -= PHYSICS_STEP;
                }
                if (!reducedMotion) {
                    trailTick += 1;
                    if (trailTick % 2 === 0) {
                        particleEmitter?.trail(shot.position.x, shot.position.y, shot.rotation, arrowDef.trailHue);
                    }
                }
            }
            arrow.position.set(shot.position.x, shot.position.y);
            arrow.rotation = shot.rotation;
            // Subtle stick tremble on gold-cap embed
            if (shot.stuck && !reducedMotion) {
                arrow.position.x += Math.sin(elapsed * 55) * 1.2;
                arrow.position.y += Math.cos(elapsed * 48) * 0.8;
            }
            // No camera work: the whole course is already on screen.
            updateHud();
        }

        // Stuck-on-gold beat before the defeat panel
        if (gameState === "Defeat" && defeatHold > 0) {
            defeatHold = Math.max(0, defeatHold - deltaSeconds);
            if (defeatHold === 0) {
                const reason = pendingDefeatReason;
                pendingDefeatReason = null;
                showResult(false, reason);
            }
        }

        if (impactPulse && impactTime > 0) {
            impactTime = Math.max(0, impactTime - deltaSeconds);
            const progress = 1 - impactTime / (reducedMotion ? 0.15 : 0.55);
            impactPulse.scale.set(1 + progress * 2.2);
            impactPulse.alpha = 1 - progress;
        }

        if (resultOverlay && resultOverlay.alpha < 1) {
            resultOverlay.alpha = Math.min(1, resultOverlay.alpha + deltaSeconds * 4.2);
        }
    }

    stage.root.on("pointerdown", onPointerDown);
    stage.root.on("pointermove", onPointerMove);
    stage.root.on("pointerup", onPointerUp);
    stage.root.on("pointerupoutside", onPointerUp);
    app.ticker.add(update);
    // React MainMenu owns the product shell. Entering the canvas starts a run
    // at the saved career level (1-based) instead of a second Pixi title screen.
    const careerLevel = Math.max(1, store.get().level);
    loadLevel(careerLevel - 1);

    // Development-only: this contract can aim, fire and skip courses, so it must
    // never exist in a shipped build.
    if (import.meta.env?.DEV)
        window.__odysseyQa = {
            snapshot: () => ({
                gameState,
                levelIndex: level.depth - 1,
                levelId: level.id,
                score: shot?.score ?? 0,
                combo: shot?.combo ?? 1,
                gatesCollected: shot?.collectedCount ?? 0,
                gateCount: level.gates.length,
                perfectShot: shot ? isPerfectShot(shot, level) : false,
                paused,
                courseScale: world.scale.x,
                courseRect: {
                    x: world.x,
                    y: world.y + PLAY_TOP * world.scale.y,
                    width: level.worldWidth * world.scale.x,
                    height: (PLAY_BOTTOM - PLAY_TOP) * world.scale.y,
                },
                visibleRect: (() => {
                    const crop = stage.coverInsets();
                    return {
                        x: crop.left,
                        y: crop.top,
                        width: DESIGN_WIDTH - crop.left - crop.right,
                        height: DESIGN_HEIGHT - crop.top - crop.bottom,
                    };
                })(),
                arrowCount: arrow ? 1 : 0,
                // Live tip state, so QA can trace the flight the player sees
                // rather than re-simulating it and hoping the two agree.
                arrowX: shot?.position.x ?? 0,
                arrowY: shot?.position.y ?? 0,
                arrowVelocityY: shot?.velocity.y ?? 0,
                simTime: gameState === "Arrow Flying" && shot ? shot.startTime + shot.elapsed : levelTime,
                gateCenters: gateViews.map((view) => view.root.y),
                groundBottom: courseGround
                    ? world.y + (courseGround.y + courseGround.height) * world.scale.y
                    : Number.NaN,
                windZones: (level.windZones ?? []).map((zone) => ({
                    x: zone.x,
                    width: zone.width,
                    accelY: zone.accelY,
                    accelX: zone.accelX ?? 0,
                })),
                aimAngle: aimDisplay,
                power: powerDisplay,
                resultOverlayCount: ui.children.filter((child) => child.label === "result-overlay").length,
            }),
            setAim,
            setPower,
            fire: () => {
                if (gameState === "Menu") loadLevel(0);
                else {
                    aimMaxDrag = 100;
                    aimPointerDownAt = 0;
                    snapAimToTarget();
                    fire();
                }
            },
            retry: () => loadLevel(),
            nextLevel: () => loadLevel(level.depth + 1),
            goToLevel: (index) => loadLevel(index + 1),
            pause: () => setPaused(true),
            resume: () => setPaused(false),
            play: () => loadLevel(0),
        };
    window.odysseyReady = true;
    document.documentElement.dataset.odysseyReady = "true";
    requestAnimationFrame(() => {
        const cover = document.getElementById("boot-cover");
        cover?.classList.add("hidden");
        window.setTimeout(() => cover?.remove(), 360);
    });

    return {
        destroy() {
            destroyed = true;
            app.ticker.remove(update);
            stage.root.off("pointerdown", onPointerDown);
            stage.root.off("pointermove", onPointerMove);
            stage.root.off("pointerup", onPointerUp);
            stage.root.off("pointerupoutside", onPointerUp);
            particleEmitter?.destroy();
            delete window.__odysseyQa;
            window.odysseyReady = false;
            unsubHudLayout();
            world.destroy({ children: true });
            ui.destroy({ children: true });
        },
    };
}
