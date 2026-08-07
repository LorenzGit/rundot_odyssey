// Spotlight tutorial overlay for RUN games (or any web game — no SDK dependency).
//
// Model: a tutorial is an array of MESSAGES advanced by click/tap anywhere.
// A message can be either:
//
//   • a plain string — a simple card, no spotlight or pointer
//   • an object { text, spotlight, arrow, arrowTarget }:
//
//       text        — innerHTML body (author copy with <b>, <br>, etc.)
//       spotlight   — name of a UI region the dark mask should "cut a
//                     hole" over. Must be a key in config.targets (or
//                     registered later via registerTarget()).
//       arrow       — 'top' | 'bottom' — render a CSS-triangle
//                     speech-bubble pointer on that side of the card,
//                     aimed at an in-game element. 'top' puts the card
//                     BELOW the spotlight (arrow points up at it);
//                     'bottom' puts the card ABOVE it.
//       arrowTarget — optional. Target name to aim the arrow at.
//                     Defaults to `spotlight` — use it when the cutout
//                     covers a wide area (a whole button row) but the
//                     arrow should anchor on a specific child.
//
// Spotlight mechanism: the `.tut-mask` div is re-purposed as a small
// "cutout" sized + positioned over the highlighted element. CSS paints a
// giant `box-shadow: 0 0 0 9999px` darkness across the rest of the
// viewport while the cutout itself stays transparent — so the element
// underneath shines through at its natural brightness with NO z-index /
// stacking-context tricks. Clicks on the cutout do NOT reach the element:
// the overlay above it swallows them as "advance the tutorial". The
// highlight is instructional — the tutorial never waits for the player to
// actually perform the spotlit action.
//
// Persistence: the engine stores NOTHING. One-shot policy lives at call
// sites via the set-before-show idiom (flip the flag AND persist BEFORE
// showing, so an interrupted tutorial never re-shows). showOnce() wraps
// that idiom over the injected `flags` adapter. Linear FTUE chains use an
// integer step field checked with exact equality — see the README.

/** One card in a tutorial sequence (the object form — a plain string is
 *  shorthand for `{ text }`). */
export interface TutorialMessage {
    /** innerHTML card body */
    text: string;
    /** target name to cut the mask over */
    spotlight?: string | null;
    /** speech-bubble pointer side */
    arrow?: "top" | "bottom" | null;
    /** target name to aim the arrow at (defaults to `spotlight`) */
    arrowTarget?: string | null;
}

/** A tutorial card as authored: a plain string or a full message object. */
export type TutorialCard = string | TutorialMessage;

/**
 * How to find a spotlight target element. A string is a DOM id; a function
 * is a resolver called at show time (use resolvers for dynamically-created /
 * re-rendered elements).
 */
export type TargetResolver = string | (() => HTMLElement | null);

/**
 * Persistence adapter for showOnce(). `has` returns whether the one-shot
 * flag is already set; `set` must flip it AND persist it durably (e.g.
 * a boolean on the save blob + saveSystem.save()).
 */
export interface TutorialFlags {
    has: (name: string) => boolean;
    set: (name: string) => void;
}

