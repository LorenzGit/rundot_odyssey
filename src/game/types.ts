export interface Point {
    x: number;
    y: number;
}

/**
 * Continuous motion applied to a ring (or the target disc).
 *
 * One shape covers the whole vocabulary:
 *   ampX 0            → bobs straight up and down
 *   ampX and ampY > 0 → travels a circle, i.e. an orbiting ring
 *   ampY 0            → slides side to side
 *
 * Collision samples this at the mid-point of each physics step, so what the
 * arrow hits is always where the ring is drawn.
 */
export interface GateDrift {
    /** Peak vertical offset in px from the authored Y. */
    ampY: number;
    /** Peak horizontal offset in px from the authored X. */
    ampX: number;
    /** Seconds for one full revolution. */
    period: number;
    /** Phase offset in radians. */
    phase: number;
}

/**
 * Iris: the opening breathes open and shut.
 *
 * `amount` is the fraction of the authored opening height that closes at the
 * tightest point, so 0.35 means the gap shrinks to 65% and back. The centre of
 * the opening stays put — only the capitals slide.
 */
export interface GateAperture {
    amount: number;
    period: number;
    phase: number;
}

/**
 * normal — plain cyan ring, 1× score.
 * gold   — 2× score, warmer glass, slightly narrower.
 * crown  — 5× score, a deliberately tight opening on the solution arc.
 */
export type GateKind = "normal" | "gold" | "crown";

export const GATE_SCORE_MULTIPLIER: Record<GateKind, number> = {
    normal: 1,
    gold: 2,
    crown: 5,
};

export interface GateData {
    id: string;
    x: number;
    openingY: number;
    openingHeight: number;
    width: number;
    /** Bob, slide or orbit. */
    drift?: GateDrift;
    /** Opening that breathes open and shut. */
    aperture?: GateAperture;
    kind?: GateKind;
}

/**
 * Target disc bounds (where the painted face is drawn).
 *
 * Collision is NOT this full box. Physics uses a thin vertical rectangle through
 * the middle of the disc (side-view slice):
 *   centerX = x + width/2
 *   centerY = y + height/2  (+ drift offset)
 *   outer radius = height/2
 * Ring score = |hitY − centerY| / radius  (center=bullseye, rims=outer).
 */
export interface TargetData {
    x: number;
    y: number;
    width: number;
    height: number;
    /** Swinging target. Applies to collision and art alike. */
    drift?: GateDrift;
}

/**
 * Horizontal band that accelerates the arrow while its tip is inside.
 *
 * `accelY` bends the arc up/down; `accelX` shortens or stretches it, which is
 * what makes the draw-power choice matter instead of being cosmetic.
 */
export interface WindZone {
    id: string;
    x: number;
    width: number;
    /** +down / −up px/s² (Pixi Y-down). */
    accelY: number;
    /** +downrange / −headwind px/s². */
    accelX?: number;
}

/**
 * Course furniture.
 *
 * - `rock` / `pillar` end the shot on contact.
 * - `bumper` / `plate` bounce it. A bounce costs one of the arrow's `bounces`;
 *   running out shatters the arrow, which is what makes a springier shaft worth
 *   buying.
 * - `obsidian` is a slab that only an arrow with `might >= hardness` smashes
 *   through. Below that it ends the shot. This is the hard wall that gates
 *   depth on equipment.
 */
export type ObstacleData =
    | { id: string; kind: "rock"; x: number; y: number; radius: number }
    | { id: string; kind: "pillar"; x: number; y: number; width: number; height: number }
    | { id: string; kind: "bumper"; x: number; y: number; radius: number }
    | { id: string; kind: "plate"; x1: number; y1: number; x2: number; y2: number }
    | { id: string; kind: "obsidian"; x: number; y: number; width: number; height: number; hardness: number };

export type BouncyObstacle = Extract<ObstacleData, { kind: "bumper" | "plate" }>;

export function isBouncy(obstacle: ObstacleData): obstacle is BouncyObstacle {
    return obstacle.kind === "bumper" || obstacle.kind === "plate";
}

/** Per-level scenery identity — drives the sky, the backdrop tint and the light grade. */
export interface LevelScenery {
    /** Sky gradient behind the painted backdrop (top → horizon). */
    skyTop: number;
    skyBottom: number;
    /** Multiply tint applied to the painted backdrop (0xffffff = untouched). */
    backdropTint: number;
    /** Stone colour of the ledge Ulysses stands on. */
    ledgeColor: number;
    /** Warm/cool light wash over the whole scene (alpha 0 disables). */
    washColor: number;
    washAlpha: number;
}

