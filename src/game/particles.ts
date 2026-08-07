import { Graphics } from "pixi.js";
import { NoiseRandom } from "./noiseRandom.ts";

type ParticleKind = "dot" | "spark" | "streak" | "ring" | "shard";

interface LiveParticle {
    g: Graphics;
    kind: ParticleKind;
    vx: number;
    vy: number;
    life: number;
    lifeMs: number;
    spin: number;
    radius: number;
    /** Fraction of speed retained after one second, applied as `drag ** dtSeconds`. */
    drag: number;
    gravity: number;
    color: number;
}

export type BurstStyle = "gate" | "goldGate" | "impact" | "bullseye" | "defeat" | "trail" | "confetti";

export interface EmitterOptions {
    burst: number;
    hue: number;
    style: BurstStyle;
    direction?: number;
    speedScale?: number;
}

export interface ParticleEmitter {
    burst(x: number, y: number, opts?: Partial<EmitterOptions>): void;
    trail(x: number, y: number, angle: number, hue?: number): void;
    update(dtSeconds: number): void;
    destroy(): void;
    get activeCount(): number;
}

function hsl(h: number, s: number, l: number): number {
    const c = (1 - Math.abs((2 * l) / 100 - 1)) * (s / 100);
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l / 100 - c / 2;
    let r = 0;
    let g = 0;
    let b = 0;
    const hh = ((h % 360) + 360) % 360;
    if (hh < 60) [r, g, b] = [c, x, 0];
    else if (hh < 120) [r, g, b] = [x, c, 0];
    else if (hh < 180) [r, g, b] = [0, c, x];
    else if (hh < 240) [r, g, b] = [0, x, c];
    else if (hh < 300) [r, g, b] = [x, 0, c];
    else [r, g, b] = [c, 0, x];
    const t = (v: number) => Math.round((v + m) * 255);
    return (t(r) << 16) | (t(g) << 8) | t(b);
}

function drawParticle(g: Graphics, kind: ParticleKind, radius: number, color: number, alpha: number): void {
    g.clear();
    if (kind === "dot") {
        g.circle(0, 0, radius).fill({ color, alpha });
        g.circle(0, 0, radius * 0.4).fill({ color: 0xffffff, alpha: alpha * 0.55 });
    } else if (kind === "spark") {
        g.moveTo(0, -radius * 1.6)
            .lineTo(radius * 0.45, 0)
            .lineTo(0, radius * 1.6)
            .lineTo(-radius * 0.45, 0)
            .closePath()
            .fill({ color, alpha });
    } else if (kind === "streak") {
        g.roundRect(-radius * 2.4, -radius * 0.35, radius * 4.8, radius * 0.7, radius * 0.35).fill({
            color,
            alpha,
        });
    } else if (kind === "ring") {
        g.circle(0, 0, radius).stroke({ color, width: Math.max(2, radius * 0.22), alpha });
    } else {
        // shard
        g.moveTo(0, -radius)
            .lineTo(radius * 0.7, radius * 0.4)
            .lineTo(-radius * 0.55, radius * 0.55)
            .closePath()
            .fill({ color, alpha });
    }
}

const STYLE: Record<
    BurstStyle,
    {
        count: number;
        kinds: ParticleKind[];
        speed: [number, number];
        life: [number, number];
        radius: [number, number];
        drag: number;
        gravity: number;
        sat: number;
        lit: [number, number];
        fan?: number;
    }
> = {
    gate: {
        count: 22,
        kinds: ["dot", "spark", "streak"],
        speed: [120, 420],
        life: [280, 620],
        radius: [2.5, 7],
        drag: 0.086,
        gravity: 40,
        sat: 85,
        lit: [55, 88],
    },
    goldGate: {
        count: 28,
        kinds: ["spark", "shard", "dot"],
        speed: [140, 480],
        life: [320, 700],
        radius: [3, 8],
        drag: 0.063,
        gravity: 55,
        sat: 90,
        lit: [50, 82],
    },
    impact: {
        count: 30,
        kinds: ["shard", "spark", "dot", "streak"],
        speed: [180, 560],
        life: [300, 720],
        radius: [2.5, 9],
        drag: 0.024,
        gravity: 220,
        sat: 70,
        lit: [45, 80],
    },
    bullseye: {
        count: 48,
        kinds: ["spark", "ring", "dot", "streak"],
        speed: [200, 640],
        life: [400, 900],
        radius: [3, 12],
        drag: 0.013,
        gravity: 90,
        sat: 95,
        lit: [55, 90],
    },
    defeat: {
        count: 18,
        kinds: ["shard", "dot"],
        speed: [80, 280],
        life: [250, 500],
        radius: [2, 6],
        drag: 0.161,
        gravity: 280,
        sat: 40,
        lit: [35, 60],
    },
    trail: {
        count: 3,
        kinds: ["dot", "streak"],
        speed: [20, 80],
        life: [120, 260],
        radius: [1.5, 4],
        drag: 0.002,
        gravity: 10,
        sat: 80,
        lit: [60, 90],
        fan: 0.6,
    },
    confetti: {
        count: 36,
        kinds: ["shard", "spark", "dot"],
        speed: [160, 520],
        life: [500, 1100],
        radius: [3, 9],
        drag: 0.161,
        gravity: 340,
        sat: 90,
        lit: [50, 85],
    },
};

