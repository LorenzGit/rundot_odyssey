import { Container, Graphics, type Application } from "pixi.js";

export const DESIGN_WIDTH = 1920;
export const DESIGN_HEIGHT = 1080;

/**
 * Design-space edge budget for HUD chrome.
 *
 * Two things push chrome inwards and they stack: the cover-fit crop (design
 * pixels that fall outside the host at all) and the device safe area (pixels
 * the host shows but the sensor housing or home indicator sits on top of). On
 * a landscape iPhone the crop is vertical and the safe area is horizontal, so
 * using only one of them leaves the HUD under the notch or off the frame.
 */
export interface CoverInsets {
    left: number;
    right: number;
    top: number;
    bottom: number;
    /** Host size in CSS pixels (canvas buffer after resize). */
    hostWidth: number;
    hostHeight: number;
    scale: number;
}

export interface Stage {
    root: Container;
    scale(): number;
    /** Cover crop in design pixels — use to keep HUD inside the visible frame. */
    coverInsets(): CoverInsets;
    onResize(callback: () => void): () => void;
    destroy(): void;
}

/** CSS safe-area insets in CSS pixels, read from the live custom properties. */
export interface SafeAreaCss {
    top: number;
    right: number;
    bottom: number;
    left: number;
}

function readNumber(styles: CSSStyleDeclaration, name: string): number {
    const raw = Number.parseFloat(styles.getPropertyValue(name));
    return Number.isFinite(raw) ? Math.max(0, raw) : 0;
}

/**
 * Live safe-area insets. `--safe-*` is set in app.css from the ViewDeck override
 * or `env(safe-area-inset-*)`, so this follows a rotation without extra wiring.
 */
export function readSafeAreaCss(): SafeAreaCss {
    if (typeof window === "undefined") return { top: 0, right: 0, bottom: 0, left: 0 };
    const styles = window.getComputedStyle(document.documentElement);
    return {
        top: readNumber(styles, "--safe-top"),
        right: readNumber(styles, "--safe-right"),
        bottom: readNumber(styles, "--safe-bottom"),
        left: readNumber(styles, "--safe-left"),
    };
}

/**
 * Cover-fit crop plus device safe area, both expressed in design pixels.
 * Always ≥ 0; zero on a 16:9 host with no insets.
 */
export function computeCoverInsets(
    hostWidth: number,
    hostHeight: number,
    safeArea: SafeAreaCss = { top: 0, right: 0, bottom: 0, left: 0 },
): CoverInsets {
    if (hostWidth <= 0 || hostHeight <= 0) {
        return { left: 0, right: 0, top: 0, bottom: 0, hostWidth: 0, hostHeight: 0, scale: 1 };
    }
    const scale = Math.max(hostWidth / DESIGN_WIDTH, hostHeight / DESIGN_HEIGHT);
    const visibleW = hostWidth / scale;
    const visibleH = hostHeight / scale;
    const cropX = Math.max(0, (DESIGN_WIDTH - visibleW) / 2);
    const cropY = Math.max(0, (DESIGN_HEIGHT - visibleH) / 2);
    return {
        left: cropX + safeArea.left / scale,
        right: cropX + safeArea.right / scale,
        top: cropY + safeArea.top / scale,
        bottom: cropY + safeArea.bottom / scale,
        hostWidth,
        hostHeight,
        scale,
    };
}

/**
 * Cover the host completely — no letterbox bands.
 *
 * With ViewDeck left/right layers the page content is often *narrower* than
 * 16:9, so "contain" produces solid top/bottom bars. Cover fills that slot
 * (cropping design left/right if needed) so the landscape art goes edge-to-edge.
 */
export function createStage(app: Application): Stage {
    const frame = new Container();
    const root = new Container();
    const mask = new Graphics().rect(0, 0, DESIGN_WIDTH, DESIGN_HEIGHT).fill(0xffffff);
    root.mask = mask;
    frame.addChild(root, mask);
    app.stage.addChild(frame);
    const callbacks = new Set<() => void>();
    let lastInsets = computeCoverInsets(app.screen.width, app.screen.height, readSafeAreaCss());

    const layout = (): void => {
        const width = app.screen.width;
        const height = app.screen.height;
        if (width <= 0 || height <= 0) return;
        const scale = Math.max(width / DESIGN_WIDTH, height / DESIGN_HEIGHT);
        frame.scale.set(scale);
        frame.position.set((width - DESIGN_WIDTH * scale) / 2, (height - DESIGN_HEIGHT * scale) / 2);
        lastInsets = computeCoverInsets(width, height, readSafeAreaCss());
        for (const callback of callbacks) callback();
    };

    app.renderer.on("resize", layout);
    // The safe area changes on rotation without the canvas necessarily resizing.
    window.addEventListener("orientationchange", layout);
    const host = app.canvas.parentElement;
    const observer = host
        ? new ResizeObserver(() => {
              if (host.clientWidth <= 0 || host.clientHeight <= 0) return;
              app.renderer.resize(host.clientWidth, host.clientHeight);
              layout();
          })
        : null;
    observer?.observe(host as HTMLElement);
    layout();

    return {
        root,
        scale: () => frame.scale.x,
        coverInsets: () => lastInsets,
        onResize(callback) {
            callbacks.add(callback);
            return () => callbacks.delete(callback);
        },
        destroy() {
            observer?.disconnect();
            window.removeEventListener("orientationchange", layout);
            app.renderer.off("resize", layout);
            callbacks.clear();
            frame.destroy({ children: true });
        },
    };
}
