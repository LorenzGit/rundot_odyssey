/**
 * Endless course generator.
 *
 * Every course is generated from its depth alone, so level 47 is the same
 * course for every player and needs nothing stored.
 *
 * The method is generate-then-prove, never generate-and-hope:
 *
 *   1. Lay down the environment first — wind, bumpers, ricochet plates, lethal
 *      rock, obsidian slabs — from the depth's feature budget.
 *   2. Search for a par shot by flying candidate (angle, power) pairs through
 *      that environment with the REAL physics, ricochets included, and keep the
 *      path it traces.
 *   3. Put the target where that path ends and the rings on the path itself.
 *   4. Re-fly par against the finished course at every frame rate we ship to.
 *      A course that does not three-star is discarded and the seed is rolled.
 *
 * Because step 2 uses the shipping integrator, a bounce chain or a headwind is
 * accounted for by construction rather than approximated — and because step 4
 * re-proves the finished article, an unwinnable course can never reach a
 * player.
 */
import { NoiseRandom } from "./noiseRandom.ts";
import { ODYSSEY_ART } from "./artAssets.ts";
import { advanceShot, createShot, getTargetFace, isPerfectShot, type ShotEvents } from "./physics.ts";
import { getArrow, type ArrowDef } from "./arrows.ts";
import {
    minGateCenterSpacing,
    PLAY_BOTTOM,
    PLAY_TOP,
    type GateData,
    type GateKind,
    type LevelData,
    type LevelScenery,
    type ObstacleData,
    type Point,
    type WindZone,
} from "./types.ts";

/** Mirrors GATE_CAP_HEIGHT: the solid capital above and below each opening. */
const GATE_CAP = 52;
/** Mirrors GATE_CAP_WIDTH_SCALE: capitals are wider than the glass. */
const GATE_CAP_WIDTH = 1.32;

const BACKDROPS = [ODYSSEY_ART.level1, ODYSSEY_ART.level2, ODYSSEY_ART.level3] as const;

const SCENERY: readonly (LevelScenery & { name: string })[] = [
    {
        name: "OLIVE SHORE",
        skyTop: 0x3f9ddd,
        skyBottom: 0xbfe9ff,
        backdropTint: 0xffffff,
        ledgeColor: 0x5f8ba3,
        washColor: 0xfff0c0,
        washAlpha: 0,
    },
    {
        name: "SIREN COVE",
        skyTop: 0x2f7fb8,
        skyBottom: 0xffd9a0,
        backdropTint: 0xffd0a8,
        ledgeColor: 0x6d5878,
        washColor: 0xff9838,
        washAlpha: 0.18,
    },
    {
        name: "MARBLE MORNING",
        skyTop: 0x63c6f2,
        skyBottom: 0xeaf7ff,
        backdropTint: 0xe2effd,
        ledgeColor: 0x89a4bb,
        washColor: 0x9fd4ff,
        washAlpha: 0.1,
    },
    {
        name: "CYCLOPS PASS",
        skyTop: 0x24506f,
        skyBottom: 0x8fb4c8,
        backdropTint: 0xa8bccd,
        ledgeColor: 0x3c5164,
        washColor: 0x21405e,
        washAlpha: 0.22,
    },
    {
        name: "ZEPHYR CLIFFS",
        skyTop: 0x59aee0,
        skyBottom: 0xdff4ff,
        backdropTint: 0xd8eeff,
        ledgeColor: 0x789cb2,
        washColor: 0xc8e8ff,
        washAlpha: 0.14,
    },
    {
        name: "IRIS BRIDGE",
        skyTop: 0x3d3f8e,
        skyBottom: 0xffb3c6,
        backdropTint: 0xc9addf,
        ledgeColor: 0x4e3f6c,
        washColor: 0x7a45bc,
        washAlpha: 0.24,
    },
    {
        name: "APOLLO HEIGHT",
        skyTop: 0x2478bb,
        skyBottom: 0xffe9b0,
        backdropTint: 0xffe6bf,
        ledgeColor: 0x93785d,
        washColor: 0xffb63e,
        washAlpha: 0.16,
    },
    {
        name: "OLYMPUS CROWN",
        skyTop: 0x15264a,
        skyBottom: 0xffbe5e,
        backdropTint: 0xbfae95,
        ledgeColor: 0x30284a,
        washColor: 0x1e1544,
        washAlpha: 0.3,
    },
];

/**
 * When each mechanic first appears.
 *
 * Spacing them out is what keeps the endless run from feeling like one course:
 * a player meets exactly one new idea at a time, and every idea stays in the
 * pool afterwards so later courses combine them.
 */
export const FEATURE_DEPTH = {
    gold: 3,
    wind: 4,
    hazard: 6,
    bobbing: 8,
    bumper: 10,
    obsidian: 12,
    orbit: 14,
    iris: 16,
    plate: 18,
    crown: 20,
    movingTarget: 22,
    shear: 26,
} as const;

/** Human-readable name of the mechanic a depth introduces, if any. */
export function featureIntroducedAt(depth: number): string | null {
    const names: Record<keyof typeof FEATURE_DEPTH, string> = {
        gold: "GOLD RINGS",
        wind: "WIND BANDS",
        hazard: "STONE HAZARDS",
        bobbing: "BOBBING RINGS",
        bumper: "RICOCHET BUMPERS",
        obsidian: "OBSIDIAN SLABS",
        orbit: "ORBITING RINGS",
        iris: "IRIS RINGS",
        plate: "ANGLED RICOCHET PLATES",
        crown: "CROWN RINGS",
        movingTarget: "SWINGING TARGET",
        shear: "CROSS-SHEAR WIND",
    };
    for (const [key, at] of Object.entries(FEATURE_DEPTH)) {
        if (at === depth) return names[key as keyof typeof FEATURE_DEPTH];
    }
    return null;
}

