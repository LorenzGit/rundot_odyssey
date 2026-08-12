import { Container, Graphics, Sprite, Text, type Texture } from "pixi.js";
import type { UlyssesRig } from "./artAssets.ts";
import { TARGET_DISC } from "./artAssets.ts";
import type { GateData, ObstacleData, TargetData } from "./types.ts";
import { GATE_CAP_HEIGHT, GATE_CAP_WIDTH_SCALE, PLAY_TOP } from "./types.ts";
import { gateWindowAt, getTargetFace } from "./physics.ts";

/** Cap center offset from opening edge (matches GATE_CAP_HEIGHT collision). */
const GATE_CAP_VISUAL_Y = GATE_CAP_HEIGHT / 2;

const INK = 0x1a2740;
const GOLD = 0xf0b429;
const GOLD_LIGHT = 0xffe58a;
const GOLD_DARK = 0x8a5a12;
const CYAN_CORE = 0xb8ffff;
const AEGEAN = 0x0b4f86;
const AEGEAN_DEEP = 0x052a44;

/**
 * Clean UI stack — always sans. Avoid serif + fat stroke combos that turn
 * gold type into mud on navy panels (especially at small sizes on mobile).
 */
const UI_SANS = 'system-ui, -apple-system, "Segoe UI", "Helvetica Neue", Arial, sans-serif';

const ULYSSES_BASE_AIM_DEG = 28;
/** Body bone only leans a little — large aim is still playable without a waist tear. */
const BODY_AIM_SCALE = 0.28;
const BODY_AIM_MAX_DELTA = 14;

/**
 * High-contrast game text.
 * - No serif
 * - No multi-px stroke on body/HUD (that’s what made labels illegible)
 * - Thin dark edge only on huge titles
 */
export function outlinedText(text: string, size: number, color = 0xffffff): Text {
    const style: Record<string, unknown> = {
        fontFamily: UI_SANS,
        fontSize: size,
        fontWeight: "800",
        fill: color,
        letterSpacing: size >= 56 ? 2 : size >= 28 ? 0.5 : 0,
        align: "center",
    };
    if (size >= 56) {
        // One thin edge for giant titles only — still crisp, not blobby.
        style.stroke = { color: 0x061018, width: Math.max(2, Math.round(size * 0.035)), join: "round" };
        style.dropShadow = { color: 0x000000, alpha: 0.4, blur: 4, distance: 2 };
    } else if (size >= 28) {
        style.dropShadow = { color: 0x000000, alpha: 0.55, blur: 2, distance: 1 };
    } else {
        // HUD / chips: pure fill + tiny shadow for contrast on any bg
        style.dropShadow = { color: 0x000000, alpha: 0.75, blur: 1, distance: 1 };
    }
    return new Text({ text, style });
}

export function labelText(text: string, size: number, color = 0xfff3c4): Text {
    return new Text({
        text,
        style: {
            fontFamily: UI_SANS,
            fontSize: size,
            fontWeight: "700",
            fill: color,
            letterSpacing: 1.2,
            dropShadow: { color: 0x000000, alpha: 0.8, blur: 1, distance: 1 },
        },
    });
}

// ─── Ulysses: deep-overlap belt pivot + joint cover ────────────────────────

export interface UlyssesView {
    root: Container;
    setAim(angleDegrees: number): void;
    setFlying(flying: boolean): void;
    playRelease(): void;
    update(elapsed: number, deltaSeconds: number, reducedMotion: boolean): void;
}

export interface UlyssesTextures {
    upper: Texture;
    lower: Texture;
    belt: Texture;
    rig: UlyssesRig;
}

/**
 * 2-bone hip rig with deep waist overlap + belt cover plate.
 * Feet stay planted; torso rotates a *scaled* amount around the gold belt.
 */
