import type {
    BouncyObstacle,
    GateAperture,
    GateData,
    GateDrift,
    LevelData,
    ObstacleData,
    Point,
    ShotState,
    TargetData,
    TargetHitQuality,
} from "./types.ts";
import { GATE_CAP_HEIGHT, GATE_CAP_WIDTH_SCALE, GATE_SCORE_MULTIPLIER } from "./types.ts";
import type { ArrowDef, ArrowId } from "./arrows.ts";
import { getArrow } from "./arrows.ts";

export const SHOT_CONFIG = {
    /**
     * Baseline tip speed. Courses are ~2600px long and take 1.1–2.8s to fly, so
     * the camera genuinely travels and each course can have its own arc shape.
     * Per-arrow `launchSpeed` in arrows.ts overrides this; keep them in step.
     */
    launchSpeed: 1300,
    gravity: 900,
    /** Subtle at these flight times — a full-lock steer bends the shot, not teleports it. */
    maximumSteeringAcceleration: 90,
    maximumDeltaTime: 0.033,
    minimumAimAngle: -10,
    maximumAimAngle: 66,
    /**
     * Draw power multiplies the equipped arrow's launch speed.
     * 1 = baseline (level-authoring / default aim). Drag left/right to change.
     */
    minimumPower: 0.55,
    maximumPower: 1.4,
    defaultPower: 1,
    /**
     * Target face scores — very different so a graze never feels like a bullseye.
     * Rings are judged on the painted face (Y only — side-view hit plane).
     */
    targetOuterScore: 50,
    targetInnerScore: 200,
    targetBullseyeScore: 500,
    /**
     * Flat mid-board slice: |hitY − centerY| / radius
     * center → bullseye · mid → inner · top/bottom of disc → outer
     */
    bullseyeRadius: 0.48,
    innerRadius: 0.78,
    /** Speed kept after a ricochet. Below 1 so a bounce chain always decays. */
    bounceRestitution: 0.94,
    /** Push-off applied after a bounce so the arrow cannot re-hit the same face. */
    bounceEpsilon: 2.5,
    /**
     * Fixed integration slice. Every caller is chopped to this internally, so a
     * 30 FPS frame and a 144 FPS frame simulate identically.
     */
    integrationStep: 1 / 120,
    /** Ricochets resolved inside one physics step before we give up and move on. */
    maximumBouncesPerStep: 4,
} as const;

// ─── Motion sampling ───────────────────────────────────────────────────────

export function driftOffsetAt(drift: GateDrift | undefined, timeSeconds: number): Point {
    if (!drift) return { x: 0, y: 0 };
    const omega = (Math.PI * 2) / Math.max(0.05, drift.period);
    const angle = timeSeconds * omega + drift.phase;
    return { x: Math.cos(angle) * drift.ampX, y: Math.sin(angle) * drift.ampY };
}

function apertureScaleAt(aperture: GateAperture | undefined, timeSeconds: number): number {
    if (!aperture) return 1;
    const omega = (Math.PI * 2) / Math.max(0.05, aperture.period);
    // sin → [-1,1]; map to [1 - amount, 1] so the opening never grows past its
    // authored height (which would break the layout guarantees).
    const wave = (Math.sin(timeSeconds * omega + aperture.phase) + 1) * 0.5;
    return 1 - aperture.amount * (1 - wave);
}

/** Where a ring's opening actually is at a given sim time. */
export interface GateWindow {
    /** Centre X of the ring, after drift. */
    x: number;
    top: number;
    bottom: number;
    height: number;
}

export function gateWindowAt(gate: GateData, timeSeconds: number): GateWindow {
    const offset = driftOffsetAt(gate.drift, timeSeconds);
    const height = gate.openingHeight * apertureScaleAt(gate.aperture, timeSeconds);
    // The iris closes around the opening's centre, so the arc through the middle
    // stays valid at every phase.
    const centre = gate.openingY + gate.openingHeight * 0.5 + offset.y;
    return { x: gate.x + offset.x, top: centre - height * 0.5, bottom: centre + height * 0.5, height };
}

/** Legacy helper kept for art that only needs the opening's top edge. */
export function gateOpeningYAt(gate: GateData, timeSeconds: number): number {
    return gateWindowAt(gate, timeSeconds).top;
}

