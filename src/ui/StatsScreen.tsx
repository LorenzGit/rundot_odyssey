import MenuScreenLayout from "./MenuScreenLayout.tsx";
import { formatNumber, t } from "../systems/localization.ts";
import { useStore } from "../state/store.ts";

export default function StatsScreen() {
    const state = useStore((value) => value);
    const stats: Array<[string, number | string]> = [
        ["BEST SCORE", state.score],
        ["TOTAL PLAYS", state.totalPlays],
        ["LEVEL", state.level],
        ["DRACHMAE", state.coins],
        ["ARROWS OWNED", state.ownedArrows.length],
        ["EQUIPPED", state.equippedArrow.toUpperCase()],
    ];
    return (
        <MenuScreenLayout title={t("MenuStats")} kicker="PLAYER RECORD">
            <p className="screen-copy">{t("StatsBody")}</p>
            <div className="stats-grid">
                {stats.map(([label, value]) => (
                    <article key={label}>
                        <span>{label}</span>
                        <strong>{typeof value === "number" ? formatNumber(value) : value}</strong>
                    </article>
                ))}
            </div>
        </MenuScreenLayout>
    );
}
