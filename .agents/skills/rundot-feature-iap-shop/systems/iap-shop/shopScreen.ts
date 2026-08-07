// Reference storefront for systems/iap-shop — plain DOM, no framework.
// Use as-is in a DOM game, or treat as a spec when re-implementing in the
// host's UI approach (the section ORDER and state rules are the spec; the
// markup is just one rendering of them).
//
// Section order, top to bottom:
//   1. Balance header (platform icon + RunBucks count, '--' when unknown)
//   2. Subscription sell card — only while available AND not subscribed
//      (top billing: it's the highest-value ask)
//   3. Bundles — full-width cards; gated bundles hidden, owned bundles
//      disabled "OWNED" with a check overlay, the limited bundle carries a
//      live countdown and vanishes once expired-unpurchased
//   4. Packs — grid with "+N% bonus vs baseline" value badges
//   5. Subscription ACTIVE card — only while subscribed (parked at the
//      bottom: ongoing confirmation, no longer selling anything)
//
// Everything re-renders wholesale via renderShop(); wire it into the shop
// system's ui.refresh so purchases repaint automatically.

import { formatCountdown } from "../../shared/serverTime";
import type { IapShop, ShopBundle, ShopPack } from "./iapShop";
import type { Subscription } from "./subscription";

export interface RenderShopOptions {
    /** Toast fn for sub checkout copy. */
    toast?: (msg: string) => void;
    /** Inline HTML for the soft-currency icon on pack cards
     *  (ADAPT: the host game's gem/coin icon markup). */
    packIconHtml?: string;
    /** Section header copy (ADAPT). */
    bundlesTitle?: string;
    /** Section header copy (ADAPT). */
    packsTitle?: string;
    /** Section header copy (ADAPT). */
    subsTitle?: string;
    /** Host already shows a balance HUD. */
    noBalanceHeader?: boolean;
}

/**
 * Rebuild the storefront inside `container`.
 * @param container  emptied and repopulated on every call
 * @param shop  a createIapShop() instance
 * @param sub  a createSubscription() instance, or null to omit the
 *   subscription sections entirely
 */
export function renderShop(
    container: HTMLElement | null,
    shop: IapShop,
    sub: Subscription | null,
    opts: RenderShopOptions = {},
): void {
    if (!container) return;

    // Start the 24h limited-offer clock the very first time the player lays
    // eyes on the shop (no-op afterwards). Must precede visibleBundles() so
    // the freshly-stamped offer renders on this same paint.
    shop.stampLimitedOfferIfUnset();

    container.innerHTML = "";
    container.classList.add("shop");

    if (!opts.noBalanceHeader) {
        const bal = document.createElement("div");
        bal.className = "shop-balance";
        bal.innerHTML = '<span class="rb-icon">RB</span><span class="shop-balance-num">--</span>';
        container.appendChild(bal);
    }

    // ── Subscription sell card (top billing while unsubscribed) ─────────
    if (sub && !sub.isActive() && sub.isAvailable()) {
        appendSectionHeader(container, opts.subsTitle || "SUBSCRIPTION");
        appendSubCard(container, shop, sub, opts, false);
    }

    // ── Bundles ──────────────────────────────────────────────────────────
    const bundles = shop.visibleBundles();
    if (bundles.length > 0) {
        appendSectionHeader(container, opts.bundlesTitle || "BUNDLES");
        for (const bundle of bundles) {
            appendBundleCard(container, shop, bundle, opts);
        }
    }

    // ── Packs ────────────────────────────────────────────────────────────
    // Packs have no gating or limited states, so the raw catalog list is
    // the render list.
    const packs = (shop.catalog.packs || []).filter(Boolean);
    if (packs.length > 0) {
        appendSectionHeader(container, opts.packsTitle || "PACKS");
        const grid = document.createElement("div");
        grid.className = "shop-packs";
        // Baseline for the "+N% bonus" badge is the FIRST pack (cheapest,
        // by convention) — every other pack's badge is its relative gain in
        // amount-per-RB vs that baseline, re-derived on every render so
        // catalog balance tweaks flow through for free.
        const baseline = packs[0];
        packs.forEach((pack, idx) => {
            grid.appendChild(buildPackCard(shop, pack, idx === 0 ? 0 : packBonusPercent(pack, baseline), opts));
        });
        container.appendChild(grid);
    }

    // ── Subscription ACTIVE card (bottom, confirmation only) ─────────────
    if (sub && sub.isActive()) {
        appendSectionHeader(container, opts.subsTitle || "SUBSCRIPTION");
        appendSubCard(container, shop, sub, opts, true);
    }

    updateBalanceDisplay(shop, container);
    applyCurrencyIcon(shop, container);

    // Keep a 1Hz countdown alive while a limited offer is active on screen.
    const hasActiveLimited = bundles.some((b) => shop.limitedOfferState(b) === "active");
    if (hasActiveLimited) {
        ensureTicker({ container, shop, sub, opts });
    } else {
        stopTicker();
    }
}

/** RunBucks price chip for a buy button: text "RB" fallback that
 *  applyCurrencyIcon swaps for the platform icon <img>. */
