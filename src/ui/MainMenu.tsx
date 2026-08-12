import packageJson from "../../package.json";
import { ARROWS, getArrow, loadArrowProgress } from "../game/arrows.ts";
import { featureIntroducedAt, requiredMightAt } from "../game/levelGenerator.ts";
import { endlessState, restartFromStart } from "../game/progression.ts";
import { formatNumber, t } from "../systems/localization.ts";
import { runtimeServices } from "../systems/runtimeServices.ts";
import { saveSystem } from "../systems/save.ts";
import { store, useStore, type MenuScreen } from "../state/store.ts";

type FeatureIcon = "calendar" | "quests" | "shop" | "stats" | "settings";

/** Secondary destinations — ARROWS is a primary CTA, not repeated here. */
const features: Array<{ screen: MenuScreen; icon: FeatureIcon; label: string; short: string }> = [
    { screen: "daily-rewards", icon: "calendar", label: "MenuDailyRewards", short: "DAILY" },
    { screen: "daily-quests", icon: "quests", label: "MenuDailyQuests", short: "QUESTS" },
    { screen: "shop", icon: "shop", label: "MenuShop", short: "SHOP" },
    { screen: "stats", icon: "stats", label: "MenuStats", short: "STATS" },
    { screen: "settings", icon: "settings", label: "MenuSettings", short: "SET" },
];

function FeatureIconSvg({ name }: { name: FeatureIcon }) {
    if (name === "calendar") {
        return (
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6 3v3M18 3v3M4 8h16M5 5h14a2 2 0 0 1 2 2v12H3V7a2 2 0 0 1 2-2Z" />
                <path d="m8 14 2 2 5-5" />
            </svg>
        );
    }
    if (name === "quests") {
        return (
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6 4h12v16H6zM9 8h6M9 12h6M9 16h4" />
            </svg>
        );
    }
    if (name === "shop") {
        return (
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M5 9h14l-1 11H6L5 9Z" />
                <path d="M8 10V7a4 4 0 0 1 8 0v3" />
            </svg>
        );
    }
    if (name === "stats") {
        return (
            <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M5 19V9h4v10M10 19V5h4v14M15 19v-7h4v7M3 19h18" />
            </svg>
        );
    }
    return (
        <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.26.6.85 1 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z" />
        </svg>
    );
}

/** Deterministic mote positions — no Math.random in game source. */
const MOTE_SLOTS = Array.from({ length: 14 }, (_, i) => ({
    id: `mote-${i}`,
    left: `${6 + ((i * 17) % 88)}%`,
    top: `${8 + ((i * 23) % 80)}%`,
    delay: `${(i % 7) * 0.35}s`,
}));

function enterRun(): void {
    const depth = endlessState().depth;
    // Step 2 is emitted only after Pixi has actually built the course. Keeping
    // the tap and the successful start separate makes load failures visible.
    runtimeServices.funnel(1, "play_tapped", "odyssey_first_play", 1);
    store.patch({ phase: "playing", score: 0, level: depth });
}

/** What the next few courses will throw at the player, for the teaser line. */
function upcomingFeature(depth: number): { at: number; name: string } | null {
    for (let ahead = 0; ahead < 12; ahead += 1) {
        const name = featureIntroducedAt(depth + ahead);
        if (name) return { at: depth + ahead, name };
    }
    return null;
}

