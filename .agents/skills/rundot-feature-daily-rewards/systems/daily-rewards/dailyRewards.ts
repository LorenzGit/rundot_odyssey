// Daily reward track for RUN games: a finite, ordered list of rewards,
// claimed one per local day, with miss-day forgiveness.
//
// Design: missing a day NEVER resets progress. The
// next claim is always the next unclaimed slot in the track, no matter how
// many calendar days passed since the last claim — the only gate is "one
// claim per local day". Friendly by construction: there is no streak to
// lose, so there is no punishment mechanic to explain or apologise for.
// When every slot is claimed the track is finished forever.
//
// State is two fields persisted inside the host's save blob:
//   { claimed: int, lastClaimDay: 'YYYY-MM-DD'|null }
// This module reaches that object only through the injected getState()
// accessor — it does NOT import the save system. It also does not persist,
// toast, or recompute anything: claimNext() mutates state and applies the
// one-shot grant, then the CALLER runs its pipeline (recompute bonuses,
// save, refresh UI, toast, schedule the reminder). See the README.
//
// Time authority: serverNow() (trusted server clock, extrapolated locally)
// answers "what time is it"; localDayKey() (device-local midnight) defines
// the day boundary. Re-sample with refreshServerTime() on boot, on resume,
// and every time the popup opens — not just at boot.
//
// Typing: createDailyRewards is generic over the game's reward-def type.
// Define the def shape once and applyReward/claimNext/forEachClaimed are
// typed:
//
//   interface MyReward extends RewardDef { type: string; amount: number; }
//   const dailyRewards = createDailyRewards<MyReward>({ ... });

import RundotGameAPI from "@series-inc/rundot-game-sdk/api";
// ADAPT: copy shared/serverTime.ts into the host alongside this file and fix
// this path to match the host's layout if it differs.
import { serverNow, localDayKey, msUntilNextLocalMidnight } from "../../shared/serverTime";

/**
 * One slot in the reward track. The def shape is game-defined — this module
 * only reads array positions and passes defs through to applyReward()/the UI.
 * The optional fields below are the conventions the reference UI understands;
 * extend this interface with the game's real fields (type, amount, ...).
 */
export interface RewardDef {
    /** Big/full-width reward — the reference UI renders it framed. */
    milestone?: boolean;
    /** Reference-UI default tile text; falls back to '+' + amount when absent. */
    label?: string | number;
    amount?: number;
}

/**
 * The persisted state — two fields inside the host's save blob. `claimed`
 * doubles as the index of the next unclaimed slot; `lastClaimDay` is the
 * localDayKey() of the last claim ('YYYY-MM-DD'), or null if never claimed.
 */
export interface DailyRewardsState {
    claimed: number;
    lastClaimDay: string | null;
}

/** Copy for the come-back-tomorrow reminder (config.notification). */
export interface DailyRewardsNotification {
    title: string;
    body: string;
    /** Dedupe custom id for the reminder. Default 'daily_reward'. */
    id?: string;
}

export interface DailyRewardsConfig<R extends RewardDef = RewardDef> {
    /**
     * Ordered reward track. Def shape is game-defined — this module only reads
     * array positions and passes defs through to applyReward()/the UI. The one
     * convention the reference UI understands is an optional `milestone: true`
     * flag for big/full-width rewards. Any length works.
     */
    rewards: R[];
    /**
     * Returns the LIVE persisted `{claimed, lastClaimDay}` object (e.g.
     * `() => game.save.dailyRewards`). claimNext() mutates it in place, so it
     * must be the object inside the save blob, not a copy. May return
     * null/undefined before the save has loaded — treated as "nothing yet".
     */
    getState: () => DailyRewardsState | null | undefined;
    /**
     * Gate for the whole feature (e.g. `() => save.stats.gamesPlayed >= 4`).
     * Defaults to always unlocked.
     */
    isUnlocked?: () => boolean;
    /**
     * Grant a ONE-SHOT reward (currencies, items). Permanent bonuses should be
     * a no-op here and be re-derived from the claimed count instead — see the
     * README's "Permanent bonuses" pattern and forEachClaimed().
     */
    applyReward?: (def: R, index: number) => void;
    /**
     * Enables the come-back-tomorrow reminder with this copy. Omit to disable
     * scheduleReminder()/cancelReminder() entirely. `id` is the dedupe custom
     * id (default 'daily_reward').
     */
    notification?: DailyRewardsNotification;
}

export interface DailyRewards<R extends RewardDef = RewardDef> {
    /** The reward track, exposed for UIs to render. Treat as read-only. */
    rewards: R[];
    /** Fresh default state for the host's defaultSave() merge. */
    defaults(): DailyRewardsState;
    /** Whether the feature is unlocked at all (config.isUnlocked). */
    isUnlocked(): boolean;
    /** True once every slot in the track has been claimed — forever. */
    isComplete(): boolean;
    /** Index of the next unclaimed slot, or -1 when the track is complete. */
    nextIndex(): number;
    /** True when there's a reward the player can claim right now. */
    canClaimNow(): boolean;
    /** Claim the next pending reward; null if claiming isn't currently allowed. */
    claimNext(): R | null;
    /** Iterate every already-claimed reward def in track order. */
    forEachClaimed(fn: (def: R, index: number) => void): void;
    /** Ms until the next claim: 0 when claimable, time to local midnight, or Infinity. */
    msUntilNextClaim(): number;
    /** Schedule the come-back-tomorrow notification (cancel-first dedupe). */
    scheduleReminder(): Promise<void>;
    /** Cancel the pending reminder. */
    cancelReminder(): Promise<void>;
}

