---
title: Text contrast that axe leaves as needs-review, and the contrast of field boundaries and icon-only controls, is measured from rendered pixels in every colour scheme
applies_when:
  - placing text over an image, gradient, video, translucent layer or pseudo-element background
  - adding or changing colour tokens, a dark mode or a theme
  - styling form fields, checkboxes, radios or icon-only buttons and links
  - axe reports color-contrast as incomplete on a page
tags: [accessibility, contrast, non-text-contrast, dark-mode, pixels, page-suite]
---

axe marks `color-contrast` incomplete wherever it cannot find a single background colour (text over an image, gradient, video, translucent or overlapping layer, or pseudo-element), and no axe rule tests non-text contrast (WCAG 1.4.11). The page suite's `contrast` test measures both in each scheme and width the `axe` test runs.

- Text: for each incomplete `color-contrast` node, screenshot it as rendered and again with `color: transparent` set on it. The second shot is the background under the text. The contrast ratio between the computed text colour and every background pixel under the text is at least 4.5:1, or 3:1 for large text (24 px, or 18.66 px bold). Add a scrim or a solid backing to text that fails; never lighten the image to pass one scheme.
- Non-text: the border or fill that identifies each form field, checkbox and radio, and the icon of each control with no visible text, has a contrast ratio of at least 3:1 against the colour next to it. Compute it from styles when both colours are solid, and from the screenshot otherwise. A control identified by its visible text needs no boundary contrast.
- Focus indicators are measured by focus-is-visible-and-never-hidden.md.

```css
/* WRONG: passes in light, white text sits on a pale photo in dark */
.hero h1 { color: var(--fg); }
/* RIGHT: a scrim fixed in both schemes, measured under the text */
.hero { background: linear-gradient(rgb(0 0 0 / 0.6), rgb(0 0 0 / 0.6)), url(hero.avif); }
```

Gate: the page suite's `contrast` test fails any measured ratio under the threshold, per page × scheme × width.
