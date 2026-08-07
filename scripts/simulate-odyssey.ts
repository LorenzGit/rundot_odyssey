/**
 * Deterministic proofs for Odyssey's endless generator.
 *
 * The courses are procedural now, so there is no hand-authored table to check.
 * What has to hold instead:
 *
 *   1. Every depth produces a course whose par three-stars it at every frame
 *      rate we ship to — with margin, not on a knife edge.
 *   2. The generator never quietly falls back to an easier depth.
 *   3. Consecutive courses are not the same course.
 *   4. The mechanics actually appear once their depth unlocks them, and the
 *      ricochet furniture is genuinely used by the solution rather than being
 *      scenery the intended shot flies past.
 *   5. Layout stays inside the band a landscape phone can show.
 *
 * An earlier version of this suite asserted that every level cleared from its
 * own opening aim, which is what forced eight hand-authored levels onto one
 * parabola. Nothing here constrains the shape of a course — only that it is
 * winnable, distinct, and visible.
 */
import assert from "node:assert/strict";
import {
    clearGeneratedLevelCache,
    FEATURE_DEPTH,
    generateLevel,
    generatorStats,
    requiredMightAt,
} from "../src/game/levelGenerator.ts";
import {
    advanceShot,
    classifyTargetHit,
    clampPower,
    createShot,
    gateWindowAt,
    getTargetFace,
    isClearPath,
    isPerfectShot,
    sampleTrajectory,
    SHOT_CONFIG,
    starRating,
    targetScoreForHit,
} from "../src/game/physics.ts";
import { ARROWS, getArrow, type ArrowDef } from "../src/game/arrows.ts";
import { gateOuterBounds, minGateCenterSpacing, PLAY_BOTTOM, PLAY_TOP, type LevelData } from "../src/game/types.ts";

const NO_EVENTS = { onGate() {}, onVictory() {}, onDefeat() {} };

/**
 * Frame rates a shipped course has to behave identically on.
 *
 * Three neat rates are not enough. A browser ticks at whatever the device
 * gives it, and a ricochet course whose three-star depends on sub-frame timing
 * passes at 30/60/144 and still fails on a real phone. Sweeping the awkward
 * rates in between is what catches that.
 */
const FRAME_RATES = [30, 40, 50, 60, 72, 90, 100, 120, 144, 165] as const;

/**
 * How far off dead centre par lands, as a fraction of the disc radius.
 * `bullseyeRadius` (0.48) is the pass line, so par must stay inside it with
 * room or a frame of jitter drops the third star.
 */
const PAR_MARGIN_LIMIT = 0.42;

/** Deepest course the suite proves. Beyond this the curve is flat. */
const MAX_DEPTH = 120;

/** The shaft a player would realistically hold at a depth: the cheapest that qualifies. */
function arrowFor(depth: number): ArrowDef {
    const need = requiredMightAt(depth);
    return ARROWS.filter((arrow) => arrow.might >= need).sort((a, b) => a.cost - b.cost)[0] ?? getArrow("storm");
}

function fly(level: LevelData, angle: number, power: number, fps: number, arrow: ArrowDef) {
    const shot = createShot(level, angle, arrow, power);
    for (let frame = 0; frame < fps * 14 && shot.outcome === "flying"; frame += 1) {
        advanceShot(shot, level, 1 / fps, 0, NO_EVENTS, arrow);
    }
    return shot;
}

function ringPosition(level: LevelData, arrow: ArrowDef, fps: number): number | null {
    const shot = fly(level, level.parShot.angle, level.parShot.power, fps, arrow);
    if (!isPerfectShot(shot, level)) return null;
    const face = getTargetFace(level.target, shot.elapsed);
    return Math.abs(shot.position.y - face.centerY) / face.radius;
}

// ── Ring map: the side-slice classifier must match the painted disc ────────
{
    const level = generateLevel(1, getArrow("reed"));
    const face = getTargetFace(level.target);
    const x = face.centerX;
    assert.equal(classifyTargetHit(level, { x, y: face.centerY }), "bullseye");
    assert.equal(classifyTargetHit(level, { x, y: face.centerY + face.radius * 0.2 }), "bullseye");
    assert.equal(classifyTargetHit(level, { x, y: face.centerY + face.radius * 0.55 }), "inner");
    assert.equal(classifyTargetHit(level, { x, y: face.centerY - face.radius * 0.55 }), "inner");
    assert.equal(classifyTargetHit(level, { x, y: face.centerY + face.radius * 0.9 }), "outer");
    assert.equal(classifyTargetHit(level, { x, y: face.top }), "outer");
    assert.equal(classifyTargetHit(level, { x, y: face.bottom }), "outer");
    assert.ok(targetScoreForHit("bullseye") > targetScoreForHit("inner"));
    assert.ok(targetScoreForHit("inner") > targetScoreForHit("outer"));
}

