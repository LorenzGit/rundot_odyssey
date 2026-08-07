// Daily rewards popup — reference vanilla-DOM implementation.
//
// Renders the reward track as a grid of tiles + a live countdown to the next
// local midnight, inside the markup from dailyRewards.html (styled by
// dailyRewards.css). Clicking the single claimable tile claims it and hands
// the def to the host's onClaim pipeline.
//
// All state is read from the system created by createDailyRewards(); this
// file holds no game state of its own. The 1s countdown ticker runs only
// while the popup is open and ONLY fully re-renders the tiles when the
// claim state actually transitions (e.g. local midnight rolls over
// mid-session) — re-rendering every tick would replace the claimable tile's
// DOM node and break a tap in flight. The common "waiting for midnight"
// tick just updates the countdown text.
//
// Not a DOM game? Treat this file as the spec and re-implement with the same
// pure state reads — see the README's "UI adaptation" section.

// ADAPT: fix this path to match where shared/serverTime.ts lives in the host.
import { formatCountdown } from "../../shared/serverTime";
import type { DailyRewards, RewardDef } from "./dailyRewards";

export interface DailyRewardsScreenOpts<R extends RewardDef = RewardDef> {
    /**
     * The host's claim pipeline: recompute bonuses, persist, refresh HUD and
     * badges, toast, scheduleReminder(). Called after a successful claimNext().
     */
    onClaim?(def: R, index: number): void;
    /**
     * ADAPT: appends the reward's icon/amount markup to a tile (below the day
     * label). The default renders def.label or '+'+def.amount as plain text —
     * supply this to show currency icons etc.
     */
    renderTileContent?(tile: HTMLElement, def: R, index: number): void;
    /** Countdown-row copy when claimable. */
    claimLabel?: string;
    /** Countdown-row copy while waiting. */
    nextLabel?: string;
    /** Countdown-row copy when finished. */
    completeLabel?: string;
}

// { container, sys, opts } while the popup is open. Module-level state can't
// carry the exported functions' R generic, hence <any> at this one seam.
let current: {
    container: HTMLElement;
    sys: DailyRewards<any>;
    opts: DailyRewardsScreenOpts<any>;
} | null = null;
let tickerHandle: ReturnType<typeof setInterval> | null = null;
let prevClaimable: boolean | null = null;

/**
 * Open the popup: render, un-hide, start the countdown ticker.
 * Callers should `await refreshServerTime()` FIRST (see README wiring) so
 * the claim gate and countdown reflect a fresh server-clock sample.
 *
 * @param container the dialog root (e.g. #daily-rewards-dialog)
 * @param sys a system from createDailyRewards()
 * @param opts see DailyRewardsScreenOpts
 */
export function openDailyRewards<R extends RewardDef>(
    container: HTMLElement | null,
    sys: DailyRewards<R>,
    opts: DailyRewardsScreenOpts<R> = {},
): void {
    if (!container) return;
    current = { container, sys, opts };
    renderDailyRewards(container, sys, opts);
    container.classList.remove("hidden");
    startTicker();
}

/** Close the popup and ALWAYS stop the ticker (even if already hidden). */
export function closeDailyRewards(container: HTMLElement | null): void {
    if (container) container.classList.add("hidden");
    stopTicker();
    current = null;
}

/**
 * Menu-badge helper: true when the entry button should carry a "reward
 * waiting" badge. Recheck after every claim, on resume, and on day rollover.
 * @param sys a system from createDailyRewards()
 */
export function dailyRewardsBadgeVisible(sys: DailyRewards): boolean {
    return sys.canClaimNow();
}

/**
 * Top-level render: rebuilds all tiles + updates the countdown row.
 * Idempotent; safe to call any time the container exists.
 */
export function renderDailyRewards<R extends RewardDef>(
    container: HTMLElement,
    sys: DailyRewards<R>,
    opts: DailyRewardsScreenOpts<R> = {},
): void {
    const grid = container.querySelector(".daily-grid");
    if (!grid) return;
    grid.innerHTML = "";

    const next = sys.nextIndex();
    const claimedCount = next === -1 ? sys.rewards.length : next;
    const canClaim = sys.canClaimNow();

    sys.rewards.forEach((def, idx) => {
        grid.appendChild(buildTile(container, sys, opts, def, idx, claimedCount, canClaim));
    });

    updateCountdown(container, sys, opts);
}

