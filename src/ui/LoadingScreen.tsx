/**
 * React loading screen — a safety net only. The HTML #boot-cover stays on top
 * for the entire load gate (setBootProgress in main.tsx drives its bar with
 * real progress), so this screen is normally never seen; it matters only if
 * the cover is lifted early (boot failure).
 */
import { useStore } from "../state/store.ts";
import { formatNumber } from "../systems/localization.ts";

export default function LoadingScreen() {
    const progress = useStore((s) => s.loadProgress);
    const pct = Math.round(progress * 100);
    return (
        <main className="loading-screen pt-safe-top pb-safe-bottom">
            <div className="loading-mark" aria-hidden="true">
                <span className="loading-mark-eye loading-mark-eye-left" />
                <span className="loading-mark-eye loading-mark-eye-right" />
                <span className="loading-mark-smile" />
            </div>
            <div className="loading-title">
                <span>ODYSSEY</span>
                <strong>THE PERFECT SHOT</strong>
            </div>
            <div className="loading-track" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
                <div className="loading-fill" style={{ width: `${pct}%` }} />
            </div>
            <p className="loading-copy">STRINGING THE BOW… {formatNumber(pct)}%</p>
        </main>
    );
}