// ── Determinism: a depth is the same course every time ────────────────────
{
    const a = generateLevel(17, getArrow("bronze"));
    clearGeneratedLevelCache();
    const b = generateLevel(17, getArrow("bronze"));
    assert.deepEqual(
        b.gates.map((gate) => [gate.x, gate.openingY, gate.openingHeight]),
        a.gates.map((gate) => [gate.x, gate.openingY, gate.openingHeight]),
        "course 17 generated two different layouts — the seed is not depth-derived",
    );
    assert.deepEqual(b.parShot, a.parShot, "course 17 produced two different par shots");
}

clearGeneratedLevelCache();

// ── Every depth: winnable, visible, and its own course ────────────────────
const seen = new Map<string, number>();
const coverage = { bumper: 0, plate: 0, obsidian: 0, orbit: 0, iris: 0, crown: 0, movingTarget: 0, bounceUsed: 0 };
let ringTotal = 0;

for (let depth = 1; depth <= MAX_DEPTH; depth += 1) {
    const arrow = arrowFor(depth);
    const level = generateLevel(depth, arrow);
    const where = `course ${depth} (${arrow.id})`;

    // 1. Par three-stars at every frame rate, with margin.
    let worstRing = 0;
    for (const fps of FRAME_RATES) {
        const ring = ringPosition(level, arrow, fps);
        assert.ok(
            ring !== null,
            `${where}: par ${level.parShot.angle}° @ ${level.parShot.power}x does not three-star at ${fps} FPS`,
        );
        worstRing = Math.max(worstRing, ring);
    }
    assert.ok(
        worstRing <= PAR_MARGIN_LIMIT,
        `${where}: par lands ${worstRing.toFixed(3)} from centre (limit ${PAR_MARGIN_LIMIT}) — one frame of ` +
            `jitter would drop the third star`,
    );

    // 2. Layout stays inside the band a landscape phone can show.
    for (let i = 0; i < level.gates.length; i += 1) {
        const gate = level.gates[i]!;
        const bounds = gateOuterBounds(gate);
        const drift = gate.drift?.ampX ?? 0;
        assert.ok(bounds.top >= PLAY_TOP, `${where} ${gate.id}: capital ${Math.round(bounds.top)} above PLAY_TOP`);
        assert.ok(
            bounds.bottom <= PLAY_BOTTOM,
            `${where} ${gate.id}: capital ${Math.round(bounds.bottom)} below PLAY_BOTTOM`,
        );
        assert.ok(gate.x - drift > 0, `${where} ${gate.id}: drifts off the left of the course`);
        const next = level.gates[i + 1];
        if (next) {
            const need = minGateCenterSpacing(gate.width, next.width);
            assert.ok(next.x - gate.x >= need, `${where}: ${gate.id}→${next.id} spacing ${next.x - gate.x} < ${need}`);
        }
    }
    const swing = level.target.drift?.ampY ?? 0;
    assert.ok(level.target.y - swing >= PLAY_TOP, `${where}: target swings above PLAY_TOP`);
    assert.ok(level.target.y + level.target.height + swing <= PLAY_BOTTOM, `${where}: target swings below PLAY_BOTTOM`);
    assert.ok(level.target.x + level.target.width <= level.worldWidth, `${where}: target runs past worldWidth`);
    assert.ok(level.gates.length >= 4, `${where}: only ${level.gates.length} rings`);

    // 3. Not a repeat of a neighbour.
    const signature = level.gates.map((gate) => `${gate.x}:${gate.openingY}`).join(",");
    const twin = seen.get(signature);
    assert.equal(twin, undefined, `${where} has the identical ring layout to course ${twin}`);
    seen.set(signature, depth);

    // 4. Mechanics show up, and the ricochet furniture is actually used.
    ringTotal += level.gates.length;
    if (level.obstacles.some((o) => o.kind === "bumper")) coverage.bumper += 1;
    if (level.obstacles.some((o) => o.kind === "plate")) coverage.plate += 1;
    if (level.obstacles.some((o) => o.kind === "obsidian")) coverage.obsidian += 1;
    if (level.gates.some((g) => g.drift && g.drift.ampX > 0)) coverage.orbit += 1;
    if (level.gates.some((g) => g.aperture)) coverage.iris += 1;
    if (level.gates.some((g) => g.kind === "crown")) coverage.crown += 1;
    if (level.target.drift) coverage.movingTarget += 1;
    if (level.requiredBounces > 0) coverage.bounceUsed += 1;

    // 5. Obsidian never demands more than the arrow the depth assumes.
    for (const obstacle of level.obstacles) {
        if (obstacle.kind !== "obsidian") continue;
        assert.ok(
            obstacle.hardness <= arrow.might,
            `${where}: obsidian grade ${obstacle.hardness} but the depth's arrow only has might ${arrow.might}`,
        );
    }

    // 6. Rings and target must be reachable in the preview the player sees.
    const preview = sampleTrajectory(level, level.initialAimAngle, 25, arrow, level.initialPower);
    assert.ok(preview.points.length <= 25, `${where}: aim preview returned more dots than requested`);
    assert.ok(
        preview.certainUntil <= preview.points.length,
        `${where}: preview certainty index runs past the dots it describes`,
    );
    // A windy course must hand the drift to the player: once the previewed arc
    // actually reaches a gust, certainty has to stop before the last dot or the
    // preview is predicting the wind again and the gust is a no-op. An aim that
    // falls short of every band legitimately has nothing to truncate.
    const firstGustX = Math.min(...(level.windZones ?? []).map((zone) => zone.x), Number.POSITIVE_INFINITY);
    const previewReach = preview.points[preview.points.length - 1]?.x ?? 0;
    if (Number.isFinite(firstGustX) && previewReach > firstGustX + 40) {
        assert.ok(
            preview.certainUntil < preview.points.length,
            `${where}: the aim preview predicts straight through a wind band, which makes the gust a no-op`,
        );
    }
}