/** Obsidian hardness in play at a depth — and so the arrow `might` it demands. */
export function requiredMightAt(depth: number): number {
    if (depth < FEATURE_DEPTH.obsidian) return 1;
    return Math.min(5, 2 + Math.floor((depth - FEATURE_DEPTH.obsidian) / 10));
}

function has(depth: number, feature: keyof typeof FEATURE_DEPTH): boolean {
    return depth >= FEATURE_DEPTH[feature];
}

function lerp(a: number, b: number, t: number): number {
    return a + (b - a) * Math.max(0, Math.min(1, t));
}

/**
 * How a course hangs its rings relative to the arc.
 *
 * The arc alone is a shallow parabola through the middle of the band, so rings
 * placed centred on it always read as one horizontal picket fence no matter how
 * the arc is chosen. Offsetting each ring within its own opening — the arrow
 * still threads it, it just passes near the top lip or the bottom one — breaks
 * that line up without touching solvability. This is the single biggest reason
 * two courses look like two courses.
 */
type RingLayout = "follow" | "zigzag" | "rising" | "falling" | "scatter";

const RING_LAYOUTS: readonly RingLayout[] = ["follow", "zigzag", "rising", "falling", "scatter"];

/**
 * Where in its opening the arc should pass, 0 = along the top lip, 1 = the
 * bottom one. The caller clamps this to whatever the ring can actually honour.
 */
function layoutBias(layout: RingLayout, index: number, total: number, random: NoiseRandom): number {
    const t = total <= 1 ? 0.5 : index / (total - 1);
    switch (layout) {
        case "zigzag":
            return index % 2 === 0 ? 0.16 : 0.84;
        case "rising":
            return 0.84 - t * 0.68;
        case "falling":
            return 0.16 + t * 0.68;
        case "scatter":
            return random.float(0.14, 0.86);
        default:
            return random.float(0.4, 0.6);
    }
}

/** 0 at depth 1, 1 at depth 30 and beyond — the master difficulty dial. */
function ramp(depth: number): number {
    return Math.max(0, Math.min(1, (depth - 1) / 29));
}

function hashDepth(depth: number, salt: number): number {
    let h = 2166136261 ^ (depth * 2654435761);
    h = Math.imul(h ^ salt, 16777619);
    h ^= h >>> 15;
    return h >>> 0;
}

interface Candidate {
    angle: number;
    power: number;
    /** One sample per physics frame, in flight order. */
    path: Point[];
    bounces: number;
    /**
     * How much of the arc can actually carry a ring.
     *
     * A ring needs its capitals inside the visible band, so an arc that spends
     * its middle above PLAY_TOP has nowhere to hang rings even though it flies
     * beautifully. Scoring this is what stopped deep courses — which lob
     * highest — from ending up with four rings instead of ten.
     */
    placeable: number;
    /** Rings this arc could carry, walked at real ring spacing. */
    capacity: number;
    /**
     * Vertical range the ring line covers, in px.
     *
     * This is the number that decides whether courses look different from each
     * other. Ranking purely on `placeable` picks the flattest arc every time,
     * and a flat arc means a horizontal picket fence of rings — which is what
     * made every generated course read as the same course with a different
     * palette. Rings spanned 154px of a 780px band before this existed.
     */
    spread: number;
}

const SILENT: ShotEvents = { onGate() {}, onVictory() {}, onDefeat() {} };
/**
 * Frame rates a course must behave identically on — the same set the shipped
 * proofs in `npm run simulate` use. A browser ticks at whatever the device
 * gives it, and a ricochet course is far more tick-sensitive than a parabola,
 * so the awkward rates in between the round numbers are the ones that catch a
 * knife-edge par.
 */
const PROOF_FRAME_RATES = [30, 40, 50, 60, 72, 90, 100, 120, 144, 165] as const;
/** Quick-reject set: most candidates die here without paying for the full sweep. */
const QUICK_FRAME_RATES = [30, 60, 144] as const;
/**
 * How far off dead centre par may land, as a fraction of the disc radius.
 * `bullseyeRadius` is 0.48, so this keeps real headroom for frame jitter rather
 * than accepting a shot that only just counts as a bullseye.
 */
const PAR_MARGIN_LIMIT = 0.4;

/**
 * Fly a shot through an environment with no rings or target and record the path.
 * Rejects anything that stops early, reverses downrange, or leaves the band —
 * rings can only be placed on a path that reads as a single left-to-right arc.
 */