export function createUlysses(textures: UlyssesTextures): UlyssesView {
    const { upper: upperTex, lower: lowerTex, belt: beltTex, rig } = textures;
    const root = new Container();
    const targetHeight = 340;
    const scale = targetHeight / Math.max(1, rig.fullSize[1]);
    const hipAboveFeet = (rig.feetY - rig.hip[1]) * scale;

    const hip = new Container();
    hip.position.set(0, -hipAboveFeet);

    // Lower first (legs), then upper (torso), then belt cover on the joint.
    const lower = new Sprite(lowerTex);
    lower.anchor.set(0, 0);
    lower.pivot.set(rig.lower.pivot[0], rig.lower.pivot[1]);
    lower.scale.set(scale);

    const upper = new Sprite(upperTex);
    upper.anchor.set(0, 0);
    upper.pivot.set(rig.upper.pivot[0], rig.upper.pivot[1]);
    upper.scale.set(scale);

    const belt = new Sprite(beltTex);
    belt.anchor.set(0, 0);
    belt.pivot.set(rig.belt.pivot[0], rig.belt.pivot[1]);
    belt.scale.set(scale * 1.05);

    const shadow = new Graphics().ellipse(10, 4, 88, 18).fill({ color: 0x0a1a28, alpha: 0.32 });

    hip.addChild(lower, upper, belt);
    root.addChild(shadow, hip);

    let aimAngle = ULYSSES_BASE_AIM_DEG;
    let flying = false;
    let releaseTime = 0;

    function bodyDeltaDeg(): number {
        const raw = (aimAngle - ULYSSES_BASE_AIM_DEG) * BODY_AIM_SCALE;
        return Math.max(-BODY_AIM_MAX_DELTA, Math.min(BODY_AIM_MAX_DELTA, raw));
    }

    function applyAim(): void {
        const delta = bodyDeltaDeg();
        // Counter-clockwise when aiming up (Pixi Y-down).
        upper.rotation = (-delta * Math.PI) / 180;
        // Belt rides with torso so the joint never opens.
        belt.rotation = upper.rotation;
        lower.rotation = 0;
    }

    applyAim();

    return {
        root,
        setAim(angleDegrees) {
            aimAngle = angleDegrees;
            applyAim();
        },
        setFlying(next) {
            flying = next;
        },
        playRelease() {
            releaseTime = 0.24;
        },
        update(elapsed, deltaSeconds, reducedMotion) {
            releaseTime = Math.max(0, releaseTime - deltaSeconds);
            const breath = reducedMotion ? 0 : Math.sin(elapsed * 2.2);
            upper.scale.y = scale * (1 + breath * 0.01);
            upper.scale.x = scale * (1 - breath * 0.003);
            belt.scale.set(scale * 1.05 * (1 + breath * 0.006));
            hip.x = flying ? Math.sin(elapsed * 8) * 2 : breath * 0.8;
            shadow.alpha = flying ? 0.18 : 0.32;
            if (releaseTime > 0) {
                const pulse = releaseTime / 0.24;
                upper.rotation = (-bodyDeltaDeg() * Math.PI) / 180 - Math.sin(pulse * Math.PI) * 0.08;
                belt.rotation = upper.rotation;
                upper.x = (1 - pulse) * 6;
                belt.x = upper.x;
            } else {
                upper.x = 0;
                belt.x = 0;
                applyAim();
            }
        },
    };
}

// ─── Gates — vertical light pillars with solid gold capitals ───────────────

export interface GateView {
    root: Container;
    collect(): void;
    /** Sync visual Y to motion at time t (seconds). */
    setSimTime(timeSeconds: number): void;
    update(elapsed: number, deltaSeconds: number, reducedMotion: boolean): void;
}

/**
 * Gate palettes. The three kinds have to be tellable apart in a half-second
 * glance while the camera is moving, so they differ in hue AND in the capital
 * metal, not just in brightness.
 */
const GATE_STYLE: Record<
    "normal" | "gold" | "crown",
    { glass: number; stroke: number; core: number; bloom: number; capBase: number; capFace: number; capLip: number }
> = {
    normal: {
        glass: 0x24d4d2,
        stroke: 0xaefcff,
        core: CYAN_CORE,
        bloom: 0x3ee8e6,
        capBase: 0x6b3f10,
        capFace: GOLD,
        capLip: GOLD_LIGHT,
    },
    gold: {
        glass: 0xf0c040,
        stroke: 0xffe58a,
        core: 0xfff0b0,
        bloom: 0xffc030,
        capBase: 0x7a4a08,
        capFace: 0xffcf3a,
        capLip: 0xfff3bc,
    },
    crown: {
        glass: 0xb072ff,
        stroke: 0xf0d8ff,
        core: 0xffffff,
        bloom: 0xc07aff,
        capBase: 0x3d1f66,
        capFace: 0xd9a8ff,
        capLip: 0xf6e6ff,
    },
};

