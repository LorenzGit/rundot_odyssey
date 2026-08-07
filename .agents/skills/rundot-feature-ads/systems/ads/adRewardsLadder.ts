// Ad-rewards ladder for RUN games: a sequential "watch N ads → CLAIM a
// milestone reward" track that turns rewarded-ad watches into a visible
// progression system.
//
// Model: the player works toward rewards IN ORDER.
// Each def has a `cost` — the ads required BEYOND the previous reward — so
// the cumulative threshold for reward i is the running sum of costs 0..i.
// Watching ads anywhere in the game fills progress (the ads system feeds
// recordWatch() via its onWatchCounted hook); the player then visits the
// ladder screen and CLAIMs each earned reward. Rewards are EARNED
// sequentially but can be CLAIMED in any order once earned.
//
// State is two fields persisted inside the host's save blob:
//   { watched: int, claimed: int[] }   // claimed = reward indices
// `watched` starts at 0 when the system ships — past watches don't count.
// `claimed` is an array of indices (not a count) so out-of-order claims and
// future track edits stay unambiguous.
//
// This module is pure state machinery: no SDK, no persistence, no UI. It
// reaches its state only through the injected getState() accessor. claim()
// applies the one-shot grant, then the CALLER runs its pipeline (recompute
// bonuses, persist, toast, refresh) — same contract as daily-rewards.
// Passive/stat rewards should be a no-op in applyReward and be re-derived
// from the claimed list via forEachClaimed (see the README pattern).

/**
 * One ladder def. The machinery reads only `cost`; everything else (desc,
 * type, amounts, item keys) is game-defined and passed through to
 * applyReward()/the UI — hence the open index signature.
 */
export interface AdLadderRewardDef {
    /** Ads required beyond the previous reward; >= 1. */
    cost: number;
    [key: string]: any;
}

/**
 * The persisted ladder slice, living inside the host's save blob:
 * `adLadder: { watched: 0, claimed: [] }`. Mutated in place.
 */
export interface AdLadderState {
    /** Total ads watched toward the ladder. */
    watched: number;
    /** Claimed reward indices (an array, not a count — see header). */
    claimed: number[];
}

export interface AdLadderConfig {
    /**
     * Ordered ladder defs. The machinery reads only `cost` (ads beyond the
     * previous reward; >= 1); everything else (desc, type, amounts, item keys)
     * is game-defined and passed through to applyReward()/the UI.
     */
    rewards: AdLadderRewardDef[];
    /**
     * Returns the LIVE persisted `{watched, claimed}` object (e.g.
     * `() => game.save.adLadder`). recordWatch()/claim() mutate it in place,
     * so it must be the object inside the save blob, not a copy.
     */
    getState: () => AdLadderState | null | undefined;
    /**
     * Grant a ONE-SHOT reward (currency, item, unlock) on claim. Keep
     * permanent stat bonuses out of it — re-derive those from the claimed
     * list instead (forEachClaimed), so `claimed` stays the single source
     * of truth.
     */
    applyReward?: (def: AdLadderRewardDef, index: number) => void;
}

/** Per-reward UI state returned by progress(i). */
export interface AdLadderProgress {
    /** Ads required for this reward (its own `cost`). */
    cost: number;
    /** Watches applied toward THIS reward (0..cost). */
    into: number;
    /** Threshold met. */
    earned: boolean;
    /** Already claimed (effect live). */
    claimed: boolean;
    /** earned && !claimed (show the CLAIM button). */
    ready: boolean;
    /** The reward currently being worked toward. */
    active: boolean;
}

export interface AdLadderSystem {
    /** The ladder defs, exposed for UIs to render. Treat as read-only. */
    rewards: AdLadderRewardDef[];
    /**
     * Fresh default state for the host's defaultSave() merge:
     * `adLadder: adLadder.defaults()` (or inline the literal).
     */
    defaults(): AdLadderState;
    /** Total ads watched toward the ladder (0 on a fresh save). */
    watchedCount(): number;
    /** How many rewards have been claimed. */
    claimedCount(): number;
    /** Has reward index i been claimed (its effect live)? */
    isClaimed(i: number): boolean;
    /** True once every reward has been claimed — the ladder is done. */
    isComplete(): boolean;
    /** Cumulative watch count required to EARN reward index i
     *  (sum of costs 0..i inclusive). */
    threshold(i: number): number;
    /** Rewards whose threshold has been met (earned, claimed or not).
     *  Sequential by construction: thresholds are cumulative. */
    earnedCount(): number;
    /** Rewards ready to CLAIM right now (earned but unclaimed).
     *  Drives the menu badge. */
    claimableCount(): number;
    /** Per-reward state for the UI (see AdLadderProgress). */
    progress(i: number): AdLadderProgress;
    /**
     * Claim a SINGLE reward by index. No-op (returns null) when out of
     * range, not yet earned, or already claimed. Applies
     * config.applyReward(def, i) and records the index — nothing else.
     * The caller runs the rest of the pipeline: recompute derived
     * bonuses, persist, toast, refresh UI. Returns the claimed def, or
     * null on no-op.
     */
    claim(i: number): AdLadderRewardDef | null;
    /**
     * Record one watch toward the ladder. Nothing is granted here —
     * rewards are claimed separately on the ladder screen. Wire this to
     * the ads system: `createAds({ onWatchCounted: () => ladder.recordWatch() })`
     * (the ads system persists right after, covering this mutation too).
     * Returns the new watched total.
     */
    recordWatch(): number;
    /**
     * Iterate every claimed reward def (ascending index order regardless
     * of claim order). This is how permanent stat rewards stay DERIVED
     * instead of stored: the game's bonus recompute calls this and sums
     * the effects, so the claimed list is the single source of truth.
     */
    forEachClaimed(fn: (def: AdLadderRewardDef, index: number) => void): void;
}

