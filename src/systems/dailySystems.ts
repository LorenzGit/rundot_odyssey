import { getRunCapabilities } from "../sdk/runSdk.ts";
import { returnReminders } from "./retention/retentionConfig.ts";
import { hasServerTime, localDayKey, serverNow } from "./serverTime.ts";
import { store } from "../state/store.ts";
import { saveSystem } from "./save.ts";
import { runtimeServices } from "./runtimeServices.ts";
import { formatNumber } from "./localization.ts";

const REWARDS = [25, 35, 50, 65, 85, 110, 175] as const;
const inFlight = new Set<string>();

export interface TimeGate {
    ready: boolean;
    authoritative: boolean;
    day: string | null;
    label: string;
}

export interface QuestView {
    id: string;
    label: string;
    value: number;
    target: number;
    reward: number;
    claimed: boolean;
    claimable: boolean;
}

function gate(): TimeGate {
    const capabilities = getRunCapabilities();
    // The SDK's browser mock is useful for exercising API shapes, but its
    // clock is not authoritative. Treat it like local development so preview
    // claims remain usable and are labelled non-authoritative.
    const host = capabilities.host && !capabilities.mock;
    if (host && !hasServerTime())
        return { ready: false, authoritative: true, day: null, label: "WAITING FOR TRUSTED RUN TIME" };
    return {
        ready: true,
        authoritative: host,
        day: localDayKey(serverNow()),
        label: host ? "TRUSTED RUN TIME" : "LOCAL DEV FALLBACK · NON-AUTHORITATIVE",
    };
}