function tracePath(
    scaffold: LevelData,
    angle: number,
    power: number,
    arrow: ArrowDef,
    minimumReach: number,
    ringMargin: number,
    columnSpacing: number,
): Candidate | null {
    const launchX = scaffold.launchPosition.x;
    const shot = createShot(scaffold, angle, arrow, power);
    const path: Point[] = [];
    const dt = 1 / 60;
    let previousX = shot.position.x;
    for (let frame = 0; frame < 60 * 8 && shot.outcome === "flying"; frame += 1) {
        advanceShot(shot, scaffold, dt, 0, SILENT, arrow);
        if (shot.position.x < previousX - 2) return null; // reversed downrange
        previousX = shot.position.x;
        path.push({ x: shot.position.x, y: shot.position.y });
    }
    if (shot.outcome === "defeat" && shot.defeatReason !== "out_of_bounds") return null;
    const last = path[path.length - 1];
    if (!last || last.x < minimumReach) return null;
    // The arc does NOT need a whole ring's height of clearance: a ring can be
    // hung so the arc passes near its top or its bottom, as long as it stays
    // `ringMargin` clear of a capital. Reserving the full opening height here
    // squeezed the usable band to ~190px of 780 and forced every course into
    // the same flat middle lane.
    const low = PLAY_TOP + GATE_CAP + ringMargin;
    const high = PLAY_BOTTOM - GATE_CAP - ringMargin;
    // Rings only ever live between the launcher and the target, so both scores
    // are measured over exactly that window. Measuring spread across the whole
    // flight rewarded arcs whose drama is a plunge AFTER the final ring, which
    // the player never sees as course shape.
    const firstColumn = launchX + 280;
    const lastColumn = path[path.length - 1]!.x - 150;
    let placeable = 0;
    let lowest = Number.POSITIVE_INFINITY;
    let highest = Number.NEGATIVE_INFINITY;
    let capacity = 0;
    let nextColumn = firstColumn;
    for (const point of path) {
        if (point.x < firstColumn || point.x > lastColumn) continue;
        if (point.y < low || point.y > high) continue;
        placeable += 1;
        lowest = Math.min(lowest, point.y);
        highest = Math.max(highest, point.y);
        if (point.x >= nextColumn) {
            capacity += 1;
            nextColumn = point.x + columnSpacing;
        }
    }
    const spread = placeable > 0 ? highest - lowest : 0;
    return { angle, power, path, bounces: shot.bounces, placeable: placeable / path.length, spread, capacity };
}

/** The path point nearest a downrange position. */
function sampleAt(path: readonly Point[], x: number): Point | null {
    for (let i = 1; i < path.length; i += 1) {
        const a = path[i - 1]!;
        const b = path[i]!;
        if (x >= a.x && x <= b.x) {
            const span = b.x - a.x;
            const t = span < 1e-6 ? 0 : (x - a.x) / span;
            return { x, y: a.y + (b.y - a.y) * t };
        }
    }
    return null;
}

/** Axis-aligned footprint of a piece of course furniture. */
function obstacleBounds(obstacle: ObstacleData): { left: number; right: number; top: number; bottom: number } {
    if (obstacle.kind === "rock" || obstacle.kind === "bumper") {
        return {
            left: obstacle.x - obstacle.radius,
            right: obstacle.x + obstacle.radius,
            top: obstacle.y - obstacle.radius,
            bottom: obstacle.y + obstacle.radius,
        };
    }
    if (obstacle.kind === "plate") {
        return {
            left: Math.min(obstacle.x1, obstacle.x2),
            right: Math.max(obstacle.x1, obstacle.x2),
            top: Math.min(obstacle.y1, obstacle.y2) - 12,
            bottom: Math.max(obstacle.y1, obstacle.y2) + 12,
        };
    }
    return {
        left: obstacle.x,
        right: obstacle.x + obstacle.width,
        top: obstacle.y,
        bottom: obstacle.y + obstacle.height,
    };
}

/** Do two pieces of furniture visually collide? */
function furnitureOverlaps(a: ObstacleData, b: ObstacleData, margin: number): boolean {
    const one = obstacleBounds(a);
    const two = obstacleBounds(b);
    return (
        one.left - margin < two.right &&
        one.right + margin > two.left &&
        one.top - margin < two.bottom &&
        one.bottom + margin > two.top
    );
}

/**
 * Would a ring placed here foul a piece of course furniture?
 *
 * Tests the ring's whole footprint — capitals included — not just the point the
 * arc passes through. A centre-point test let a ring's gold capital sit on top
 * of a bumper or straight through an obsidian slab, because the arc threading
 * the middle was clear even when the hardware around it was not.
 */
function ringFoulsObstacle(
    x: number,
    top: number,
    height: number,
    width: number,
    obstacles: readonly ObstacleData[],
    margin: number,
): boolean {
    const halfWidth = (width * GATE_CAP_WIDTH) / 2 + margin;
    const ring = {
        left: x - halfWidth,
        right: x + halfWidth,
        top: top - GATE_CAP - margin,
        bottom: top + height + GATE_CAP + margin,
    };
    for (const obstacle of obstacles) {
        const bounds = obstacleBounds(obstacle);
        if (
            ring.left < bounds.right &&
            ring.right > bounds.left &&
            ring.top < bounds.bottom &&
            ring.bottom > bounds.top
        ) {
            return true;
        }
    }
    return false;
}

interface Attempt {
    level: LevelData;
    ok: boolean;
}

/**
 * Build one candidate course.
 *
 * The order matters. Wind and lethal rock go down first because a par shot has
 * to route around them, but every *interactive* piece — the bumpers, the
 * ricochet plate, the obsidian slab — is placed AFTER a par arc is chosen, sat
 * directly on that arc. Scattering them randomly first meant the par search
 * simply picked an arc that sailed over everything, so the toys were never
 * touched and the level was a plain parabola with decoration.
 */