function buildTile<R extends RewardDef>(
    container: HTMLElement,
    sys: DailyRewards<R>,
    opts: DailyRewardsScreenOpts<R>,
    def: R,
    idx: number,
    claimedCount: number,
    canClaim: boolean,
): HTMLElement {
    const isClaimed = idx < claimedCount;
    // The "next up" tile is claimable only when canClaimNow() is true
    // (i.e. today hasn't already consumed a claim).
    const isClaimable = !isClaimed && idx === claimedCount && canClaim;

    const tile = document.createElement("div");
    tile.className = "daily-tile";
    if (def.milestone) tile.classList.add("milestone"); // full-width, framed
    if (isClaimed) tile.classList.add("claimed");
    else if (isClaimable) tile.classList.add("claimable");
    else tile.classList.add("locked");

    // Only the claimable tile is interactive: expose it as a button to
    // assistive tech and the keyboard. Non-claimable tiles stay plain divs
    // so they don't tab-stop uselessly.
    if (isClaimable) {
        tile.setAttribute("role", "button");
        tile.setAttribute("tabindex", "0");
        // ADAPT: claim-button copy for assistive tech.
        tile.setAttribute("aria-label", "Claim day " + (idx + 1) + " reward");
        const activate = (): void => handleClaim(container, sys, opts);
        tile.addEventListener("click", activate);
        tile.addEventListener("keydown", (ev) => {
            if (ev.key === "Enter" || ev.key === " ") {
                ev.preventDefault();
                activate();
            }
        });
    }

    const dayLbl = document.createElement("div");
    dayLbl.className = "day-lbl";
    dayLbl.textContent = "DAY " + (idx + 1); // ADAPT: label copy/localization
    tile.appendChild(dayLbl);

    if (opts.renderTileContent) {
        // Custom renderer owns everything below the day label.
        opts.renderTileContent(tile, def, idx);
    } else {
        // Default: best-effort text from common def fields.
        const amt = document.createElement("div");
        amt.className = "day-amt";
        amt.textContent = def.label != null ? String(def.label) : def.amount != null ? "+" + def.amount : "";
        tile.appendChild(amt);
        if (def.milestone) {
            const perm = document.createElement("div");
            perm.className = "day-perm";
            perm.textContent = "PERMANENT"; // ADAPT: milestone note copy
            tile.appendChild(perm);
        }
    }

    return tile;
}

function handleClaim<R extends RewardDef>(
    container: HTMLElement,
    sys: DailyRewards<R>,
    opts: DailyRewardsScreenOpts<R>,
): void {
    const idx = sys.nextIndex();
    const def = sys.claimNext();
    if (!def) return;
    // Host pipeline first (recompute/persist/toast/reminder), then re-render
    // so the tiles reflect any state the pipeline changed.
    if (opts.onClaim) opts.onClaim(def, idx);
    prevClaimable = sys.canClaimNow(); // keep the ticker's transition check in sync
    renderDailyRewards(container, sys, opts);
}

// ── Countdown row ──────────────────────────────────────────────────────────

function updateCountdown(container: HTMLElement, sys: DailyRewards, opts: DailyRewardsScreenOpts): void {
    const lblEl = container.querySelector<HTMLElement>(".daily-countdown-lbl");
    const valEl = container.querySelector<HTMLElement>(".daily-countdown-val");
    const row = lblEl && lblEl.parentElement;
    if (!lblEl || !valEl || !row) return;

    if (sys.isComplete()) {
        row.classList.add("finished");
        row.classList.remove("claimable");
        lblEl.textContent = opts.completeLabel || "All rewards claimed!";
        return;
    }
    row.classList.remove("finished");
    if (sys.canClaimNow()) {
        // CTA state — styling lives on `.daily-countdown-row.claimable`.
        row.classList.add("claimable");
        lblEl.textContent = opts.claimLabel || "Tap the glowing reward to claim!";
        valEl.textContent = "";
        valEl.style.display = "none";
        return;
    }
    row.classList.remove("claimable");
    valEl.style.display = "";
    lblEl.textContent = opts.nextLabel || "Next reward in";
    const ms = sys.msUntilNextClaim();
    valEl.textContent = isFinite(ms) ? formatCountdown(ms) : "--";
}

// ── Ticker ─────────────────────────────────────────────────────────────────
// 1s interval while the popup is open. Full re-render ONLY on claim-state
// transitions; plain ticks just refresh the countdown text (see file header).

function startTicker(): void {
    stopTicker();
    if (!current) return;
    prevClaimable = current.sys.canClaimNow();
    tickerHandle = setInterval(() => {
        if (!current) return;
        const { container, sys, opts } = current;
        const nowClaimable = sys.canClaimNow();
        if (nowClaimable !== prevClaimable) {
            prevClaimable = nowClaimable;
            renderDailyRewards(container, sys, opts);
        } else {
            updateCountdown(container, sys, opts);
        }
    }, 1000);
}

function stopTicker(): void {
    if (tickerHandle) {
        clearInterval(tickerHandle);
        tickerHandle = null;
    }
    prevClaimable = null;
}