export function createGate(data: GateData): GateView {
    const root = new Container();
    root.position.set(data.x, data.openingY);
    const half = data.width / 2;
    const h = data.openingHeight;
    const r = Math.min(data.width * 0.4, 40);
    const kind = data.kind ?? "normal";
    const style = GATE_STYLE[kind];
    const isCrown = kind === "crown";

    // Outer glow
    const bloom = new Graphics()
        .roundRect(-half - 20, -6, data.width + 40, h + 12, r + 8)
        .fill({ color: style.bloom, alpha: isCrown ? 0.2 : 0.14 });

    // Pillar glass body
    const body = new Graphics()
        .roundRect(-half, 0, data.width, h, r)
        .fill({ color: style.glass, alpha: kind === "normal" ? 0.32 : 0.28 })
        .stroke({ color: style.stroke, width: 5, alpha: 0.85 });

    // Bright core + side rails (reads as hollow portal)
    const core = new Graphics()
        .roundRect(-half * 0.5, 16, data.width * 0.5, h - 32, r * 0.65)
        .fill({ color: style.core, alpha: 0.4 });
    const rails = new Graphics()
        .roundRect(-half + 4, 8, 6, h - 16, 3)
        .fill({ color: 0xffffff, alpha: 0.28 })
        .roundRect(half - 10, 8, 6, h - 16, 3)
        .fill({ color: 0xffffff, alpha: 0.16 });

    // Solid capitals — these BLOCK the arrow (physics uses GATE_CAP_HEIGHT)
    const top = gateCapital(data.width, style);
    top.y = -GATE_CAP_VISUAL_Y;
    const bottom = gateCapital(data.width, style);
    bottom.y = h + GATE_CAP_VISUAL_Y;
    bottom.scale.y = -1;

    // Badges: ▲▼ for a moving gate, ◇ for an iris, a laurel mark for a crown.
    const badge = new Graphics();
    if (data.drift) {
        for (const [dir, y] of [
            [-1, -GATE_CAP_VISUAL_Y - 30],
            [1, h + GATE_CAP_VISUAL_Y + 30],
        ] as const) {
            badge
                .moveTo(-11, y + dir * 11)
                .lineTo(0, y - dir * 12)
                .lineTo(11, y + dir * 11)
                .stroke({ color: style.capLip, width: 3.5, alpha: 0.9 });
        }
    }
    if (data.aperture) {
        // A diamond outline: the shape an iris makes as it closes.
        badge
            .moveTo(0, -GATE_CAP_VISUAL_Y - 44)
            .lineTo(13, -GATE_CAP_VISUAL_Y - 30)
            .lineTo(0, -GATE_CAP_VISUAL_Y - 16)
            .lineTo(-13, -GATE_CAP_VISUAL_Y - 30)
            .closePath()
            .stroke({ color: style.capLip, width: 3, alpha: 0.9 });
    }
    if (data.drift && data.drift.ampX > 0) {
        // An orbit ring travels a circle; trace the path it will take so the
        // player can read where it is going, not just that it moves.
        badge.circle(0, h / 2, Math.max(data.drift.ampX, data.drift.ampY)).stroke({
            color: style.stroke,
            width: 2,
            alpha: 0.28,
        });
    }
    if (isCrown) {
        badge
            .moveTo(-16, -GATE_CAP_VISUAL_Y - 26)
            .lineTo(-8, -GATE_CAP_VISUAL_Y - 42)
            .lineTo(0, -GATE_CAP_VISUAL_Y - 28)
            .lineTo(8, -GATE_CAP_VISUAL_Y - 42)
            .lineTo(16, -GATE_CAP_VISUAL_Y - 26)
            .closePath()
            .fill({ color: 0xf0d8ff, alpha: 0.95 });
    }

    const sparks: Graphics[] = [];
    for (let i = 0; i < 12; i += 1) {
        const spark = new Graphics()
            .circle(0, 0, i % 3 === 0 ? 5 : 2.5)
            .fill(i % 2 === 0 ? style.capLip : style.stroke);
        spark.position.set(
            ((i * 47) % Math.round(data.width * 0.55)) - data.width * 0.27,
            18 + ((i * 71) % Math.max(1, Math.round(h - 36))),
        );
        sparks.push(spark);
    }

    const pulse = new Graphics()
        .ellipse(0, h / 2, data.width * 0.7, h * 0.52)
        .stroke({ color: style.capLip, width: 11, alpha: 0 });

    root.addChild(bloom, body, core, rails, ...sparks, top, bottom, badge, pulse);
    let collected = false;
    let pulseTime = 0;

    return {
        root,
        collect() {
            collected = true;
            pulseTime = 0.5;
            body.alpha = 1;
            core.alpha = 1;
        },
        setSimTime(timeSeconds) {
            const window = gateWindowAt(data, timeSeconds);
            // The container is anchored on the opening's top edge, so drift moves
            // the root and the iris rescales the glass between the capitals.
            root.position.set(window.x, window.top);
            const scale = window.height / Math.max(1, h);
            body.scale.y = scale;
            core.scale.y = scale;
            rails.scale.y = scale;
            bloom.scale.y = scale;
            bottom.y = window.height + GATE_CAP_VISUAL_Y;
            pulse.y = (window.height - h) / 2;
            for (let i = 0; i < sparks.length; i += 1) {
                const spark = sparks[i];
                if (spark) spark.visible = spark.y <= window.height - 14;
            }
        },
        update(elapsed, deltaSeconds, reducedMotion) {
            for (let i = 0; i < sparks.length; i += 1) {
                const spark = sparks[i];
                if (!spark) continue;
                spark.alpha = collected ? 0.15 : 0.55 + Math.sin(elapsed * 3.2 + i) * 0.3;
                if (!reducedMotion) {
                    spark.y += Math.sin(elapsed * 2 + i) * deltaSeconds * 9;
                    if (spark.y < 14) spark.y = h - 18;
                    if (spark.y > h - 14) spark.y = 18;
                }
            }
            if (!collected && !reducedMotion) {
                core.alpha = 0.34 + Math.sin(elapsed * 2.5) * 0.1;
                if (data.drift || data.aperture || isCrown) badge.alpha = 0.55 + Math.sin(elapsed * 4) * 0.35;
            }
            if (pulseTime > 0) {
                pulseTime = Math.max(0, pulseTime - deltaSeconds);
                const p = 1 - pulseTime / 0.5;
                pulse.scale.set(1 + p * 0.9);
                pulse.alpha = (1 - p) * 0.95;
            }
            if (collected && pulseTime === 0) {
                body.alpha += (0.5 - body.alpha) * Math.min(1, deltaSeconds * 4);
                core.alpha += (0.18 - core.alpha) * Math.min(1, deltaSeconds * 4);
                badge.alpha = 0;
            }
        },
    };
}