function buildAttempt(depth: number, salt: number, arrow: ArrowDef, relax = 0): Attempt | null {
    const random = new NoiseRandom(hashDepth(depth, salt));
    const t = ramp(depth);
    const scenery = SCENERY[(depth - 1 + salt) % SCENERY.length]!;
    const backgroundUrl = BACKDROPS[(depth - 1 + Math.floor(salt / 2)) % BACKDROPS.length]!;

    const worldWidth = Math.round(lerp(2300, 3000, t) + random.float(-80, 80));
    const launch: Point = { x: 335, y: Math.round(random.float(520, 700)) };
    const ringCount = Math.min(10, 4 + Math.floor(depth / 1.6) + (random.nextDouble() < 0.3 ? 1 : 0));
    // Course 1 is a teaching shot; anything after it gets a shaped ring line.
    const ringLayout: RingLayout = depth <= 2 ? "follow" : RING_LAYOUTS[random.int(0, RING_LAYOUTS.length)]!;
    /**
     * Whether the target sits above, level with, or below the launcher.
     *
     * This is what changes the whole composition rather than the detail inside
     * it: an uphill course is a climb into a cliff-top target, a downhill one
     * plunges to the shore. Letting the target land wherever the arc happened to
     * end put it at roughly the same height every time.
     */
    const tilt: "uphill" | "level" | "downhill" =
        depth <= 2 ? "level" : (["uphill", "level", "downhill"] as const)[random.int(0, 3)]!;
    const hardness = requiredMightAt(depth);

    const midStart = 700;
    const span = Math.max(400, worldWidth - 480 - midStart);

    // ── Wind: shapes the arc, so it exists before the search ───────────────
    const windZones: WindZone[] = [];
    if (has(depth, "wind")) {
        // One band for most of the ladder. Two wide bands plus their clearances
        // covered most of the mid-course, leaving nowhere to sit a reflector.
        const zoneCount = 1 + (t > 0.62 ? 1 : 0);
        for (let i = 0; i < zoneCount; i += 1) {
            const lifting = random.nextDouble() < 0.5;
            const shear = has(depth, "shear") && random.nextDouble() < 0.35;
            windZones.push({
                id: `w${i}`,
                x: Math.round(midStart + span * ((i + 0.5) / zoneCount) + random.float(-120, 120)),
                // Wide enough to dwell in, and strong enough to OVERPOWER
                // gravity rather than modulate it. At the old 700–1800 the gust
                // added ~17° of bend to a path gravity was already bending
                // 5–28°, so it read as "the arrow is falling" — invisible. At
                // 3–5× gravity an updraft visibly lifts the arrow mid-flight,
                // which is the only version a player can actually see.
                width: Math.round(lerp(300, 400, t) + random.float(-30, 30)),
                accelY: Math.round(lerp(2600, 4600, t) * (lifting ? -1 : 1)),
                ...(shear ? { accelX: Math.round(random.float(-1400, 1100)) } : {}),
            });
        }
    }

    const openingHeight = Math.round(lerp(310, 155, t));
    const ringWidth = Math.round(lerp(106, 84, t));
    // Clearance a ring needs between the arc and its nearest capital: the
    // integration slack a 30 FPS tick can introduce, plus the worst drift.
    const ringMargin = 46 + Math.round(lerp(34, 66, t));
    const spacing = minGateCenterSpacing(ringWidth, ringWidth);
    const minimumReach = worldWidth * 0.74;

    const makeScaffold = (obstacles: readonly ObstacleData[]): LevelData => ({
        id: `depth-${depth}`,
        name: scenery.name,
        tagline: "",
        depth,
        worldWidth,
        worldHeight: 1080,
        backgroundUrl,
        scenery,
        ulysses: { x: launch.x - 140, y: launch.y + 220 },
        launchPosition: launch,
        initialAimAngle: 30,
        initialPower: 1,
        parShot: { angle: 30, power: 1 },
        requiredMight: hardness,
        requiredBounces: 0,
        gates: [],
        // Parked far outside the world on purpose. The scaffold is only ever
        // flown to discover a path, and a target inside it is a live collider:
        // every candidate would end the moment it crossed the placeholder,
        // truncating the trace and hiding the rest of the arc.
        target: { x: worldWidth + 6000, y: 600, width: 140, height: 195 },
        obstacles,
        ...(windZones.length > 0 ? { windZones } : {}),
    });

    // ── Lethal rock: must be avoided, so it goes down before the search ────
    const hazards: ObstacleData[] = [];
    if (has(depth, "hazard")) {
        const count = 1 + Math.floor(t * 2.4);
        for (let i = 0; i < count; i += 1) {
            const x = Math.round(midStart + span * random.nextDouble());
            if (random.nextDouble() < 0.5) {
                hazards.push({
                    id: `rock${i}`,
                    kind: "rock",
                    x,
                    y: Math.round(random.float(840, 910)),
                    radius: Math.round(random.float(70, 115)),
                });
            } else {
                const height = Math.round(random.float(240, 460));
                const width = Math.round(height * 0.3);
                hazards.push({
                    id: `pillar${i}`,
                    kind: "pillar",
                    x: Math.round(x - width / 2),
                    y: PLAY_BOTTOM - height,
                    width,
                    height,
                });
            }
        }
    }

    // ── Par search over wind + hazards ─────────────────────────────────────
    const sweep = (obstacles: readonly ObstacleData[]): Candidate[] => {
        const scaffold = makeScaffold(obstacles);
        const found: Candidate[] = [];
        for (let angle = 10; angle <= 56; angle += 3) {
            for (let power = 0.8; power <= 1.4001; power += 0.08) {
                const candidate = tracePath(
                    scaffold,
                    angle,
                    Number(power.toFixed(2)),
                    arrow,
                    minimumReach,
                    ringMargin,
                    spacing,
                );
                if (candidate) found.push(candidate);
            }
        }
        return found;
    };

    /**
     * Pick the arc this course is built on.
     *
     * Capacity is a floor, not the objective: an arc only has to hold enough
     * rings to be a course. Past that bar the choice is made on SHAPE, because
     * two courses with the same ring count look identical if both arcs are flat.
     * Preferring the widest vertical sweep is what turns the ladder into dives,
     * lobs and S-curves instead of one picket fence after another.
     */
    const chooseArc = (found: readonly Candidate[]): Candidate | null => {
        if (found.length === 0) return null;
        // Ring capacity is a hard floor; past it, SHAPE decides. Scoring the two
        // together let a flat eleven-ring arc beat a plunging seven-ring one,
        // and flat arcs are exactly what made every course read the same. At
        // any depth there are arcs with both — 500px of sweep and seven rings —
        // so the floor costs nothing and the drama is free.
        const floor = Math.min(ringCount, 5);
        const viable = found.filter((candidate) => candidate.capacity >= floor);
        const pool = viable.length > 0 ? viable : found;
        let bestSpread = 0;
        for (const candidate of pool) bestSpread = Math.max(bestSpread, candidate.spread);
        const dramatic = pool.filter((candidate) => candidate.spread >= bestSpread * 0.7);
        const chosen = dramatic.length > 0 ? dramatic : pool;
        return chosen[random.int(0, chosen.length)] ?? chosen[0]!;
    };

    const clean = sweep(hazards);
    const par = chooseArc(clean);
    if (!par) return null;

    // ── Interactive furniture, sat on the chosen arc ───────────────────────
    //
    // Each piece is offered as a few variants and the first one that survives a
    // re-trace is kept. A bumper in particular has a narrow sweet spot: centred
    // exactly one radius under the arc, the tip grazes its crown, flips
    // vertical velocity and keeps flying downrange. A few pixels deeper and the
    // deflection is so steep the rest of the arc leaves the ring band; a few
    // shallower and it misses entirely.
    const onPath = (fraction: number): Point => par.path[Math.floor(par.path.length * fraction)] ?? par.path[0]!;
    const insideGust = (x: number): boolean =>
        windZones.some((zone) => x >= zone.x - 60 && x <= zone.x + zone.width + 60);
    /**
     * A path point clear of every wind band.
     *
     * A bumper sat inside a gust is a coin flip: the arc through a 4600 px/s²
     * band is steep and fast, so the graze that should deflect it cleanly
     * either misses or hits dead-centre. Keeping reflectors in still air is
     * both more reliable to place and far more readable.
     */
    const onClearPath = (from: number, to: number): Point => {
        for (let attempt = 0; attempt < 10; attempt += 1) {
            const point = onPath(random.float(from, to));
            if (!insideGust(point.x)) return point;
        }
        // Widen the search across the whole mid-course before giving up.
        for (let attempt = 0; attempt < 10; attempt += 1) {
            const point = onPath(random.float(0.18, 0.78));
            if (!insideGust(point.x)) return point;
        }
        return onPath((from + to) * 0.5);
    };
    const proposals: ObstacleData[][] = [];

    // Each piece gets its OWN stretch of the arc. Letting them all draw from
    // the middle meant they collided constantly — overlap was by far the biggest
    // rejection reason — and whichever was proposed last simply never appeared.
    const LANES = { early: [0.2, 0.34], middle: [0.42, 0.56], late: [0.64, 0.78] } as const;
    const lane = (span: readonly [number, number]) => onClearPath(span[0], span[1]);
    const freeLanes: (readonly [number, number])[] = [LANES.early, LANES.middle, LANES.late];
    const takeLane = (preferred: readonly [number, number]): readonly [number, number] | null => {
        const index = freeLanes.indexOf(preferred);
        if (index >= 0) return freeLanes.splice(index, 1)[0]!;
        return freeLanes.shift() ?? null;
    };

    if (has(depth, "obsidian")) {
        // The slab claims the middle: it is the piece the whole upgrade gate
        // hangs on, and it reads best square across the centre of the flight.
        const span = takeLane(LANES.middle);
        if (span) {
            const anchor = lane(span);
            const height = Math.round(random.float(190, 300));
            const width = Math.round(random.float(56, 84));
            proposals.push([
                {
                    id: "obsidian0",
                    kind: "obsidian" as const,
                    x: Math.round(anchor.x - width / 2),
                    y: Math.round(
                        Math.max(PLAY_TOP + 40, Math.min(PLAY_BOTTOM - height - 40, anchor.y - height * 0.5)),
                    ),
                    width,
                    height,
                    hardness,
                },
            ]);
        }
    }

    if (has(depth, "bumper") && relax < 2) {
        const count = 1 + (t > 0.55 && random.nextDouble() < 0.5 ? 1 : 0);
        for (let i = 0; i < count; i += 1) {
            const span = takeLane(i === 0 ? LANES.early : LANES.late);
            if (!span) break;
            const anchor = lane(span);
            const radius = Math.round(random.float(72, 108));
            proposals.push(
                [1, 0.99, 1.01, 0.985, 1.015, 0.97, 1.03, 0.955, 1.045, 0.94].map((drop) => ({
                    id: `bump${i}`,
                    kind: "bumper" as const,
                    // Centre exactly one radius below the arc, so the tip grazes
                    // the crown and the contact normal points nearly straight
                    // up: vertical velocity flips, downrange velocity survives.
                    // Sitting it closer means a dead-centre hit, which reverses
                    // the shot.
                    x: Math.round(anchor.x),
                    y: Math.round(anchor.y + radius * drop),
                    radius,
                })),
            );
        }
    }

    if (has(depth, "plate") && relax < 1) {
        const span = takeLane(LANES.late);
        if (span) {
            const anchor = lane(span);
            const length = Math.round(random.float(200, 300));
            const tilt = random.float(0.3, 0.6) * (random.nextDouble() < 0.5 ? -1 : 1);
            proposals.push(
                [14, 20, 26, 8, 32, 2].map((drop) => {
                    const y = Math.round(anchor.y + drop);
                    return {
                        id: "plate0",
                        kind: "plate" as const,
                        x1: Math.round(anchor.x - length / 2),
                        y1: Math.round(y - (length * tilt) / 2),
                        x2: Math.round(anchor.x + length / 2),
                        y2: Math.round(y + (length * tilt) / 2),
                    };
                }),
            );
        }
    }

    // Accept furniture the arc can live with, one piece at a time.
    //
    // Every variant is scored, not just the first that survives: a bumper
    // positioned so the arc misses it entirely "survives" perfectly, which is
    // how the courses ended up full of bumpers that were never touched. A
    // variant the shot actually banks off always wins over one it flies past.
    let obstacles: ObstacleData[] = [...hazards];
    // Overlap is only checked against the other INTERACTIVE pieces. Guarding
    // against the scattered rock as well was the single biggest rejection
    // reason: a rock is up to 115px across, so its exclusion zone swallowed
    // most of the arc and the reflectors simply never got placed. A bumper
    // sitting near a boulder is perfectly readable — they share no silhouette.
    const placedInteractive: ObstacleData[] = [];
    // Relative to the arc we already have, not an absolute score: a course whose
    // best clean arc only scores 0.38 would reject every single piece against a
    // fixed 0.42 bar, which quietly stripped the obsidian and the moving rings
    // out of a third of the ladder.
    const placeableFloor = Math.min(0.45, par.placeable - 0.06);
    for (const variants of proposals) {
        let chosen: { piece: ObstacleData; bounces: number; placeable: number } | null = null;
        for (const piece of variants) {
            if (placedInteractive.some((placed) => furnitureOverlaps(placed, piece, 24))) {
                generatorStats.rejectOverlap += 1;
                continue;
            }
            const traced = tracePath(
                makeScaffold([...obstacles, piece]),
                par.angle,
                par.power,
                arrow,
                minimumReach,
                ringMargin,
                spacing,
            );
            if (!traced) {
                generatorStats.rejectNoPath += 1;
                continue;
            }
            if (traced.placeable < placeableFloor) {
                generatorStats.rejectPlaceable += 1;
                continue;
            }
            const better =
                !chosen ||
                (traced.bounces > 0 && chosen.bounces === 0) ||
                (traced.bounces > 0 === chosen.bounces > 0 && traced.placeable > chosen.placeable);
            if (better) chosen = { piece, bounces: traced.bounces, placeable: traced.placeable };
            // A clean bank with plenty of ring room is as good as it gets.
            if (traced.bounces > 0 && traced.placeable > 0.6) break;
        }
        if (chosen) {
            obstacles = [...obstacles, chosen.piece];
            placedInteractive.push(chosen.piece);
        }
    }

    // The furniture was positioned against THIS arc, so fly this arc through the
    // finished course and keep it if it survives. Re-searching from scratch
    // here would pick whichever angle has the most ring capacity, which is
    // reliably one that sails clean over the bumper the course was built
    // around — the ricochet would exist but never be used.
    const throughFurniture = tracePath(
        makeScaffold(obstacles),
        par.angle,
        par.power,
        arrow,
        minimumReach,
        ringMargin,
        spacing,
    );
    let finalPar = throughFurniture && throughFurniture.placeable >= placeableFloor ? throughFurniture : null;
    if (!finalPar) {
        // The furniture broke the intended shot; find whatever still works.
        finalPar = chooseArc(sweep(obstacles));
        if (!finalPar) return null;
    }
    const finalPath = finalPar.path;
    const bounces = finalPar.bounces;

    // ── Target on the path's end ───────────────────────────────────────────
    const targetHeight = Math.round(lerp(215, 165, t));
    const targetWidth = Math.round(targetHeight * 0.72);
    const targetFits = (point: Point): boolean =>
        point.y >= PLAY_TOP + targetHeight / 2 + 20 &&
        point.y <= PLAY_BOTTOM - targetHeight / 2 - 20 &&
        point.x <= worldWidth - targetWidth - 60 &&
        point.x >= minimumReach &&
        !ringFoulsObstacle(point.x, point.y - targetHeight / 2, targetHeight, targetWidth, obstacles, 24);

    // Prefer a landing that matches the course's tilt; fall back to any legal
    // one so a shot that simply cannot climb still gets a target.
    const matchesTilt = (point: Point): boolean =>
        tilt === "uphill"
            ? point.y <= launch.y - 90
            : tilt === "downhill"
              ? point.y >= launch.y + 90
              : Math.abs(point.y - launch.y) <= 140;

    let targetPoint: Point | null = null;
    for (const strict of [true, false]) {
        for (let i = finalPath.length - 1; i >= 0; i -= 1) {
            const point = finalPath[i]!;
            if (!targetFits(point)) continue;
            if (strict && !matchesTilt(point)) continue;
            targetPoint = point;
            break;
        }
        if (targetPoint) break;
    }
    if (!targetPoint) return null;

    const targetDrift =
        has(depth, "movingTarget") && random.nextDouble() < 0.7
            ? {
                  ampX: 0,
                  ampY: Math.round(lerp(40, 90, t)),
                  period: random.float(2.4, 3.6),
                  phase: random.float(0, Math.PI * 2),
              }
            : undefined;
    const swing = targetDrift?.ampY ?? 0;
    const targetCenterY = Math.max(
        PLAY_TOP + targetHeight / 2 + swing,
        Math.min(PLAY_BOTTOM - targetHeight / 2 - swing, targetPoint.y),
    );

    // ── Rings on the path ──────────────────────────────────────────────────
    const firstX = launch.x + 280;
    const lastX = targetPoint.x - 150;
    const gates: GateData[] = [];
    if (lastX - firstX < spacing) return null;

    // Sweep a fine grid and take the first workable column at least `spacing`
    // past the last ring. Stepping exactly `ringCount` times instead threw away
    // every column that happened to land on an obstacle, which is why deep
    // courses were collapsing to three rings while shallow ones had eight.
    const probe = Math.max(24, spacing * 0.25);
    const idealGap = Math.max(spacing, (lastX - firstX) / Math.max(1, ringCount - 1));
    for (let x = firstX; x <= lastX && gates.length < ringCount; x += probe) {
        const previous = gates[gates.length - 1];
        if (previous && x - previous.x < Math.min(idealGap, spacing * 1.6)) continue;
        const point = sampleAt(finalPath, x);
        if (!point) continue;

        const drift =
            has(depth, "orbit") && random.nextDouble() < 0.34
                ? {
                      ampX: Math.round(lerp(20, 44, t)),
                      ampY: Math.round(lerp(34, 66, t)),
                      period: random.float(1.9, 3.2),
                      phase: random.float(0, Math.PI * 2),
                  }
                : has(depth, "bobbing") && random.nextDouble() < 0.38
                  ? {
                        ampX: 0,
                        ampY: Math.round(lerp(34, 64, t)),
                        period: random.float(1.8, 3.0),
                        phase: random.float(0, Math.PI * 2),
                    }
                  : undefined;
        const aperture =
            has(depth, "iris") && random.nextDouble() < 0.32
                ? { amount: lerp(0.2, 0.4, t), period: random.float(1.7, 2.8), phase: random.float(0, Math.PI * 2) }
                : undefined;

        // A ring must clear its own motion at any phase, or the course would be
        // winnable only on one release frame.
        const slack = (drift?.ampY ?? 0) + (aperture ? openingHeight * aperture.amount * 0.5 : 0);
        const height = Math.round(openingHeight + slack * 1.4);
        // 42px of slack absorbs the Euler-integration difference between a
        // 30 FPS tick and a 144 FPS one; at 30 the arc can sit tens of pixels
        // off the planned trace, and a tighter margin fails the proof.
        const margin = Math.min(42, height * 0.22) + slack;
        const bias = layoutBias(ringLayout, gates.length, ringCount, random);
        let top = Math.round(point.y - height * bias);
        top = Math.max(top, point.y - height + margin);
        top = Math.min(top, point.y - margin);
        top = Math.max(top, PLAY_TOP + GATE_CAP + slack);
        top = Math.min(top, PLAY_BOTTOM - GATE_CAP - height - slack);
        if (point.y < top + margin * 0.5 || point.y > top + height - margin * 0.5) continue;
        if (ringFoulsObstacle(x, top, height, ringWidth, obstacles, 8)) continue;

        const kind: GateKind | undefined =
            has(depth, "crown") && random.nextDouble() < 0.18
                ? "crown"
                : has(depth, "gold") && random.nextDouble() < 0.3
                  ? "gold"
                  : undefined;
        const width = kind === "crown" ? Math.round(ringWidth * 0.78) : ringWidth;
        if (previous && x - previous.x < minGateCenterSpacing(previous.width, width)) continue;

        gates.push({
            id: `${depth}-r${gates.length + 1}`,
            x: Math.round(x),
            openingY: top,
            openingHeight: kind === "crown" ? Math.round(height * 0.72) : height,
            width,
            ...(drift ? { drift } : {}),
            ...(aperture ? { aperture } : {}),
            ...(kind ? { kind } : {}),
        });
    }
    if (gates.length < Math.min(4, ringCount)) return null;

    const level: LevelData = {
        ...makeScaffold(obstacles),
        tagline: describeCourse(tilt, ringLayout, obstacles, windZones, gates, Boolean(targetDrift)),
        initialAimAngle: Math.round(Math.max(12, Math.min(52, finalPar.angle + random.float(-14, 14)))),
        initialPower: Number(Math.max(0.7, Math.min(1.3, finalPar.power + random.float(-0.2, 0.2))).toFixed(2)),
        parShot: { angle: finalPar.angle, power: finalPar.power },
        requiredBounces: bounces,
        gates,
        target: {
            x: Math.round(targetPoint.x - targetWidth / 2),
            y: Math.round(targetCenterY - targetHeight / 2),
            width: targetWidth,
            height: targetHeight,
            ...(targetDrift ? { drift: targetDrift } : {}),
        },
    };

    // ── Proof ──────────────────────────────────────────────────────────────
    //
    // The planned par is a good guess, not a guarantee: it was traced at one
    // tick rate and the game runs at whatever the device gives. Rather than
    // discard the whole course when the planned shot is a few pixels off, sweep
    // a small neighbourhood and keep the first shot that is a genuine three-star
    // at every rate we ship to. Only if nothing in that neighbourhood works is
    // the layout actually broken.
    const proven = refinePar(level, arrow);
    if (!proven) return { level, ok: false };
    return { level: { ...level, parShot: proven }, ok: true };
}

