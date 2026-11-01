---
title: Every pointer target of a page is at least 24 by 24 CSS px or spaced as WCAG 2.5.8 allows, and anything done by dragging can also be done with single clicks
applies_when:
  - adding icon buttons, social links, pagination, close buttons or other small controls
  - placing links or buttons close together, such as in a footer or a toolbar
  - adding a carousel, slider, sortable list, map or anything moved by dragging or swiping
tags: [accessibility, target-size, dragging, pointer, wcag22, page-suite]
---

- Size (WCAG 2.5.8): axe's `target-size` rule, run by the `wcag22aa` tag (built-pages-pass-axe-in-every-scheme-and-width.md), fails undersized targets that crowd each other. The page suite's `pointer` test measures each target `target-size` marks incomplete from its box: it passes when it is at least 24 × 24 CSS px, or when a 24 px circle centred on it intersects no other target and no other such circle. A link inside a sentence is exempt; nothing else is.
- Dragging (WCAG 2.5.7): the `pointer` test lists every element with `draggable="true"` and every non-native element with a pointerdown, mousedown or touchstart listener (CDP `DOMDebugger.getEventListeners`). Each sits in an island whose stories include a journey that reaches the same outcome with single clicks (previous and next buttons, step buttons, a move-up control). Prefer a native control, such as `<input type="range">`, which needs no drag.

```html
<!-- WRONG: 16 px icon links side by side -->
<a href="/rss" class="size-4"><svg aria-hidden="true">…</svg><span class="sr-only">RSS</span></a>
<!-- RIGHT: the hit area is 24 px or more whatever the icon's size -->
<a href="/rss" class="inline-grid size-6 place-items-center">…</a>
```

Gate: the page suite's `pointer` test fails an incomplete target that is undersized and crowded; review (judge) checks each drag handler the test lists against its island's single-click journey.