function gateCapital(width: number, style: { capBase: number; capFace: number; capLip: number }): Graphics {
    const cap = new Graphics();
    const w = width * GATE_CAP_WIDTH_SCALE;
    const h = GATE_CAP_HEIGHT;
    // Heavy solid block — clearly solid, not decorative fluff
    cap.roundRect(-w / 2 + 2, -h / 2 + 4, w, h, 10).fill({ color: 0x2a1605, alpha: 0.55 });
    cap.roundRect(-w / 2, -h / 2, w, h, 10).fill(style.capBase);
    cap.roundRect(-w / 2 + 3, -h / 2 + 3, w - 6, h - 6, 8).fill(style.capFace);
    cap.roundRect(-w / 2 + 8, -h / 2 + 6, w - 16, 12, 4).fill({ color: style.capLip, alpha: 0.75 });
    // Dense key pattern so it reads as solid metal at distance
    const cell = Math.max(10, Math.min(14, w / 7));
    for (let x = -w * 0.36; x < w * 0.36; x += cell) {
        cap.roundRect(x, -7, cell * 0.55, cell * 0.75, 2).fill(style.capBase);
    }
    return cap;
}

// ─── Arrow / target / obstacles ────────────────────────────────────────────

export function createArrow(colors?: { shaft?: number; head?: number; fletch?: number }): Container {
    const shaft = colors?.shaft ?? 0x6e3d1a;
    const head = colors?.head ?? GOLD_LIGHT;
    const fletch = colors?.fletch ?? 0x1a7fd0;
    const root = new Container();
    const art = new Graphics()
        .moveTo(-102, 0)
        .lineTo(-4, 0)
        .stroke({ color: shaft, width: 8, cap: "round" })
        .moveTo(-6, -14)
        .lineTo(16, 0)
        .lineTo(-6, 14)
        .closePath()
        .fill(head)
        .stroke({ color: GOLD_DARK, width: 4 })
        .moveTo(-88, 0)
        .lineTo(-112, -16)
        .lineTo(-98, 1)
        .lineTo(-112, 16)
        .closePath()
        .fill(fletch)
        .stroke({ color: INK, width: 3 });
    root.addChild(art);
    return root;
}

export interface TargetView {
    root: Container;
    /** Sync the painted disc to the collider at time t (seconds). */
    setSimTime(timeSeconds: number): void;
}

/**
 * Painted target art. The disc centre is pinned to getTargetFace(), including
 * its swing, so a moving target is never scored where it is not drawn.
 */
export function createTarget(data: TargetData, texture: Texture): TargetView {
    const root = new Container();
    const rest = getTargetFace(data, 0);
    const R = rest.radius;

    const sprite = new Sprite(texture);
    sprite.anchor.set(TARGET_DISC.anchorX, TARGET_DISC.anchorY);
    sprite.scale.set(R / TARGET_DISC.radiusPx);
    // No rotation — disc center stays locked to the flat mid-slice collider
    sprite.position.set(rest.centerX, rest.centerY);

    // A swinging disc hangs from a rope; a static one just sits on its legs.
    const rig = new Graphics();
    if (data.drift) {
        rig.rect(rest.centerX - 3, PLAY_TOP - 40, 6, rest.centerY - R - (PLAY_TOP - 40)).fill({
            color: 0x6b4a2a,
            alpha: 0.9,
        });
    }

    const shadow = new Graphics()
        .ellipse(rest.centerX + 6, rest.bottom + 18, R * 0.72, 15)
        .fill({ color: 0x0a1a28, alpha: 0.26 });

    root.addChild(shadow, rig, sprite);
    return {
        root,
        setSimTime(timeSeconds) {
            if (!data.drift) return;
            const face = getTargetFace(data, timeSeconds);
            sprite.y = face.centerY;
            shadow.alpha = 0.26 * (1 - Math.min(0.6, Math.abs(face.centerY - rest.centerY) / (R * 2)));
            rig.clear()
                .rect(face.centerX - 3, PLAY_TOP - 40, 6, face.centerY - R - (PLAY_TOP - 40))
                .fill({ color: 0x6b4a2a, alpha: 0.9 });
        },
    };
}