export function createAdRewardsLadder(config: AdLadderConfig): AdLadderSystem {
    const { rewards, getState, applyReward = null } = config;

    /** Persisted state, or null if the accessor has nothing yet. */
    function state(): AdLadderState | null {
        const st = getState();
        return st && typeof st === "object" ? st : null;
    }

    function claimedList(st: AdLadderState | null): number[] {
        return st && Array.isArray(st.claimed) ? st.claimed : [];
    }

    const sys: AdLadderSystem = {
        /** The ladder defs, exposed for UIs to render. Treat as read-only. */
        rewards,

        /**
         * Fresh default state for the host's defaultSave() merge:
         * `adLadder: adLadder.defaults()` (or inline the literal).
         */
        defaults(): AdLadderState {
            return { watched: 0, claimed: [] };
        },

        /** Total ads watched toward the ladder (0 on a fresh save). */
        watchedCount(): number {
            const st = state();
            return (st && st.watched) || 0;
        },

        /** How many rewards have been claimed. */
        claimedCount(): number {
            return claimedList(state()).length;
        },

        /** Has reward index i been claimed (its effect live)? */
        isClaimed(i: number): boolean {
            return claimedList(state()).indexOf(i) >= 0;
        },

        /** True once every reward has been claimed — the ladder is done. */
        isComplete(): boolean {
            return sys.claimedCount() >= rewards.length;
        },

        /** Cumulative watch count required to EARN reward index i
         *  (sum of costs 0..i inclusive). */
        threshold(i: number): number {
            let sum = 0;
            for (let k = 0; k <= i && k < rewards.length; k++) {
                sum += rewards[k].cost || 0;
            }
            return sum;
        },

        /** Rewards whose threshold has been met (earned, claimed or not).
         *  Sequential by construction: thresholds are cumulative. */
        earnedCount(): number {
            const w = sys.watchedCount();
            let n = 0;
            for (let i = 0; i < rewards.length; i++) {
                if (w >= sys.threshold(i)) n++;
                else break;
            }
            return n;
        },

        /** Rewards ready to CLAIM right now (earned but unclaimed).
         *  Drives the menu badge. */
        claimableCount(): number {
            const earned = sys.earnedCount();
            let n = 0;
            for (let i = 0; i < earned; i++) {
                if (!sys.isClaimed(i)) n++;
            }
            return n;
        },

        /**
         * Per-reward state for the UI:
         *   cost    — ads required for this reward (its own `cost`)
         *   into    — watches applied toward THIS reward (0..cost)
         *   earned  — threshold met
         *   claimed — already claimed (effect live)
         *   ready   — earned && !claimed (show the CLAIM button)
         *   active  — the reward currently being worked toward
         */
        progress(i: number): AdLadderProgress {
            const cost = rewards[i] ? rewards[i].cost || 0 : 0;
            const prev = sys.threshold(i) - cost; // cumulative before this one
            const w = sys.watchedCount();
            const into = Math.max(0, Math.min(cost, w - prev));
            const earned = w >= sys.threshold(i);
            const claimed = sys.isClaimed(i);
            return {
                cost,
                into,
                earned,
                claimed,
                ready: earned && !claimed,
                active: !earned && w >= prev,
            };
        },

        /**
         * Claim a SINGLE reward by index. No-op (returns null) when out of
         * range, not yet earned, or already claimed. Applies
         * config.applyReward(def, i) and records the index — nothing else.
         * The caller runs the rest of the pipeline: recompute derived
         * bonuses, persist, toast, refresh UI.
         */
        claim(i: number): AdLadderRewardDef | null {
            if (i < 0 || i >= rewards.length) return null;
            const st = state();
            if (!st) return null;
            if (sys.watchedCount() < sys.threshold(i)) return null; // not earned
            if (sys.isClaimed(i)) return null; // already claimed
            const def = rewards[i];
            if (applyReward) applyReward(def, i);
            if (!Array.isArray(st.claimed)) st.claimed = [];
            st.claimed.push(i);
            return def;
        },

        /**
         * Record one watch toward the ladder. Nothing is granted here —
         * rewards are claimed separately on the ladder screen. Wire this to
         * the ads system: `createAds({ onWatchCounted: () => ladder.recordWatch() })`
         * (the ads system persists right after, covering this mutation too).
         */
        recordWatch(): number {
            const st = state();
            if (!st) return 0;
            st.watched = (st.watched || 0) + 1;
            return st.watched;
        },

        /**
         * Iterate every claimed reward def (ascending index order regardless
         * of claim order). This is how permanent stat rewards stay DERIVED
         * instead of stored: the game's bonus recompute calls this and sums
         * the effects, so the claimed list is the single source of truth.
         */
        forEachClaimed(fn: (def: AdLadderRewardDef, index: number) => void): void {
            for (let i = 0; i < rewards.length; i++) {
                if (sys.isClaimed(i)) fn(rewards[i], i);
            }
        },
    };

    return sys;
}
