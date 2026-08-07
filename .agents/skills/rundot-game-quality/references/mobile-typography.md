# Mobile typography

Use these values as minimum **effective rendered sizes in CSS pixels**. They are
not design-space values and they are not a request to make every label the same
size.

## Non-negotiable floor

No readable text may render below **10 CSS pixels** at any supported viewport.
This includes version labels, badges, debug/status copy, canvas text, and bitmap
fonts. The 10px value is reserved for brief, noncritical metadata with strong
contrast and adequate weight; it is not the default body or control size.

Use this role scale:

| Text role | Minimum effective size |
| --- | ---: |
| Noncritical metadata, version, terse badge | 10 CSS px |
| Auxiliary status or short output | 11 CSS px |
| Compact control, button, or capability label | 12 CSS px |
| Supporting description or secondary copy | 13 CSS px |
| Body copy, FTUE, instructions, or modal explanation | 14 CSS px |

Use larger sizes for primary actions, headings, accessibility-critical copy,
long reading, low-contrast treatments, or fonts with poor small-size legibility.
Never shrink below the role minimum to solve overflow. Shorten or wrap the copy,
reflow the layout, allow intentional scrolling, or remove decorative content.

## Measure the rendered result

The rule applies after every scaling layer:

- DOM without transforms: use the computed CSS `font-size`.
- DOM inside a scaled transform: multiply the computed size by the cumulative
  visual scale.
- Width-fitted Pixi/canvas text:
  `effective CSS px = design font size × rendered canvas width ÷ design width`.
- Bitmap text: measure the final scaled glyph/line box in CSS pixels. A
  design-space glyph height is not evidence of its displayed size.

Device pixel ratio and renderer resolution affect sharpness, not CSS-pixel size.
Do not count DPR as an increase.

## Verification

1. Check the project's declared smallest supported viewport; use 320 CSS pixels
   wide when no smaller-width contract is documented.
2. Also check representative short/tall phones, a tablet, and desktop embedding.
3. Exercise every screen, open drawer, modal, HUD state, shop/ad surface, toast,
   error, loading, and disabled/loading control state.
4. Inspect media/container queries and compact-height modes; they must not reduce
   any role below its minimum.
5. Record the smallest measured effective size and its selector/component,
   viewport, and scaling calculation in release evidence.

## Keep short-viewport overrides last in the stylesheet

A `@media (max-height: ...)` block whose selectors match the base rules they
override has *the same specificity*, so source order alone decides. Placed
before the base rules, the whole block is silently dead — no warning, no lint
error, and the rules read as if they work.

In one project seven of fifteen short-screen rules had never applied, including
a compaction pass written and reported as working the day before. Put override
blocks at the end of the file and say why in a comment, or raise their
specificity deliberately.

Related trap: an element that bleeds to a container's edge with negative margins
must derive them from the same custom property the container uses for padding.
Hard-coded pairs drift the moment a media query changes one of them.
