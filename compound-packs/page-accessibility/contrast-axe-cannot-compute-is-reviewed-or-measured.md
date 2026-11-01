---
title: Text contrast that axe leaves as needs-review is shown to a reviewer with a screenshot, and the contrast of field boundaries and icon-only controls is measured, in every colour scheme
applies_when:
  - placing text over an image, gradient, video, translucent layer or pseudo-element background
  - adding or changing colour tokens, a dark mode or a theme
  - styling form fields, checkboxes, radios or icon-only buttons and links
  - axe reports color-contrast as incomplete on a page
tags: [accessibility, contrast, non-text-contrast, dark-mode, needs-review, page-suite]
---

axe marks `color-contrast` incomplete wherever it cannot find a single background colour (text over an image, gradient, video, translucent or overlapping layer, or pseudo-element) and hands those nodes to a person, as the Storybook a11y addon's Incomplete tab does. No axe rule tests non-text contrast (WCAG 1.4.11). The page suite's `contrast` test, in each scheme and width the `axe` test runs:

- Text: attaches a screenshot of each incomplete `color-contrast` node, with its selector, page, scheme and width, to the run's report. The reviewer measures the text against the parts of the background behind it that are most like the text (WCAG failure F83, technique G18). The threshold is 4.5:1, or 3:1 for large text (24 px, or 18.66 px bold). Add a scrim or a solid backing to text that fails; never lighten the image to pass one scheme.
- Non-text: the border or fill that identifies each form field, checkbox and radio, and the icon of each control with no visible text, has a contrast ratio of at least 3:1 against the colour next to it, computed from styles when both colours are solid. Where either is not solid, the test attaches a screenshot for the reviewer, who tests the least contrasting area (Understanding 1.4.11). A control identified by its visible text needs no boundary contrast.
- Focus indicators are measured by focus-is-visible-and-never-hidden.md.

```css
/* WRONG: passes in light, white text sits on a pale photo in dark */
.hero h1 { color: var(--fg); }
/* RIGHT: a scrim in both schemes */
.hero { background: linear-gradient(rgb(0 0 0 / 0.6), rgb(0 0 0 / 0.6)), url(hero.avif); }
```

Gate: the page suite's `contrast` test fails a solid-colour boundary or icon under 3:1; review — the reviewer measures each attached needs-review screenshot by F83 and rejects text under 4.5:1 (3:1 large), or a graphic under 3:1, against the background behind it.
