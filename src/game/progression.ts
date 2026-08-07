/**
 * Endless progression.
 *
 * There is no level list any more — courses are generated from their depth, so
 * the only progression state worth keeping is how deep the player has reached
 * and how well. `depth` is the course they are on now; `bestDepth` is the
 * furthest they have ever cleared, which is the number the menu brags about.
 *
 * Losing never costs depth. A miss just re-arms the same course, so the run is
 * a puzzle you keep chewing rather than a streak you can drop.
 */
import { store } from "../state/store.ts";
import { getArrow, ARROWS, type ArrowDef } from "./arrows.ts";
import { generateLevel, requiredMightAt } from "./levelGenerator.ts";
import type { LevelData } from "./types.ts";

export interface EndlessState {
    /** Course the player is on (1-based). */
    depth: number;
    /** Deepest course ever cleared. */
    bestDepth: number;
    /** Arrow `might` the current course demands. */
    requiredMight: number;
    /** The equipped shaft can survive this depth. */
    canAttempt: boolean;
    /** Cheapest shaft that unblocks the current depth, if one is needed. */
    blocker: ArrowDef | null;
}

export function equippedArrow(): ArrowDef {
    return getArrow(store.get().equippedArrow as Parameters<typeof getArrow>[0]);
}

/** Cheapest owned-or-buyable shaft strong enough for a depth. */
function cheapestFor(might: number): ArrowDef | null {
    return ARROWS.filter((arrow) => arrow.might >= might).sort((a, b) => a.cost - b.cost)[0] ?? null;
}

export function endlessState(): EndlessState {
    const state = store.get();
    const depth = Math.max(1, Math.floor(state.depth));
    const requiredMight = requiredMightAt(depth);
    const arrow = equippedArrow();
    const ok = arrow.might >= requiredMight;
    return {
        depth,
        bestDepth: Math.max(0, Math.floor(state.bestDepth)),
        requiredMight,
        canAttempt: ok,
        blocker: ok ? null : cheapestFor(requiredMight),
    };
}

/**
 * The course to play right now.
 *
 * Generation takes the equipped shaft because the generator proves par with the
 * arrow the player actually holds — a course is only emitted once THIS shaft can
 * clear it.
 */
export function currentLevel(): LevelData {
    return generateLevel(endlessState().depth, equippedArrow());
}

export function levelAt(depth: number): LevelData {
    return generateLevel(Math.max(1, depth), equippedArrow());
}

/** Bank a clear and move to the next course. Returns the new depth. */
export function advanceDepth(stars: number): number {
    const state = store.get();
    const cleared = Math.max(1, Math.floor(state.depth));
    const next = cleared + 1;
    store.patch({
        depth: next,
        bestDepth: Math.max(state.bestDepth, cleared),
        bestStars: Math.max(state.bestStars, Math.max(0, Math.min(3, Math.round(stars)))),
    });
    return next;
}

/**
 * Start again from the top, keeping everything earned.
 *
 * Offered because a player walled by an obsidian grade can still farm shallower
 * courses for drachmae; without it, being under-equipped would be a dead end.
 */
export function restartFromStart(): void {
    store.patch({ depth: 1 });
}

declare global {
    interface Window {
        /** Development-only progression escape hatch. Never present in a build. */
        __odysseyDev?: {
            jumpToDepth(depth: number): number;
            grantArrow(id: string): boolean;
            /** Simulate owning a durable, so the patron path is testable off-host. */
            grantProduct(id: string): boolean;
        };
    }
}

/**
 * QA reach-anywhere hooks.
 *
 * Visual and interaction QA has to inspect depth 40 without playing 39 courses.
 * Gated on `import.meta.env.DEV` alone (no `?qa=1`) because a ViewDeck scenario
 * cannot add a query string to the URL it launches, and the flag is compiled out
 * of every shipped build regardless.
 */
export function installProgressionDevTools(): void {
    if (!import.meta.env?.DEV || typeof window === "undefined") return;
    window.__odysseyDev = {
        jumpToDepth(depth) {
            const next = Math.max(1, Math.floor(depth));
            store.patch({ depth: next, bestDepth: Math.max(store.get().bestDepth, next - 1) });
            return next;
        },
        grantArrow(id) {
            const arrow = ARROWS.find((entry) => entry.id === id);
            if (!arrow) return false;
            const owned = new Set(store.get().ownedArrows);
            owned.add(arrow.id);
            store.patch({ ownedArrows: [...owned], equippedArrow: arrow.id });
            return true;
        },
        // Ownership normally only ever comes from an authoritative entitlement
        // read. This writes the same store field so QA can see the patron
        // results card without a live catalog; it is compiled out of builds.
        grantProduct(id) {
            const owned = new Set(store.get().ownedProductIds);
            owned.add(id);
            store.patch({ ownedProductIds: [...owned].sort() });
            return true;
        },
    };
}
