/**
 * Thin React overlay above the Pixi canvas.
 *
 * In-game chrome (score, pause, power) stays in Pixi so it cover-fits with the
 * stage. This layer only owns the host-lifecycle pause sheet — no second MENU
 * button stacked on the Pixi pause control.
 */
import { useStore } from "../state/store.ts";
import { resumeFromHostPause } from "../systems/hostPause.ts";

export default function Hud() {
    const paused = useStore((s) => s.paused);
    // Pixi owns its own pause overlay for player-initiated pause. This sheet
    // only covers host lifecycle pause (app backgrounded, ad overlay, etc.).
    if (!paused) return null;
    return (
        <div className="pointer-events-none play-surface">
            <button type="button" className="pause-overlay pointer-events-auto" onClick={resumeFromHostPause}>
                <div>
                    <p className="eyebrow">HOLD THE WIND</p>
                    <strong>PAUSED</strong>
                    <span>TAP TO RESUME</span>
                </div>
            </button>
        </div>
    );
}
