// Daily quests for RUN games: a pool of quests rolled fresh every local day,
// a few visible at a time, each measured against the game's lifetime stat
// counters and paying a claimable reward.
//
// Design:
//   - Progress is a BASELINE SNAPSHOT against lifetime stats. Each quest
//     stores startVal = the player's stat total at generation time, and
//     progress is `current - startVal`. Gameplay code never reports quest
//     progress — it just keeps incrementing the lifetime counters it already
//     has (see systems/stats), and quests measure the delta. A quest always
//     begins at 0/target regardless of historical totals.
//   - Slot rotation: dailyCount quests are rolled per day but only
//     activeCount are visible at once. Claiming frees the slot and the next
//     unclaimed reserve pick slides in — and its baseline is re-snapshotted
//     at that moment, so it arrives at 0/target instead of pre-completed by
//     progress made while it sat in reserve ("I just got this quest and it's
//     already done?!" feels broken).
//   - Difficulty tracks ENGAGEMENT, not calendar drift: the questDays
//     counter increments on day rollover only when the OUTGOING day had at
//     least one claim, and never decreases on a skip. Targets scale from 1x
//     at questDays 0 up to scaling.maxMult x at scaling.maxDays (capped so
//     the long-term grind stays attainable).
//   - The daily roll is SEEDED on questDays, so every player at the same
//     difficulty tier sees the same quests in the same order — "what are
//     today's quests?" becomes a community talking point, and live-ops can
//     read completion rates without per-player variance noise.
//
// State is one object inside the host's save blob (see defaults()). This
// module reaches it only through the injected getState() accessor — it does
// NOT import the save system — and it never persists, toasts, or renders:
// claimSlot() mutates state and applies the reward, then the CALLER runs its
// pipeline (persist, refresh HUD/badges, toast). See the README.
//
// Time authority: serverNow() (trusted server clock, extrapolated locally) +
// localDayKey() (device-local midnight) define the day boundary — the same
// primitives as systems/daily-rewards, so every "new day" feature in the
// game ticks over together.

// ADAPT: copy shared/serverTime.ts into the host alongside this file and fix
// this path to match the host's layout if it differs.
import { serverNow, localDayKey, msUntilNextLocalMidnight } from "../../shared/serverTime";

/** One entry in the quest pool (config.questTypes). */
export interface QuestType {
    /**
     * Lifetime stat counter this quest measures (key into getStatValue), e.g.
     * 'enemiesKilled'. Progress is the increase in this counter since the
     * quest was generated (or since it rotated into a visible slot).
     */
    stat: string;
    /**
     * Description template; '{n}' is replaced with the scaled target at roll
     * time, so the saved quest is self-contained (rebalancing startingValue
     * mid-day never rewrites text in front of the player).
     */
    desc: string;
    /**
     * Day-0 target (used at questDays = 0). Scaled up by the difficulty curve.
     */
    startingValue: number;
    /**
     * Stable unique id; defaults to `stat`. Only needs setting when two types
     * share a stat. Used to match saved quests back to their type
     * (relocalizeDescriptions).
     */
    id?: string;
    /**
     * Optional reward payload copied verbatim onto the rolled quest. Opaque to
     * the engine — applyReward() and the UI interpret it. Omit when every
     * quest pays the same flat reward.
     */
    reward?: any;
}

/** A rolled quest entry (persisted in state.quests). */
export interface Quest {
    /** matching QuestType id */
    id: string;
    /** stat counter being measured */
    stat: string;
    /** pre-rendered description ('{n}' resolved) */
    desc: string;
    /** scaled goal value */
    target: number;
    /** stat baseline; progress = current - startVal */
    startVal: number;
    claimed: boolean;
    /** pass-through from the QuestType, if defined */
    reward?: any;
}

/**
 * The persisted state slice — one object inside the host's save blob, shape
 * per defaults(). quests/day/activeSlots describe TODAY's roll;
 * claimedAnyToday gates the rollover questDays bump; questDays is the
 * lifetime engagement counter; lifetimeClaimed is a stats-style tally.
 */