export interface TargetFace {
    centerX: number;
    centerY: number;
    radius: number;
    top: number;
    bottom: number;
}

/**
 * Flat vertical plane through the middle of the disc.
 * Hit when the arrow crosses x = centerX with y between top and bottom.
 */
export function getTargetFace(target: TargetData, timeSeconds = 0): TargetFace {
    const radius = Math.max(1, target.height * 0.5);
    const offset = driftOffsetAt(target.drift, timeSeconds);
    const centerX = target.x + target.width * 0.5 + offset.x;
    const centerY = target.y + radius + offset.y;
    return { centerX, centerY, radius, top: centerY - radius, bottom: centerY + radius };
}

export interface ShotEvents {
    onGate(index: number, awardedScore: number): void;
    onVictory(): void;
    onDefeat(reason: ShotState["defeatReason"]): void;
    /** A ricochet resolved at this point, with the outgoing direction. */
    onBounce?(point: Point, obstacleId: string, bouncesLeft: number): void;
    /** An obsidian slab was smashed through. */
    onShatter?(point: Point, obstacleId: string): void;
}

export function clampAimAngle(angle: number): number {
    return Math.max(SHOT_CONFIG.minimumAimAngle, Math.min(SHOT_CONFIG.maximumAimAngle, angle));
}

export function clampPower(power: number): number {
    return Math.max(SHOT_CONFIG.minimumPower, Math.min(SHOT_CONFIG.maximumPower, power));
}

/** Effective tip speed for an arrow at the given draw power. */
export function launchSpeedFor(arrow: ArrowDef, power: number = SHOT_CONFIG.defaultPower): number {
    return arrow.launchSpeed * clampPower(power);
}

export function createShot(
    level: LevelData,
    angleDegrees: number,
    arrow: ArrowDef = getArrow("reed"),
    power: number = SHOT_CONFIG.defaultPower,
    startTime = 0,
): ShotState {
    const radians = (clampAimAngle(angleDegrees) * Math.PI) / 180;
    const speed = launchSpeedFor(arrow, power);
    const velocity = { x: Math.cos(radians) * speed, y: -Math.sin(radians) * speed };
    return {
        position: { ...level.launchPosition },
        previousPosition: { ...level.launchPosition },
        velocity,
        rotation: Math.atan2(velocity.y, velocity.x),
        collected: level.gates.map(() => false),
        collectedCount: 0,
        combo: 1,
        score: 0,
        outcome: "flying",
        defeatReason: null,
        elapsed: 0,
        startTime,
        targetHit: null,
        stuck: false,
        arrowId: arrow.id,
        bounces: 0,
        blockedBy: null,
        blockedHardness: 0,
    };
}

// ─── Geometry ──────────────────────────────────────────────────────────────

function crossedX(previous: Point, current: Point, x: number): number | null {
    const delta = current.x - previous.x;
    if (Math.abs(delta) < 0.0001) return null;
    const t = (x - previous.x) / delta;
    return t >= 0 && t <= 1 ? t : null;
}

function pointAlong(previous: Point, current: Point, t: number): Point {
    return { x: previous.x + (current.x - previous.x) * t, y: previous.y + (current.y - previous.y) * t };
}

/** Liang–Barsky: earliest entry t into AABB, or null if no hit. */
function segmentRectEntryT(
    previous: Point,
    current: Point,
    x: number,
    y: number,
    width: number,
    height: number,
): number | null {
    let start = 0;
    let end = 1;
    const dx = current.x - previous.x;
    const dy = current.y - previous.y;
    const edges = [
        [-dx, previous.x - x],
        [dx, x + width - previous.x],
        [-dy, previous.y - y],
        [dy, y + height - previous.y],
    ] as const;
    for (const [p, q] of edges) {
        if (p === 0) {
            if (q < 0) return null;
            continue;
        }
        const ratio = q / p;
        if (p < 0) start = Math.max(start, ratio);
        else end = Math.min(end, ratio);
        if (start > end) return null;
    }
    return start;
}

function segmentIntersectsCircle(previous: Point, current: Point, center: Point, radius: number): boolean {
    const dx = current.x - previous.x;
    const dy = current.y - previous.y;
    const lengthSquared = dx * dx + dy * dy;
    const t =
        lengthSquared === 0
            ? 0
            : Math.max(0, Math.min(1, ((center.x - previous.x) * dx + (center.y - previous.y) * dy) / lengthSquared));
    const point = pointAlong(previous, current, t);
    const cx = point.x - center.x;
    const cy = point.y - center.y;
    return cx * cx + cy * cy <= radius * radius;
}