export default function MainMenu() {
    useStore((state) => state.locale);
    const coins = useStore((state) => state.coins);
    // Subscribing to depth is what re-renders the CTA after a run.
    useStore((state) => state.depth);
    useStore((state) => state.equippedArrow);
    const progress = loadArrowProgress();
    const equipped = getArrow(progress.equipped);
    const drachmae = Math.max(coins, progress.coins);
    const endless = endlessState();
    const bestDepth = useStore((state) => state.bestDepth);
    const bestStars = useStore((state) => state.bestStars);
    const upcoming = upcomingFeature(endless.depth);

    // The nudge that makes the shop worth opening: the cheapest shaft the
    // player does not own that is strictly better than the one equipped.
    const upgrade = ARROWS.filter((arrow) => !progress.owned.includes(arrow.id) && arrow.might >= equipped.might).sort(
        (a, b) => a.cost - b.cost,
    )[0];
    const canAffordUpgrade = upgrade ? drachmae >= upgrade.cost : false;
    const needsUpgrade = !endless.canAttempt;

    return (
        <main className="menu-shell">
            <div className="menu-backdrop" aria-hidden="true" />
            <div className="menu-motes" aria-hidden="true">
                {MOTE_SLOTS.map((mote) => (
                    <span key={mote.id} style={{ left: mote.left, top: mote.top, animationDelay: mote.delay }} />
                ))}
            </div>

            <section className="menu-card ody-panel" aria-label="Odyssey main menu">
                <header className="menu-brand">
                    <h1 className="menu-wordmark">ODYSSEY</h1>
                    <p className="menu-subhead">THE PERFECT SHOT</p>
                    <p className="menu-wallet">
                        DRACHMAE {formatNumber(drachmae)} · {equipped.name} · MIGHT {formatNumber(equipped.might)}
                    </p>
                </header>

                <div className="menu-run">
                    <p className="menu-section-label">ENDLESS ASCENT</p>
                    <div className="run-depth">
                        <span className="run-depth-label">COURSE</span>
                        <strong className="run-depth-value">{formatNumber(endless.depth)}</strong>
                    </div>
                    <div className="run-stats">
                        <span>
                            BEST <strong>{formatNumber(bestDepth)}</strong>
                        </span>
                        <span>
                            STARS <strong>{formatNumber(bestStars)}/3</strong>
                        </span>
                    </div>
                    {needsUpgrade ? (
                        <p className="run-teaser is-blocked">
                            OBSIDIAN GRADE {formatNumber(endless.requiredMight)} AHEAD · NEEDS{" "}
                            {endless.blocker?.name ?? "A HEAVIER SHAFT"}
                        </p>
                    ) : upcoming ? (
                        <p className="run-teaser">
                            {upcoming.at === endless.depth
                                ? `NEW THIS COURSE: ${upcoming.name}`
                                : `COURSE ${formatNumber(upcoming.at)}: ${upcoming.name}`}
                        </p>
                    ) : null}
                </div>

                <div className="menu-primary-row">
                    <button type="button" className="ody-btn" onClick={enterRun} disabled={needsUpgrade}>
                        {endless.depth === 1 ? "PLAY" : "CONTINUE"}
                    </button>
                    <button
                        type="button"
                        className={`ody-btn ody-btn-blue${needsUpgrade || canAffordUpgrade ? " has-badge" : ""}`}
                        onClick={() => store.patch({ menuScreen: "arrows" })}
                        aria-label={needsUpgrade || canAffordUpgrade ? "Arrows — upgrade available" : "Arrows"}
                    >
                        ARROWS
                        {(needsUpgrade || canAffordUpgrade) && (
                            <span className="btn-badge" aria-hidden="true">
                                !
                            </span>
                        )}
                    </button>
                    {endless.depth > 1 && (
                        <button
                            type="button"
                            className="ody-btn ody-btn-slate menu-restart"
                            onClick={() => {
                                restartFromStart();
                                void saveSystem.flush();
                            }}
                            title="Replay from course 1 to farm drachmae"
                        >
                            ↺
                        </button>
                    )}
                </div>

                <nav className="menu-feature-row" aria-label="Game menus">
                    {features.map(({ screen, icon, label, short }) => (
                        <button
                            key={screen}
                            type="button"
                            className="feature-chip"
                            onClick={() => store.patch({ menuScreen: screen })}
                        >
                            <FeatureIconSvg name={icon} />
                            <span className="feature-chip-label" data-short={short}>
                                {t(label)}
                            </span>
                        </button>
                    ))}
                </nav>

                <p className="menu-hint">
                    {requiredMightAt(endless.depth) > 1
                        ? "Heavier shafts smash obsidian · springier shafts survive more ricochets"
                        : "Up/down aim · Left/right power · Release to fire"}
                </p>
            </section>

            <p className="menu-version">v{packageJson.version}</p>
        </main>
    );
}