export interface DailyQuestsState {
    /** Today's rolled quests (visible + reserve), in pool order. */
    quests: Quest[];
    /** Day key ('YYYY-MM-DD') of the current roll; null before the first roll (or while locked). */
    day: string | null;
    /** Visible-slot table: slot -> index into quests, or null when the pool is exhausted. */
    activeSlots: (number | null)[];
    /** True once any quest was claimed today; gates the rollover questDays bump. */
    claimedAnyToday: boolean;
    /** Lifetime engagement counter (days with >= 1 claim); drives difficulty + the roll seed. */
    questDays: number;
    /** Stats-style lifetime tally of claimed quests. */
    lifetimeClaimed: number;
}

export interface DailyQuestsConfig {
    /**
     * The quest pool. Rolls draw `dailyCount` types per day (seeded shuffle),
     * so the pool should comfortably exceed dailyCount. A pool smaller than
     * dailyCount just rolls
     * the whole pool.
     */
    questTypes: QuestType[];
    /**
     * Returns the LIVE persisted state object (e.g. `() => game.save.dailyQuests`
     * — shape per defaults()). Mutated in place, so it must be the object
     * inside the save blob, not a copy.
     */
    getState: () => DailyQuestsState | null | undefined;
    /**
     * Current lifetime total for a stat key, e.g. `(k) => game.save.stats[k] || 0`
     * (or `stats.get` from systems/stats). Must be monotonically increasing —
     * counters, not gauges — or baseline progress goes negative (clamped to 0).
     */
    getStatValue: (stat: string) => number;
    /**
     * Quests rolled per local day (visible + reserve). Default 5.
     */
    dailyCount?: number;
    /**
     * Quests visible/claimable at once. Remaining picks queue up and slide
     * into a slot as soon as one is emptied by a claim. Default 3.
     */
    activeCount?: number;
    /**
     * Gate for the whole feature (e.g. `() => save.stats.gamesPlayed >= 3`).
     * While locked, refreshIfNeeded() keeps state empty so the UI can render
     * a clean "keep playing to unlock" message. Defaults to always unlocked.
     */
    isUnlocked?: () => boolean;
    /**
     * Grant the reward for one claimed quest (e.g. add gems). Called inside
     * claimSlot(); keep it side-effect-minimal — persisting, toasts, and UI
     * refresh belong in the caller's claim pipeline.
     */
    applyReward?: (quest: Quest, slotIndex: number) => void;
    /**
     * Difficulty hook: returns the target for a type at an engagement level.
     * Default: linear ramp from startingValue at questDays 0 to
     * startingValue * scaling.maxMult at questDays >= scaling.maxDays,
     * rounded, min 1.
     */
    scaleTarget?: (type: QuestType, questDays: number) => number;
    /**
     * Parameters for the default scaleTarget. The shipped values:
     * `{ maxDays: 30, maxMult: 5 }` — targets quintuple over a month of
     * engaged days, then plateau.
     */
    scaling?: { maxDays?: number; maxMult?: number };
}

export interface DailyQuestsSystem {
    /** Visible-slot count, exposed so renderers size rows consistently. */
    activeCount: number;
    /** Fresh default state for the host's defaultSave() merge. */
    defaults(): DailyQuestsState;
    /** Whether the feature is unlocked at all (config.isUnlocked). */
    isUnlocked(): boolean;
    /** Day key ('YYYY-MM-DD') of the current roll, or null. */
    dayKey(): string | null;
    /** Ensure state reflects the current local day; true when a new set was rolled. */
    refreshIfNeeded(): boolean;
    /** Resolve an active slot index (0..activeCount-1) to its quest, or null. */
    questAt(slotIdx: number): Quest | null;
    /** Current progress on a quest: stat delta since its baseline, clamped to >= 0. */
    progress(q: Quest | null | undefined): number;
    /** True when a quest is at/above its target and unclaimed. */
    isClaimable(q: Quest | null | undefined): q is Quest;
    /** Claim the quest in the given active slot; null if not claimable right now. */
    claimSlot(slotIdx: number): Quest | null;
    /** How many VISIBLE quests are claimable right now. */
    claimableCount(): number;
    /** Today's claim tracker, anchored to the daily pool size. */
    claimedToday(): { claimed: number; total: number };
    /** Refresh, then return every VISIBLE quest that newly crossed its target. */
    takeNewlyClaimable(): Quest[];
    /** Milliseconds until the daily reset (next local midnight, trusted clock). */
    msUntilReset(): number;
    /** Re-render every saved quest's desc from the current questTypes copy. */
    relocalizeDescriptions(): void;
}