interface Impact {
    /** Fraction along the segment where contact happens. */
    t: number;
    /** Unit surface normal at the contact point. */
    normal: Point;
    /**
     * Where to put the arrow after reflecting — clear of the surface.
     *
     * Nudging a fixed epsilon along the normal is enough for a plate, which has
     * no volume, but not for a bumper: a tip that entered several pixels deep is
     * still inside the circle afterwards, hits again next frame, and burns
     * through the arrow's whole bounce budget on one bumper.
     */
    exit: Point;
}

/** Earliest entry into a circle, with the outward radial normal. */
function circleImpact(previous: Point, current: Point, center: Point, radius: number): Impact | null {
    const dx = current.x - previous.x;
    const dy = current.y - previous.y;
    const fx = previous.x - center.x;
    const fy = previous.y - center.y;
    const a = dx * dx + dy * dy;
    if (a < 1e-9) return null;
    const b = 2 * (fx * dx + fy * dy);
    const c = fx * fx + fy * fy - radius * radius;
    const discriminant = b * b - 4 * a * c;
    if (discriminant < 0) return null;
    const root = Math.sqrt(discriminant);
    // Nearest entry in [0,1]; a start already inside gives a negative t, which
    // we clamp to 0 so a grazing overlap still resolves outward.
    const t1 = (-b - root) / (2 * a);
    const t2 = (-b + root) / (2 * a);
    const t = t1 >= 0 && t1 <= 1 ? t1 : t2 >= 0 && t2 <= 1 ? t2 : c < 0 ? 0 : null;
    if (t === null) return null;
    const hit = pointAlong(previous, current, t);
    const nx = hit.x - center.x;
    const ny = hit.y - center.y;
    const length = Math.hypot(nx, ny) || 1;
    const normal = { x: nx / length, y: ny / length };
    // Project back out to the surface, not just off the contact point.
    const clearance = radius + SHOT_CONFIG.bounceEpsilon;
    return {
        t,
        normal,
        exit: { x: center.x + normal.x * clearance, y: center.y + normal.y * clearance },
    };
}

/** Segment-vs-segment crossing, with the plate's normal facing the incoming arrow. */
function plateImpact(previous: Point, current: Point, plate: BouncyObstacle & { kind: "plate" }): Impact | null {
    const rx = current.x - previous.x;
    const ry = current.y - previous.y;
    const sx = plate.x2 - plate.x1;
    const sy = plate.y2 - plate.y1;
    const denominator = rx * sy - ry * sx;
    if (Math.abs(denominator) < 1e-9) return null;
    const t = ((plate.x1 - previous.x) * sy - (plate.y1 - previous.y) * sx) / denominator;
    const u = ((plate.x1 - previous.x) * ry - (plate.y1 - previous.y) * rx) / denominator;
    if (t < 0 || t > 1 || u < 0 || u > 1) return null;
    const length = Math.hypot(sx, sy) || 1;
    let nx = -sy / length;
    let ny = sx / length;
    // Face the normal against the incoming direction so the reflection pushes back.
    if (nx * rx + ny * ry > 0) {
        nx = -nx;
        ny = -ny;
    }
    const hit = pointAlong(previous, current, t);
    return {
        t,
        normal: { x: nx, y: ny },
        exit: { x: hit.x + nx * SHOT_CONFIG.bounceEpsilon, y: hit.y + ny * SHOT_CONFIG.bounceEpsilon },
    };
}

function bounceImpact(obstacle: BouncyObstacle, previous: Point, current: Point): Impact | null {
    return obstacle.kind === "bumper"
        ? circleImpact(previous, current, obstacle, obstacle.radius)
        : plateImpact(previous, current, obstacle);
}