function previousDay(day: string): string {
    const date = new Date(`${day}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() - 1);
    return date.toISOString().slice(0, 10);
}

function ensureQuestDay(day: string): void {
    const state = store.get();
    if (state.dailyQuestDay === day) return;
    store.patch({ dailyQuestDay: day, dailyQuestProgress: {} });
    void saveSystem.flush();
}

async function commitGrant(id: string, coins: number, patch: Parameters<typeof store.patch>[0]): Promise<boolean> {
    if (inFlight.has(id)) return false;
    inFlight.add(id);
    const before = store.get();
    store.patch({ ...patch, coins: before.coins + coins });
    const saved = await saveSystem.flush();
    if (!saved) {
        // Revert by DELTA against the current state, not by restoring the
        // `before` snapshot wholesale: a reward claim and a quest claim can
        // overlap on one failed flush, and absolute restores would each wipe
        // the other's revert (and any coin change made during the await).
        // Scalar reward fields are safe to restore from `before` — only a
        // reward claim writes them, and its claim id dedupes concurrency.
        const current = store.get();
        const revert: Parameters<typeof store.patch>[0] = {
            coins: Math.max(0, current.coins - coins),
        };
        if ("dailyRewardClaimIds" in patch) {
            revert.dailyRewardClaimIds = current.dailyRewardClaimIds.filter((claimId) => claimId !== id);
            revert.dailyRewardLastClaimDay = before.dailyRewardLastClaimDay;
            revert.dailyRewardStreak = before.dailyRewardStreak;
        }
        if ("dailyQuestClaimIds" in patch) {
            revert.dailyQuestClaimIds = current.dailyQuestClaimIds.filter((claimId) => claimId !== id);
        }
        store.patch(revert);
    }
    inFlight.delete(id);
    return saved;
}

export const dailySystems = {
    timeGate(): TimeGate {
        return gate();
    },

    rewardView() {
        const time = gate();
        const state = store.get();
        if (!time.ready || !time.day)
            return { ...time, claimed: false, streak: state.dailyRewardStreak, reward: REWARDS[0] };
        const claimId = `daily-reward:${time.day}`;
        const claimed = state.dailyRewardClaimIds.includes(claimId);
        const nextStreak = state.dailyRewardLastClaimDay === previousDay(time.day) ? state.dailyRewardStreak + 1 : 1;
        const rewardIndex = (Math.max(1, nextStreak) - 1) % REWARDS.length;
        return {
            ...time,
            claimed,
            streak: claimed ? state.dailyRewardStreak : nextStreak,
            reward: REWARDS[rewardIndex] ?? REWARDS[0],
        };
    },

    async claimDailyReward(): Promise<{ ok: boolean; reason: string; coins: number }> {
        const view = this.rewardView();
        if (!runtimeServices.config.dailyRewardsEnabled) return { ok: false, reason: "DISABLED BY LIVEOPS", coins: 0 };
        if (!view.ready || !view.day) return { ok: false, reason: view.label, coins: 0 };
        const claimId = `daily-reward:${view.day}`;
        if (view.claimed || store.get().dailyRewardClaimIds.includes(claimId))
            return { ok: false, reason: "ALREADY CLAIMED", coins: 0 };
        const state = store.get();
        const ok = await commitGrant(claimId, view.reward, {
            dailyRewardLastClaimDay: view.day,
            dailyRewardStreak: view.streak,
            dailyRewardClaimIds: [...state.dailyRewardClaimIds, claimId].slice(-90),
        });
        if (ok) {
            runtimeServices.track("daily_reward_claimed", {
                streak: view.streak,
                coins: view.reward,
                authoritative: view.authoritative,
            });
            // Kill switch: the 24h reminder promises this reward. Leaving it
            // scheduled pings the player about something they just claimed,
            // which is how a useful notification becomes a muted one.
            void returnReminders.cancel("d1");
        }
        return { ok, reason: ok ? "CLAIMED" : "SAVE FAILED", coins: ok ? view.reward : 0 };
    },

    recordQuestProgress(id: "bounces" | "plays" | "coins", amount = 1): void {
        const time = gate();
        if (!time.ready || !time.day || !runtimeServices.config.dailyQuestsEnabled) return;
        ensureQuestDay(time.day);
        const state = store.get();
        const progress = {
            ...state.dailyQuestProgress,
            [id]: Math.max(0, (state.dailyQuestProgress[id] ?? 0) + amount),
        };
        store.patch({ dailyQuestProgress: progress });
        void saveSystem.flush();
    },

    quests(): QuestView[] {
        const time = gate();
        const state = store.get();
        // Only recordQuestProgress rolls dailyQuestDay forward, so right after
        // midnight the stored progress still belongs to YESTERDAY while the
        // claim ids are already built for today. Counting that stale progress
        // let every completed-but-unreset quest pay out a second time each day.
        const progressIsToday = state.dailyQuestDay === time.day;
        const definitions = [
            { id: "bounces", label: `LAND ${formatNumber(10)} SHOTS`, target: 10, reward: 20 },
            { id: "plays", label: `PLAY ${formatNumber(3)} RUNS`, target: 3, reward: 35 },
            { id: "coins", label: `EARN ${formatNumber(100)} COINS`, target: 100, reward: 50 },
        ];
        return definitions.map((quest) => {
            const claimId = `daily-quest:${time.day ?? "untrusted"}:${quest.id}`;
            const value = progressIsToday ? (state.dailyQuestProgress[quest.id] ?? 0) : 0;
            const claimed = state.dailyQuestClaimIds.includes(claimId);
            return { ...quest, value, claimed, claimable: time.ready && !claimed && value >= quest.target };
        });
    },

    async claimQuest(questId: string): Promise<{ ok: boolean; reason: string; coins: number }> {
        const time = gate();
        if (!runtimeServices.config.dailyQuestsEnabled) return { ok: false, reason: "DISABLED BY LIVEOPS", coins: 0 };
        if (!time.ready || !time.day) return { ok: false, reason: time.label, coins: 0 };
        const quest = this.quests().find((entry) => entry.id === questId);
        if (!quest || !quest.claimable)
            return { ok: false, reason: quest?.claimed ? "ALREADY CLAIMED" : "NOT COMPLETE", coins: 0 };
        const claimId = `daily-quest:${time.day}:${quest.id}`;
        const state = store.get();
        const ok = await commitGrant(claimId, quest.reward, {
            dailyQuestClaimIds: [...state.dailyQuestClaimIds, claimId].slice(-180),
        });
        if (ok)
            runtimeServices.track("daily_quest_claimed", {
                quest_id: quest.id,
                coins: quest.reward,
                authoritative: time.authoritative,
            });
        return { ok, reason: ok ? "CLAIMED" : "SAVE FAILED", coins: ok ? quest.reward : 0 };
    },
};