export function createDailyRewards<R extends RewardDef = RewardDef>(config: DailyRewardsConfig<R>): DailyRewards<R> {
    const { rewards, getState, isUnlocked = () => true, applyReward = null, notification = null } = config;

    const notifId = (notification && notification.id) || "daily_reward";

    /** Persisted state, or null if the accessor has nothing yet. */
    function state(): DailyRewardsState | null {
        const st = getState();
        return st && typeof st === "object" ? st : null;
    }

    const sys: DailyRewards<R> = {
        /** The reward track, exposed for UIs to render. Treat as read-only. */
        rewards,

        /**
         * Fresh default state for the host's defaultSave() merge:
         * `dailyRewards: dailyRewards.defaults()` (or inline the literal).
         */
        defaults(): DailyRewardsState {
            return { claimed: 0, lastClaimDay: null };
        },

        /** Whether the feature is unlocked at all (config.isUnlocked). */
        isUnlocked(): boolean {
            return !!isUnlocked();
        },

        /** True once every slot in the track has been claimed — forever. */
        isComplete(): boolean {
            const st = state();
            return !!st && (st.claimed || 0) >= rewards.length;
        },

        /**
         * Index of the next unclaimed slot (= the claimed count), or -1 when
         * the track is complete. Independent of the one-per-day gate: this is
         * "which tile is next", not "may I claim it right now".
         */
        nextIndex(): number {
            const st = state();
            const c = st ? st.claimed || 0 : 0;
            return c >= rewards.length ? -1 : c;
        },

        /**
         * True when there's a reward the player can claim right now: the
         * track is unlocked, not finished, and today (local day, trusted
         * clock) hasn't already consumed a claim. Drives the menu badge and
         * the popup CTA state.
         */
        canClaimNow(): boolean {
            if (!sys.isUnlocked() || sys.isComplete()) return false;
            const st = state();
            if (!st) return false;
            return st.lastClaimDay !== localDayKey(serverNow());
        },

        /**
         * Claim the next pending reward. Applies config.applyReward(def, i),
         * advances `claimed`, and stamps `lastClaimDay` — nothing else. The
         * caller is responsible for the rest of the pipeline: recompute
         * derived bonuses, persist the save, refresh UI, toast, and
         * scheduleReminder(). Returns the claimed reward def, or null if
         * claiming isn't currently allowed.
         */
        claimNext(): R | null {
            if (!sys.canClaimNow()) return null;
            const st = state();
            if (!st) return null; // unreachable: canClaimNow() requires state
            const idx = st.claimed || 0;
            const def = rewards[idx];
            if (!def) return null;
            if (applyReward) applyReward(def, idx);
            st.claimed = idx + 1;
            st.lastClaimDay = localDayKey(serverNow());
            return def;
        },

        /**
         * Iterate every already-claimed reward def in track order. This is
         * how permanent bonuses stay derived instead of stored: the game's
         * bonus recompute calls this and sums up the milestone effects, so
         * `claimed` is the single source of truth (see README "Patterns").
         */
        forEachClaimed(fn: (def: R, index: number) => void): void {
            const st = state();
            const n = Math.min(st ? st.claimed || 0 : 0, rewards.length);
            for (let i = 0; i < n; i++) fn(rewards[i], i);
        },

        /**
         * Milliseconds until the next claim becomes available: 0 when
         * claimable right now, time to the next local midnight when today's
         * claim is spent, Infinity when the track is complete or still
         * locked (no countdown makes sense). Check isComplete()/isUnlocked()
         * before formatting this as a countdown.
         */
        msUntilNextClaim(): number {
            if (sys.isComplete() || !sys.isUnlocked()) return Infinity;
            if (sys.canClaimNow()) return 0;
            return msUntilNextLocalMidnight(serverNow());
        },

        /**
         * Schedule the come-back-tomorrow notification for just after the
         * next local midnight. Cancel-first dedupe on the custom id, so
         * calling repeatedly never stacks reminders. No-op unless
         * config.notification is set or when the track is complete.
         *
         * Call it right after a successful claim, while the app is alive.
         * NEVER call from onSleep/onQuit handlers — a hard close tears down
         * the runtime before the RPC reaches the host.
         */
        async scheduleReminder(): Promise<void> {
            if (!notification || sys.isComplete()) return;
            try {
                await RundotGameAPI.notifications.cancelNotification(notifId);
                // +60s so it fires safely after the rollover, not racing it.
                const delaySec = Math.ceil(msUntilNextLocalMidnight(serverNow()) / 1000) + 60;
                await RundotGameAPI.notifications.scheduleAsync(
                    notification.title,
                    notification.body,
                    delaySec,
                    notifId,
                );
            } catch {
                /* mock mode / notifications disabled — never fatal */
            }
        },

        /**
         * Cancel the pending reminder. Call at boot when the player is
         * already back and the reward is claimable (or the track finished) —
         * a reminder for a task they're looking at is just noise. No-op
         * unless config.notification is set.
         */
        async cancelReminder(): Promise<void> {
            if (!notification) return;
            try {
                await RundotGameAPI.notifications.cancelNotification(notifId);
            } catch {
                /* swallow */
            }
        },
    };

    return sys;
}
