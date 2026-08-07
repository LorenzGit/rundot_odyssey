// Daily quests panel — reference vanilla-DOM implementation.
//
// Renders a header (countdown to the daily reset + claimed-today tracker)
// and one row per visible quest slot: description, reward, progress bar,
// and a claim button when the target is met. Uses the markup shell from
// dailyQuests.html (styled by dailyQuests.css), or any bare container.
//
// All state is read from the system created by createDailyQuests(); this
// file holds no game state of its own. The 1s ticker runs only while the
// panel is open: plain ticks update the countdown text and progress bars
// IN PLACE, and the row tree is fully rebuilt only when the claimable/
// claimed shape actually changes or local midnight rolls over mid-session
// (rebuilding every tick would replace a claim button mid-tap). The
// rollover case re-rolls via refreshIfNeeded() so the list regenerates
// without a manual refresh.
//
// Not a DOM game? Treat this file as the spec and re-implement with the
// same pure state reads — see the README's "UI adaptation" section.

// ADAPT: fix this path to match where shared/serverTime.ts lives in the host.
import { formatCountdown } from "../../shared/serverTime";
import type { DailyQuestsSystem, Quest } from "./dailyQuests";

export interface DailyQuestsScreenOpts {
    /**
     * The host's claim pipeline: persist, refresh HUD + badges, toast.
     * Called after a successful claimSlot() (reward already applied).
     */
    onClaim?: (quest: Quest, slotIndex: number) => void;
    /**
     * ADAPT: fills a row's reward element (e.g. currency icon + amount).
     * The default renders quest.reward as text, or nothing when absent.
     */
    renderReward?: (el: HTMLElement, quest: Quest) => void;
    /** claim-button copy (default 'CLAIM') */
    claimLabel?: string;
    /** countdown-row copy ('New quests in') */
    countdownLabel?: string;
    /** tracker copy ('QUESTS COMPLETED') */
    trackerLabel?: string;
    /** copy when every quest is claimed */
    allDoneLabel?: string;
    /** copy while the feature is locked */
    lockedLabel?: string;
}

interface PanelState {
    container: HTMLElement;
    sys: DailyQuestsSystem;
    opts: DailyQuestsScreenOpts;
}

let current: PanelState | null = null; // set while the panel is open
let tickerHandle: number | null = null;
let lastDayKey: string | null = null; // detects midnight rollover between ticks
let lastRowSig: string | null = null; // detects claimable/claimed transitions
let lastCdText: string | null = null; // skip countdown DOM writes when unchanged

/**
 * Open the panel: refresh the day roll, render, un-hide, start the ticker.
 * Callers should `await refreshServerTime()` FIRST (see README wiring) so
 * the day boundary and countdown reflect a fresh server-clock sample. If
 * refreshIfNeeded() rolled a new day here, the roll persists with the next
 * save — claiming or the host's debounced save both cover it.
 *
 * @param container panel root (e.g. #daily-quests-panel), or any element the
 *   renderer may own the contents of. Rows render into its `.quest-list`
 *   descendant when present, else into the container itself.
 * @param sys a system from createDailyQuests()
 * @param opts see DailyQuestsScreenOpts
 */
export function openDailyQuests(
    container: HTMLElement | null,
    sys: DailyQuestsSystem,
    opts: DailyQuestsScreenOpts = {},
): void {
    if (!container) return;
    sys.refreshIfNeeded();
    current = { container, sys, opts };
    renderDailyQuests(container, sys, opts);
    container.classList.remove("hidden");
    startTicker();
}

/** Close the panel and ALWAYS stop the ticker (even if already hidden). */
export function closeDailyQuests(container: HTMLElement | null): void {
    if (container) container.classList.add("hidden");
    stopTicker();
    current = null;
}

/**
 * Menu-badge helper: how many quests are claimable right now (0 = no
 * badge). Refreshes the day roll first, so a badge check after midnight
 * reflects the new day. Recheck after claims, on resume, and whenever the
 * host refreshes its menu.
 * @param sys a system from createDailyQuests()
 */
export function dailyQuestsBadgeCount(sys: DailyQuestsSystem): number {
    sys.refreshIfNeeded();
    return sys.claimableCount();
}

