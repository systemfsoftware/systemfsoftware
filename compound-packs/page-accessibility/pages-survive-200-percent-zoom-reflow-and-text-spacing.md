---
title: A page loses no content at 200% zoom, reflows at 320 CSS px with no horizontal scroll, and loses no text when WCAG text spacing is applied
applies_when:
  - laying out a page, section, table, code block or navigation for narrow screens
  - setting font sizes, line heights, fixed heights or overflow on text containers
  - adding a fixed-width element, a wide image or a horizontal list to a page
tags: [accessibility, reflow, resize-text, zoom, text-spacing, page-suite]
---

The page suite runs a `reflow` and a `text` test on every page.

- Zoom (WCAG 1.4.4): a 1280 × 720 window at 200% page zoom is a 640 × 360 CSS px viewport at `deviceScaleFactor: 2`. At that size the page does not scroll sideways, no text is clipped, and every control the page shows at 1280 is still visible or reachable through a visible control (a menu button).
- Reflow (WCAG 1.4.10): at 320 × 640 CSS px, which is 1280 at 400% zoom, `document.documentElement.scrollWidth` is at most 320. Only a data table, map, diagram, video or code block may scroll sideways, and only inside its own focusable scroll container.
- Text spacing (WCAG 1.4.12): with WCAG's values applied to every element (`line-height: 1.5`, `letter-spacing: 0.12em`, `word-spacing: 0.16em`, and `margin-bottom: 2em` after each paragraph), no text is clipped.
- Clipped means an element holding text whose overflow is hidden or clipped has `scrollWidth` greater than `clientWidth` or `scrollHeight` greater than `clientHeight`. Never give a text container a fixed height.

```css
/* WRONG: clips at two lines once text is larger or more widely spaced */
.card p { height: 3em; overflow: hidden; }
/* RIGHT */
.card p { min-height: 3em; }
```

Gate: the page suite's `reflow` and `text` tests fail on sideways scroll, clipped text, or a control lost at 200% zoom.