/** A lethal or breakable obstacle crossed by this segment, earliest first. */
function blockingObstacle(
    level: LevelData,
    previous: Point,
    current: Point,
): { obstacle: ObstacleData; t: number } | null {
    let best: { obstacle: ObstacleData; t: number } | null = null;
    for (const obstacle of level.obstacles) {
        let t: number | null = null;
        if (obstacle.kind === "rock") {
            t = segmentIntersectsCircle(previous, current, obstacle, obstacle.radius)
                ? (circleImpact(previous, current, obstacle, obstacle.radius)?.t ?? 0)
                : null;
        } else if (obstacle.kind === "pillar" || obstacle.kind === "obsidian") {
            t = segmentRectEntryT(previous, current, obstacle.x, obstacle.y, obstacle.width, obstacle.height);
        }
        if (t === null) continue;
        if (!best || t < best.t) best = { obstacle, t };
    }
    return best;
}

// ─── Scoring ───────────────────────────────────────────────────────────────

/**
 * Side-view ring slice:
 *          outer  ↑ top of disc
 *          inner
 *        bullseye · disc center (gold)
 *          inner
 *          outer  ↓ bottom of disc
 * Only Y matters. X is the face plane; we never use a 2D ellipse-on-face.
 */
export function classifyTargetHit(level: LevelData, hit: Point, timeSeconds = 0): TargetHitQuality {
    const face = getTargetFace(level.target, timeSeconds);
    // Clamp into the disc so slightly-past-edge hits still classify as outer, not NaN.
    const dy = Math.max(-face.radius, Math.min(face.radius, hit.y - face.centerY));
    const ny = Math.abs(dy) / face.radius;
    if (ny <= SHOT_CONFIG.bullseyeRadius) return "bullseye";
    if (ny <= SHOT_CONFIG.innerRadius) return "inner";
    return "outer";
}

export function targetScoreForHit(quality: TargetHitQuality, mult = 1): number {
    const base =
        quality === "bullseye"
            ? SHOT_CONFIG.targetBullseyeScore
            : quality === "inner"
              ? SHOT_CONFIG.targetInnerScore
              : SHOT_CONFIG.targetOuterScore;
    return Math.round(base * mult);
}

/** Stars: 1 = any hit · 2 = all rings · 3 = all rings + bullseye. */
export function starRating(shot: ShotState, level: LevelData): 1 | 2 | 3 {
    if (shot.outcome !== "victory") return 1;
    const allGates = shot.collectedCount >= level.gates.length;
    if (allGates && shot.targetHit === "bullseye") return 3;
    if (allGates) return 2;
    return 1;
}

// ─── Integration ───────────────────────────────────────────────────────────

function endShot(shot: ShotState, reason: ShotState["defeatReason"], events: ShotEvents): void {
    shot.outcome = "defeat";
    shot.defeatReason = reason;
    events.onDefeat(reason);
}

/**
 * Resolve gates, the target and lethal obstacles along one straight sub-segment.
 * Returns true when the shot ended and integration must stop.
 */