export function createParticleEmitter(
    root: { addChild: (g: Graphics) => void },
    random = new NoiseRandom(),
): ParticleEmitter {
    const particles = new Set<LiveParticle>();
    let trailCooldown = 0;

    function spawn(
        x: number,
        y: number,
        kind: ParticleKind,
        vx: number,
        vy: number,
        lifeMs: number,
        radius: number,
        color: number,
        drag: number,
        gravity: number,
    ): void {
        const g = new Graphics();
        drawParticle(g, kind, radius, color, 1);
        g.x = x;
        g.y = y;
        g.rotation = Math.atan2(vy, vx);
        root.addChild(g);
        particles.add({
            g,
            kind,
            vx,
            vy,
            life: lifeMs,
            lifeMs,
            spin: random.float(-4, 4),
            radius,
            drag,
            gravity,
            color,
        });
    }

    return {
        burst(x, y, opts) {
            const style = opts?.style ?? "impact";
            const preset = STYLE[style];
            const count = opts?.burst ?? preset.count;
            const baseHue = opts?.hue ?? 48;
            const speedScale = opts?.speedScale ?? 1;
            const dir = opts?.direction;
            const fan = preset.fan ?? Math.PI * 2;

            for (let i = 0; i < count; i += 1) {
                const kind = preset.kinds[i % preset.kinds.length] ?? "dot";
                let angle: number;
                if (dir !== undefined) {
                    angle = dir + random.float(-fan / 2, fan / 2);
                } else {
                    angle = (Math.PI * 2 * i) / count + random.float(-0.2, 0.2);
                }
                const speed = random.float(preset.speed[0], preset.speed[1]) * speedScale;
                const life = random.float(preset.life[0], preset.life[1]);
                const radius = random.float(preset.radius[0], preset.radius[1]);
                const hue = baseHue + random.float(-28, 28);
                const color = hsl(hue, preset.sat, random.float(preset.lit[0], preset.lit[1]));
                // rings expand outward slowly
                if (kind === "ring") {
                    spawn(x, y, kind, 0, 0, life * 1.1, radius * 0.6, color, 1, 0);
                    continue;
                }
                spawn(
                    x + random.float(-3, 3),
                    y + random.float(-3, 3),
                    kind,
                    Math.cos(angle) * speed,
                    Math.sin(angle) * speed,
                    life,
                    radius,
                    color,
                    preset.drag,
                    preset.gravity,
                );
            }
        },

        trail(x, y, angle, hue = 48) {
            trailCooldown += 1;
            if (trailCooldown % 2 !== 0) return;
            const preset = STYLE.trail;
            for (let i = 0; i < preset.count; i += 1) {
                const kind = preset.kinds[i % preset.kinds.length] ?? "dot";
                const a = angle + Math.PI + random.float(-0.45, 0.45);
                const speed = random.float(preset.speed[0], preset.speed[1]);
                spawn(
                    x + random.float(-4, 4),
                    y + random.float(-4, 4),
                    kind,
                    Math.cos(a) * speed,
                    Math.sin(a) * speed,
                    random.float(preset.life[0], preset.life[1]),
                    random.float(preset.radius[0], preset.radius[1]),
                    hsl(hue + random.float(-15, 15), 80, random.float(60, 90)),
                    preset.drag,
                    preset.gravity,
                );
            }
        },

        update(dtSeconds: number) {
            if (!particles.size) return;
            const toRemove: LiveParticle[] = [];
            for (const p of particles) {
                p.life -= dtSeconds * 1000;
                // `drag` is the fraction of speed retained after one second, so
                // raising it to dtSeconds keeps trajectories identical whether
                // the ticker runs at 60 Hz or 120 Hz. A flat per-frame multiply
                // made 120 Hz twice as draggy.
                const decay = p.drag ** dtSeconds;
                p.vx *= decay;
                p.vy = p.vy * decay + p.gravity * dtSeconds;
                p.g.x += p.vx * dtSeconds;
                p.g.y += p.vy * dtSeconds;
                p.g.rotation += p.spin * dtSeconds;
                const ratio = Math.max(0, p.life / p.lifeMs);
                p.g.alpha = ratio;
                if (p.kind === "ring") {
                    const grow = 1 + (1 - ratio) * 3.2;
                    p.g.scale.set(grow);
                    p.g.alpha = ratio * 0.85;
                } else {
                    p.g.scale.set(0.35 + ratio * 0.75);
                }
                if (p.life <= 0) toRemove.push(p);
            }
            for (const p of toRemove) {
                p.g.parent?.removeChild(p.g);
                p.g.destroy();
                particles.delete(p);
            }
        },

        destroy() {
            for (const p of particles) {
                p.g.parent?.removeChild(p.g);
                p.g.destroy();
            }
            particles.clear();
        },

        get activeCount() {
            return particles.size;
        },
    };
}
