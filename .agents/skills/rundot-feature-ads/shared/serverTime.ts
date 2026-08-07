// Trusted-clock and day-rollover primitives for RUN games.
//
// Why this exists: reward gating ("one claim per day", "offer expires in 24h")
// must not trust the device clock, which players can wind forward. The RUN host
// provides an authoritative server time; we sample it rarely and extrapolate
// locally with Date.now() *deltas*, so the device clock's absolute value never
// matters after a sample. Doc best practice: "Cache the server response and
// update periodically rather than spamming the endpoint."
//
// Day boundaries are the player's LOCAL midnight by default ("I'll claim my
// daily after dinner" should match the player's phone calendar). The residual
// tamper window is device-*timezone* shifting; if you need a fixed global
// reset instead, see RundotGameAPI.getFutureTimeAsync({timezone:'PT'}).
//
// Usage:
//   await refreshServerTime();                  // boot, resume, and before any claim-gate check
//   const now = serverNow();                    // trusted epoch ms
//   const today = localDayKey(now);             // 'YYYY-MM-DD'
//   const msLeft = msUntilNextLocalMidnight(now);

import RundotGameAPI from "@series-inc/rundot-game-sdk/api";

// ADAPT(testing only): true collapses a "day" into one wall-clock minute so a
// 7-day reward track can be tested in 7 minutes. Must be false in production.
const TEST_MINUTES_AS_DAYS = false;

let _serverBase: number | null = null; // server epoch ms at the moment of the last sample
let _localBase: number | null = null; // Date.now() at the moment of the last sample

/**
 * Sample the authoritative server clock and cache it.
 * Safe to call often (boot, onResume, on opening any time-gated UI);
 * failures are swallowed and serverNow() falls back to Date.now().
 */
export async function refreshServerTime(): Promise<void> {
    try {
        const info = await RundotGameAPI.requestTimeAsync();
        if (info && typeof info.serverTime === "number") {
            _serverBase = info.serverTime;
            _localBase = Date.now();
        }
    } catch {
        /* offline/mock mode: keep previous sample or fall back */
    }
}

/**
 * Trusted "now" in epoch ms: last server sample plus the local *delta* since.
 * Falls back to Date.now() only if no sample has ever landed (e.g. local dev).
 */
export function serverNow(): number {
    if (_serverBase !== null && _localBase !== null) {
        return _serverBase + (Date.now() - _localBase);
    }
    return Date.now();
}

/** True once refreshServerTime() has landed at least one real sample. */
export function hasServerTime(): boolean {
    return _serverBase !== null;
}

/**
 * Calendar-day key ('YYYY-MM-DD') for an epoch-ms instant, in the device's
 * local timezone. Two instants share a key iff they're the same local day.
 */
export function localDayKey(ms: number): string {
    const d = new Date(ms);
    const y = d.getFullYear();
    const mo = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    const base = y + "-" + mo + "-" + dd;
    if (TEST_MINUTES_AS_DAYS) {
        const hh = String(d.getHours()).padStart(2, "0");
        const mm = String(d.getMinutes()).padStart(2, "0");
        return base + "-" + hh + "-" + mm;
    }
    return base;
}

/** Milliseconds from the given instant until the next local midnight (or next minute in test mode). */
export function msUntilNextLocalMidnight(ms: number): number {
    const d = new Date(ms);
    if (TEST_MINUTES_AS_DAYS) {
        const next = new Date(d);
        next.setSeconds(0, 0);
        next.setMinutes(d.getMinutes() + 1);
        return Math.max(0, next.getTime() - ms);
    }
    const next = new Date(d);
    next.setHours(24, 0, 0, 0); // midnight at the start of the next day, local tz
    return Math.max(0, next.getTime() - ms);
}

/**
 * Compact countdown label: "5h03m" at >= 1 hour, else "4m09s".
 */
export function formatCountdown(ms: number): string {
    const totalSec = Math.max(0, Math.ceil(ms / 1000));
    const h = Math.floor(totalSec / 3600);
    const m = Math.floor((totalSec % 3600) / 60);
    const s = totalSec % 60;
    const pad = (n: number): string => (n < 10 ? "0" + n : String(n));
    if (h >= 1) return h + "h" + pad(m) + "m";
    return m + "m" + pad(s) + "s";
}
