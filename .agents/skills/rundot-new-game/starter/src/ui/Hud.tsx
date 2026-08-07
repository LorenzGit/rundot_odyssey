/**
 * In-game HUD: a React overlay above the Pixi canvas.
 *
 * Pattern to keep: the overlay itself is pointer-events-none so taps fall
 * through to the canvas; each interactive control opts back in with
 * pointer-events-auto. `pt-safe-top` (see app.css) pads below the RUN host
 * header.
 */
import { store, useStore } from "../state/store.ts";

export default function Hud() {
    const score = useStore((s) => s.score);
    const paused = useStore((s) => s.paused);
    return (
        <div className="pointer-events-none absolute inset-0 pt-safe-top">
            <div className="flex items-start justify-between p-4">
                {/* ADAPT: demo counter — replace with real HUD (currencies, wave, timer...) */}
                <div className="rounded-xl bg-black/50 px-4 py-2 text-lg font-bold tabular-nums">Bounces: {score}</div>
                <button
                    type="button"
                    className="pointer-events-auto rounded-xl bg-black/50 px-4 py-2 text-lg font-bold transition-transform active:scale-95"
                    onClick={() => store.patch({ phase: "menu" })}
                >
                    Menu
                </button>
            </div>
            {paused && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/60">
                    <p className="text-2xl font-bold">Paused</p>
                </div>
            )}
        </div>
    );
}