/**
 * Top-level render: rebuilds the header + all quest rows.
 * Idempotent; safe to call any time the container exists (e.g. from the
 * host after gameplay changes stats while the panel is visible).
 */
export function renderDailyQuests(
    container: HTMLElement,
    sys: DailyQuestsSystem,
    opts: DailyQuestsScreenOpts = {},
): void {
    const list = container.querySelector(".quest-list") || container;
    list.innerHTML = "";

    if (!sys.isUnlocked()) {
        const locked = document.createElement("div");
        locked.className = "quest-empty";
        // ADAPT: locked copy — name the actual unlock condition.
        locked.textContent = opts.lockedLabel || "Keep playing to unlock daily quests!";
        list.appendChild(locked);
        lastRowSig = rowSignature(sys);
        lastDayKey = sys.dayKey();
        return;
    }

    // ── Header: countdown to reset + claimed-today tracker ─────────────
    // One wrapper so a tutorial spotlight can highlight both together —
    // the countdown says "this resets daily", the tracker says "here's
    // what's still on the table today".
    const header = document.createElement("div");
    header.className = "quest-header";

    const countdown = document.createElement("div");
    countdown.className = "quest-countdown";
    const cdLbl = document.createElement("span");
    cdLbl.className = "quest-countdown-lbl";
    cdLbl.textContent = opts.countdownLabel || "New quests in"; // ADAPT: copy/localization
    const cdVal = document.createElement("span");
    cdVal.className = "quest-countdown-val";
    cdVal.textContent = formatCountdown(sys.msUntilReset());
    countdown.appendChild(cdLbl);
    countdown.appendChild(cdVal);
    header.appendChild(countdown);

    const today = sys.claimedToday();
    const tracker = document.createElement("div");
    tracker.className = "quest-tracker";
    const trkLbl = document.createElement("span");
    trkLbl.className = "quest-tracker-lbl";
    trkLbl.textContent = opts.trackerLabel || "QUESTS COMPLETED"; // ADAPT: copy/localization
    const trkVal = document.createElement("span");
    trkVal.className = "quest-tracker-val";
    trkVal.textContent = today.claimed + " / " + today.total;
    tracker.appendChild(trkLbl);
    tracker.appendChild(trkVal);
    header.appendChild(tracker);

    list.appendChild(header);

    // ── Quest rows (visible slots) ──────────────────────────────────────
    // Iterate the active-slot table, not the full pool: slots give stable
    // positions (claiming the middle row refills it in place rather than
    // collapsing the list). Empty slots only happen when the whole day's
    // pool is exhausted — show the all-done state then.
    let renderedAny = false;
    for (let s = 0; s < sys.activeCount; s++) {
        const q = sys.questAt(s);
        if (!q) continue;
        renderedAny = true;
        list.appendChild(buildRow(container, sys, opts, q, s));
    }

    if (!renderedAny) {
        const empty = document.createElement("div");
        empty.className = "quest-empty";
        // ADAPT: all-done copy.
        empty.textContent = opts.allDoneLabel || "All quests complete — new quests tomorrow!";
        list.appendChild(empty);
    }

    lastRowSig = rowSignature(sys);
    lastDayKey = sys.dayKey();
}

