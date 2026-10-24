---
title: A story renders one component or one composed screen, never a shipped route, a built page or an iframe of a site
applies_when:
  - writing or changing a story for a page, a route or a marketing site
  - a story renders a whole application entry, a built bundle or an iframe of a deployed URL
  - an agent adds a story so that a page "has a story"
tags: [storybook, stories, pages, scope, integration]
---

A story proves what a person observes of a component or a composed screen whose I/O arrives as port fakes (`stories-compose-at-their-own-root`). A shipped page reaches its own router, its own data loaders, its own scripts and its own network, so a story that renders it proves nothing about a unit and fails for reasons outside the story. The founder's verdict on 2026-10-23 on a story that rendered the public site was "PublicSite is not a story, this is ridiculous."

## Rule

A story renders one component or one composed screen built from the app's own components, with its I/O supplied by fakes. It never renders a shipped route, a built page or an iframe of a deployed or locally served site. A page is proven by its sections as stories and by the production walk `production-is-rechecked-after-deploy` names, not by a story that mounts the whole page.

- **Compose the screen from its parts.** A page-level story mounts the screen's components under the preview's provider, not the page's entry module with its router.
- **No embedded site.** No story renders an `iframe` whose source is a route, a built output directory or a URL, and none mounts the application entry.

Evidence. A story that mounts a shipped page runs the page's own router and loaders, so its pass or fail depends on state the story neither built nor controls.

Gate: `review` — Does any story added or changed by the diff render a route, a built page, the application entry or an iframe of a shipped site, instead of one component or one composed screen over fakes?
