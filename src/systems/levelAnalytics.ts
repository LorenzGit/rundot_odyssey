export type AnalyticsScalar = string | number | boolean;
export type AnalyticsPayload = Record<string, AnalyticsScalar>;

export interface LevelAnalyticsContext extends AnalyticsPayload {
    level_id: string;
    level: number;
}

export interface LevelAnalyticsSnapshot {
    level_id: string;
    level: number;
    attempt: number;
    attempts: number;
    restarts: number;
    duration_seconds: number;
    attempt_duration_seconds: number;
}

interface ActiveLevel {
    context: LevelAnalyticsContext;
    attempt: number;
    totalActiveMs: number;
    attemptActiveMs: number;
    activeSinceMs: number | null;
}

interface LevelEventNames {
    started: string;
    restarted: string;
    completed: string;
    abandoned: string;
}

interface LevelAnalyticsConfig {
    emit: (eventName: string, payload: AnalyticsPayload) => void;
    now?: () => number;
    events?: Partial<LevelEventNames>;
}

const DEFAULT_EVENTS: LevelEventNames = {
    started: "level_started",
    restarted: "level_restarted",
    completed: "level_completed",
    abandoned: "level_abandoned",
};

/**
 * Reusable active-time instrumentation for a level, wave, round, or run.
 *
 * ADAPT: keep this machinery generic. Derived games should change the context
 * and call sites, not fork timing logic into their renderer or UI components.
 */
export function createLevelAnalytics(config: LevelAnalyticsConfig) {
    const now = config.now ?? (() => performance.now());
    const events = { ...DEFAULT_EVENTS, ...config.events };
    const pauseReasons = new Set<string>();
    let active: ActiveLevel | null = null;

    const commitActiveSegment = (atMs: number): void => {
        if (!active || active.activeSinceMs === null) return;
        const elapsedMs = Math.max(0, atMs - active.activeSinceMs);
        active.totalActiveMs += elapsedMs;
        active.attemptActiveMs += elapsedMs;
        active.activeSinceMs = null;
    };

    const snapshotAt = (atMs: number): LevelAnalyticsSnapshot | null => {
        if (!active) return null;
        const liveMs = active.activeSinceMs === null ? 0 : Math.max(0, atMs - active.activeSinceMs);
        return {
            level_id: active.context.level_id,
            level: active.context.level,
            attempt: active.attempt,
            attempts: active.attempt,
            restarts: active.attempt - 1,
            duration_seconds: seconds(active.totalActiveMs + liveMs),
            attempt_duration_seconds: seconds(active.attemptActiveMs + liveMs),
        };
    };

    const emit = (eventName: string, payload: AnalyticsPayload): void => {
        try {
            config.emit(eventName, payload);
        } catch {
            // Telemetry is observational and must never alter gameplay.
        }
    };

    const payloadAt = (atMs: number, extra: AnalyticsPayload = {}): AnalyticsPayload | null => {
        if (!active) return null;
        const metrics = snapshotAt(atMs);
        return metrics ? { ...active.context, ...extra, ...metrics } : null;
    };

    const finish = (eventName: string, extra: AnalyticsPayload): LevelAnalyticsSnapshot | null => {
        if (!active) return null;
        const atMs = now();
        commitActiveSegment(atMs);
        const metrics = snapshotAt(atMs);
        const payload = payloadAt(atMs, extra);
        if (payload) emit(eventName, payload);
        active = null;
        return metrics;
    };

    return {
        start(context: LevelAnalyticsContext): void {
            if (active) finish(events.abandoned, { exit_reason: "level_changed" });
            const atMs = now();
            active = {
                context: { ...context },
                attempt: 1,
                totalActiveMs: 0,
                attemptActiveMs: 0,
                activeSinceMs: pauseReasons.size === 0 ? atMs : null,
            };
            emit(events.started, { ...active.context, attempt: 1, attempts: 1, restarts: 0 });
        },

        restart(extra: AnalyticsPayload = {}): LevelAnalyticsSnapshot | null {
            if (!active) return null;
            const atMs = now();
            commitActiveSegment(atMs);
            const metrics = snapshotAt(atMs);
            const payload = payloadAt(atMs, { ...extra, next_attempt: active.attempt + 1 });
            if (payload) emit(events.restarted, payload);
            active.attempt += 1;
            active.attemptActiveMs = 0;
            active.activeSinceMs = pauseReasons.size === 0 ? atMs : null;
            return metrics;
        },

        checkpoint(eventName: string, extra: AnalyticsPayload = {}): LevelAnalyticsSnapshot | null {
            if (!active) return null;
            const atMs = now();
            const metrics = snapshotAt(atMs);
            const payload = payloadAt(atMs, extra);
            if (payload) emit(eventName, payload);
            return metrics;
        },

        complete(extra: AnalyticsPayload = {}): LevelAnalyticsSnapshot | null {
            return finish(events.completed, extra);
        },

        abandon(exitReason: string, extra: AnalyticsPayload = {}): LevelAnalyticsSnapshot | null {
            return finish(events.abandoned, { ...extra, exit_reason: exitReason });
        },

        setPaused(reason: string, paused: boolean): void {
            if (paused) {
                if (pauseReasons.has(reason)) return;
                if (pauseReasons.size === 0) commitActiveSegment(now());
                pauseReasons.add(reason);
                return;
            }
            if (!pauseReasons.delete(reason) || pauseReasons.size > 0 || !active || active.activeSinceMs !== null) {
                return;
            }
            active.activeSinceMs = now();
        },

        snapshot(): LevelAnalyticsSnapshot | null {
            return snapshotAt(now());
        },
    };
}

function seconds(milliseconds: number): number {
    return Math.round(Math.max(0, milliseconds)) / 1_000;
}
