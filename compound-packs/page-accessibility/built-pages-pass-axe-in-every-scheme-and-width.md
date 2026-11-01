---
title: Every public page of a static or island site passes axe at WCAG 2.2 AA and best-practice as built, in a real browser, in each colour scheme it ships and at 320 and 1280 CSS px wide
applies_when:
  - adding or changing a page, layout, theme, colour token or island on a static or island site (Astro pages with React islands, any prerendered marketing site)
  - adding a landing page, pricing page, signup page or other public page
  - adding a dark mode, a theme toggle or another colour scheme to a site
  - setting up accessibility tests for a site Storybook cannot render whole
  - a page's accessibility test fails, or a change proposes excluding a rule, an element or a page from it
tags: [accessibility, axe, wcag22, static-site, astro, islands, dark-mode, playwright, page-suite]
---

Test the site as it ships. Build it, serve the build output the deploy uploads with the platform's local server for it (such as `astro preview` or `wrangler dev`), and drive it with Playwright Test in Chromium from the site's own E2E package (e2e-testing pack: e2e-is-its-own-package-on-real-processes.md). Never test a page by rendering its components, and never against the dev server.

- Pages: read the list from the build (its sitemap, or every built HTML file), so a new page is tested without editing the suite. An empty list fails the run.
- Matrix: every page in every colour scheme the site ships, at 320 and at 1280 CSS px wide. Set each scheme with `page.emulateMedia({ colorScheme })`, and set each position of a theme toggle by using the toggle.
- Ready: check only after every island has hydrated (no `astro-island[ssr]` is left; scroll so `client:visible` islands load) and `document.fonts.ready` has resolved.
- axe: `new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'])`. The `wcag22aa` tag also runs `target-size`, which axe leaves off by default.
- Any violation fails the test and is printed with its rule id, selector, page, scheme and width. Never call `disableRules` or `exclude`, turn a rule off through `options`, filter violations, allow a count of them, or skip a page, globally or for one page: fix the page.
- Print every incomplete ("needs review") result in the run's output with its rule id, selector and reason, and attach the list to the report. Incomplete colour results are measured (contrast-axe-cannot-compute-is-measured-from-pixels.md); the rest are read in review.

```typescript
// WRONG: one scheme, one width, a rule switched off and a component render
await page.goto(`/storybook/iframe.html?id=hero--default`)
await new AxeBuilder({ page }).disableRules(['color-contrast']).analyze()
// RIGHT: one test per built page × scheme × width, each with the full tag set and nothing excluded
const { violations, incomplete } = await new AxeBuilder({ page }).withTags(WCAG22_AA_AND_BEST_PRACTICE).analyze()
printNeedsReview(incomplete, { path, colorScheme, width })
expect(violations).toEqual([])
```

Gate: the page suite's `axe` test fails on any violation in any page × scheme × width; review rejects any exclusion, disabled rule, violation filter, allowance or skipped page in the suite.
