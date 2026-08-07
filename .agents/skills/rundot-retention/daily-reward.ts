/**
 * Drop-in daily / return reward + streak for a RUN.game title.
 *
 * Copy into `src/retention/daily-reward.ts`. Tracks a consecutive-day streak on
 * trusted server time and returns the amount to grant — it does NOT touch your
 * economy, so grant the returned currency yourself. Day boundary is UTC; swap
 * `serverDayNumber` for `getFutureTimeAsync` with a PT reset for a fixed local hour.
 */
import RundotGameAPI from "@series-inc/rundot-game-sdk/api";

const LAST_CLAIM_DAY_KEY = "daily_reward_last_day";
const STREAK_KEY = "daily_reward_streak";
const DAY_MS = 24 * 60 * 60 * 1000;

/** Reward for each consecutive day (index 0 = day 1). Streaks past the end repeat the last value. Tune to your economy. */
export const DAILY_REWARDS: number[] = [50, 75, 100, 150, 200, 300, 500];

export interface DailyRewardStatus {
    /** A new day is available to claim. */
    claimable: boolean;
    /** Consecutive days already claimed (before today's claim). */
    streak: number;
    /** Amount the player receives if they claim now. */
    nextAmount: number;
}

/** UTC day number from trusted server time (falls back to the device clock if unavailable). */
async function serverDayNumber(): Promise<number> {
    try {
        const { serverTime } = await RundotGameAPI.requestTimeAsync();
        return Math.floor(serverTime / DAY_MS);
    } catch {
        return Math.floor(Date.now() / DAY_MS);
    }
}

async function readInt(key: string): Promise<number> {
    try {
        const raw = await RundotGameAPI.appStorage.getItem(key);
        const n = raw == null ? NaN : parseInt(raw, 10);
        return Number.isFinite(n) ? n : 0;
    } catch {
        return 0;
    }
}

function rewardForStreak(streak: number): number {
    const idx = Math.min(Math.max(streak, 1), DAILY_REWARDS.length) - 1;
    return DAILY_REWARDS[idx] ?? DAILY_REWARDS[DAILY_REWARDS.length - 1] ?? 0;
}

/** Current claim status without mutating state — drive your reward UI from this. */
export async function getDailyRewardStatus(): Promise<DailyRewardStatus> {
    const today = await serverDayNumber();
    const lastDay = await readInt(LAST_CLAIM_DAY_KEY);
    const streak = await readInt(STREAK_KEY);

    if (lastDay === 0) {
        return { claimable: true, streak: 0, nextAmount: rewardForStreak(1) };
    }

    const claimable = today > lastDay;
    const continues = today === lastDay + 1;
    const nextStreak = claimable ? (continues ? streak + 1 : 1) : streak;
    return { claimable, streak, nextAmount: rewardForStreak(nextStreak) };
}

/**
 * Claim today's reward. Advances the streak on a consecutive day, resets it after
 * a gap, and returns the amount to grant (0 if already claimed today). Grant the
 * returned amount to your own currency.
 */
export async function claimDailyReward(): Promise<{ granted: number; streak: number }> {
    const today = await serverDayNumber();
    const lastDay = await readInt(LAST_CLAIM_DAY_KEY);
    const prevStreak = await readInt(STREAK_KEY);

    if (lastDay !== 0 && today <= lastDay) {
        return { granted: 0, streak: prevStreak };
    }

    const continues = lastDay !== 0 && today === lastDay + 1;
    const streak = continues ? prevStreak + 1 : 1;
    const granted = rewardForStreak(streak);

    try {
        await RundotGameAPI.appStorage.setItem(LAST_CLAIM_DAY_KEY, String(today));
        await RundotGameAPI.appStorage.setItem(STREAK_KEY, String(streak));
    } catch (err) {
        RundotGameAPI.error("daily reward: failed to persist claim", err);
    }
    return { granted, streak };
}

/** Clear streak state (wire to a dev "reset" action). */
export async function resetDailyReward(): Promise<void> {
    try {
        await RundotGameAPI.appStorage.removeItem(LAST_CLAIM_DAY_KEY);
        await RundotGameAPI.appStorage.removeItem(STREAK_KEY);
    } catch {
        // ignore
    }
}