function resolveSegment(
    shot: ShotState,
    level: LevelData,
    from: Point,
    to: Point,
    sampleTime: number,
    events: ShotEvents,
    arrow: ArrowDef,
): boolean {
    for (let index = 0; index < level.gates.length; index += 1) {
        const gate = level.gates[index];
        if (!gate) continue;
        const window = gateWindowAt(gate, sampleTime);
        const capW = gate.width * GATE_CAP_WIDTH_SCALE;
        const capX = window.x - capW / 2;

        if (!shot.collected[index]) {
            // Capitals use a full AABB sweep (not just the centreline) so the
            // solid bars always catch a fast arrow.
            const topHit = segmentRectEntryT(from, to, capX, window.top - GATE_CAP_HEIGHT, capW, GATE_CAP_HEIGHT);
            const botHit = segmentRectEntryT(from, to, capX, window.bottom, capW, GATE_CAP_HEIGHT);
            const stickT = topHit !== null && botHit !== null ? Math.min(topHit, botHit) : (topHit ?? botHit);
            if (stickT !== null) {
                const hit = pointAlong(from, to, stickT);
                shot.position.x = hit.x;
                shot.position.y = hit.y;
                shot.velocity.x = 0;
                shot.velocity.y = 0;
                shot.stuck = true;
                shot.blockedBy = gate.id;
                endShot(shot, "gate_cap", events);
                return true;
            }
        }

        if (shot.collected[index]) continue;
        const crossing = crossedX(from, to, window.x);
        if (crossing === null) continue;
        const crossingPoint = pointAlong(from, to, crossing);
        if (crossingPoint.y >= window.top && crossingPoint.y <= window.bottom) {
            shot.collected[index] = true;
            shot.collectedCount += 1;
            const mult = GATE_SCORE_MULTIPLIER[gate.kind ?? "normal"] * arrow.gateScoreMult;
            const awardedScore = Math.round(50 * shot.combo * mult);
            shot.score += awardedScore;
            shot.combo += 1;
            events.onGate(index, awardedScore);
        }
    }

    // Flat mid-disc plane (zero-thickness vertical slice — cannot tunnel past).
    const face = getTargetFace(level.target, sampleTime);
    const planeT = crossedX(from, to, face.centerX);
    if (planeT !== null) {
        const hit = pointAlong(from, to, planeT);
        if (hit.y >= face.top && hit.y <= face.bottom) {
            const quality = classifyTargetHit(level, hit, sampleTime);
            shot.targetHit = quality;
            shot.score += targetScoreForHit(quality, arrow.targetScoreMult);
            shot.position.x = face.centerX;
            shot.position.y = hit.y;
            shot.velocity.x = 0;
            shot.velocity.y = 0;
            shot.stuck = true;
            shot.outcome = "victory";
            events.onVictory();
            return true;
        }
    }

    const blocking = blockingObstacle(level, from, to);
    if (blocking) {
        const { obstacle } = blocking;
        if (obstacle.kind === "obsidian") {
            // Strong enough smashes straight through; too weak stops dead.
            if (arrow.might >= obstacle.hardness) {
                events.onShatter?.(pointAlong(from, to, blocking.t), obstacle.id);
            } else {
                const hit = pointAlong(from, to, blocking.t);
                shot.position.x = hit.x;
                shot.position.y = hit.y;
                shot.velocity.x = 0;
                shot.velocity.y = 0;
                shot.stuck = true;
                shot.blockedBy = obstacle.id;
                shot.blockedHardness = obstacle.hardness;
                endShot(shot, "too_weak", events);
                return true;
            }
        } else {
            shot.blockedBy = obstacle.id;
            endShot(shot, "obstacle", events);
            return true;
        }
    }
    return false;
}

/**
 * Advance one frame.
 *
 * Ricochets are resolved by sub-stepping: integrate the remaining slice, find
 * the earliest bounce, move to the contact point, reflect, and continue with
 * what is left of the frame. Reflecting once and deferring the remainder to the
 * next frame would make a bounce chain frame-rate dependent, which the
 * multi-frame-rate proofs in `npm run simulate` exist to prevent.
 */
export function advanceShot(
    shot: ShotState,
    level: LevelData,
    deltaSeconds: number,
    steering: number,
    events: ShotEvents,
    arrow: ArrowDef = getArrow((shot.arrowId as ArrowId | undefined) ?? "reed"),
): void {
    if (shot.outcome !== "flying") return;
    const frameDt = Math.max(0, Math.min(SHOT_CONFIG.maximumDeltaTime, deltaSeconds));
    shot.previousPosition.x = shot.position.x;
    shot.previousPosition.y = shot.position.y;

    // Chop the frame into fixed slices so the simulation is identical at every
    // frame rate BY CONSTRUCTION rather than by tuning. Called with 1/30 this
    // runs four 1/120 slices and lands on exactly the same pixel as a 120 FPS
    // caller. Without it, a 4600 px/s² gust turned the residual per-step error
    // into a par that cleared at one rate and missed at another — and no amount
    // of retuning the gust fixes a physics step that depends on the display.
    let frameLeft = frameDt;
    while (frameLeft > 1e-6 && shot.outcome === "flying") {
        const slice = Math.min(SHOT_CONFIG.integrationStep, frameLeft);
        frameLeft -= slice;
        integrateSlice(shot, level, slice, steering, events, arrow);
    }
    if (shot.outcome !== "flying") return;

    shot.rotation = Math.atan2(shot.velocity.y, shot.velocity.x);

    // Flying above the world is legal — a high lob is a real strategy. Only the
    // sides and the floor end the shot.
    if (shot.position.x < 0 || shot.position.x > level.worldWidth || shot.position.y > level.worldHeight) {
        endShot(shot, "out_of_bounds", events);
        return;
    }

    const speedSquared = shot.velocity.x * shot.velocity.x + shot.velocity.y * shot.velocity.y;
    if (shot.elapsed > 0.5 && speedSquared < 70 * 70) endShot(shot, "stopped", events);
}

