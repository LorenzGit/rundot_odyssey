/**
 * Per-level scenery — sky, parallax backdrop and light grade.
 *
 * Only three painted backdrops exist for eight courses, so a course's identity
 * comes from the light around them: its own sky gradient, a tint on the
 * painting, a colour wash, and a vignette. Eight courses read as eight times of
 * day without eight paintings.
 *
 * Everything here is a full-frame grade over the painting. An earlier version
 * also drew code silhouettes — hills, columns, sails — on top of it; painted
 * art and flat vector shapes at the same depth read as a rendering bug rather
 * than as depth, so these layers now only ever adjust the painting's light.
 *
 * Nothing here is gameplay: no collider reads these containers.
 */
import { Container, Sprite, Texture } from "pixi.js";
import type { LevelData, LevelScenery } from "./types.ts";

export const DESIGN_WIDTH = 1920;
export const DESIGN_HEIGHT = 1080;

export interface SceneryLayers {
    root: Container;
}

/** Cover a dest rect with the texture; centers the overflow. */
export function fitBackgroundCoverHeight(sprite: Sprite, destW: number, destH: number): void {
    const tw = Math.max(1, sprite.texture.width);
    const th = Math.max(1, sprite.texture.height);
    const scale = Math.max(destW / tw, destH / th);
    sprite.scale.set(scale);
    sprite.position.set((destW - tw * scale) / 2, (destH - th * scale) / 2);
}

export interface GradientStop {
    at: number;
    color: number;
    alpha: number;
}

function css(color: number, alpha: number): string {
    return `rgba(${(color >> 16) & 0xff}, ${(color >> 8) & 0xff}, ${color & 0xff}, ${alpha})`;
}

/**
 * Vertical gradient as a stretched 1×N texture.
 *
 * Drawing this as stacked translucent Graphics bands looked fine at alpha 1 and
 * produced visible horizontal seams the moment any stop was translucent: the
 * one-pixel overlap that hides a seam in opaque bands double-composites in
 * translucent ones, printing a line across the sky at every band boundary.
 * A canvas gradient has no bands at all.
 */
export function verticalGradient(width: number, height: number, stops: readonly GradientStop[]): Sprite {
    const canvas = document.createElement("canvas");
    canvas.width = 1;
    canvas.height = 256;
    const context = canvas.getContext("2d");
    if (context) {
        const ramp = context.createLinearGradient(0, 0, 0, 256);
        for (const stop of stops) {
            ramp.addColorStop(Math.max(0, Math.min(1, stop.at)), css(stop.color, stop.alpha));
        }
        context.fillStyle = ramp;
        context.fillRect(0, 0, 1, 256);
    }
    const sprite = new Sprite(Texture.from(canvas));
    sprite.width = width;
    sprite.height = height;
    return sprite;
}

/** Soft dark edges so the bright HUD plaques always have something to sit on. */
function vignette(scenery: LevelScenery): Container {
    const depth = 0.16 + scenery.washAlpha * 0.5;
    const band = 220;
    const root = new Container();
    const top = verticalGradient(DESIGN_WIDTH + 400, band, [
        { at: 0, color: 0x02121f, alpha: depth },
        { at: 1, color: 0x02121f, alpha: 0 },
    ]);
    top.position.set(-200, -60);
    const bottom = verticalGradient(DESIGN_WIDTH + 400, band, [
        { at: 0, color: 0x02121f, alpha: 0 },
        { at: 1, color: 0x02121f, alpha: depth },
    ]);
    bottom.position.set(-200, DESIGN_HEIGHT + 60 - band);
    root.addChild(top, bottom);
    return root;
}

/**
 * Build sky → backdrop → grade for a level.
 *
 * The painting fills the design frame at its own scale and stays put. It is
 * deliberately NOT stretched to the course width: a 2900px course would blow a
 * 1504px painting up past 2.5× and go soft, and since the whole course is
 * fitted on screen there is nothing to scroll it against anyway.
 */
export function createScenery(level: LevelData, backdrop: Texture): SceneryLayers {
    const scenery = level.scenery;
    const root = new Container();

    const sky = verticalGradient(DESIGN_WIDTH, DESIGN_HEIGHT, [
        { at: 0, color: scenery.skyTop, alpha: 1 },
        { at: 1, color: scenery.skyBottom, alpha: 1 },
    ]);
    root.addChild(sky);

    const backdropLayer = new Container();
    const backdropSprite = new Sprite(backdrop);
    fitBackgroundCoverHeight(backdropSprite, DESIGN_WIDTH, DESIGN_HEIGHT);
    backdropSprite.tint = scenery.backdropTint;
    backdropLayer.addChild(backdropSprite);
    root.addChild(backdropLayer);

    // Atmospheric grade: the course's own light, densest around the horizon and
    // thinning towards the top of the sky and the foreground.
    const grade = new Container();
    if (scenery.washAlpha > 0) {
        grade.addChild(
            verticalGradient(DESIGN_WIDTH + 400, DESIGN_HEIGHT + 400, [
                { at: 0, color: scenery.skyTop, alpha: scenery.washAlpha * 0.85 },
                { at: 0.58, color: scenery.washColor, alpha: scenery.washAlpha },
                { at: 1, color: scenery.washColor, alpha: scenery.washAlpha * 0.4 },
            ]),
        );
    }
    root.addChild(grade);
    root.addChild(vignette(scenery));

    grade.position.set(-200, -200);
    return { root };
}