export function buyButtonHtml(costRB: number): string {
    return '<span class="rb-icon">RB</span>' + (Number(costRB) || 0).toLocaleString();
}

/** Write the cached balance into every .shop-balance-num under root —
 *  '--' when unknown (null: not fetched yet or fetch failed). */
export function updateBalanceDisplay(shop: IapShop, root?: ParentNode | null): void {
    const scope = root || document;
    scope.querySelectorAll(".shop-balance-num").forEach((el) => {
        el.textContent = typeof shop.balance === "number" ? shop.balance.toLocaleString() : "--";
    });
}

/**
 * Swap every .rb-icon text chip under root for the platform icon <img>,
 * once shop.iconUrl is known. The original text stays as a hidden sibling
 * span (CSS: .rb-icon img + span { display: none }) so it reappears if the
 * image fails to load. Idempotent — safe to call on every render.
 */
export function applyCurrencyIcon(shop: IapShop, root?: ParentNode | null): void {
    const url = shop && shop.iconUrl;
    if (!url) return;
    (root || document).querySelectorAll(".rb-icon").forEach((el) => {
        if (el.querySelector("img")) return; // already swapped
        const fallback = document.createElement("span");
        fallback.textContent = (el.textContent || "").trim() || "RB";
        el.textContent = "";
        const img = document.createElement("img");
        img.src = url;
        img.alt = "RunBucks";
        el.appendChild(img);
        el.appendChild(fallback);
    });
}

/**
 * Percentage "extra value" of a pack vs the baseline pack, from
 * amount-per-RB. Positive = better value than baseline. Returns 0 when any
 * input is missing/zero so callers can gate rendering on > 0.
 */
export function packBonusPercent(pack: ShopPack | null | undefined, baseline: ShopPack | null | undefined): number {
    const pr = Number(pack && pack.costRB) || 0;
    const pa = packAmount(pack);
    const br = Number(baseline && baseline.costRB) || 0;
    const ba = packAmount(baseline);
    if (pr <= 0 || pa <= 0 || br <= 0 || ba <= 0) return 0;
    return Math.round((pa / pr / (ba / br) - 1) * 100);
}

// ── internals ──────────────────────────────────────────────────────────────

/** Display quantity for a pack. ADAPT: prefers pack.amount; falls back to
 *  the first numeric value in pack.grants (works for {gems: 250}-style). */
function packAmount(pack: ShopPack | null | undefined): number {
    if (!pack) return 0;
    if (typeof pack.amount === "number") return pack.amount;
    const g = pack.grants || {};
    for (const k of Object.keys(g)) {
        if (typeof g[k] === "number") return g[k];
    }
    return 0;
}

function appendSectionHeader(container: HTMLElement, text: string): void {
    const hdr = document.createElement("div");
    hdr.className = "shop-section-hdr";
    hdr.textContent = text;
    container.appendChild(hdr);
}

function appendBundleCard(container: HTMLElement, shop: IapShop, bundle: ShopBundle, opts: RenderShopOptions): void {
    const state = shop.limitedOfferState(bundle);
    const owned = shop.ownedCount(bundle.id) > 0;

    const card = document.createElement("div");
    card.className = "shop-bundle";
    if (bundle.limited) card.classList.add("limited");
    if (owned) card.classList.add("owned-one");

    // Owned glyph — rendered first so it layers beneath later children;
    // pointer-events: none (CSS) keeps it from intercepting clicks.
    if (owned) {
        const check = document.createElement("div");
        check.className = "shop-bundle-owned-check";
        check.setAttribute("aria-hidden", "true");
        check.textContent = "✔";
        card.appendChild(check);
    }

    const top = document.createElement("div");
    top.className = "shop-bundle-top";
    const nameEl = document.createElement("div");
    nameEl.className = "shop-bundle-name";
    nameEl.textContent = bundle.name || bundle.id;
    top.appendChild(nameEl);

    // Live countdown while the limited offer is buyable; hidden once owned
    // so the ticking timer doesn't distract from the purchased state.
    if (state === "active") {
        const timeEl = document.createElement("div");
        timeEl.className = "shop-bundle-time";
        timeEl.innerHTML =
            'Ends in <span id="shop-limited-countdown">' + formatCountdown(shop.limitedOfferRemainingMs()) + "</span>";
        top.appendChild(timeEl);
    }
    card.appendChild(top);

    const ul = document.createElement("ul");
    ul.className = "shop-bundle-perks";
    for (const perk of bundle.perks || []) {
        const li = document.createElement("li");
        li.textContent = perk;
        ul.appendChild(li);
    }
    card.appendChild(ul);

    const actions = document.createElement("div");
    actions.className = "shop-bundle-actions";
    const spacer = document.createElement("div"); // keeps the button right-aligned
    spacer.className = "shop-bundle-spacer";
    actions.appendChild(spacer);

    const btn = document.createElement("button");
    if (owned) {
        btn.className = "shop-buy-btn owned-lbl";
        btn.textContent = "OWNED";
        btn.disabled = true;
    } else {
        btn.className = "shop-buy-btn";
        btn.innerHTML = buyButtonHtml(bundle.costRB);
        btn.addEventListener("click", async () => {
            if (btn.disabled) return;
            btn.disabled = true; // double-tap guard while the platform UI is up
            await shop.purchase(bundle, "bundle");
            btn.disabled = false; // usually moot: ui.refresh re-rendered already
        });
    }
    actions.appendChild(btn);
    card.appendChild(actions);

    container.appendChild(card);
}