function buildRow(
    container: HTMLElement,
    sys: DailyQuestsSystem,
    opts: DailyQuestsScreenOpts,
    q: Quest,
    slotIdx: number,
): HTMLDivElement {
    const cur = sys.progress(q);
    const canClaim = sys.isClaimable(q);

    const row = document.createElement("div");
    row.className = "quest-item" + (canClaim ? " can-claim" : "");
    row.dataset.slot = String(slotIdx); // in-place tick updates find rows by slot

    const top = document.createElement("div");
    top.className = "quest-top";
    const desc = document.createElement("span");
    desc.className = "quest-desc";
    desc.textContent = q.desc || "";
    top.appendChild(desc);
    const reward = document.createElement("span");
    reward.className = "quest-reward";
    if (opts.renderReward) {
        opts.renderReward(reward, q); // custom icon/amount markup
    } else if (q.reward != null) {
        // ADAPT: default is bare text — supply renderReward for icons.
        reward.textContent = "+" + q.reward;
    }
    top.appendChild(reward);
    row.appendChild(top);

    const bar = document.createElement("div");
    bar.className = "quest-bar";
    const fill = document.createElement("div");
    fill.className = "quest-fill";
    fill.style.width = Math.min(100, (cur / q.target) * 100) + "%";
    bar.appendChild(fill);
    row.appendChild(bar);

    const bot = document.createElement("div");
    bot.className = "quest-bottom";
    const prog = document.createElement("span");
    prog.className = "quest-prog";
    prog.textContent = Math.min(cur, q.target) + "/" + q.target;
    bot.appendChild(prog);

    if (canClaim) {
        const btn = document.createElement("button");
        btn.className = "quest-claim";
        btn.textContent = opts.claimLabel || "CLAIM"; // ADAPT: copy/localization
        btn.addEventListener("click", () => {
            const claimed = sys.claimSlot(slotIdx);
            if (!claimed) return;
            // Host pipeline first (persist/HUD/toast), then re-render so the
            // refilled slot and tracker reflect any state the pipeline changed.
            if (opts.onClaim) opts.onClaim(claimed, slotIdx);
            renderDailyQuests(container, sys, opts);
        });
        bot.appendChild(btn);
    }
    row.appendChild(bot);

    return row;
}

// ── Ticker ─────────────────────────────────────────────────────────────────
// 1s interval while the panel is open. Full re-render ONLY on a day rollover
// or a claimable/claimed transition; plain ticks update the countdown text
// and progress bars in place (see file header).

/** Compact claim-state fingerprint: per slot '!'=claimable, '.'=in
 *  progress, '_'=empty; plus the tracker tally and the unlock state.
 *  (Claimed quests never appear in a slot — claiming refills it.) */
function rowSignature(sys: DailyQuestsSystem): string {
    let sig = "";
    for (let s = 0; s < sys.activeCount; s++) {
        const q = sys.questAt(s);
        sig += !q ? "_" : sys.isClaimable(q) ? "!" : ".";
    }
    const today = sys.claimedToday();
    return sig + "|" + today.claimed + "/" + today.total + "|" + (sys.isUnlocked() ? "u" : "l");
}

function startTicker(): void {
    stopTicker();
    if (!current) return;
    lastCdText = null;
    tickerHandle = setInterval(() => {
        if (!current) return;
        const { container, sys, opts } = current;
        // Navigated away without closeDailyQuests()? Stop mutating dead DOM.
        if (!document.body.contains(container) || container.classList.contains("hidden")) {
            stopTicker();
            return;
        }
        // Idempotent within a day; re-rolls the list when midnight crosses
        // while the panel is open.
        sys.refreshIfNeeded();
        const sig = rowSignature(sys);
        if (sys.dayKey() !== lastDayKey || sig !== lastRowSig) {
            renderDailyQuests(container, sys, opts);
            lastCdText = null;
            return;
        }
        // Fast path: countdown text (only when it changed) + bars in place.
        const cdVal = container.querySelector(".quest-countdown-val");
        if (cdVal) {
            const txt = formatCountdown(sys.msUntilReset());
            if (txt !== lastCdText) {
                lastCdText = txt;
                cdVal.textContent = txt;
            }
        }
        updateBars(container, sys);
    }, 1000);
}

/** Refresh each visible row's fill width + progress text without touching
 *  the row tree (stats can move while the panel is open mid-run). */
function updateBars(container: HTMLElement, sys: DailyQuestsSystem): void {
    for (let s = 0; s < sys.activeCount; s++) {
        const q = sys.questAt(s);
        if (!q) continue;
        const row = container.querySelector('.quest-item[data-slot="' + s + '"]');
        if (!row) continue;
        const cur = sys.progress(q);
        const fill = row.querySelector<HTMLElement>(".quest-fill");
        if (fill) fill.style.width = Math.min(100, (cur / q.target) * 100) + "%";
        const prog = row.querySelector(".quest-prog");
        if (prog) prog.textContent = Math.min(cur, q.target) + "/" + q.target;
    }
}

function stopTicker(): void {
    if (tickerHandle) {
        clearInterval(tickerHandle);
        tickerHandle = null;
    }
    lastDayKey = null;
    lastRowSig = null;
    lastCdText = null;
}
