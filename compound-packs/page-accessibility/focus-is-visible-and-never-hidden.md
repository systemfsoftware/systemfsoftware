---
title: Every focused element of a page shows a visible indicator with 3:1 contrast against the colours next to it, and is never wholly covered by a sticky header, banner or other page content
applies_when:
  - styling :focus or :focus-visible, or removing an outline
  - adding a sticky or fixed header, cookie banner, chat launcher or toolbar
  - adding a dark mode or changing the colours behind focusable elements
tags: [accessibility, focus-visible, focus-not-obscured, non-text-contrast, sticky-header, page-suite]
---

At each tab stop of the keyboard walk (every-control-is-reached-and-operated-by-keyboard.md), in every colour scheme, under forced colours and at both widths, the page suite's `focus` test checks:

- Visible (WCAG 2.4.7, with 1.4.11): a screenshot of the element and a 4 px margin around it, focused by keyboard, differs from the same area unfocused. The indicator, meaning the pixels that changed, has a contrast ratio of at least 3:1 against the unchanged pixels next to it, as WCAG's Understanding 2.4.13 reads 1.4.11 for focus indicators. The browser's own indicator, left unstyled, is exempt from the 3:1 check. Never remove an outline without a replacement. Draw the indicator with `outline`, which forced colours keep, not `box-shadow`, which they remove.
- Not obscured (WCAG 2.4.11): once the browser has scrolled the element into view, `document.elementFromPoint` returns the element or a descendant for at least one point of a 5 × 5 grid over its box. A sticky header that covers it fails: set `scroll-padding-top` to the header's height.

```css
/* WRONG */
:focus { outline: none; }
/* RIGHT */
:focus-visible { outline: 2px solid var(--focus-ring); outline-offset: 2px; }
html { scroll-padding-top: var(--header-height); }
```

Gate: the page suite's `focus` test fails a tab stop with no changed pixels, an authored indicator under 3:1 against its neighbours, or no uncovered grid point.
