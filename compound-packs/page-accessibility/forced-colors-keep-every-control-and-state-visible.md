---
title: Under forced colours, every control, meaningful icon and selected state of a page stays visible
applies_when:
  - drawing an icon as an SVG or a CSS background
  - showing a selected, current or pressed state with a background colour
  - using box-shadow or background for borders, focus rings or dividers
  - setting forced-color-adjust
tags: [accessibility, forced-colors, high-contrast, windows, page-suite]
---

The page suite's `forced-colors` test sets `page.emulateMedia({ forcedColors: 'active' })`, so Chromium replaces author colours with system colours, and visits every page at both widths:

- Drawn: the screenshot of every control, and of every icon that has an accessible name or sits in a named control, holds at least two distinct colours, so its text, icon or border is drawn. Fill SVG icons with `currentColor`; a fixed fill can match the forced background.
- Distinguished: each element with `aria-selected`, `aria-current` or `aria-pressed` set to true renders differently from a sibling that is not, so the state does not rest on a background colour the system replaced. Add a border, underline or weight change.
- The focus indicator check of focus-is-visible-and-never-hidden.md runs here too.

```css
/* WRONG: the active tab is only a fill, which forced colours replace */
[aria-selected='true'] { background: var(--accent); }
/* RIGHT */
[aria-selected='true'] { background: var(--accent); border-bottom: 3px solid currentColor; }
```

Gate: the page suite's `forced-colors` test fails on a single-colour control or icon, or on a state that renders like its unselected sibling.
