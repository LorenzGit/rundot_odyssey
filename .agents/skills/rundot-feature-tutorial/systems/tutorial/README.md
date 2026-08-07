# Tutorial System — spotlight overlays, FTUE chains, feature callouts

Click-through tutorial cards with a character portrait, a dark mask that "cuts a hole" over the UI element being explained (box-shadow cutout — no z-index tricks), and a speech-bubble arrow aimed at the target. Tap anywhere to advance; the spotlit element shines through at full brightness but is not clickable — the highlight is instructional, the tutorial never waits for the player to perform the action.

**The engine stores nothing and imports nothing.** One-shot policy lives at the call sites via a persisted flag set *before* the tutorial shows; persistence goes through an injected `flags` adapter — typically backed by `systems/save/`. If the host game has no save system, integrate that first.

## Files

| File | Copy to host? | Purpose |
|---|---|---|
| `tutorial.ts` | yes (e.g. `src/helpers/tutorial.ts`) | engine: factory, sequencing, spotlight renderer — you should not need to edit it |
| `tutorial.css` | yes (e.g. `styles/tutorial.css`) | overlay/mask/card/arrow styling; theme via CSS custom properties at the top |
| `tutorial.html` | paste its contents into the host's `index.html` | the overlay DOM (last child of `<body>`) |
| `README.md` | no | this guide |

