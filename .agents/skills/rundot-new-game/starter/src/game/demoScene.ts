/**
 * ADAPT: this entire file is a throwaway demo scene. It exists to prove the
 * whole pipeline end-to-end — warmed asset → sprite → ticker loop → store
 * patch → React HUD update — and to be deleted when the real game goes in.
 *
 * It also demonstrates the DESIGN-UNIT coordinate system (see stage.ts):
 * everything below is positioned/sized/moved in design units, so the sprite
 * occupies the same fraction of the screen on every device. The sprite is 180
 * units wide = exactly 25% of the 720-unit design width, everywhere.
 *
 * Scene contract (keep this shape for real scenes): createXxxScene(app, stage)
 * returns { destroy() } — the Scene interface below — that removes its ticker
 * callback and display objects.
 */
import { Assets, Graphics, Sprite, type Application, type Texture, type Ticker } from "pixi.js";
import { store } from "../state/store.ts";
import type { Stage } from "./stage.ts";

/** The scene contract: every createXxxScene(app, stage) returns one of these. */
export interface Scene {
    destroy(): void;
}

export function createDemoScene(app: Application, stage: Stage): Scene {
    // Use the warmed placeholder texture; if the manifest entry was removed,
    // generate one so the demo never renders an empty screen.
    let texture: Texture | null = null;
    try {
        texture = Assets.get<Texture>("placeholder");
    } catch {
        /* not loaded */
    }
    if (!texture) {
        const g = new Graphics().roundRect(0, 0, 64, 64, 12).fill(0x22c55e);
        texture = app.renderer.generateTexture(g);
        g.destroy();
    }

    const sprite = new Sprite(texture);
    sprite.anchor.set(0.5);
    sprite.width = stage.width * 0.25; // 25% of screen width on every device
    sprite.height = sprite.width;
    sprite.x = stage.width / 2;
    sprite.y = stage.designHeight() / 2;
    stage.root.addChild(sprite);

    // Design units per second — same fraction-of-screen speed everywhere.
    let vx = 300;
    let vy = 240;

    // Vertical bounds change when the screen resizes (designHeight varies by
    // aspect ratio); keep the sprite inside the new bounds.
    const offResize = stage.onResize(() => {
        sprite.y = Math.min(sprite.y, stage.designHeight() - sprite.height / 2);
    });

    const tick = (ticker: Ticker) => {
        const dt = ticker.deltaMS / 1000;
        sprite.x += vx * dt;
        sprite.y += vy * dt;
        sprite.rotation += dt;

        const halfW = sprite.width / 2;
        const halfH = sprite.height / 2;
        const maxX = stage.width;
        const maxY = stage.designHeight();
        let bounced = false;
        if (sprite.x < halfW) {
            sprite.x = halfW;
            vx = Math.abs(vx);
            bounced = true;
        }
        if (sprite.x > maxX - halfW) {
            sprite.x = maxX - halfW;
            vx = -Math.abs(vx);
            bounced = true;
        }
        if (sprite.y < halfH) {
            sprite.y = halfH;
            vy = Math.abs(vy);
            bounced = true;
        }
        if (sprite.y > maxY - halfH) {
            sprite.y = maxY - halfH;
            vy = -Math.abs(vy);
            bounced = true;
        }

        // Game → React bridge demo: patch the store on discrete events
        // (never every frame) and the HUD re-renders.
        if (bounced) store.patch({ score: store.get().score + 1 });
    };
    app.ticker.add(tick);

    return {
        destroy() {
            app.ticker.remove(tick);
            offResize();
            sprite.destroy();
        },
    };
}