export interface TutorialsConfig {
    /**
     * Map of public spotlight names → how to find the element. A string is a
     * DOM id; a function is a resolver called at show time (use resolvers for
     * dynamically-created / re-rendered elements). Keeping the map here means
     * the content dictionary stays pure data and the engine owns element
     * resolution. More targets can be added later via registerTarget().
     */
    targets?: Record<string, TargetResolver>;
    /**
     * Persistence adapter for showOnce(). `has` returns whether the one-shot
     * flag is already set; `set` must flip it AND persist it durably (e.g.
     * a boolean on the save blob + saveSystem.save()). Required only if you
     * use showOnce().
     */
    flags?: TutorialFlags;
    /**
     * Character portrait image URL for the card. Omit to hide the portrait
     * box entirely (applied by attach()).
     */
    portraitUrl?: string;
    /**
     * Analytics hook fired when a sequence completes (last card dismissed).
     * `id` is the third arg to show() / the flag name from showOnce().
     * Long durations indicate confusing copy; instant dismissals on
     * important tutorials indicate players ignoring info they need.
     */
    onDismiss?: (id: string, cardCount: number, durationMs: number) => void;
    /**
     * Fired when the overlay becomes visible (sequence start). The source
     * game used this slot to add a body class that hid its CRT scanline /
     * vignette overlays so they didn't darken edge-positioned spotlit
     * elements — dim or pause competing full-screen effects here.
     */
    onOverlayShown?: () => void;
    /** Fired when the overlay hides (sequence end). Undo onOverlayShown. */
    onOverlayHidden?: () => void;
    /**
     * Override the overlay DOM ids if the defaults collide with the host.
     * Defaults: 'tutorial-overlay', 'tut-box', 'tut-text', 'tut-continue'
     * (matching tutorial.html).
     */
    overlayIds?: { overlay?: string; box?: string; text?: string; continueHint?: string };
    /**
     * ADAPT: continue-hint copy, e.g. for localization.
     * Defaults: 'tap to continue' / 'click to continue'.
     */
    continueLabels?: { mobile?: string; desktop?: string };
    /**
     * Optional CSS selector for elements whose in-flight CSS transitions
     * could shift the spotlit target's POSITION via surrounding flex/grid
     * layout. The engine always snaps the target + arrow target's own
     * transitions before measuring; add a selector when a NEIGHBOR animates
     * size at the moment a tutorial fires.
     */
    transitionSnapSelector?: string;
    /**
     * Padding around the spotlit element when sizing the cutout — gives the
     * halo/glow breathing room so it doesn't eat into the element's border.
     * Default 8.
     */
    spotlightPadPx?: number;
    /**
     * Gap between the cutout and the card — big enough to make the
     * speech-bubble pointer feel intentional. Default 18.
     */
    spotlightGapPx?: number;
    /**
     * Minimum horizontal distance between the arrow tip and the card's
     * left/right edge, so the arrow can't disappear into rounded corners
     * when the target sits far off to one side. Default 18.
     */
    arrowEdgePadPx?: number;
    /**
     * Draw an accent-colored halo ring around the cutout (see
     * `.tut-mask.has-spotlight.halo` in tutorial.css). Leave this off when the
     * dark mask already isolates the element and the ring competes with the
     * card's border.
     * Default false.
     */
    halo?: boolean;
}

export interface Tutorials {
    /**
     * Wire the overlay's single click listener (any click/tap anywhere
     * on the overlay advances the tutorial) and apply the portrait
     * config. Call once at boot, after the DOM is ready and the
     * tutorial.html snippet is in the document. Safe to call again if
     * the overlay wasn't in the DOM yet — it only latches on success.
     */
    attach(): void;
    /**
     * Show a tutorial sequence. Replaces any sequence already showing
     * (the replaced sequence's onDone does NOT run).
     * @param messages the cards
     * @param onDone   fired after the last card is dismissed
     * @param id       analytics id passed to onDismiss
     */
    show(messages: TutorialCard[], onDone?: () => void, id?: string): void;
    /**
     * One-shot show, keyed on a persisted flag. Uses the set-before-show
     * idiom: the flag is set AND persisted BEFORE the overlay appears,
     * so a tutorial interrupted mid-sequence (app killed, refresh)
     * never re-shows — a deliberate trade: a lost tutorial beats a
     * player stuck re-reading one on every boot.
     * @param flag flag name in the flags adapter (also the analytics id)
     * @returns true if the tutorial was shown
     */
    showOnce(flag: string, messages: TutorialCard[], onDone?: () => void): boolean;
    /** Advance to the next card (the overlay click listener calls this;
     *  call it directly for e.g. a hardware-back-button binding).
     *  No-op when no tutorial is active. */
    advance(): void;
    /** Whether a tutorial is currently showing. Useful for pausing
     *  game-loop input or gating other popups. */
    isActive(): boolean;
    /**
     * Add or replace a spotlight target after creation. Handy when a
     * screen module owns a dynamically-created element and wants to
     * register its resolver next to the code that renders it.
     * @param resolver DOM id or resolver fn
     */
    registerTarget(name: string, resolver: TargetResolver): void;
}