/**
 * Course furniture.
 *
 * Lethal and bouncy pieces have to be told apart instantly at a glance while
 * the arrow is in the air, so they share no silhouette: stone is a painted
 * sprite, a bumper is a banded disc with a spring rim, a plate is a hard
 * angled bar with direction chevrons, and obsidian is a cracked black slab
 * stamped with the grade of shaft needed to break it.
 */
export function createObstacle(data: ObstacleData, textures: { pillar: Texture; rock: Texture }): Container {
    const root = new Container();

    if (data.kind === "pillar") {
        const sprite = new Sprite(textures.pillar);
        sprite.anchor.set(0.5, 1);
        sprite.scale.set(data.height / Math.max(1, textures.pillar.height));
        root.position.set(data.x + data.width / 2, data.y + data.height);
        root.addChild(sprite);
        return root;
    }

    if (data.kind === "rock") {
        const sprite = new Sprite(textures.rock);
        sprite.anchor.set(0.5, 0.55);
        sprite.scale.set((data.radius * 2.15) / Math.max(1, textures.rock.width));
        root.position.set(data.x, data.y);
        root.addChild(sprite);
        return root;
    }

    if (data.kind === "bumper") {
        const r = data.radius;
        const g = new Graphics();
        g.circle(0, 6, r + 6).fill({ color: 0x0a1a28, alpha: 0.3 });
        g.circle(0, 0, r).fill(0x1c9f6e);
        g.circle(0, 0, r * 0.82).fill(0x2fd493);
        g.circle(0, 0, r * 0.55).fill(0x8ff5cf);
        g.circle(0, 0, r * 0.3).fill(0xffffff);
        // Spring lugs around the rim read as "this thing throws you".
        for (let i = 0; i < 10; i += 1) {
            const a = (i / 10) * Math.PI * 2;
            g.circle(Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9, r * 0.075).fill({
                color: 0xeafff6,
                alpha: 0.85,
            });
        }
        g.circle(0, 0, r).stroke({ color: 0xeafff6, width: 4, alpha: 0.9 });
        root.position.set(data.x, data.y);
        root.addChild(g);
        return root;
    }

    if (data.kind === "plate") {
        const dx = data.x2 - data.x1;
        const dy = data.y2 - data.y1;
        const length = Math.hypot(dx, dy) || 1;
        const g = new Graphics();
        const thickness = 20;
        g.roundRect(0, -thickness / 2 + 5, length, thickness, thickness / 2).fill({ color: 0x0a1a28, alpha: 0.32 });
        g.roundRect(0, -thickness / 2, length, thickness, thickness / 2).fill(0x2a6fb0);
        g.roundRect(2, -thickness / 2 + 3, length - 4, thickness * 0.42, thickness / 3).fill({
            color: 0x9fd8ff,
            alpha: 0.85,
        });
        // Chevrons along the face point the way it throws the arrow.
        for (let i = 1; i < 5; i += 1) {
            const cx = (length * i) / 5;
            g.moveTo(cx - 8, 2)
                .lineTo(cx, -9)
                .lineTo(cx + 8, 2)
                .stroke({
                    color: 0xeaf6ff,
                    width: 3,
                    alpha: 0.8,
                });
        }
        g.position.set(0, 0);
        root.position.set(data.x1, data.y1);
        root.rotation = Math.atan2(dy, dx);
        root.addChild(g);
        return root;
    }

    // Obsidian: the slab that gates depth on equipment.
    const g = new Graphics();
    g.roundRect(4, 6, data.width, data.height, 8).fill({ color: 0x000000, alpha: 0.4 });
    g.roundRect(0, 0, data.width, data.height, 8).fill(0x1a1030);
    g.roundRect(3, 3, data.width - 6, data.height - 6, 6).fill(0x2c1b4d);
    // Facet cracks, deterministic from the slab's own size so it never shimmers.
    for (let i = 1; i < 5; i += 1) {
        const y = (data.height * i) / 5;
        g.moveTo(2, y)
            .lineTo(data.width * 0.55, y - data.height * 0.05)
            .lineTo(data.width - 2, y + data.height * 0.03)
            .stroke({ color: 0x6a4aa8, width: 2, alpha: 0.55 });
    }
    g.roundRect(0, 0, data.width, data.height, 8).stroke({ color: 0x8f6fd8, width: 3, alpha: 0.9 });
    const badge = new Container();
    const plate = new Graphics()
        .circle(0, 0, 21)
        .fill({ color: 0x120a24, alpha: 0.95 })
        .circle(0, 0, 21)
        .stroke({ color: 0xc9a8ff, width: 3 });
    const grade = outlinedText(String(data.hardness), 26, 0xf0e0ff);
    grade.anchor.set(0.5);
    badge.addChild(plate, grade);
    badge.position.set(data.width / 2, data.height / 2);
    root.position.set(data.x, data.y);
    root.addChild(g, badge);
    return root;
}