/** One fixed-size integration slice, ricochets inside it resolved by sub-stepping. */
function integrateSlice(
    shot: ShotState,
    level: LevelData,
    sliceSeconds: number,
    steering: number,
    events: ShotEvents,
    arrow: ArrowDef,
): void {
    let remaining = sliceSeconds;
    for (let step = 0; step <= SHOT_CONFIG.maximumBouncesPerStep && remaining > 1e-6; step += 1) {
        const dt = remaining;

        if (level.windZones) {
            // Apply the gust over the fraction of this step that is actually
            // inside the band, not "all of it or none of it" based on where the
            // step happened to start. A point test makes the total impulse a
            // function of how many ticks land inside — so the same shot picks up
            // a different push at 40 FPS than at 120, and the stronger the gust
            // the worse the divergence. Weighting by travelled distance makes
            // the impulse a property of the geometry instead.
            const spanStart = shot.position.x;
            const spanEnd = spanStart + shot.velocity.x * dt;
            const spanLow = Math.min(spanStart, spanEnd);
            const spanHigh = Math.max(spanStart, spanEnd);
            const spanWidth = spanHigh - spanLow;
            for (const zone of level.windZones) {
                const overlap = Math.min(spanHigh, zone.x + zone.width) - Math.max(spanLow, zone.x);
                if (overlap <= 0) continue;
                const share = spanWidth < 1e-6 ? 1 : Math.min(1, overlap / spanWidth);
                const push = arrow.windScale * dt * share;
                shot.velocity.y += zone.accelY * push;
                if (zone.accelX) shot.velocity.x += zone.accelX * push;
            }
        }
        const beforeX = shot.velocity.x;
        const beforeY = shot.velocity.y;
        shot.velocity.x +=
            Math.max(-1, Math.min(1, steering)) * SHOT_CONFIG.maximumSteeringAcceleration * arrow.steerScale * dt;
        shot.velocity.y += arrow.gravity * dt;

        // Trapezoidal step: advance on the AVERAGE of the velocity before and
        // after the accelerations, which is exact for a constant force instead
        // of carrying Euler's 0.5·a·dt² position error. That error is invisible
        // under gravity alone but a 4600 px/s² gust turns it into tens of pixels
        // per band, which is why the same par cleared at 120 FPS and missed at
        // 30 once the wind was made strong enough to see.
        const from = { x: shot.position.x, y: shot.position.y };
        const to = {
            x: from.x + (beforeX + shot.velocity.x) * 0.5 * dt,
            y: from.y + (beforeY + shot.velocity.y) * 0.5 * dt,
        };

        let earliest: { impact: Impact; obstacle: BouncyObstacle } | null = null;
        for (const obstacle of level.obstacles) {
            if (obstacle.kind !== "bumper" && obstacle.kind !== "plate") continue;
            const impact = bounceImpact(obstacle, from, to);
            if (!impact) continue;
            if (!earliest || impact.t < earliest.impact.t) earliest = { impact, obstacle };
        }

        // Sample drift at the middle of the slice actually travelled.
        const sliceMidTime = shot.startTime + shot.elapsed + dt * (earliest ? earliest.impact.t : 1) * 0.5;
        const contact = earliest ? pointAlong(from, to, earliest.impact.t) : to;
        if (resolveSegment(shot, level, from, contact, sliceMidTime, events, arrow)) return;

        if (!earliest) {
            shot.position.x = to.x;
            shot.position.y = to.y;
            shot.elapsed += dt;
            remaining = 0;
            break;
        }

        if (shot.bounces >= arrow.bounces) {
            shot.position.x = contact.x;
            shot.position.y = contact.y;
            shot.velocity.x = 0;
            shot.velocity.y = 0;
            shot.stuck = true;
            shot.blockedBy = earliest.obstacle.id;
            endShot(shot, "shattered", events);
            return;
        }

        const { normal, exit } = earliest.impact;
        const dot = shot.velocity.x * normal.x + shot.velocity.y * normal.y;
        shot.velocity.x = (shot.velocity.x - 2 * dot * normal.x) * SHOT_CONFIG.bounceRestitution;
        shot.velocity.y = (shot.velocity.y - 2 * dot * normal.y) * SHOT_CONFIG.bounceRestitution;
        shot.position.x = exit.x;
        shot.position.y = exit.y;
        shot.elapsed += dt * earliest.impact.t;
        shot.bounces += 1;
        events.onBounce?.({ x: contact.x, y: contact.y }, earliest.obstacle.id, arrow.bounces - shot.bounces);
        remaining = dt * (1 - earliest.impact.t);
    }
}

