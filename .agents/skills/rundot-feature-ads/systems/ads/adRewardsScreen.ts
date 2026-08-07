// Ad-rewards ladder screen — reference vanilla-DOM implementation.
//
// Renders the ladder as a sequential list of reward rows (styled by
// ads.css): a header with the total watch count, an optional WATCH AD
// button, and one row per reward showing its state:
//   claimed → dimmed row with a CLAIMED label
//   ready   → glowing CLAIM button (claims ONLY that reward)
//   active  → live progress bar toward the next reward
//   locked  → dim row with its full requirement
//
// All state is read from createAdRewardsLadder(); button availability from
// an optional createAds() system. This file holds no game state of its own
// and every DOM lookup is null-safe. The watch button follows the shipped
// game's precedence: no-ads platform → hidden (the ladder advances via
// bonus placements' fallback instead, if countFallbackAsWatch is on);
// daily cap hit → disabled "DAILY LIMIT REACHED"; otherwise enabled
// optimistically and demoted to "NO AD AVAILABLE" when the async SDK
// readiness probe resolves false. A render sequence token guards the async
// probe and the in-flight watch against re-renders replacing their nodes.
//
// Not a DOM game? Treat this file as the spec and re-implement with the
// same pure state reads — see the README's "UI adaptation" section.

import type { AdsSystem } from "./ads";
import type { AdLadderSystem, AdLadderRewardDef } from "./adRewardsLadder";

export interface AdRewardsScreenOptions {
    /**
     * A system from createAds(). Enables the watch button's capability/cap/
     * readiness states and the "N left today" note. Omit to render the
     * ladder read-only-plus-claims (it still works standalone).
     */
    ads?: AdsSystem;
    /**
     * The host's watch flow for the dedicated button, e.g.
     * `() => ads.showRewardedAd({ id: 'ladder_watch', name: 'Ad Rewards Ladder' })`.
     * Omit to hide the button (placements elsewhere still fill the ladder).
     * The screen disables the button while the promise is in flight and
     * re-renders afterwards.
     */
    onWatch?: () => Promise<boolean>;
    /**
     * The host's claim pipeline: recompute bonuses, persist, toast, refresh
     * menu badges. Called after a successful ladder.claim(i).
     */
    onClaim?: (def: AdLadderRewardDef, index: number) => void;
    /**
     * ADAPT: appends the reward's description/preview markup to a row's info
     * column (below the title). Default renders def.desc as plain text.
     */
    renderRewardContent?: (info: HTMLElement, def: AdLadderRewardDef, index: number) => void;
    /** Header copy (default 'AD REWARDS'). */
    title?: string;
    /** Header watch-count copy. */
    watchedLabel?: (n: number) => string;
    /** "N left today" copy. */
    remainingLabel?: (n: number) => string;
    /** Watch button (default 'WATCH AD'). */
    watchLabel?: string;
    /** Watch button in flight. */
    loadingLabel?: string;
    /** Watch button, SDK has no fill. */
    noAdLabel?: string;
    /** Watch button, daily cap reached. */
    capLabel?: string;
    /** Claim button (default 'CLAIM'). */
    claimLabel?: string;
    /** Claimed rows (default 'CLAIMED'). */
    claimedLabel?: string;
}

// Bumped on every render; stale async continuations compare against it and
// bail instead of mutating nodes that were replaced underneath them.
let _renderSeq = 0;

/**
 * Render (or re-render) the ladder into a container. Idempotent — call on
 * open and after any state change (watch, claim).
 *
 * @param container e.g. document.getElementById('ad-rewards-body')
 * @param ladder a system from createAdRewardsLadder()
 */
export function renderAdRewardsLadder(
    container: HTMLElement | null,
    ladder: AdLadderSystem | null,
    opts: AdRewardsScreenOptions = {},
): void {
    if (!container || !ladder) return;
    const seq = ++_renderSeq;
    container.classList.add("ads-ladder");
    container.innerHTML = "";

    // ── Header: title + total watch count ──────────────────────────────
    const hdr = document.createElement("div");
    hdr.className = "ads-header";
    const title = document.createElement("div");
    title.className = "ads-title";
    title.textContent = opts.title || "AD REWARDS"; // ADAPT: copy/localization
    hdr.appendChild(title);
    const total = document.createElement("div");
    total.className = "ads-total";
    total.textContent = (opts.watchedLabel || ((n: number) => "Ads watched: " + n))(ladder.watchedCount());
    hdr.appendChild(total);
    container.appendChild(hdr);

    // ── Watch row (optional; hidden once the ladder is complete) ───────
    if (opts.onWatch && !ladder.isComplete()) {
        const row = buildWatchRow(container, ladder, opts, seq);
        if (row) container.appendChild(row);
    }

    // ── Reward rows ─────────────────────────────────────────────────────
    for (let i = 0; i < ladder.rewards.length; i++) {
        container.appendChild(buildRewardRow(container, ladder, opts, i));
    }
}

/**
 * Menu-badge helper: true when the entry button should carry a "reward
 * waiting" badge. Recheck after every watch and claim.
 * @param ladder a system from createAdRewardsLadder()
 */
