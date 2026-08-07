// Lifetime stat counters for RUN games.
//
// Model: stats are a flat {key: number} map living INSIDE the host's save
// blob. This module never persists anything itself — it reads the map through
// getStore() and reports mutations through onDirty(), so it composes with
// systems/save (or any persistence the host already has) without importing it.
//
// All mutation flows through add(key, val): increment, dirty-flag, optional
// side-effects. Gameplay code never writes the map directly, which keeps the
// gate (shouldTrack) and analytics hooks (onIncrement) impossible to bypass
// by accident.
//
// Display is registry-driven: the ordered `registry` config (key → label +
// format) is the single source of truth for which stats exist, what they're
// called, and how they render. formattedEntries() turns it into renderer-
// agnostic rows; statsScreen.ts is the reference DOM consumer.
//
// The optional SDK mirror (mirrorToSdk + syncMirrors) pushes absolute local
// totals to RundotGameAPI.stats for server-side features (collectible grants,
// leaderboard feeds). Local counters remain the source of truth; the mirror
// is fire-and-forget and safe in mock mode.

import RundotGameAPI from "@series-inc/rundot-game-sdk/api";

/**
 * Collectible grant as resolved by RundotGameAPI.stats.submit(). Derived from
 * the SDK because the `/api` entry point doesn't re-export the GrantInfo type
 * (v5.23.0); if a newer SDK exports it there, import it instead.
 */
export type GrantInfo = Awaited<ReturnType<typeof RundotGameAPI.stats.submit>>["grants"][number];

/**
 * The save-slice this system owns: a flat stat-key → running-total map stored
 * inside the host's save blob (e.g. `save.stats`). Values may be fractional
 * (seconds accumulators). Read live through getStore(); persisted by the host.
 */
export interface StatsStore {
    [key: string]: number;
}

export interface RegistryEntry {
    /** Display label, e.g. 'Enemies Killed'. */
    label: string;
    /**
     * 'number' (default) → fmtNum K/M abbreviation; 'duration' → fmtDuration
     * H:MM:SS (for seconds accumulators); or a custom (value) => string.
     */
    format?: "number" | "duration" | ((value: number) => string);
    /**
     * Optional group header. Consecutive entries sharing a section render
     * under one header; omit everywhere for a flat list.
     */
    section?: string;
}

/** One renderer-agnostic display row from formattedEntries(). */
export interface FormattedEntry {
    key: string;
    label: string;
    value: number;
    formatted: string;
    section: string | undefined;
}

export interface StatsConfig {
    /**
     * Ordered map of stat key → display entry. Insertion order is display
     * order. Every key a screen should show belongs here; add() also accepts
     * unregistered keys (they count, they just don't render).
     */
    registry: Record<string, RegistryEntry>;
    /**
     * Returns the live mutable stats map, e.g. `() => saveSystem.data.stats`.
     * Called on every access so the save can load/reload underneath; a
     * null/undefined return (save not loaded yet) makes add() a silent no-op.
     */
    getStore: () => StatsStore | null | undefined;
    /**
     * Called after every successful increment. Wire to the save system's
     * debounced path (`saveSystem.markDirty`) — stats are high-frequency, so
     * never wire an immediate save() here.
     */
    onDirty?: () => void;
    /**
     * Optional gate: return false to drop an increment. Use for FTUE gating
     * (see README "Always-tracked vs gated stats"). Absent = everything tracks.
     */
    shouldTrack?: (key: string) => boolean;
    /**
     * Optional post-increment hook with the NEW total — the seam for analytics
     * side-effects (e.g. funnel steps on gamesPlayed milestones). Fires on
     * every add, including per-frame duration ticks: branch on key and keep it
     * cheap. Exceptions are swallowed.
     */
    onIncrement?: (key: string, value: number) => void;
    /**
     * Optional list of stat keys to mirror to RundotGameAPI.stats, using the
     * local key as the SDK statId. See syncMirrors().
     */
    mirrorToSdk?: string[];
}

export interface Stats {
    /** Sole mutation entry point. `val` defaults to 1 and may be fractional. */
    add(key: string, val?: number): void;
    /** Current total for a key. Missing key, or store not loaded, reads 0. */
    get(key: string): number;
    /** Fresh {key: 0, ...} for every registry key — merge into defaultSave(). */
    defaults(): StatsStore;
    /** Registry-ordered display rows for any renderer (DOM, React, canvas). */
    formattedEntries(): FormattedEntry[];
    /** Push absolute totals for mirrorToSdk keys; resolves with collectible grants. */
    syncMirrors(): Promise<GrantInfo[]>;
}

