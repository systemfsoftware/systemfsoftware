---
title: A React island is proven by its stories under the ui-testing pack and tested again hydrated in the built page, and neither replaces the other
applies_when:
  - adding or changing an interactive island (client:load, client:idle, client:visible) on a static site
  - deciding whether an island needs stories or a page test
tags: [accessibility, islands, astro, react, storybook, page-suite]
---

- Every island has stories run by the Storybook Vitest addon in a real browser, with axe, and its behaviour is proven by journeys that follow the ui-testing pack (stories-are-the-ui-tests.md, journeys-are-embedded-gherkin.md, queries-are-accessible.md).
- A story never stands in for the page: it cannot see the page's landmarks, heading order, colour scheme, sticky header or neighbouring targets. The page suite tests the island hydrated in every built page that uses it.
- The page suite never stands in for the island's journeys: it proves properties of the page, not what the island does when a person uses it.

```text
WRONG  the newsletter island has stories, so its page is left out of the page suite
RIGHT  newsletter-signup.stories.tsx proves the journey; the page suite tests / with the island hydrated
```

Gate: review (judge) checks that each island has stories and that every page using it is in the page suite's built page list.