// ─── UI chrome ─────────────────────────────────────────────────────────────

export interface UiButton {
    root: Container;
    setEnabled(enabled: boolean): void;
}

export function createButton(label: string, width: number, onPress: () => void, color = GOLD): UiButton {
    const root = new Container();
    root.label = "ui-button";
    const height = 92;
    const isGold = color === GOLD || color === 0xf0b429 || color === 0xffc129;
    const rim = isGold ? GOLD_DARK : 0x0a2a44;
    const highlight = isGold ? 0xfff0a8 : 0xa8d8ff;
    // Gold faces use dark ink; cooler faces use cream so labels stay readable.
    const labelFill = isGold ? 0x1a1205 : 0xfff8e8;
    const shadow = new Graphics()
        .roundRect(-width / 2 + 4, -height / 2 + 10, width, height, 18)
        .fill({ color: 0x000000, alpha: 0.4 });
    const face = new Graphics()
        .roundRect(-width / 2, -height / 2, width, height, 18)
        .fill(rim)
        .roundRect(-width / 2 + 3, -height / 2 + 3, width - 6, height - 6, 15)
        .fill(color)
        .roundRect(-width / 2 + 10, -height / 2 + 8, width - 20, 18, 8)
        .fill({ color: highlight, alpha: isGold ? 0.35 : 0.18 });
    face.label = "ui-button-face";
    const text = new Text({
        text: label,
        style: {
            fontFamily: UI_SANS,
            // Two lines still render above the 10px effective floor on the
            // smallest supported 667x375 landscape viewport. Shared wrapping
            // prevents long contextual labels from escaping their button.
            fontSize: 30,
            fontWeight: "800",
            fill: labelFill,
            letterSpacing: 1,
            align: "center",
            breakWords: true,
            lineHeight: 31,
            wordWrap: true,
            wordWrapWidth: width - 32,
        },
    });
    text.label = "ui-button-label";
    text.anchor.set(0.5);
    text.y = -1;
    root.addChild(shadow, face, text);
    root.eventMode = "static";
    root.cursor = "pointer";
    root.hitArea = {
        contains: (x: number, y: number) =>
            x >= -width / 2 && x <= width / 2 && y >= -height / 2 - 6 && y <= height / 2 + 6,
    };
    root.on("pointerdown", (e) => {
        e.stopPropagation();
        root.scale.set(0.96);
    });
    root.on("pointerup", (e) => {
        e.stopPropagation();
        root.scale.set(1);
        onPress();
    });
    root.on("pointerupoutside", () => root.scale.set(1));
    return {
        root,
        setEnabled(enabled) {
            root.eventMode = enabled ? "static" : "none";
            root.alpha = enabled ? 1 : 0.45;
        },
    };
}

export function createPauseButton(onPress: () => void): Container {
    const root = new Container();
    const base = new Graphics()
        .circle(0, 0, 48)
        .fill(GOLD_DARK)
        .circle(0, 0, 42)
        .fill(AEGEAN_DEEP)
        .stroke({ color: GOLD, width: 4 })
        .circle(0, 0, 35)
        .stroke({ color: GOLD_LIGHT, width: 1.5, alpha: 0.45 });
    const icon = new Graphics()
        .roundRect(-14, -16, 10, 32, 3)
        .fill(GOLD_LIGHT)
        .roundRect(5, -16, 10, 32, 3)
        .fill(GOLD_LIGHT);
    root.addChild(base, icon);
    root.eventMode = "static";
    root.cursor = "pointer";
    root.hitArea = { contains: (x: number, y: number) => Math.hypot(x, y) <= 52 };
    root.on("pointerdown", (e) => {
        e.stopPropagation();
        root.scale.set(0.94);
    });
    root.on("pointerup", (e) => {
        e.stopPropagation();
        root.scale.set(1);
        onPress();
    });
    root.on("pointerupoutside", () => root.scale.set(1));
    return root;
}

/** Clean navy panel with thin gold frame — less ornament so type stays readable. */
export function createPanel(width: number, height: number): Container {
    const root = new Container();
    const g = new Graphics();
    g.roundRect(-width / 2 + 8, -height / 2 + 10, width, height, 24).fill({ color: 0x000000, alpha: 0.35 });
    g.roundRect(-width / 2, -height / 2, width, height, 22).fill(0x0c2438);
    g.roundRect(-width / 2, -height / 2, width, height, 22).stroke({ color: 0xf0c94a, width: 4 });
    g.roundRect(-width / 2 + 8, -height / 2 + 8, width - 16, height - 16, 16).stroke({
        color: 0xffe9a0,
        width: 1.5,
        alpha: 0.35,
    });
    g.moveTo(-40, -height / 2)
        .lineTo(0, -height / 2 - 22)
        .lineTo(40, -height / 2)
        .closePath()
        .fill(0xf0c94a);
    root.addChild(g);
    return root;
}