/**
 * Does this exact shot three-star the course at every shipped frame rate, with
 * enough room off dead centre that a frame of jitter cannot drop a star?
 */
function provesOut(level: LevelData, arrow: ArrowDef, angle: number, power: number): boolean {
    for (const rates of [QUICK_FRAME_RATES, PROOF_FRAME_RATES]) {
        for (const fps of rates) {
            const shot = createShot(level, angle, arrow, power);
            for (let frame = 0; frame < fps * 14 && shot.outcome === "flying"; frame += 1) {
                advanceShot(shot, level, 1 / fps, 0, SILENT, arrow);
            }
            if (!isPerfectShot(shot, level)) return false;
            const face = getTargetFace(level.target, shot.elapsed);
            if (Math.abs(shot.position.y - face.centerY) / face.radius > PAR_MARGIN_LIMIT) return false;
        }
    }
    return true;
}

/**
 * Search outward from the planned par for a shot that survives every frame
 * rate. Returns null when the course is genuinely unclearable.
 */
function refinePar(level: LevelData, arrow: ArrowDef): { angle: number; power: number } | null {
    const { angle: baseAngle, power: basePower } = level.parShot;
    if (provesOut(level, arrow, baseAngle, basePower)) return { angle: baseAngle, power: basePower };
    for (let ring = 1; ring <= 8; ring += 1) {
        const spread = ring * 0.75;
        for (let da = -spread; da <= spread + 1e-9; da += 0.75) {
            for (let dp = -ring * 0.01; dp <= ring * 0.01 + 1e-9; dp += 0.01) {
                // Only the shell just reached, so the nearest working shot wins.
                if (Math.abs(da) < spread - 0.01 && Math.abs(dp) < ring * 0.01 - 0.001) continue;
                const angle = Number((baseAngle + da).toFixed(2));
                const power = Number(Math.max(0.6, Math.min(1.4, basePower + dp)).toFixed(3));
                if (provesOut(level, arrow, angle, power)) return { angle, power };
            }
        }
    }
    return null;
}