No dependencies — not even the RUN SDK. Works in any web game. TypeScript; if the host game is plain JavaScript, strip the type annotations while copying (see the root README's integration protocol).

## Quick integration

### 1. Paste the overlay DOM and CSS

Copy the block in `tutorial.html` into `index.html` as the **last child of `<body>`** (it must paint above everything; it is `position:fixed`, `z-index:220` — ADAPT the z-index in the CSS if the host has higher layers). Include `tutorial.css` however the host loads styles, and retheme the `:root` custom properties (`--tut-accent`, `--tut-card-bg`, `--tut-text-color`, …) to match the game's palette.

### 2. Write the content dictionary (new file, e.g. `src/tutorials.ts`)

Pure data — no runtime imports. Each entry is an array of cards; a card is a string or an object (see Message schema below).

```ts
import type { TutorialCard } from './helpers/tutorial';

// ADAPT: every tutorial in the game. Edit copy here, not at call sites.
// `text` renders via innerHTML, so <b> / <br> / host-specific tags work.
export const TUTORIALS: Record<string, TutorialCard[]> = {
    WELCOME: [
        {
            text: "Welcome! <b>Drag blocks</b> onto the grid to build your defense!",
            spotlight: 'shop',       // key in the `targets` config below
            arrow: 'bottom',         // card floats ABOVE the cutout, arrow points down at it
        },
    ],
    MERGE_HINT: [
        "Want stronger blocks? Try <b>merging</b> two of the same kind!",
        "Just drag one block onto another of the same type!",
    ],
    DAILY_REWARDS_UNLOCKED: [
        {
            text: "Come back every day for <b>DAILY REWARDS</b>!",
            spotlight: 'dailyRewards',
            arrow: 'bottom',
        },
    ],
};
```

### 3. Create the system (new file, e.g. `src/tutorialConfig.ts`)

```ts
import { createTutorials } from './helpers/tutorial';
import { saveSystem } from './saveConfig';   // systems/save

export const tutorials = createTutorials({
    // ADAPT: spotlight name -> DOM id, or a resolver fn for elements that
    // are created/re-rendered dynamically (resolved fresh at show time).
    targets: {
        shop: 'shop-panel',
        dailyRewards: 'btn-daily-rewards',
        upgradeBtn: () => document.querySelector<HTMLElement>('#units-list .upgrade-btn'),
    },
    // Flags adapter: one-shot booleans persisted in the save blob (the cast:
    // flag names index the save dynamically, outside its static shape).
    flags: {
        has: (name) => !!(saveSystem.data as any)[name],
        set: (name) => { (saveSystem.data as any)[name] = true; saveSystem.save(); },
    },
    portraitUrl: './images/tutorial_character.png',  // ADAPT: or omit to hide the portrait box
    // Optional analytics: long durations = confusing copy; instant
    // dismissals on important tutorials = players skipping info they need.
    onDismiss(id, cardCount, durationMs) {
        // ADAPT: e.g. recordCustomEvent('tutorial_dismissed', { id, cardCount, durationMs })
    },
    // Optional: dim/pause competing full-screen effects while a tutorial
    // is up. Hide any global scanline, vignette, or similar overlays here
    // so they didn't darken edge-positioned spotlit elements.
    onOverlayShown() { document.body.classList.add('tut-active'); },
    onOverlayHidden() { document.body.classList.remove('tut-active'); },
});
```

Save schema addition (all additive — no migration needed, see the save README):

```ts
// in the save interface AND defaultSave():
tutorialStep: 0,                 // linear FTUE chain position
shownMergeTut: false,            // one boolean per showOnce() tutorial
shownDailyRewardsTut: false,
```

### 4. Boot wiring

```ts
tutorials.attach();   // once, after the DOM is ready — wires the tap-anywhere-to-advance listener
```

### 5. Trigger sites — one-shot callouts

`showOnce` wraps the **set-before-show** idiom: it flips the flag and persists it *before* the overlay appears, so a tutorial interrupted mid-sequence (app killed, refresh) never re-shows. A lost tutorial beats a player stuck re-reading one on every boot.

```ts
// e.g. in updateMenuButtons(), when the button first unlocks:
if (dailyRewardsUnlocked(game) && menuIsIdle()) {   // see Patterns: idle gating
    tutorials.showOnce('shownDailyRewardsTut', TUTORIALS.DAILY_REWARDS_UNLOCKED);
}

// e.g. at the END of a screen's render fn, after its DOM is mounted
// (so the spotlight measurement can resolve the target):
tutorials.showOnce('shownUnitsScreenTut', TUTORIALS.UNITS_SCREEN_HELP);
```

### 6. Trigger sites — linear FTUE chain

Multi-beat onboarding uses one integer step field checked with **exact equality** — each trigger site owns exactly one transition, and advancing the step (persisted in `onDone`) is what unlocks the next beat. `===` (not `>=`) means an already-past step can never refire.

```ts
// beat 0 -> 1: very first game start
if (game.save.tutorialStep === 0) {
    tutorials.show(TUTORIALS.WELCOME, () => {
        game.save.tutorialStep = 1;
        saveSystem.save();
    }, 'WELCOME');
}

// beat 2 -> 3: elsewhere (e.g. back on the menu after the first defeat)
if (game.save.tutorialStep === 2 && menuIsIdle()) {
    tutorials.show(TUTORIALS.FTUE_UPGRADES, () => {
        game.save.tutorialStep = 3;
        saveSystem.save();
    }, 'FTUE_UPGRADES');
}
```

Note the FTUE step advances in `onDone` (the player actually clicked through), while `showOnce` flags flip before showing — different guarantees for different jobs: an interrupted one-shot callout is disposable; an interrupted FTUE beat should resume on next boot.

## Message schema

A tutorial is an array of cards, advanced by click/tap anywhere. Each card is:

- a **plain string** — simple card, full-screen dark mask, no pointer, or
- an **object**:

| Field | Type | Meaning |
|---|---|---|
| `text` | string | card body, rendered via `innerHTML` (`<b>`, `<br>`, host tags OK) |
| `spotlight` | string? | `targets` key — the mask cuts a bright hole over that element |
| `arrow` | `'top'`\|`'bottom'`? | speech-bubble pointer side. `'top'` = card sits BELOW the cutout, arrow points up; `'bottom'` = card sits ABOVE, arrow points down |
| `arrowTarget` | string? | `targets` key to aim the arrow at; defaults to `spotlight`. Use when the cutout covers a wide region but the arrow should anchor on one child (e.g. spotlight the whole speed-button row, aim at the new 2x button) |

## Config reference

`createTutorials(config)`:

| Key | Required | Purpose |
|---|---|---|
| `targets` | for spotlights | `{ name: 'dom-id' \| () => HTMLElement\|null }` — resolvers run at show time |
| `flags` | for `showOnce` | `{ has(name), set(name) }` — `set` must persist durably |
| `portraitUrl` | no | portrait image; omitted = portrait box hidden |
| `onDismiss(id, cardCount, durationMs)` | no | analytics, fired when a sequence completes |
| `onOverlayShown` / `onOverlayHidden` | no | dim/restore competing full-screen effects |
| `overlayIds` | no | override default DOM ids (`tutorial-overlay`, `tut-box`, `tut-text`, `tut-continue`) |
| `continueLabels` | no | `{ mobile, desktop }` hint copy (defaults `'tap to continue'` / `'click to continue'`; ADAPT for localization — may be getters; read lazily per render, so `L.Get()`-backed getters track live language switches) |
| `transitionSnapSelector` | no | extra elements whose CSS transitions are snapped before measuring (see Patterns) |
| `spotlightPadPx` (8) / `spotlightGapPx` (18) / `arrowEdgePadPx` (18) / `halo` (false) | no | spotlight tuning |

Returned API: `attach()`, `show(messages, onDone?, id?)`, `showOnce(flag, messages, onDone?)` → boolean, `advance()`, `isActive()`, `registerTarget(name, resolver)`.

Everything is null-safe: a missing overlay, unknown target, hidden element, or throwing resolver degrades gracefully (full-screen mask, card at the default bottom position, `onDone` still runs) — never a crash.

## Patterns

**Spotlight a dynamically re-rendered element.** Two options: (a) a resolver — `targets: { buyBtn: () => document.querySelector<HTMLElement>('#cards .buy-btn') }` — resolved fresh every show; or (b) re-stamp a well-known id on each render, such as `id="unit-lvl-btn-first"` on the topmost still-upgradable row, so the same target name always lands on the row that matters. Either way, trigger the tutorial *after* the render that mounts the element.

**First-visit screen help.** At the end of `renderXScreen()`, after the DOM is mounted: `tutorials.showOnce('shownXScreenTut', TUTORIALS.X_SCREEN_HELP)`. The engine defers measurement to a `requestAnimationFrame`, so same-tick renders settle before the cutout is measured.

**Gate menu triggers behind an idle predicate.** Unlock tutorials fire from menu-refresh code, which also runs while dialogs are open or other screens are up. Guard with a `mainMenuReady` predicate, and re-run the check when a dialog closes so a suppressed tutorial fires as soon as the screen is uncluttered:

```ts
function menuIsIdle(): boolean {
    const menu = document.getElementById('main-menu');
    if (!menu || menu.classList.contains('hidden')) return false;
    for (const id of ['settings-dialog', 'daily-rewards-dialog' /* ADAPT: every menu dialog */]) {
        const el = document.getElementById(id);
        if (el && !el.classList.contains('hidden')) return false;
    }
    return !tutorials.isActive();
}
```

**Targets that animate as the tutorial fires.** The engine snaps the target's own in-flight CSS transitions to measure final layout. If a *neighbor* animates size at that moment and shifts the target's position through the surrounding flex/grid layout, pass a selector such as `transitionSnapSelector: '.menu-btn'` so the neighbors get snapped too.

## Derive from the host game (do not ask the user)

| Decision | How to derive it |
|---|---|
| What to write tutorials about | the game's first-session verbs — read its core loop (main update/input code) and cover each verb the player must learn: place, merge, upgrade, claim. Add a one-shot callout for each feature unlock and each screen's first visit. |
| Which elements to spotlight | find their ids/classes in the host's markup or render code; add an id (or a resolver / re-stamped id for dynamic elements) per target |
| Where flags persist | the host's save system — add one boolean per `showOnce` tutorial plus `tutorialStep: 0` to its save schema (additive fields, no migration) |
| Copy tone | mimic the game's existing UI strings (button labels, toasts). If it has a mascot/character, write in that voice and use its art for `portraitUrl`; otherwise omit the portrait. |
| Where triggers live | screen render functions (first-visit help), unlock/refresh code (feature callouts), game-start / game-over paths (FTUE chain) |
| Theme | copy colors from the host's CSS into the `--tut-*` variables at the top of `tutorial.css` |

## SDK notes

None directly — the engine is SDK-free and works anywhere, including local dev and non-RUN builds. Persistence rides the save system through the `flags` adapter, so all storage rules (and the "browser storage doesn't work in the production iframe" rule) are the save system's concern, not this one's. If you fire analytics from `onDismiss`, keep the global rule: wrap SDK calls in try/catch.

## UI adaptation

This system is inherently DOM: the overlay, mask, and card are elements. That still works over a **canvas-rendered game** — the overlay is `position:fixed`, so pasting it as the last child of `<body>` floats it above the canvas with zero changes for plain (non-spotlight) cards.

To *spotlight a canvas-drawn region*, give the engine a proxy element positioned over that region:

```ts
// One invisible proxy div per canvas region you want to spotlight.
const proxy = document.createElement('div');
proxy.style.cssText = 'position:fixed; pointer-events:none; visibility:hidden;';
document.body.appendChild(proxy);

// Reposition from game coordinates just before showing the tutorial
// (account for canvas CSS scaling: backing pixels vs layout pixels).
function placeProxy(gx: number, gy: number, gw: number, gh: number): void {
    const c = canvas.getBoundingClientRect();
    const sx = c.width / canvas.width, sy = c.height / canvas.height;
    proxy.style.left = (c.left + gx * sx) + 'px';
    proxy.style.top = (c.top + gy * sy) + 'px';
    proxy.style.width = (gw * sx) + 'px';
    proxy.style.height = (gh * sy) + 'px';
}

tutorials.registerTarget('mergeSlot', () => proxy);
// trigger site:
placeProxy(slot.x, slot.y, slot.w, slot.h);
tutorials.showOnce('shownMergeTut', TUTORIALS.MERGE_HINT);
```

The proxy stays `visibility:hidden` — the engine only reads its bounding rect (a hidden-but-laid-out element still measures; do NOT use `display:none`, which measures 0×0 and makes the spotlight bail). For a framework-rendered UI (React etc.), treat `tutorial.ts` as-is (it only touches its own overlay ids) and use resolvers that query the framework's rendered DOM. Fully reimplementing the mask on canvas is possible (draw the darkness with a cleared rect over the target) but you lose the card/arrow for free — only go there if a DOM overlay is genuinely impossible.

## Verification checklist

1. Spotlight lands exactly on its target (8px pad) at several window sizes / orientations — including targets near screen edges, where the arrow tip must clamp 18px from the card's corners instead of sliding off it.
2. During a spotlight card, the spotlit element is fully bright (even if disabled/dimmed normally) but NOT clickable — a tap on it advances the tutorial instead.
3. Kill/refresh the game mid-`showOnce` tutorial → it does not re-show on next boot (flag persisted before showing).
4. After the last card: overlay hidden, no `.tut-spotlit` class left anywhere, no inline `left/top/width/height` on the mask, no `floating`/arrow classes or inline styles on the card, element transitions restored — and the next tutorial starts clean.
5. Point a `spotlight` at a hidden or missing element → card still shows over a full-screen mask at the default bottom position, no throw.
6. `onDismiss` fires once per completed sequence with a sane `durationMs`; `onOverlayShown`/`onOverlayHidden` bracket the sequence (e.g. body class added/removed).
7. FTUE chain: each step fires once, in order, and an interrupted step re-offers on next boot (step advances only in `onDone`).