function buildPackCard(shop: IapShop, pack: ShopPack, bonusPct: number, opts: RenderShopOptions): HTMLElement {
    const card = document.createElement("div");
    card.className = "shop-pack";

    if (bonusPct > 0) {
        const badge = document.createElement("div");
        badge.className = "shop-pack-badge";
        badge.textContent = "+" + bonusPct + "%";
        card.appendChild(badge);
    }

    const amount = document.createElement("div");
    amount.className = "shop-pack-amount";
    amount.innerHTML = (opts.packIconHtml || "") + packAmount(pack).toLocaleString();
    card.appendChild(amount);

    const btn = document.createElement("button");
    btn.className = "shop-pack-buy";
    btn.innerHTML = buyButtonHtml(pack.costRB);
    btn.addEventListener("click", async () => {
        if (btn.disabled) return;
        btn.disabled = true;
        await shop.purchase(pack, "pack");
        btn.disabled = false;
    });
    card.appendChild(btn);

    return card;
}

/**
 * Subscription card, reusing the bundle-card look. Unlike bundles this is
 * NOT a RunBucks spend — the button shows the real-money platform price and
 * clicks open the host's subscription checkout sheet.
 */
function appendSubCard(
    container: HTMLElement,
    shop: IapShop,
    sub: Subscription,
    opts: RenderShopOptions,
    active: boolean,
): void {
    const card = document.createElement("div");
    card.className = "shop-bundle" + (active ? " owned-one" : "");

    if (active) {
        const check = document.createElement("div");
        check.className = "shop-bundle-owned-check";
        check.setAttribute("aria-hidden", "true");
        check.textContent = "✔";
        card.appendChild(check);
    }

    const top = document.createElement("div");
    top.className = "shop-bundle-top";
    const nameEl = document.createElement("div");
    nameEl.className = "shop-bundle-name";
    nameEl.textContent = sub.name;
    top.appendChild(nameEl);
    card.appendChild(top);

    const ul = document.createElement("ul");
    ul.className = "shop-bundle-perks";
    for (const perk of sub.perks || []) {
        const li = document.createElement("li");
        li.textContent = perk;
        ul.appendChild(li);
    }
    card.appendChild(ul);

    const actions = document.createElement("div");
    actions.className = "shop-bundle-actions";
    const spacer = document.createElement("div");
    spacer.className = "shop-bundle-spacer";
    actions.appendChild(spacer);

    const btn = document.createElement("button");
    if (active) {
        btn.className = "shop-buy-btn owned-lbl";
        btn.textContent = "ACTIVE";
        btn.disabled = true;
    } else {
        btn.className = "shop-buy-btn";
        btn.textContent = sub.priceLabel();
        btn.addEventListener("click", async () => {
            if (btn.disabled) return;
            btn.disabled = true; // guard double-taps while the sheet is up
            const ok = await sub.purchase();
            btn.disabled = false;
            if (ok) {
                if (opts.toast) opts.toast(sub.successToast);
                renderShop(container, shop, sub, opts);
            }
            // On cancel/fail: no toast — the platform sheet showed its own
            // UI; silently returning matches a declined RunBucks top-up.
        });
    }
    actions.appendChild(btn);
    card.appendChild(actions);

    container.appendChild(card);
}

// ── Limited-offer countdown ticker ─────────────────────────────────────────
// One module-level 1s interval: updates the countdown text in place and, on
// the active → expired transition, re-renders the shop so the card vanishes
// cleanly. Stops itself when the container leaves the DOM or no active
// limited offer remains.

interface TickerCtx {
    container: HTMLElement;
    shop: IapShop;
    sub: Subscription | null;
    opts: RenderShopOptions;
}

let _ticker: ReturnType<typeof setInterval> | null = null;
let _tickerCtx: TickerCtx | null = null;

function ensureTicker(ctx: TickerCtx): void {
    _tickerCtx = ctx;
    if (_ticker !== null) return;
    _ticker = setInterval(tick, 1000);
}

function stopTicker(): void {
    if (_ticker !== null) {
        clearInterval(_ticker);
        _ticker = null;
    }
    _tickerCtx = null;
}

function tick(): void {
    const ctx = _tickerCtx;
    if (!ctx || !ctx.container.isConnected) {
        stopTicker();
        return;
    }
    const remaining = ctx.shop.limitedOfferRemainingMs();
    const el = document.getElementById("shop-limited-countdown");
    if (el) el.textContent = formatCountdown(remaining);
    if (remaining <= 0) {
        const { container, shop, sub, opts } = ctx;
        stopTicker();
        renderShop(container, shop, sub, opts); // hides the expired card
    }
}