assert.equal(
    generatorStats.fallbacks,
    0,
    `the generator gave up and served an easier course ${generatorStats.fallbacks} time(s) — a depth in the ` +
        `ladder cannot produce a winnable layout`,
);

// ── The ladder must actually teach something new as it goes ────────────────
const spanAfter = (from: number) => MAX_DEPTH - from + 1;
assert.ok(
    coverage.bumper >= spanAfter(FEATURE_DEPTH.bumper) * 0.6,
    `bumpers appear on only ${coverage.bumper} courses past depth ${FEATURE_DEPTH.bumper}`,
);
assert.ok(
    coverage.obsidian >= spanAfter(FEATURE_DEPTH.obsidian) * 0.6,
    `obsidian appears on only ${coverage.obsidian} courses past depth ${FEATURE_DEPTH.obsidian}`,
);
assert.ok(coverage.orbit >= 12, `orbiting rings appear on only ${coverage.orbit} courses`);
assert.ok(coverage.iris >= 12, `iris rings appear on only ${coverage.iris} courses`);
assert.ok(coverage.crown >= 8, `crown rings appear on only ${coverage.crown} courses`);
assert.ok(coverage.plate >= 8, `ricochet plates appear on only ${coverage.plate} courses`);
assert.ok(
    coverage.bounceUsed >= 20,
    `only ${coverage.bounceUsed} courses need a ricochet to clear — the bumpers are decoration`,
);

// ── The opening course has to be gentle ────────────────────────────────────
{
    const level = generateLevel(1, getArrow("reed"));
    const opening = fly(level, level.initialAimAngle, clampPower(level.initialPower), 60, getArrow("reed"));
    assert.ok(level.gates.length <= 6, `course 1 has ${level.gates.length} rings — too busy for a first shot`);
    assert.equal(level.obstacles.length, 0, "course 1 must have no obstacles at all");
    assert.equal(starRating(opening, level) >= 1, true);
    assert.equal(isClearPath(opening, level) || opening.outcome !== "victory", true);
}

// ── Arrow stats must actually ladder ──────────────────────────────────────
{
    const byCost = [...ARROWS].sort((a, b) => a.cost - b.cost);
    assert.equal(byCost[0]!.id, "reed", "the free shaft must be the weakest");
    assert.ok(
        Math.max(...ARROWS.map((a) => a.might)) >= requiredMightAt(MAX_DEPTH),
        `no shaft can survive depth ${MAX_DEPTH}`,
    );
    for (const arrow of ARROWS) {
        assert.ok(arrow.might >= 1 && arrow.bounces >= 1, `${arrow.id} has an unusable stat line`);
    }
}

// ── Iris rings must never close past their own opening ────────────────────
for (let depth = FEATURE_DEPTH.iris; depth <= FEATURE_DEPTH.iris + 30; depth += 1) {
    const level = generateLevel(depth, arrowFor(depth));
    for (const gate of level.gates) {
        if (!gate.aperture) continue;
        for (let time = 0; time < gate.aperture.period; time += gate.aperture.period / 16) {
            const window = gateWindowAt(gate, time);
            assert.ok(window.height > 40, `course ${depth} ${gate.id}: iris closes to ${window.height.toFixed(1)}px`);
            assert.ok(
                window.height <= gate.openingHeight + 0.01,
                `course ${depth} ${gate.id}: iris opens wider than its authored height, breaking the layout proof`,
            );
        }
    }
}

console.log(
    JSON.stringify(
        {
            depthsProven: MAX_DEPTH,
            generator: generatorStats,
            averageRings: Number((ringTotal / MAX_DEPTH).toFixed(2)),
            coverage,
            steering: SHOT_CONFIG.maximumSteeringAcceleration,
        },
        null,
        2,
    ),
);