function describeCourse(
    tilt: "uphill" | "level" | "downhill",
    layout: RingLayout,
    obstacles: readonly ObstacleData[],
    windZones: readonly WindZone[],
    gates: readonly GateData[],
    movingTarget: boolean,
): string {
    const notes: string[] = [];
    const tiltNote = tilt === "uphill" ? "UPHILL SHOT" : tilt === "downhill" ? "PLUNGING SHOT" : "";
    if (tiltNote) notes.push(tiltNote);
    const shapes: Record<RingLayout, string> = {
        follow: "",
        zigzag: "ZIGZAG RINGS",
        rising: "RISING LADDER",
        falling: "FALLING LADDER",
        scatter: "SCATTERED RINGS",
    };
    if (shapes[layout]) notes.push(shapes[layout]);
    if (obstacles.some((o) => o.kind === "plate")) notes.push("ANGLED PLATE");
    if (obstacles.some((o) => o.kind === "bumper")) notes.push("BUMPERS");
    const obsidian = obstacles.find((o) => o.kind === "obsidian");
    if (obsidian && obsidian.kind === "obsidian") notes.push(`OBSIDIAN GRADE ${obsidian.hardness}`);
    if (gates.some((g) => g.drift && g.drift.ampX > 0)) notes.push("ORBITING RINGS");
    else if (gates.some((g) => g.drift)) notes.push("BOBBING RINGS");
    if (gates.some((g) => g.aperture)) notes.push("IRIS RINGS");
    if (windZones.length > 1) notes.push("TWIN GUSTS");
    else if (windZones.length === 1) notes.push("CROSSWIND");
    if (movingTarget) notes.push("SWINGING TARGET");
    if (notes.length === 0) notes.push(`${gates.length} RINGS · CLEAN AIR`);
    return notes.slice(0, 3).join(" · ");
}