/**
 * Aim preview.
 *
 * `certainUntil` splits the dots in two. Everything before it is exactly where
 * the arrow will fly. Everything after it is where the arrow would fly IF THE
 * WIND WERE NOT THERE — a reference line, not a prediction.
 *
 * The preview used to simulate the gusts too, which is precisely what made wind
 * a no-op: the dots already bent through the band, so the player lined the dots
 * up with the rings, fired, and the arrow followed the dots. The force was
 * measurable and completely unfelt. Cutting the certainty at the band's leading
 * edge makes reading the gust the player's job, and showing the wind-free
 * continuation is what keeps that fair: you can see what the shot would do
 * unpushed and add the drift yourself.
 */
export interface TrajectoryPreview {
    points: Point[];
    /**
     * Index of the first dot that is a wind-free reference rather than a
     * prediction. Equal to `points.length` when the shot never meets a gust.
     */
    certainUntil: number;
}

function firstWindEntryX(level: LevelData, fromX: number): number | null {
    let earliest: number | null = null;
    for (const zone of level.windZones ?? []) {
        const edge = zone.x;
        if (edge < fromX) continue;
        if (earliest === null || edge < earliest) earliest = edge;
    }
    return earliest;
}

export function sampleTrajectory(
    level: LevelData,
    angleDegrees: number,
    count = 28,
    arrow: ArrowDef = getArrow("reed"),
    power: number = SHOT_CONFIG.defaultPower,
    startTime = 0,
): TrajectoryPreview {
    const silent: ShotEvents = { onGate() {}, onVictory() {}, onDefeat() {} };
    const dt = 1 / 120;
    const facePlaneX = getTargetFace(level.target).centerX;
    const gustX = firstWindEntryX(level, level.launchPosition.x);
    // Past the first gust the reference line is flown with the wind switched
    // off, so the dots show the unpushed shot rather than a false prediction.
    const windless: LevelData = { ...level, windZones: [] };

    const path: Point[] = [];
    let certain = -1;
    // Flown from the phase the player is sitting on, so the dots are drawn
    // against the ring positions actually on screen.
    const shot = createShot(level, angleDegrees, arrow, power, startTime);
    for (let frame = 0; frame < 120 * 6; frame += 1) {
        // Collecting rings here would mark them for the real shot, and steering
        // is the player's live input rather than a prediction.
        shot.collected.fill(false);
        shot.collectedCount = 0;
        shot.combo = 1;
        shot.score = 0;
        if (shot.outcome !== "flying") break;
        const uncertain = gustX !== null && shot.position.x >= gustX;
        if (uncertain && certain < 0) certain = path.length;
        advanceShot(shot, uncertain ? windless : level, dt, 0, silent, arrow);
        path.push({ x: shot.position.x, y: shot.position.y });
        if (shot.position.x > facePlaneX + 80) break;
    }
    if (path.length === 0) return { points: [], certainUntil: 0 };

    // Spread the dots over the arc actually flown. Sampling every Nth frame of
    // the maximum flight left a short, fast shot with only a handful on screen.
    const points: Point[] = [];
    const wanted = Math.max(1, Math.min(count, path.length));
    let certainUntil = wanted;
    for (let i = 0; i < wanted; i += 1) {
        const at = wanted === 1 ? 0 : Math.round((i * (path.length - 1)) / (wanted - 1));
        const point = path[at];
        if (!point) continue;
        if (certain >= 0 && at >= certain && certainUntil === wanted) certainUntil = points.length;
        points.push(point);
    }
    return { points, certainUntil };
}

/** Every ring collected, regardless of target ring. */
export function isClearPath(shot: ShotState, level: LevelData): boolean {
    return shot.outcome === "victory" && shot.collectedCount >= level.gates.length;
}

/** Full clear: every ring + bullseye centre. */
export function isPerfectShot(shot: ShotState, level: LevelData): boolean {
    return isClearPath(shot, level) && shot.targetHit === "bullseye";
}

export function isBullseye(shot: ShotState): boolean {
    return shot.outcome === "victory" && shot.targetHit === "bullseye";
}