/**
 * One continuous stat bar with internal dividers.
 *
 * Three separate plaques left gaps that gate capitals scrolled through, which
 * read as the HUD glitching rather than as the world passing behind it.
 * `cellWidths` are laid out left to right; `cellX(i)` returns each cell's origin
 * so the caller can seat its labels without re-deriving the arithmetic.
 */
export interface HudBar {
    root: Container;
    height: number;
    width: number;
    cellX(index: number): number;
}

export function createHudBar(cellWidths: readonly number[], height = 84): HudBar {
    const root = new Container();
    const width = cellWidths.reduce((sum, w) => sum + w, 0);
    const g = new Graphics();
    g.roundRect(3, 5, width, height, 14).fill({ color: 0x000000, alpha: 0.38 });
    g.roundRect(0, 0, width, height, 14).fill({ color: 0x0a1e32, alpha: 0.95 });
    g.roundRect(0, 0, width, height, 14).stroke({ color: 0xe8c45a, width: 2.5 });
    let x = 0;
    for (let i = 0; i < cellWidths.length - 1; i += 1) {
        x += cellWidths[i]!;
        g.rect(x - 1, 12, 2, height - 24).fill({ color: 0xe8c45a, alpha: 0.32 });
    }
    root.addChild(g);
    return {
        root,
        height,
        width,
        cellX(index) {
            let offset = 0;
            for (let i = 0; i < index && i < cellWidths.length; i += 1) offset += cellWidths[i]!;
            return offset;
        },
    };
}

/**
 * Course title card. It announces the course and then gets out of the way —
 * the old always-on banner sat permanently on top of the first gate's capital.
 */
export interface LevelBanner {
    root: Container;
    /** `newFeature` names the mechanic this depth introduces, if any. */
    show(depth: number, newFeature: string | null, name: string, tagline: string): void;
    update(deltaSeconds: number, reducedMotion: boolean): void;
}

export function createLevelBanner(): LevelBanner {
    const root = new Container();
    const width = 660;
    const height = 96;
    const plate = new Graphics()
        .roundRect(-width / 2, 0, width, height, 14)
        .fill({ color: AEGEAN_DEEP, alpha: 0.9 })
        .stroke({ color: GOLD, width: 3 })
        .roundRect(-width / 2 + 7, 7, width - 14, height - 14, 9)
        .stroke({ color: GOLD_LIGHT, width: 1.25, alpha: 0.35 });
    const eyebrow = labelText("COURSE 1", 20, GOLD_LIGHT);
    eyebrow.anchor.set(0.5);
    eyebrow.position.set(0, 22);
    const name = outlinedText("LEVEL", 36, 0xfff4d6);
    name.anchor.set(0.5);
    name.position.set(0, 52);
    const tag = labelText("", 19, 0xbcd4e8);
    tag.anchor.set(0.5);
    tag.position.set(0, 80);
    root.addChild(plate, eyebrow, name, tag);
    root.alpha = 0;

    /** Seconds left at full opacity before the card fades out. */
    let hold = 0;

    return {
        root,
        show(depth, newFeature, nextName, tagline) {
            eyebrow.text = newFeature ? `COURSE ${depth} · NEW: ${newFeature}` : `COURSE ${depth}`;
            eyebrow.style.fill = newFeature ? 0x8ef0a8 : GOLD_LIGHT;
            name.text = nextName;
            tag.text = tagline.toUpperCase();
            root.alpha = 1;
            // A course that introduces a mechanic holds longer — that card is
            // the only place the new idea is ever named.
            hold = newFeature ? 4.2 : 2.4;
        },
        update(deltaSeconds, reducedMotion) {
            if (root.alpha <= 0) return;
            if (hold > 0) {
                hold = Math.max(0, hold - deltaSeconds);
                return;
            }
            root.alpha = reducedMotion ? 0 : Math.max(0, root.alpha - deltaSeconds * 1.6);
        },
    };
}

/**
 * Classic 1–3 star rating — immediately readable.
 * filled = earned gold stars; empty = dim outlines.
 */
export function createStarRating(stars: 1 | 2 | 3): Container {
    const root = new Container();
    const spacing = 72;
    for (let i = 0; i < 3; i += 1) {
        const filled = i < stars;
        const star = drawStar(0, 0, 28, filled);
        star.x = (i - 1) * spacing;
        root.addChild(star);
    }
    return root;
}

function drawStar(cx: number, cy: number, radius: number, filled: boolean): Graphics {
    const points: number[] = [];
    for (let i = 0; i < 10; i += 1) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const r = i % 2 === 0 ? radius : radius * 0.42;
        points.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
    }
    const g = new Graphics().poly(points, true);
    if (filled) {
        g.fill(0xffd24a).stroke({ color: 0x8a5a10, width: 3 });
    } else {
        g.fill({ color: 0x1a2a3a, alpha: 0.9 }).stroke({ color: 0x6a7a8a, width: 3, alpha: 0.85 });
    }
    return g;
}