export function createDailyQuests(config: DailyQuestsConfig): DailyQuestsSystem {
    const {
        questTypes,
        getState,
        getStatValue,
        dailyCount = 5,
        activeCount = 3,
        isUnlocked = () => true,
        applyReward = null,
        scaleTarget = null,
        scaling = {},
    } = config;

    const maxDays = scaling.maxDays !== undefined && scaling.maxDays > 0 ? scaling.maxDays : 30;
    const maxMult = scaling.maxMult !== undefined && scaling.maxMult > 0 ? scaling.maxMult : 5;

    /** Persisted state, or null if the accessor has nothing yet. */
    function state(): DailyQuestsState | null {
        const st = getState();
        return st && typeof st === "object" ? st : null;
    }

    /** Target for a type at an engagement level (config.scaleTarget or the
     *  default linear-ramp-with-cap formula). */
    function targetFor(type: QuestType, questDays: number): number {
        if (scaleTarget) return Math.max(1, Math.round(scaleTarget(type, questDays)));
        const base = (type && type.startingValue) || 1;
        const clamped = Math.max(0, Math.min(maxDays, questDays | 0));
        const mult = 1 + (clamped / maxDays) * (maxMult - 1);
        return Math.max(1, Math.round(base * mult));
    }

    /**
     * Build a fresh quest list for the current questDays. Seeded on
     * questDays (offset so day 0 isn't the all-zero seed, which would leave
     * Mulberry32 stuck on a low-entropy first sample) so every player at the
     * same tier rolls the same quests in the same order. The seed advances
     * when questDays does, so claim-then-skip-a-day still lands on a
     * fresh-feeling rotation the next active day.
     */
    function pickQuests(st: DailyQuestsState): Quest[] {
        const pool = Array.isArray(questTypes) ? questTypes.slice() : [];
        if (pool.length === 0) return [];
        const wanted = Math.min(dailyCount, pool.length);
        const days = st.questDays || 0;
        // 0x9E3779B1 is the golden-ratio constant commonly used to spread
        // small integer seeds across the 32-bit space — keeps adjacent days
        // from producing visibly correlated sequences.
        const rand = mulberry32((days + 1) * 0x9e3779b1);
        // Fisher-Yates partial shuffle — only the first `wanted` items matter.
        for (let i = 0; i < wanted; i++) {
            const j = i + Math.floor(rand() * (pool.length - i));
            const tmp = pool[i];
            pool[i] = pool[j];
            pool[j] = tmp;
        }
        const out: Quest[] = [];
        for (let i = 0; i < wanted; i++) {
            const type = pool[i];
            const target = targetFor(type, days);
            const quest: Quest = {
                id: type.id || type.stat,
                stat: type.stat,
                // Pre-render the description with the actual target so the
                // saved quest needs no pool lookup at render/toast time.
                desc: (type.desc || "").replace("{n}", String(target)),
                target,
                // Snapshot the current lifetime stat: progress is measured
                // as `current - startVal`, so the quest starts at 0/target.
                startVal: getStatValue(type.stat) || 0,
                claimed: false,
            };
            if (type.reward !== undefined) quest.reward = type.reward;
            out.push(quest);
        }
        return out;
    }

    /** Next unclaimed pool index not already occupying an active slot, in
     *  pool order (deterministic refill), or null when exhausted. */
    function nextPoolIndex(st: DailyQuestsState, taken: Set<number>): number | null {
        const list = st.quests || [];
        for (let i = 0; i < list.length; i++) {
            const q = list[i];
            if (!q || q.claimed || taken.has(i)) continue;
            return i;
        }
        return null;
    }

    /**
     * Sync the active-slot table (state.activeSlots: slot -> pool index or
     * null). Stable-position: slots holding a still-unclaimed quest are
     * kept; vacated/invalid slots refill from the reserve in pool order.
     * A quest entering a visible slot for the first time gets its startVal
     * RE-SNAPSHOTTED so progress starts at 0 from the moment the player can
     * see it. Pool exhaustion leaves nulls (renderers show an all-done row).
     */
    function refreshSlots(st: DailyQuestsState): void {
        if (!Array.isArray(st.activeSlots)) st.activeSlots = [];
        const list = st.quests || [];
        const taken = new Set<number>();
        const slots: (number | null)[] = [];
        for (let s = 0; s < activeCount; s++) {
            const cur = st.activeSlots[s];
            if (typeof cur === "number" && list[cur] && !list[cur].claimed && !taken.has(cur)) {
                slots[s] = cur;
                taken.add(cur);
            } else {
                slots[s] = null;
            }
        }
        for (let s = 0; s < activeCount; s++) {
            if (slots[s] !== null) continue;
            const next = nextPoolIndex(st, taken);
            if (next === null) break;
            const q = list[next];
            if (q) q.startVal = getStatValue(q.stat) || 0; // fresh baseline on arrival
            slots[s] = next;
            taken.add(next);
        }
        while (slots.length < activeCount) slots.push(null);
        slots.length = activeCount;
        st.activeSlots = slots;
    }

    // In-memory "already surfaced a completion for this quest today" map for
    // takeNewlyClaimable(). Deliberately NOT persisted (matches the source
    // game): worst case a reload re-toasts a completed quest once.
    let _notified: Record<number, boolean> = {};
    let _notifiedDay: string | null = null;

    const sys: DailyQuestsSystem = {
        /** Visible-slot count, exposed so renderers size rows consistently. */
        activeCount,

        /**
         * Fresh default state for the host's defaultSave() merge:
         * `dailyQuests: dailyQuests.defaults()` (or inline the literal).
         * quests/day/activeSlots describe TODAY's roll; claimedAnyToday
         * gates the rollover questDays bump; questDays is the lifetime
         * engagement counter; lifetimeClaimed is a stats-style tally.
         */
        defaults(): DailyQuestsState {
            return {
                quests: [],
                day: null,
                activeSlots: [],
                claimedAnyToday: false,
                questDays: 0,
                lifetimeClaimed: 0,
            };
        },

        /** Whether the feature is unlocked at all (config.isUnlocked). */
        isUnlocked(): boolean {
            return !!isUnlocked();
        },

        /** Day key ('YYYY-MM-DD') of the current roll, or null. Renderers
         *  compare it across ticks to detect a midnight rollover. */
        dayKey(): string | null {
            const st = state();
            return st ? st.day || null : null;
        },

        /**
         * Ensure state reflects the current local day. Call at boot (after
         * the save loads and refreshServerTime() lands), before showing the
         * quests UI, and from the gameplay check (see takeNewlyClaimable) —
         * it's idempotent within the same day, so calling often is cheap.
         *
         * On rollover: bumps questDays if the OUTGOING day had any claim
         * (first-ever roll skips the bump — there's no previous day to
         * credit), then rolls a fresh quest set and fills the slots.
         * While locked, keeps state empty instead.
         *
         * Returns true when a new set was rolled this call — the caller
         * should persist (the roll is part of the save).
         */
        refreshIfNeeded(): boolean {
            const st = state();
            if (!st) return false;
            if (!sys.isUnlocked()) {
                if (Array.isArray(st.quests) && st.quests.length) st.quests = [];
                st.day = null;
                st.activeSlots = [];
                return false;
            }
            const today = localDayKey(serverNow());
            if (st.day === today && Array.isArray(st.quests) && st.quests.length > 0) {
                // Same day — heal slot state (legacy save mid-upgrade, or a
                // reload) without rolling new quests.
                refreshSlots(st);
                return false;
            }
            if (st.day !== null && st.claimedAnyToday) {
                st.questDays = (st.questDays || 0) + 1;
            }
            st.claimedAnyToday = false;
            st.quests = pickQuests(st);
            st.day = today;
            st.activeSlots = [];
            refreshSlots(st);
            return true;
        },

        /**
         * Resolve an active slot index (0..activeCount-1) to its quest.
         * Returns null when the slot is empty (pool exhausted).
         */
        questAt(slotIdx: number): Quest | null {
            const st = state();
            if (!st) return null;
            const poolIdx = (st.activeSlots || [])[slotIdx];
            if (typeof poolIdx !== "number") return null;
            return (st.quests || [])[poolIdx] || null;
        },

        /**
         * Current progress on a quest: stat delta since its baseline,
         * clamped to >= 0. NOT clamped to target — renderers do that.
         */
        progress(q: Quest | null | undefined): number {
            if (!q) return 0;
            const cur = getStatValue(q.stat) || 0;
            return Math.max(0, cur - (q.startVal || 0));
        },

        /**
         * True when a quest is at/above its target and unclaimed.
         * (A type predicate so a `true` result narrows away null/undefined.)
         */
        isClaimable(q: Quest | null | undefined): q is Quest {
            if (!q || q.claimed) return false;
            return sys.progress(q) >= q.target;
        },

        /**
         * Claim the quest in the given active slot. Marks it claimed, stamps
         * the engagement flag, bumps the lifetime tally, applies
         * config.applyReward(quest, slotIdx), and refills the slot in place
         * from the reserve — nothing else. The caller runs the rest of the
         * pipeline: persist the save, refresh HUD/badges, toast.
         * Returns the claimed quest, or null if that slot wasn't claimable
         * right now.
         */
        claimSlot(slotIdx: number): Quest | null {
            const st = state();
            if (!st) return null;
            const q = sys.questAt(slotIdx);
            if (!sys.isClaimable(q)) return null;
            q.claimed = true;
            st.claimedAnyToday = true;
            st.lifetimeClaimed = (st.lifetimeClaimed || 0) + 1;
            if (applyReward) applyReward(q, slotIdx);
            refreshSlots(st);
            return q;
        },

        /**
         * How many VISIBLE quests are claimable right now — "actionable
         * now", not "completable later when a reserve rotates in". Drives
         * the menu badge.
         */
        claimableCount(): number {
            let n = 0;
            for (let s = 0; s < activeCount; s++) {
                if (sys.isClaimable(sys.questAt(s))) n++;
            }
            return n;
        },

        /**
         * Today's claim tracker, anchored to the daily pool size — players
         * want "how many rewards are still on the table today?", not a
         * lifetime figure. Skipping a day starts fresh.
         */
        claimedToday(): { claimed: number; total: number } {
            const st = state();
            const list = (st && st.quests) || [];
            let claimed = 0;
            for (const q of list) {
                if (q && q.claimed) claimed++;
            }
            return { claimed, total: list.length };
        },

        /**
         * The gameplay-loop bridge: refreshIfNeeded(), then return every
         * VISIBLE quest that crossed its target since the last call (each
         * reported once per day, in-memory memo). Call it wherever the game
         * already checks periodic state — end of wave/run, or piggybacked on
         * the save debounce — and toast the results so completion feels
         * immediate. Reserve quests are not reported: their baseline
         * re-snapshots when they rotate in, so a completion there would be
         * announcing progress the player is about to lose.
         */
        takeNewlyClaimable(): Quest[] {
            sys.refreshIfNeeded();
            const st = state();
            if (!st) return [];
            if (_notifiedDay !== st.day) {
                _notified = {};
                _notifiedDay = st.day;
            }
            const out: Quest[] = [];
            for (let s = 0; s < activeCount; s++) {
                const poolIdx = (st.activeSlots || [])[s];
                if (typeof poolIdx !== "number" || _notified[poolIdx]) continue;
                const q = (st.quests || [])[poolIdx];
                if (sys.isClaimable(q)) {
                    _notified[poolIdx] = true;
                    out.push(q);
                }
            }
            return out;
        },

        /**
         * Milliseconds until the daily reset (next local midnight, trusted
         * clock) — drive the "new quests in …" countdown with
         * formatCountdown() from shared/serverTime.ts.
         */
        msUntilReset(): number {
            return msUntilNextLocalMidnight(serverNow());
        },

        /**
         * Re-render every saved quest's pre-baked desc from the CURRENT
         * questTypes copy (matched by id). Saved quests are deliberately
         * self-contained, so a language switch would otherwise leave today's
         * list in the old language until the rollover — call this after the
         * host relocalizes its data. Quests whose type has since been
         * removed keep their old text. No-op for single-language games.
         */
        relocalizeDescriptions(): void {
            const st = state();
            if (!st || !Array.isArray(st.quests)) return;
            for (const q of st.quests) {
                if (!q || !q.id) continue;
                const type = (questTypes || []).find((t) => t && (t.id || t.stat) === q.id);
                if (type && type.desc) q.desc = type.desc.replace("{n}", String(q.target));
            }
        },
    };

    return sys;
}

/**
 * Mulberry32 — small deterministic PRNG: uint32 seed in, () => [0,1) out.
 * Identical seeds produce identical sequences on every device, which is what
 * makes "every player at the same questDays sees the same roll" work without
 * a server-side coordinator.
 */
function mulberry32(seed: number): () => number {
    let s = (seed | 0) >>> 0;
    return function () {
        s = (s + 0x6d2b79f5) >>> 0;
        let t = s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