export function adLadderBadgeVisible(ladder: AdLadderSystem): boolean {
    return ladder.claimableCount() > 0;
}

function buildWatchRow(
    container: HTMLElement,
    ladder: AdLadderSystem,
    opts: AdRewardsScreenOptions,
    seq: number,
): HTMLElement | null {
    const ads = opts.ads || null;
    // No-ads platform: there is no ad to watch, and charging RunBucks for a
    // bare ladder tick is a bad trade — hide the button. Bonus placements'
    // fallback spends can still advance the ladder (countFallbackAsWatch).
    if (ads && !ads.adsCapability()) return null;

    const row = document.createElement("div");
    row.className = "ads-watch-row";

    const btn = document.createElement("button");
    btn.className = "ads-watch-btn";

    if (ads && ads.capReached()) {
        btn.disabled = true;
        btn.textContent = opts.capLabel || "DAILY LIMIT REACHED"; // ADAPT: copy
        row.appendChild(btn);
        return row;
    }

    // Optimistic label; the async readiness probe demotes it if needed.
    btn.disabled = false;
    btn.textContent = opts.watchLabel || "WATCH AD"; // ADAPT: copy
    if (ads) {
        ads.isAvailable().then((avail) => {
            // A re-render replaced this node — don't mutate the orphan.
            if (seq !== _renderSeq) return;
            if (!avail) {
                btn.disabled = true;
                btn.textContent = opts.noAdLabel || "NO AD AVAILABLE"; // ADAPT: copy
            }
        });
    }

    btn.addEventListener("click", async () => {
        if (btn.disabled) return;
        btn.disabled = true;
        btn.textContent = opts.loadingLabel || "LOADING AD…"; // ADAPT: copy
        try {
            // onWatch is guaranteed by the caller (the row only builds when set).
            await opts.onWatch!(); // host flow; its result shows in the re-render
        } catch {
            /* host flow must not break the screen */
        }
        if (seq !== _renderSeq) return; // something else already re-rendered
        renderAdRewardsLadder(container, ladder, opts);
    });
    row.appendChild(btn);

    if (ads) {
        const note = document.createElement("span");
        note.className = "ads-remaining";
        note.textContent = (opts.remainingLabel || ((n: number) => n + " left today"))(ads.remainingToday()); // ADAPT: copy
        row.appendChild(note);
    }

    return row;
}

function buildRewardRow(
    container: HTMLElement,
    ladder: AdLadderSystem,
    opts: AdRewardsScreenOptions,
    i: number,
): HTMLElement {
    const def = ladder.rewards[i];
    const p = ladder.progress(i);

    const row = document.createElement("div");
    row.className = "ads-node " + (p.claimed ? "claimed" : p.ready ? "ready" : p.active ? "active" : "locked");

    // Info column: title + game-defined reward content.
    const info = document.createElement("div");
    info.className = "ads-node-info";
    const title = document.createElement("div");
    title.className = "ads-node-title";
    title.textContent = "REWARD #" + (i + 1); // ADAPT: copy/localization
    info.appendChild(title);
    if (opts.renderRewardContent) {
        // Custom renderer owns everything below the title (icons, item
        // preview chips, amounts).
        opts.renderRewardContent(info, def, i);
    } else {
        const desc = document.createElement("div");
        desc.className = "ads-node-desc";
        desc.textContent = def && def.desc != null ? String(def.desc) : "";
        info.appendChild(desc);
    }
    row.appendChild(info);

    // Track column: claimed label / claim button / progress bar.
    const track = document.createElement("div");
    track.className = "ads-track";
    if (p.claimed) {
        const lbl = document.createElement("div");
        lbl.className = "ads-claimed-lbl";
        lbl.textContent = opts.claimedLabel || "CLAIMED"; // ADAPT: copy
        track.appendChild(lbl);
    } else if (p.ready) {
        const btn = document.createElement("button");
        btn.className = "ads-claim-btn";
        btn.textContent = opts.claimLabel || "CLAIM"; // ADAPT: copy
        btn.addEventListener("click", () => {
            const claimed = ladder.claim(i); // claims ONLY this reward
            if (!claimed) return;
            // Host pipeline first (recompute/persist/toast/badge), then
            // re-render so rows reflect any state the pipeline changed.
            if (opts.onClaim) {
                try {
                    opts.onClaim(claimed, i);
                } catch {
                    /* swallow */
                }
            }
            renderAdRewardsLadder(container, ladder, opts);
        });
        track.appendChild(btn);
    } else {
        const pct = p.cost > 0 ? Math.min(100, (p.into / p.cost) * 100) : 0;
        const bar = document.createElement("div");
        bar.className = "ads-bar";
        const fill = document.createElement("div");
        fill.className = "ads-fill";
        fill.style.width = pct.toFixed(0) + "%";
        bar.appendChild(fill);
        track.appendChild(bar);
        const count = document.createElement("div");
        count.className = "ads-count";
        count.textContent = p.into + " / " + p.cost; // ADAPT: copy
        track.appendChild(count);
    }
    row.appendChild(track);

    return row;
}
