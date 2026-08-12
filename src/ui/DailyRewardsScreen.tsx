import { useState } from "react";
import { audioManager } from "../audio/audioManager.ts";
import { dailySystems } from "../systems/dailySystems.ts";
import { runtimeServices } from "../systems/runtimeServices.ts";
import { formatNumber, t } from "../systems/localization.ts";
import { store, useStore } from "../state/store.ts";
import MenuScreenLayout from "./MenuScreenLayout.tsx";

const REWARDS = [25, 35, 50, 65, 85, 110, 175];

export default function DailyRewardsScreen() {
    useStore((state) => `${state.locale}:${state.dailyRewardClaimIds.length}:${state.trustedTimeReady}`);
    const [busy, setBusy] = useState(false);
    const view = dailySystems.rewardView();

    const claim = async () => {
        await audioManager.unlock();
        setBusy(true);
        const result = await dailySystems.claimDailyReward();
        setBusy(false);
        store.patch({ toast: result.ok ? `+${formatNumber(result.coins)} DRACHMAE` : result.reason });
        if (result.ok) {
            audioManager.play("reward");
            void runtimeServices.haptic("success");
            dailySystems.recordQuestProgress("coins", result.coins);
        } else audioManager.play("error");
    };

    return (
        <MenuScreenLayout
            title={t("MenuDailyRewards")}
            kicker="RETURN LOOP"
            actions={
                <button
                    type="button"
                    className="claim-action"
                    disabled={busy || !view.ready || view.claimed}
                    onClick={() => void claim()}
                >
                    {busy
                        ? "SAVING..."
                        : view.claimed
                          ? "CLAIMED TODAY"
                          : `CLAIM ${formatNumber(view.reward)} DRACHMAE`}
                </button>
            }
        >
            <p className="screen-copy">{t("DailyRewardsBody")}</p>
            <p className="authority-label">{view.label}</p>
            <div className="reward-track">
                {REWARDS.map((coins, index) => (
                    <div
                        // The reward index wraps modulo the track, so streaks past
                        // day 7 must highlight by the wrapped position — a straight
                        // `streak === index + 1` goes dark from day 8 onward.
                        className={`reward-day ${
                            view.streak > 0 && (view.streak - 1) % REWARDS.length === index ? "current" : ""
                        }`}
                        key={coins}
                    >
                        <span>DAY {formatNumber(index + 1)}</span>
                        <strong>{formatNumber(coins)}</strong>
                        <small>ΔΡ</small>
                    </div>
                ))}
            </div>
            <p className="safety-note">
                Local-browser claims persist for development but are never presented as RUN-authoritative.
            </p>
        </MenuScreenLayout>
    );
}
