import { ARROWS, equipArrow, loadArrowProgress, tryBuyArrow, type ArrowId } from "../game/arrows.ts";
import { formatNumber, t } from "../systems/localization.ts";
import { analytics } from "../systems/analytics/analyticsConfig.ts";
import { saveSystem } from "../systems/save.ts";
import { store, useStore } from "../state/store.ts";
import MenuScreenLayout from "./MenuScreenLayout.tsx";

function hex(n: number): string {
    return `#${n.toString(16).padStart(6, "0")}`;
}

export default function ArrowsScreen() {
    // Re-render when inventory / wallet changes.
    useStore((s) => `${s.coins}:${s.equippedArrow}:${s.ownedArrows.join(",")}:${s.locale}`);
    const progress = loadArrowProgress();

    return (
        <MenuScreenLayout title={t("MenuArrows")} kicker="ARMORY">
            <p className="menu-wallet" style={{ textAlign: "center" }}>
                DRACHMAE {formatNumber(progress.coins)}
            </p>
            <div className="arrow-rack">
                {ARROWS.map((arrow) => {
                    const owned = progress.owned.includes(arrow.id);
                    const equipped = progress.equipped === arrow.id;
                    return (
                        <article key={arrow.id} className={`arrow-row${equipped ? " is-equipped" : ""}`}>
                            <div
                                className="arrow-swatch"
                                style={{
                                    background: `linear-gradient(90deg, ${hex(arrow.fletch)}, ${hex(arrow.shaft)} 40%, ${hex(arrow.head)})`,
                                }}
                                aria-hidden="true"
                            />
                            <div className="arrow-meta">
                                <strong>{arrow.name}</strong>
                                <span>{arrow.blurb}</span>
                            </div>
                            <div className="arrow-actions">
                                {equipped ? (
                                    <span className="equipped-tag">EQUIPPED</span>
                                ) : owned ? (
                                    <button
                                        type="button"
                                        className="ody-btn ody-btn-blue"
                                        style={{ minHeight: 40, padding: "0 16px", fontSize: 13 }}
                                        onClick={() => {
                                            if (equipArrow(progress, arrow.id as ArrowId)) {
                                                void saveSystem.flush();
                                            }
                                        }}
                                    >
                                        EQUIP
                                    </button>
                                ) : (
                                    <>
                                        <span className="arrow-cost">{formatNumber(arrow.cost)}</span>
                                        <button
                                            type="button"
                                            className="ody-btn"
                                            style={{ minHeight: 40, padding: "0 16px", fontSize: 13 }}
                                            disabled={progress.coins < arrow.cost}
                                            onClick={() => {
                                                const result = tryBuyArrow(progress, arrow.id as ArrowId);
                                                if (result.ok) {
                                                    analytics.spend(
                                                        "drachmae",
                                                        arrow.cost,
                                                        "arrow_unlock",
                                                        arrow.id,
                                                        progress.coins,
                                                    );
                                                    void saveSystem.flush();
                                                    store.patch({ toast: `BOUGHT ${arrow.name}` });
                                                } else {
                                                    store.patch({
                                                        toast:
                                                            result.reason === "coins"
                                                                ? "NOT ENOUGH DRACHMAE"
                                                                : "ALREADY OWNED",
                                                    });
                                                }
                                            }}
                                        >
                                            BUY
                                        </button>
                                    </>
                                )}
                            </div>
                        </article>
                    );
                })}
            </div>
        </MenuScreenLayout>
    );
}
