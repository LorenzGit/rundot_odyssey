---
name: rundot-mobile-ux
description: >-
  Make a RUN.game title feel right on phones: portrait-first (landscape only when
  the genre needs it), layouts that respond to any screen size by anchoring to
  corners/edges instead of absolute coordinates, safe-area insets, and touch-safe
  text/icon sizing. Use when building or reviewing HUD/UI layout, responsive
  design, orientation, touch controls, tap targets, or when the user mentions
  mobile, portrait, landscape, screen size, safe area, or fat-fingering.
---

# RUN.game Mobile UX

RUN games run on phones. Design for **portrait, touch, one-thumb reach**, and for the fact that no two screens are the same size. This skill is the framework for layouts that hold up across devices without getting mis-tapped.

## Coaching approach — ask, teach, reveal blind spots

Most creators build and test on one screen — often a desktop browser — and never feel how their game plays on an actual phone in one hand. Your job is to make the physical reality of a thumb on a small screen concrete, and to catch the issues they can't see from their dev setup. Ask, then teach.

Ask as you go (a couple at a time):

- Have you played this on a real phone, held in one hand, with your thumb? What felt awkward?
- Which hand and which thumb reaches your most-used buttons? Can they be reached without shifting grip?
- Does your layout still work on the smallest and largest phones, or is it tuned to one size?
- Is anything important tucked under the notch, the home bar, or the host's UI chrome?
- Are any tap targets small enough to fat-finger? What happens on a mis-tap?
- Portrait or landscape — and is that a deliberate genre choice or just how it happened?

Teach the why, and name the blind spots: phones vary wildly in size, so absolute pixel placement that looks fine on the dev machine breaks on real devices — anchor to corners/edges instead. Notches and home indicators eat the screen edges. Fingers are far less precise than a mouse, so a 30px button that's easy to click is a frustrating miss on a phone. These are invisible until someone plays on hardware — get them to do it early.

## Orientation: portrait-first

- **Default to portrait (9:16).** It's how players hold a phone in a feed, and it's the safe assumption for almost every genre.
- **Use landscape only when the genre genuinely needs it** — e.g. twin-stick action, racing, or side-scrollers where horizontal space is the point. If you go landscape, commit to it and lock it; don't try to support both well with one layout.
- Design UI within the app container (caps at 720×1280, 9:16), not the raw viewport.

## Responsive by anchoring, not absolute placement

The single biggest mobile-layout mistake is positioning UI at fixed pixel coordinates that only look right on the device you tested. Instead:

- **Anchor every HUD element to a corner or edge** (top-left score, bottom-right action button) so it stays put as the screen grows or shrinks. Use `position: absolute` with `top/left/right/bottom` + a margin, not computed x/y.
- **Scale sizes with the viewport, clamped.** Use `clamp(min, vw-based, max)` for font and icon sizes so they grow on tablets and shrink on small phones but never become unreadable or huge.
- **Never hardcode a coordinate** derived from one screen's width/height. If you must place something relative to gameplay, compute it from the current container size (via `ResizeObserver`), not a constant.
- Read the device when you need to branch layout: `RundotGameAPI.system.getDevice()` gives `orientation`, `deviceType`, `screenSize`, `pixelRatio`, and `fontScale`.

See [`mobile-hud.css`](mobile-hud.css) for corner-anchor classes and clamped sizing tokens.

## Safe area — stay out from under notches and host chrome

The host reports insets (device notches + toolbar/feed header). Everything interactive or important must sit inside them.

- Read `RundotGameAPI.system.getSafeArea()` **after the SDK initializes** (never at module top level — it throws pre-init on a real device). It's static; read once and cache.
- Apply it as padding on your HUD root. [`safe-area.ts`](safe-area.ts) exposes it as CSS variables (`--safe-top/right/bottom/left`) so your CSS can anchor against them.

## Touch-safe sizing — don't make players fat-finger

- **Minimum touch target 44×44px.** Anything smaller is a mis-tap. Pad small icons with a transparent hit area to reach 44px even if the glyph is smaller.
- **Space interactive elements apart** so adjacent taps don't collide — especially near the bottom where thumbs land.
- **Keep text legible:** clamp HUD/body text so it never drops below ~14px; use `font-variant-numeric: tabular-nums` for counters and `text-shadow` for contrast over the 3D scene.
- **Respect `fontScale`** (accessibility): if `getDevice().fontScale > 1.2`, prefer a more compact layout so scaled-up text still fits.
- **Put primary actions in thumb reach** — the lower half of the screen, not the top corners, for anything tapped repeatedly.

## Canvas sizing & DPI

- **Never call `renderer.setPixelRatio()`** — it silently multiplies sizes and breaks picking/screenshots. Handle DPI manually: cap DPR at 2 (`Math.min(window.devicePixelRatio, 2)`), then `renderer.setSize(w * dpr, h * dpr, false)` and set the canvas CSS size to `w`/`h`.
- Use a **`ResizeObserver`** on the container (element-level, fires between layout and paint) rather than `window` resize. [`responsive-canvas.ts`](responsive-canvas.ts) wires this up.

## Interaction & jitter

- Set `touch-action: none` on the canvas/app container to stop browser pan, zoom, and double-tap-to-zoom. Prefer this over `preventDefault()`; if you do call `preventDefault` on touch, register the listener `{ passive: false }`.
- For drag controls (thumbsticks/sliders), attach `mousemove`/`mouseup` to `window`, not the element, or the control sticks when the finger/cursor leaves it. Set `user-select: none` on the HUD root so labels/emoji don't get selected mid-drag.
- Animate **only `transform` and `opacity`** on overlays (compositor-thread) — animating `top`/`left`/`width`/`box-shadow` forces layout and fights the game loop, causing mutual stutter.
- Every button needs an `:active` state (`transform: scale(0.95)`) — `:hover` doesn't exist on phones, and a button that doesn't react to touch feels broken.

## Checklist

```
- [ ] Portrait by default; landscape only if the genre demands it (and then locked)
- [ ] Every HUD element anchored to a corner/edge, not absolute coordinates
- [ ] Font/icon sizes use clamp() — never too small, never oversized
- [ ] Safe-area insets read after init and applied to the HUD
- [ ] All touch targets ≥ 44×44px, spaced apart, primary actions in thumb reach
- [ ] Text ≥ ~14px, tabular-nums on counters, readable over the 3D scene
- [ ] fontScale > 1.2 handled with a compact layout
- [ ] No setPixelRatio; DPR capped at 2; ResizeObserver drives canvas size
- [ ] touch-action: none on the canvas; drag listeners on window
- [ ] Overlays animate transform/opacity only; buttons have an :active state
```

## Anti-patterns

- ❌ Absolute pixel coordinates from one test device — breaks on every other screen.
- ❌ Supporting portrait and landscape equally with one layout — pick one.
- ❌ Icons/buttons under 44px or crowded together — guaranteed mis-taps.
- ❌ Ignoring safe area — UI hides under the notch or host toolbar.
- ❌ `renderer.setPixelRatio()` or uncapped DPR — kills fill rate on 3x phones.
- ❌ Animating layout properties on overlays — stutter against the render loop.
- ❌ Relying on `:hover` for feedback, or no press feedback at all.

## Resources

- [safe-area.ts](safe-area.ts) — read host insets after init and expose as CSS variables.
- [responsive-canvas.ts](responsive-canvas.ts) — `ResizeObserver`-based canvas sizing with DPR capped at 2.
- [mobile-hud.css](mobile-hud.css) — corner-anchor classes, clamped sizing tokens, touch-target + press-feedback patterns.