export function createTutorials(config: TutorialsConfig): Tutorials {
    const {
        targets = {},
        flags = null,
        portraitUrl = null,
        onDismiss = null,
        onOverlayShown = null,
        onOverlayHidden = null,
        overlayIds = {},
        continueLabels = {},
        transitionSnapSelector = null,
        spotlightPadPx = 8,
        spotlightGapPx = 18,
        arrowEdgePadPx = 18,
        halo = false,
    } = config;

    const ids = {
        overlay: overlayIds.overlay || "tutorial-overlay",
        box: overlayIds.box || "tut-box",
        text: overlayIds.text || "tut-text",
        continueHint: overlayIds.continueHint || "tut-continue",
    };
    // Read lazily (per renderStep) so localized continueLabels getters
    // resolve in the player's CURRENT language, not the import-time default.
    const labels = {
        get mobile() {
            return continueLabels.mobile || "tap to continue";
        },
        get desktop() {
            return continueLabels.desktop || "click to continue";
        },
    };

    // Live copy of the target map so registerTarget() can extend it.
    const targetMap: Record<string, TargetResolver> = Object.assign({}, targets);

    // ── Sequence state ──────────────────────────────────────────────────
    let msgs: TutorialCard[] | null = null; // active message array (null when idle)
    let idx = 0; // current card index
    let doneCb: (() => void) | null = null; // onDone callback for the active sequence
    let startedAt = 0; // wall-clock start for onDismiss duration
    let activeId = "unknown"; // analytics id for the active sequence
    let active = false;
    let attached = false;
    // Guards the deferred rAF measurement: if the sequence advances or
    // closes before the frame fires, the stale measurement bails.
    let currentSpotlitTarget: HTMLElement | null = null;

    // ── Helpers ─────────────────────────────────────────────────────────

    function isMobile(): boolean {
        return typeof window !== "undefined" && ("ontouchstart" in window || navigator.maxTouchPoints > 0);
    }

    function now(): number {
        return typeof performance !== "undefined" && performance.now ? performance.now() : Date.now();
    }

    function byId(id: string): HTMLElement | null {
        return (typeof document !== "undefined" && document.getElementById(id)) || null;
    }

    /** Resolve a target name to a live element, or null. Never throws —
     *  a missing entry, a missing element, or a throwing resolver all
     *  degrade to "no spotlight" rather than breaking the card. */
    function resolveTarget(name: string): HTMLElement | null {
        const entry = targetMap[name];
        if (!entry) return null;
        try {
            const el = typeof entry === "function" ? entry() : byId(entry);
            // `as any`: the truthiness guard is load-bearing (a resolver can
            // return non-element junk at runtime), but TS sees the method as
            // always defined on HTMLElement.
            return el && (el as any).getBoundingClientRect ? el : null;
        } catch (e) {
            return null;
        }
    }

    /** Coerce a message into the canonical shape regardless of whether it
     *  was authored as a plain string or a full object. arrowTarget
     *  defaults to spotlight so authors can omit it whenever the arrow
     *  should aim at the same element the cutout covers. */
    function normalizeMessage(msg: TutorialCard): Required<TutorialMessage> {
        if (typeof msg === "string") return { text: msg, spotlight: null, arrow: null, arrowTarget: null };
        return {
            text: (msg && msg.text) || "",
            spotlight: (msg && msg.spotlight) || null,
            arrow: (msg && msg.arrow) || null,
            arrowTarget: (msg && msg.arrowTarget) || (msg && msg.spotlight) || null,
        };
    }

    // ── Spotlight engine ────────────────────────────────────────────────

    /**
     * Position the dark mask as a "cutout" over the named element + float
     * the card just outside it (below for arrow:'top', above for
     * arrow:'bottom'). No-op (silent, full-screen mask stays) when the
     * spotlight is null, the name is unknown, or the resolved element is
     * hidden / 0-sized. Measurement is deferred to a rAF so any pending
     * layout (the host often re-renders a screen right before showing its
     * first-visit tutorial) settles before we read bounding rects.
     */
    function applySpotlight(
        overlay: HTMLElement | null,
        spotlight: string | null,
        arrow: "top" | "bottom" | null,
        arrowTarget: string | null,
    ): void {
        clearSpotlight(overlay);
        if (!spotlight || !overlay) return;
        const target = resolveTarget(spotlight);
        if (!target) return;
        // Arrow target falls back to the spotlight target — keeps the
        // common case (arrow points at the cutout) zero-config.
        const arrowEl = (arrowTarget ? resolveTarget(arrowTarget) : null) || target;
        currentSpotlitTarget = target;
        // Tag the target so its own dim states (e.g. a :disabled button at
        // opacity:0.3) get force-overridden to opacity:1 — see the
        // `.tut-spotlit` rule in tutorial.css. Without this the spotlit
        // element can paint as a dim shape inside the bright cutout,
        // reading as "behind the darkness" even though it's cut out.
        target.classList.add("tut-spotlit");
        if (arrowEl !== target) arrowEl.classList.add("tut-spotlit");
        requestAnimationFrame(() => {
            if (currentSpotlitTarget !== target) return; // advanced/closed before this frame
            const mask = overlay.querySelector<HTMLElement>(".tut-mask");
            const box = byId(ids.box);
            if (!mask) return;
            // Snap any in-flight CSS transitions so we measure the FINAL
            // layout, not still-animating intermediate values. Critical
            // when elements change state right as the tutorial fires (an
            // unlocking button growing via `transition: all .2s` — this
            // rAF lands within a frame of the change, well before the
            // animation completes). Two categories need snapping:
            //   1. The target (and arrow target) itself — to size the
            //      cutout correctly when the spotlit element is the one
            //      transitioning.
            //   2. Elements matched by transitionSnapSelector — neighbors
            //      whose transitions shift the target's POSITION through
            //      the surrounding flex/grid layout.
            const snapTargets = new Set<HTMLElement>();
            snapTargets.add(target);
            snapTargets.add(arrowEl);
            if (transitionSnapSelector) {
                for (const el of document.querySelectorAll<HTMLElement>(transitionSnapSelector)) snapTargets.add(el);
            }
            const saved: Array<{ el: HTMLElement; transition: string }> = [];
            for (const el of snapTargets) {
                saved.push({ el, transition: el.style.transition });
                el.style.transition = "none";
            }
            void target.offsetHeight; // force reflow so the snapped layout commits
            const r = target.getBoundingClientRect();
            const ov = overlay.getBoundingClientRect();
            if (r.width === 0 && r.height === 0) {
                for (const { el, transition } of saved) el.style.transition = transition;
                return; // hidden / unmounted — full-screen mask stays
            }
            // Position the cutout precisely over the target (with a small
            // pad so any halo sits just outside the element's own border).
            // Coordinates are relative to the overlay because the mask is
            // `position:absolute` inside it.
            const left = r.left - ov.left - spotlightPadPx;
            const top = r.top - ov.top - spotlightPadPx;
            const width = r.width + spotlightPadPx * 2;
            const height = r.height + spotlightPadPx * 2;
            mask.classList.add("has-spotlight");
            mask.classList.toggle("halo", halo);
            mask.style.left = left + "px";
            mask.style.top = top + "px";
            mask.style.width = width + "px";
            mask.style.height = height + "px";
            // Float the card just outside the cutout. For arrow:'top' the
            // card sits BELOW the spotlight (arrow points up at it); for
            // arrow:'bottom' (or no arrow) the card sits ABOVE it. Without
            // floating mode the card stays on its default flex-end
            // alignment at the bottom of the overlay.
            if (box) {
                box.classList.add("floating");
                if (arrow === "top") {
                    box.style.top = top + height + spotlightGapPx + "px";
                    box.style.bottom = "auto";
                } else {
                    box.style.bottom = Math.max(0, ov.height - top + spotlightGapPx) + "px";
                    box.style.top = "auto";
                }
                // Aim the speech-bubble arrow at the arrow-target's
                // horizontal centre. The CSS triangle pseudos read
                // `--tut-arrow-x` (set on the box) and lock their centre
                // line to that x inside the box's own coordinate system.
                // Reading the box's rect AFTER applying the top/bottom
                // inline styles forces a fresh layout so the rect reflects
                // the new position.
                const boxRect = box.getBoundingClientRect();
                const arrowR = arrowEl.getBoundingClientRect();
                const targetCenter = arrowR.left + arrowR.width / 2;
                let arrowX = targetCenter - boxRect.left;
                arrowX = Math.max(arrowEdgePadPx, Math.min(boxRect.width - arrowEdgePadPx, arrowX));
                box.style.setProperty("--tut-arrow-x", arrowX + "px");
            }
            // Restore the original transition values now that all
            // measurements are done.
            for (const { el, transition } of saved) el.style.transition = transition;
        });
    }

    /** Reset the mask back to its full-screen default and drop any
     *  spotlight-driven inline styles / classes so nothing leaks between
     *  cards or into the game after close. */
    function clearSpotlight(overlay: HTMLElement | null): void {
        currentSpotlitTarget = null;
        if (typeof document !== "undefined") {
            // Sweep the whole document — covers both the cutout target and
            // a different arrow target, even if they since re-rendered.
            for (const el of document.querySelectorAll(".tut-spotlit")) {
                el.classList.remove("tut-spotlit");
            }
        }
        if (!overlay) return;
        const mask = overlay.querySelector<HTMLElement>(".tut-mask");
        if (mask) {
            mask.classList.remove("has-spotlight", "halo");
            mask.style.removeProperty("left");
            mask.style.removeProperty("top");
            mask.style.removeProperty("width");
            mask.style.removeProperty("height");
        }
        const box = byId(ids.box);
        if (box) {
            box.classList.remove("floating");
            box.style.removeProperty("top");
            box.style.removeProperty("bottom");
            box.style.removeProperty("--tut-arrow-x");
        }
    }

    /** Apply / clear the speech-bubble pointer classes on the card. */
    function applyArrow(box: HTMLElement | null, arrow: "top" | "bottom" | null): void {
        if (!box) return;
        box.classList.remove("arrow-top", "arrow-bottom");
        if (arrow === "top") box.classList.add("arrow-top");
        else if (arrow === "bottom") box.classList.add("arrow-bottom");
    }

    /** Drop every spotlight / arrow modifier — called on close so nothing
     *  leaks into the next tutorial or sticks around as a zombie class. */
    function clearMods(): void {
        clearSpotlight(byId(ids.overlay));
        applyArrow(byId(ids.box), null);
    }

    // ── Sequencing ──────────────────────────────────────────────────────

    /** Last card dismissed (or overlay missing): hide, clean up, fire the
     *  analytics hook, then the sequence's onDone. */
    function endSequence(): void {
        const overlay = byId(ids.overlay);
        if (overlay) overlay.classList.add("hidden");
        clearMods();
        const finished = msgs;
        const cb = doneCb;
        msgs = null;
        doneCb = null;
        active = false;
        if (onOverlayHidden) {
            try {
                onOverlayHidden();
            } catch (e) {
                /* host hook must not break the flow */
            }
        }
        if (onDismiss) {
            const durationMs = startedAt ? Math.max(0, now() - startedAt) : 0;
            try {
                onDismiss(activeId, (finished || []).length, durationMs);
            } catch (e) {
                /* analytics must not break the flow */
            }
        }
        if (cb) cb();
    }

    /** Render the current card, or end the sequence if past the last one.
     *  A missing overlay ends the sequence immediately (onDone still runs)
     *  so game logic behind a tutorial can never dead-end on absent DOM. */
    function renderStep(): void {
        if (!msgs || idx >= msgs.length) {
            endSequence();
            return;
        }
        const overlay = byId(ids.overlay);
        if (!overlay) {
            endSequence();
            return;
        }
        const box = byId(ids.box);
        const msg = normalizeMessage(msgs[idx]);
        const textEl = byId(ids.text);
        if (textEl) textEl.innerHTML = msg.text;
        const hintEl = byId(ids.continueHint);
        if (hintEl) hintEl.textContent = isMobile() ? labels.mobile : labels.desktop;
        applySpotlight(overlay, msg.spotlight, msg.arrow, msg.arrowTarget);
        applyArrow(box, msg.arrow);
        overlay.classList.remove("hidden");
    }

    const sys: Tutorials = {
        /**
         * Wire the overlay's single click listener (any click/tap anywhere
         * on the overlay advances the tutorial) and apply the portrait
         * config. Call once at boot, after the DOM is ready and the
         * tutorial.html snippet is in the document. Safe to call again if
         * the overlay wasn't in the DOM yet — it only latches on success.
         */
        attach(): void {
            if (attached) return;
            const overlay = byId(ids.overlay);
            if (!overlay) return;
            attached = true;
            overlay.addEventListener("click", () => sys.advance());
            const charBox = overlay.querySelector<HTMLElement>(".tut-char");
            const img = charBox ? charBox.querySelector("img") : null;
            if (portraitUrl && img) img.src = portraitUrl;
            else if (!portraitUrl && charBox) charBox.style.display = "none";
        },

        /**
         * Show a tutorial sequence. Replaces any sequence already showing
         * (the replaced sequence's onDone does NOT run).
         * @param messages the cards
         * @param onDone   fired after the last card is dismissed
         * @param id       analytics id passed to onDismiss
         */
        show(messages: TutorialCard[], onDone?: () => void, id?: string): void {
            if (!messages || !messages.length) {
                if (onDone) onDone();
                return;
            }
            const wasActive = active;
            msgs = messages;
            idx = 0;
            doneCb = onDone || null;
            startedAt = now();
            activeId = id || "unknown";
            active = true;
            if (!wasActive && onOverlayShown) {
                try {
                    onOverlayShown();
                } catch (e) {
                    /* host hook must not break the flow */
                }
            }
            renderStep();
        },

        /**
         * One-shot show, keyed on a persisted flag. Uses the set-before-show
         * idiom: the flag is set AND persisted BEFORE the overlay appears,
         * so a tutorial interrupted mid-sequence (app killed, refresh)
         * never re-shows — a deliberate trade: a lost tutorial beats a
         * player stuck re-reading one on every boot.
         * @param flag flag name in the flags adapter (also the analytics id)
         * @returns true if the tutorial was shown
         */
        showOnce(flag: string, messages: TutorialCard[], onDone?: () => void): boolean {
            if (!flags || flags.has(flag)) return false;
            flags.set(flag);
            sys.show(messages, onDone, flag);
            return true;
        },

        /** Advance to the next card (the overlay click listener calls this;
         *  call it directly for e.g. a hardware-back-button binding).
         *  No-op when no tutorial is active. */
        advance(): void {
            if (!active) return;
            idx++;
            renderStep();
        },

        /** Whether a tutorial is currently showing. Useful for pausing
         *  game-loop input or gating other popups. */
        isActive(): boolean {
            return active;
        },

        /**
         * Add or replace a spotlight target after creation. Handy when a
         * screen module owns a dynamically-created element and wants to
         * register its resolver next to the code that renders it.
         * @param resolver DOM id or resolver fn
         */
        registerTarget(name: string, resolver: TargetResolver): void {
            targetMap[name] = resolver;
        },
    };

    return sys;
}
