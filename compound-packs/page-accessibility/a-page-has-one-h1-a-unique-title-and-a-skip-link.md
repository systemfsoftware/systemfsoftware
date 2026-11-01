---
title: A page has exactly one h1 inside main, a title no other page shares, and a skip link as its first tab stop when anything focusable comes before main
applies_when:
  - adding a page, layout, header or navigation to a site
  - choosing heading levels for sections or cards
  - setting a page's title
tags: [accessibility, headings, landmarks, skip-link, page-title, page-suite]
---

axe's best-practice rules, run by built-pages-pass-axe-in-every-scheme-and-width.md, already fail a page with no h1 (`page-has-heading-one`), a skipped heading level (`heading-order`), a missing or duplicate main landmark, or content outside a landmark (`region`). The page suite's `structure` test adds what axe allows:

- Exactly one `h1`, and it is inside `main`.
- Each page's `<title>` differs from every other page's.
- When any tab stop comes before `main`, the first tab stop is a link to `main`'s id whose text says it skips to the content, and pressing Enter on it makes the next tab stop the first one inside `main`. It may stay visually hidden until focused.

```html
<!-- WRONG: the logo and the hero both are h1, and twelve nav links precede main with no skip link -->
<!-- RIGHT -->
<header><a class="skip-link" href="#main">Skip to content</a><nav aria-label="Main">…</nav></header>
<main id="main" tabindex="-1"><h1>…</h1>…</main>
```

Gate: the page suite's `structure` test fails on zero or several h1 elements or one outside main, a shared title, or a missing or broken skip link.
