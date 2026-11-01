---
title: A page reflows at 320 CSS px with no horizontal scroll, and loses no text when the default font size is doubled or WCAG text spacing is applied
applies_when:
  - laying out a page, section, table, code block or navigation for narrow screens
  - setting font sizes, line heights, fixed heights or overflow on text containers
  - adding a fixed-width element, a wide image or a horizontal list to a page
tags: [accessibility, reflow, resize-text, text-spacing, zoom, page-suite]
---

The page suite runs a `reflow` and a `text` test on every page.

- Reflow (WCAG 1.4.10): at 320 × 640 CSS px, `document.documentElement.scrollWidth` is at most 320. Only a data table, map, diagram, video or code block may scroll sideways, and only inside its own focusable scroll container.
- Text size (WCAG 1.4.4): at 1280 CSS px wide with Chromium's default font size doubled (CDP `Page.setFontSizes({ fontSizes: { standard: 32, fixed: 26 } })`, the setting a person changes in the browser), the computed font size of each element holding text is at least double its size at the default, the page does not scroll sideways, and no text is clipped. Size type in `rem` or `em`, never `px`.
- Text spacing (WCAG 1.4.12): with WCAG's values applied to every element (`line-height: 1.5`, `letter-spacing: 0.12em`, `word-spacing: 0.16em`, and `margin-bottom: 2em` after each paragraph), no text is clipped.
- Clipped means an element holding text whose overflow is hidden or clipped has `scrollWidth` greater than `clientWidth` or `scrollHeight` greater than `clientHeight`. Never give a text container a fixed height.

```css
/* WRONG: does not grow with the person's font size, and clips at two lines */
.card p { font-size: 15px; height: 3em; overflow: hidden; }
/* RIGHT */
.card p { font-size: 0.9375rem; }
```

Gate: the page suite's `reflow` and `text` tests fail on sideways scroll, text that does not double, or clipped text.
