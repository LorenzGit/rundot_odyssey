---
name: ui-art-qa-gate
description: >
  Mandatory per-change UI/art/graphics visual gate: capture a fresh screenshot
  of the affected surface, list candidate fails first, answer the eight Yes/No
  questions (overlap, text, covering art, size, icons, style drift, alignment,
  stretch). Any Yes means the task is incomplete. Use after every UI, art, or
  graphics change; when the user asks for a visual pass, UI QA, art gate, or
  screenshot review of layout integrity. Complements rundot-game-quality
  (product quality) with a tight layout/art integrity pass. Not for audio,
  haptics, or non-visual QA.
---

# UI / art / graphics visual gate

**Mandatory after any task that changes UI, art, or graphics.** This is a
**recurring** pass — not a one-time setup check.

**If any answer is Yes, the task is NOT complete.** Fix and re-check until
every answer is **No**.

This skill is the portable gate. Games may keep a project copy under
`docs/UI_ART_QA_GATE.md` with game-specific art canon, capture notes, and
review logs. The **questions and enforcement rules here are the default**;
project docs may **add** questions later but must not weaken these eight or
the anti-loose rules.

Related (do not substitute):

- `rundot-game-quality` — version, thumbnail, splash, product sensory quality
- `rundot-visual-assets` — making/importing assets
- Capture tooling (e.g. ViewDeck) — take screenshots; then run this gate on them

## When to run

Run this gate when:

- Any UI, CSS, layout, HUD, panel, icon, or chrome change landed
- Any art, sprite, background, or image crop/fit change landed
- The user asks for a visual pass, art gate, or “does this look right”
- You are about to claim a UI/art task complete

Skip only for pure logic/sim/backend changes with **no** visible surface change
(and no shared chrome affected).

## Enforcement (anti-loose rules)

These rules are binding. Violating them invalidates a PASS. A prior PASS that
ignored these rules is **void** and must be rewritten as FAIL or re-gated.

1. **Doubt defaults to Yes.** If something is uneven, half-covered, hard to
   read, “probably fine,” or only works if you squint — answer **Yes**.
2. **Evidence required for every No.** Each No must name a concrete fact
   (shared baseline, equal gap, full glyph, real asset used). Vibe-only No
   is forbidden.
3. **List candidate fails first.** Before writing any No/PASS, list every
   possible fail you see. If the list is non-empty, you may not PASS until each
   item is fixed or ruled out with evidence.
4. **Second pass.** Gate answers only after re-opening/re-reading the actual
   screenshot file — not from intent or memory of the design.
5. **Reference compare.** When a concept or reference screenshot exists for
   the surface, compare side-by-side. Structural drift → Yes on Q6 and/or Q7.
6. **Project capture notes.** If the game documents capture rails, device frame,
   or orientation requirements (e.g. landscape H5 side rails), follow them for
   the gate capture.
7. **Pixel crops beat narrative.** If a zoomed crop of the screenshot shows a
   defect, that defect is a fail even if the full-frame “looks fine” in a
   summary description. Owner-supplied crops are binding evidence.
8. **Automatic Yes (no debate).** Any of the following is an immediate Yes on
   the matching question — do not invent a No:
   - **Clipped / faded / incomplete glyphs** at a panel, card, or safe-area edge
     → Q2 Yes.
   - **Hard rectangular crop** through a character’s head, hair, crown, weapon
     tip, or face at a card/panel edge (soft intentional fade into UI is
     allowed; a sharp overflow clip is not) → Q3 Yes and usually Q7 Yes.
   - **Banner / list tile** where the subject is a thin edge sliver or mostly
     empty dead space so the character is not readable as a person → Q4 Yes.
   - **Empty / blank label chips** (colored pill with missing or unreadable
     text) → Q5 Yes.
   - **Footer / meta lines** (rates, pity, currency, costs) not fully inside
     the readable panel with complete glyphs → Q2 Yes.
9. **No “intentional scroll” excuse for primary chrome.** Secondary list items
   may scroll; primary rates/pity/CTAs/featured face may not be off-screen or
   half-clipped.
10. **PASS requires a fresh capture after the last fix.** Reusing an older
    screenshot to justify a PASS after code/CSS/art changes is forbidden.

## Questions (v1 — eight)

Canonical list also lives in `references/questions.md` so the project can
extend it later without rewriting this whole skill. **Do not remove or weaken
these eight without an explicit owner decision.**

1. Does any UI object overlap any other object?
2. Is the text showing any overlaps or formatting issues?
3. Is any UI or graphical part covering important pieces of art?
4. Is there any piece of art or hero that is too small and difficult to read?
5. Is any icon malformed?
6. Has the art style drifted or deviated from what we have decided it should be?
7. Is the UI misaligned or does it look like it is in the wrong position?
8. Does any image look stretched or squashed?

### Q7 checklist (all must pass or Q7 = Yes)

- [ ] Shared baselines (tops of sibling cards, bottoms of nameplates, panel headers)
- [ ] Equal gaps between parallel items
- [ ] Sibling components same size (icons, chips, nameplates, cards)
- [ ] Content not floating inconsistently inside equal slots
- [ ] When a concept/ref exists: structure matches (no foreign chrome family)

### Q8 notes

- **Yes** if `object-fit: fill` (or wrong fixed aspect) distorts a character,
  banner, or feature card away from the source image proportions.
- Prefer `cover` / `contain` (never `fill`) for photo/illustration art. UI
  chrome tiles may use fixed sizes only when the source asset was authored for
  that box.

### Extending the question list

To add questions later:

1. Append them to `references/questions.md` with a stable number (Q9…).
2. Mention them in the report template.
3. Optionally mirror them in the host game’s `docs/UI_ART_QA_GATE.md`.

Do **not** add soft, generic, or non-visual checks (e.g. arbitrary touch-size
rules, “is the CTA obvious,” product version bumps). Those belong elsewhere
(`rundot-game-quality`, design review).

## Procedure

1. Identify the **affected surface** (menu, formation, battle HUD, results…).
2. Capture a **fresh** screenshot after the latest fix (project capture notes if any).
3. Open/read the image file (and crops if provided).
4. Write **Candidate fails** first (may be empty only if truly none).
5. Answer Q1–Q8 (and any project-added Qs) with **No / Yes — evidence: …**.
6. **PASS** only if every answer is No. Otherwise **FAIL**, fix, re-capture, re-gate.

## Report template

Copy and fill (also in `references/report-template.md`):

```
Screenshot path:
Surface:
Reference compared (if any):

Candidate fails (list first; empty only if none):
- …

1. UI overlap: No / Yes — evidence: …
2. Text issues: No / Yes — evidence: …
3. Art covered by UI: No / Yes — evidence: …
4. Art too small: No / Yes — evidence: …
5. Malformed icons: No / Yes — evidence: …
6. Style drift: No / Yes — evidence: …
7. UI misaligned / wrong position: No / Yes — evidence: …
   Q7 checklist: baselines / gaps / sizes / slot consistency / ref match
8. Stretched / squashed: No / Yes — evidence: …

Result: PASS (all No) / FAIL (any Yes)
```

Attach or link the capture in the response when claiming PASS.
