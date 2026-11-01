---
title: Every image, canvas, SVG and chart that carries information has a text alternative stating it, and a decorative one is hidden by an explicit choice in the source
applies_when:
  - adding an image, logo, illustration, icon, SVG, canvas or chart to a page
  - writing alt text
  - writing or changing a site's image component
tags: [accessibility, alt-text, images, svg, canvas, charts, page-suite]
---

axe fails an `img`, `input[type=image]`, `svg[role=img]` or `[role=img]` with no accessible name. The page suite's `alternatives` test adds, on every page:

- Every `<canvas>`, and every `<svg>` that is neither `aria-hidden="true"` nor inside a named control, has `role="img"` and a non-empty accessible name.
- A chart also gives its values as text on the page: a table, a list, or text it references with `aria-describedby`.
- No accessible name of an image is a file name, a URL, or only a word such as "image", "photo", "picture", "graphic", "icon" or "logo".
- The test prints each page's image names for review.

Decorative is a choice the source makes: the site's image component's props are `{ alt: string }` with a non-empty string, or `{ decorative: true }`, which renders `alt=""`; pages never render a bare `<img>`. Review (judge) reads the printed names: each states what the image tells a person on that page.

```astro
<!-- WRONG -->
<Image src={chart} alt="chart.png" />
<!-- RIGHT -->
<Image src={chart} alt="Monthly signups rose from 120 in May to 480 in August" />
<Image src={swirl} decorative />
```

Gate: the page suite's `alternatives` test; typecheck of the image component's props; review (judge) of the printed names.