export interface LevelData {
    id: string;
    name: string;
    tagline: string;
    /** 1-based endless depth this level was generated for. */
    depth: number;
    worldWidth: number;
    worldHeight: number;
    backgroundUrl: string;
    scenery: LevelScenery;
    ulysses: Point;
    launchPosition: Point;
    initialAimAngle: number;
    /** Draw power the course opens on (1 = baseline). */
    initialPower: number;
    /**
     * The shot the generator verified this course on. Not a hint shown to the
     * player: the generator refuses to emit a level whose par does not collect
     * every ring and hit the bullseye at every frame rate we ship against, and
     * the sim re-checks it.
     */
    parShot: { angle: number; power: number };
    /** Lowest arrow `might` that can survive this course's obsidian. */
    requiredMight: number;
    /** Bounces the par shot needs; an arrow with fewer will shatter. */
    requiredBounces: number;
    gates: readonly GateData[];
    target: TargetData;
    obstacles: readonly ObstacleData[];
    windZones?: readonly WindZone[];
}

export type GameState = "Menu" | "Loading" | "Aiming" | "Arrow Flying" | "Victory" | "Defeat";
export type DefeatReason = "obstacle" | "out_of_bounds" | "stopped" | "gate_cap" | "too_weak" | "shattered";
/** Where on the target face the arrow struck. */
export type TargetHitQuality = "bullseye" | "inner" | "outer";

export interface ShotState {
    position: Point;
    previousPosition: Point;
    velocity: Point;
    rotation: number;
    collected: boolean[];
    collectedCount: number;
    combo: number;
    score: number;
    outcome: "flying" | "victory" | "defeat";
    defeatReason: DefeatReason | null;
    elapsed: number;
    /**
     * Course-animation time the arrow was released into.
     *
     * Rings, irises and the target keep drifting while the player aims, and the
     * shot flies through the phase it was released into — so what is on screen
     * is what the arrow meets. The generator calms each course's motion until
     * par clears from ANY release moment, so this can never make a course
     * unwinnable; see calmMotionUntilPhaseRobust.
     */
    startTime: number;
    /** Set on victory. */
    targetHit: TargetHitQuality | null;
    /** Arrow frozen in a capital, a slab, or the ground. */
    stuck: boolean;
    /** Equipped arrow id at fire time (for score mults / FX). */
    arrowId?: string;
    /** Ricochets used so far. */
    bounces: number;
    /** Obstacle id that ended the shot, for a specific defeat message. */
    blockedBy: string | null;
    /** Hardness of the slab that stopped it, when `defeatReason` is too_weak. */
    blockedHardness: number;
}

/** Solid gold capital height (must match art + collision). */
export const GATE_CAP_HEIGHT = 52;
/**
 * Cap is wider than the glass opening (art + collision must match).
 * Keep modest so neighboring gates can still have a visible air gap.
 */
export const GATE_CAP_WIDTH_SCALE = 1.32;
/** Minimum clear air (px) between neighboring gold-cap edges. */
export const MIN_GATE_EDGE_GAP = 56;

/**
 * Vertical band of design space that is guaranteed visible after cover-fit.
 *
 * The stage cover-fits 1920×1080 into the host, so a landscape phone crops the
 * top and bottom, not the sides. iPhone 17 Pro Max landscape (956×440, aspect
 * 2.17) keeps y 98…982; the band below survives aspects up to ~2.42, which
 * covers every phone we ship to. Anything a player must see or hit — gate caps,
 * the target disc, Ulysses — is authored inside it.
 */
export const PLAY_TOP = 150;
export const PLAY_BOTTOM = 930;

/** Center-to-center X spacing so two gates never touch/overlap. */
export function minGateCenterSpacing(widthA: number, widthB: number, edgeGap = MIN_GATE_EDGE_GAP): number {
    const halfA = (widthA * GATE_CAP_WIDTH_SCALE) / 2;
    const halfB = (widthB * GATE_CAP_WIDTH_SCALE) / 2;
    return Math.ceil(halfA + halfB + edgeGap);
}

/** Full vertical extent a gate occupies at its worst phase, capitals included. */
export function gateOuterBounds(gate: GateData): { top: number; bottom: number } {
    const swing = gate.drift?.ampY ?? 0;
    return {
        top: gate.openingY - GATE_CAP_HEIGHT - swing,
        bottom: gate.openingY + gate.openingHeight + GATE_CAP_HEIGHT + swing,
    };
}