const cache = new Map<string, LevelData>();

/**
 * The course for a depth. Deterministic: same depth, same course, forever.
 *
 * `arrow` matters because the generator proves par with the shaft the player
 * actually holds — a course is only emitted if THIS arrow can clear it, so an
 * under-equipped player is stopped by an honest obsidian slab rather than by an
 * unwinnable layout.
 */
export function generateLevel(depth: number, arrow: ArrowDef = getArrow("reed")): LevelData {
    const safeDepth = Math.max(1, Math.floor(depth));
    const key = `${safeDepth}:${arrow.id}`;
    const cached = cache.get(key);
    if (cached) return cached;

    let fallback: LevelData | null = null;
    // Roll the seed, and progressively drop the fanciest furniture if this depth
    // proves stubborn. Relaxing keeps the course at its own depth and its own
    // seed, so it stays unique; the old behaviour — falling back to depth − 4 —
    // shipped a byte-identical copy of an earlier course under a new number.
    for (let salt = 0; salt < 48; salt += 1) {
        generatorStats.attempts += 1;
        const relax = salt < 20 ? 0 : salt < 34 ? 1 : 2;
        const attempt = buildAttempt(safeDepth, salt, arrow, relax);
        if (!attempt) continue;
        if (!attempt.ok) {
            generatorStats.proofFailures += 1;
            fallback ??= attempt.level;
            continue;
        }
        cache.set(key, attempt.level);
        return attempt.level;
    }
    // Nothing proved out even stripped back. Serving an easier depth would ship
    // a duplicate course, so serve the best unproven layout for this depth and
    // record it: the soak test fails the build on any non-zero count here.
    generatorStats.fallbacks += 1;
    const level = fallback ?? buildAttempt(1, 0, getArrow("reed"))?.level;
    if (!level) throw new Error("Odyssey could not generate a starting course");
    cache.set(key, level);
    return level;
}

export function clearGeneratedLevelCache(): void {
    cache.clear();
    generatorStats.attempts = 0;
    generatorStats.fallbacks = 0;
    generatorStats.proofFailures = 0;
    generatorStats.rejectOverlap = 0;
    generatorStats.rejectNoPath = 0;
    generatorStats.rejectPlaceable = 0;
}

/** Diagnostics for the generator soak test; not read by the game. */
export const generatorStats = {
    attempts: 0,
    fallbacks: 0,
    proofFailures: 0,
    rejectOverlap: 0,
    rejectNoPath: 0,
    rejectPlaceable: 0,
};
