/**
 * Design-resolution stage: scene code works in fixed DESIGN UNITS, and this
 * module maps them to real pixels — so anything sized at 1/4 of the design
 * width takes up 1/4 of the screen width on EVERY device and aspect ratio.
 *
 * How it works (width-fit, the pattern a shipped RUN game uses for all of
 * its gameplay layout):
 *   - The stage root container is scaled by screenWidth / DESIGN_WIDTH.
 *   - Horizontal space is therefore always exactly DESIGN_WIDTH units wide.
 *   - Vertical space varies with the device: designHeight() reports how many
 *     units tall the screen currently is (taller phones simply see more).
 *     Anchor vertical layout to top / bottom / center via designHeight() —
 *     never hardcode a bottom edge.
 *
 * With the 9:16 device-frame clamp in styles/app.css, designHeight() for a
 * DESIGN_WIDTH of 720 ranges from 1280 (9:16 exactly) to ~1560 (tall 19.5:9
 * phones). Design your layout to work across that range: keep must-see
 * content within the top 1280 units or bottom-anchor it.
 */
import { Container, type Application } from "pixi.js";

/**
 * ADAPT: the game's design width, in units. 720 is a good default for
 * portrait (art assets sized against a 720-wide layout look right at 2x DPR
 * on modern phones). For a LANDSCAPE game, invert the pattern: fix a design
 * HEIGHT instead and scale by screenHeight / DESIGN_HEIGHT, letting width
 * vary — see layout() below.
 */
export const DESIGN_WIDTH = 720;

/** What createStage returns — the surface scenes build against. */
export interface Stage {
    /** Add all scene content here (NOT app.stage), positioned in design units. */
    root: Container;
    /** Constant: the design-space width (= DESIGN_WIDTH). */
    width: number;
    /** Current screen height in design units — re-read after resizes. */
    designHeight(): number;
    /** Current design-unit → pixel factor (rarely needed directly). */
    scale(): number;
    /** Subscribe to resizes (re-anchor bottom/center content). Returns unsubscribe. */
    onResize(cb: () => void): () => void;
    destroy(): void;
}

/**
 * Create the stage on a Pixi app. Add all scene content to `stage.root`
 * (NOT app.stage) and position/size it in design units.
 */
export function createStage(app: Application): Stage {
    const root = new Container();
    app.stage.addChild(root);

    const resizeCbs = new Set<() => void>();
    let _designHeight = 0;

    const layout = () => {
        const s = app.screen.width / DESIGN_WIDTH;
        root.scale.set(s);
        _designHeight = app.screen.height / s;
        for (const cb of resizeCbs) cb();
    };

    // app.screen is in CSS pixels regardless of resolution/autoDensity, so
    // the design mapping is unaffected by devicePixelRatio.
    app.renderer.on("resize", layout);
    layout();

    return {
        root,
        width: DESIGN_WIDTH,
        designHeight: () => _designHeight,
        scale: () => root.scale.x,
        onResize(cb) {
            resizeCbs.add(cb);
            return () => resizeCbs.delete(cb);
        },
        destroy() {
            app.renderer.off("resize", layout);
            resizeCbs.clear();
            root.destroy({ children: true });
        },
    };
}