export function createStats(config: StatsConfig): Stats {
    const { registry, getStore, onDirty = null, shouldTrack = null, onIncrement = null, mirrorToSdk = [] } = config;

    const sys: Stats = {
        /**
         * The sole mutation entry point. Missing keys start at 0, so no
         * pre-registration is required and old saves lacking a key are fine.
         * The increment may be fractional, e.g. dt seconds.
         */
        add(key: string, val: number = 1): void {
            const store = getStore();
            if (!store) return; // save not loaded yet — drop silently
            if (shouldTrack && !shouldTrack(key)) return;
            store[key] = (store[key] || 0) + val;
            if (onDirty) onDirty();
            if (onIncrement) {
                try {
                    onIncrement(key, store[key]);
                } catch (e) {
                    /* hooks must not break tracking */
                }
            }
        },

        /**
         * Current total for a key. Missing key, or store not loaded, reads 0.
         */
        get(key: string): number {
            const store = getStore();
            return (store && store[key]) || 0;
        },

        /**
         * Fresh {key: 0, ...} for every registry key — spread this into the
         * save system's defaultSave() so new saves start zeroed and (via
         * fillMissing in validate()) old saves gain newly added stats.
         */
        defaults(): StatsStore {
            const out: StatsStore = {};
            for (const k of Object.keys(registry)) out[k] = 0;
            return out;
        },

        /**
         * Registry-ordered display rows for any renderer (DOM, React,
         * canvas): [{key, label, value, formatted, section}].
         */
        formattedEntries(): FormattedEntry[] {
            const entries: FormattedEntry[] = [];
            for (const key of Object.keys(registry)) {
                const entry = registry[key];
                const value = sys.get(key);
                entries.push({
                    key,
                    label: entry.label,
                    value,
                    formatted: formatValue(value, entry.format),
                    section: entry.section,
                });
            }
            return entries;
        },

        /**
         * Push the absolute local total of every mirrorToSdk key to
         * RundotGameAPI.stats. The SDK store is last-write-wins on absolute
         * values — never submit deltas — so re-syncing is always safe and
         * idempotent. Submits are issued synchronously so the SDK coalesces
         * them into one batched RPC.
         *
         * Call at discrete moments while the app is alive (end of run,
         * opening the stats screen) — NEVER from onSleep/onQuit handlers
         * (see docs/run-sdk-notes.md lifecycle gotcha). Never throws. SDK
         * 5.23+ mock mode stores each submitted value in memory and returns no
         * grants. Resolves with the collectible grants triggered by this sync
         * (usually empty — see README "SDK notes").
         */
        async syncMirrors(): Promise<GrantInfo[]> {
            const results = await Promise.all(
                mirrorToSdk.map(async (statId): Promise<GrantInfo[]> => {
                    try {
                        const res = await RundotGameAPI.stats.submit(statId, sys.get(statId));
                        return res && Array.isArray(res.grants) ? res.grants : [];
                    } catch (e) {
                        return []; // unavailable host: local totals remain authoritative
                    }
                }),
            );
            return results.flat();
        },
    };

    return sys;
}

/** Route a value through a registry entry's format spec. */
function formatValue(value: number, format: RegistryEntry["format"]): string {
    if (typeof format === "function") {
        try {
            return format(value);
        } catch (e) {
            return String(value);
        }
    }
    if (format === "duration") return fmtDuration(value);
    return fmtNum(value);
}

/**
 * Abbreviated counter: 1234 → '1.2K', 5600000 → '5.6M', else String(n).
 * Expects whole-number counters; give float accumulators (playtime, damage
 * with decimals) the 'duration' format or a custom formatter instead.
 */
export function fmtNum(n: number): string {
    n = n || 0;
    return n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? (n / 1e3).toFixed(1) + "K" : String(n);
}

/**
 * Duration in seconds as 'H:MM:SS' — hours have no leading zero (45 minutes
 * reads '0:45:00', not '00:45:00'); minutes and seconds are two digits.
 */
export function fmtDuration(totalSec: number): string {
    const s = Math.max(0, Math.floor(totalSec || 0));
    const hh = Math.floor(s / 3600);
    const mm = Math.floor((s % 3600) / 60);
    const ss = s % 60;
    const pad = (n: number): string => (n < 10 ? "0" + n : String(n));
    return hh + ":" + pad(mm) + ":" + pad(ss);
}