/** Mini bullseye that highlights which ring scored (score lives in chips / key). */
export function createHitRingDiagram(quality: "bullseye" | "inner" | "outer"): Container {
    const root = new Container();
    const rings: Array<{ r: number; fill: number; key: "outer" | "inner" | "bullseye" }> = [
        { r: 48, fill: 0xf4f0e6, key: "outer" },
        { r: 34, fill: 0xc7372e, key: "outer" },
        { r: 22, fill: 0xf4f0e6, key: "inner" },
        { r: 12, fill: 0xc7372e, key: "inner" },
        { r: 6, fill: 0xffd24a, key: "bullseye" },
    ];
    for (const ring of rings) {
        const active =
            quality === "bullseye"
                ? ring.key === "bullseye"
                : quality === "inner"
                  ? ring.key === "inner"
                  : ring.key === "outer";
        const g = new Graphics().circle(0, 0, ring.r).fill(ring.fill);
        if (active) {
            g.circle(0, 0, ring.r).stroke({ color: 0xffe58a, width: 4, alpha: 1 });
        } else {
            g.alpha = 0.45;
        }
        root.addChild(g);
    }
    return root;
}

/**
 * Bottom-centre aim readout: angle, draw power and the control hint in one
 * plate. Power and instructions used to be two separate panels stacked close
 * enough to overlap each other on a phone; one plate cannot.
 */
export interface AimReadout {
    root: Container;
    /** Plate height in design px, so the caller can seat it above the safe edge. */
    height: number;
    set(angleDegrees: number, power: number, min: number, max: number): void;
    setHintVisible(visible: boolean): void;
}

export function createAimReadout(): AimReadout {
    const width = 640;
    const height = 128;
    const root = new Container();
    const plate = new Graphics()
        .roundRect(-width / 2, 0, width, height, 16)
        .fill({ color: AEGEAN_DEEP, alpha: 0.9 })
        .stroke({ color: GOLD, width: 3 })
        .roundRect(-width / 2 + 7, 7, width - 14, height - 14, 11)
        .stroke({ color: GOLD_LIGHT, width: 1.25, alpha: 0.3 });

    const angleLabel = labelText("AIM", 18, GOLD_LIGHT);
    angleLabel.anchor.set(0.5);
    angleLabel.position.set(-232, 20);
    const angleValue = outlinedText("31°", 40, 0xfff8e7);
    angleValue.anchor.set(0.5);
    angleValue.position.set(-232, 58);

    const powerLabel = labelText("POWER", 18, GOLD_LIGHT);
    powerLabel.anchor.set(0.5);
    powerLabel.position.set(60, 20);
    const powerValue = outlinedText("100%", 40, 0xfff8e7);
    powerValue.anchor.set(0.5);
    powerValue.position.set(232, 58);

    const trackW = 300;
    const trackX = -90;
    const track = new Graphics()
        .roundRect(trackX, 46, trackW, 18, 9)
        .fill({ color: 0x061828 })
        .stroke({ color: 0x4a6a80, width: 1.5 });
    const fill = new Graphics();

    const divider = new Graphics().rect(-152, 18, 2, 82).fill({ color: GOLD_LIGHT, alpha: 0.28 });

    const hint = labelText("DRAG UP/DOWN TO AIM · LEFT/RIGHT FOR POWER · RELEASE TO FIRE", 19, 0xbcd4e8);
    hint.anchor.set(0.5);
    hint.position.set(0, 100);

    root.addChild(plate, divider, angleLabel, angleValue, powerLabel, track, fill, powerValue, hint);

    return {
        root,
        height,
        set(angleDegrees, power, min, max) {
            angleValue.text = `${Math.round(angleDegrees)}°`;
            const t = Math.max(0, Math.min(1, (power - min) / Math.max(0.001, max - min)));
            fill.clear()
                .roundRect(trackX + 3, 49, Math.max(6, (trackW - 6) * t), 12, 6)
                .fill(t > 0.85 ? 0xff6a3a : t > 0.55 ? GOLD : 0x4ec8ff);
            powerValue.text = `${Math.round(power * 100)}%`;
        },
        setHintVisible(visible) {
            hint.visible = visible;
        },
    };
}

export function createStatChip(label: string, value: string, accent = GOLD_LIGHT): Container {
    const root = new Container();
    const w = 210;
    const h = 100;
    const g = new Graphics()
        .roundRect(-w / 2, -h / 2, w, h, 12)
        .fill({ color: AEGEAN, alpha: 0.4 })
        .stroke({ color: GOLD, width: 2, alpha: 0.75 });
    const lab = labelText(label, 20, accent);
    lab.anchor.set(0.5);
    lab.y = -24;
    const val = outlinedText(value, 40, 0xfff8e7);
    val.anchor.set(0.5);
    val.y = 14;
    root.addChild(g, lab, val);
    return root;
}

export { GOLD, GOLD_LIGHT, AEGEAN_DEEP };
