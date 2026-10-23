---
title: In-app navigation is an href on an Astryx component routed through LinkProvider, never an onClick that calls navigate
applies_when:
  - adding or editing a link, a navigation item, a button that leads to another route or a menu entry built with @astryxdesign/core components
  - wiring the router's link component into an app that uses @astryxdesign/core
tags: [astryx, navigation, links, router, accessibility]
---

An Astryx component given `href` renders a link: the accessibility tree says `link`, the browser offers open in a new tab, and `LinkProvider` hands the click to the router's link component so it routes client-side. An `onClick={() => navigate(...)}` renders a button: assistive tech announces an action, not a destination, middle-click and copy-link do nothing, and a story that asserts `getByRole('link', { name })` can never find it.

1. **Navigate with `href`.** Any element whose job is to take the person to another route sets `href={<route path>}` on the Astryx component (button, menu item, side navigation item, link). No `onClick` that calls the router's `navigate` for this.
2. **No `#` hrefs.** A `#`-prefixed `href` is not a route. A control that changes state on the same page without changing the URL is a button with an `onClick`, not a link.
3. **One `LinkProvider` at the root**, given the router's link component (pack: astryx, astryx-styles-and-providers-load-at-every-root.md). Without it Astryx falls back to a plain anchor and every click reloads the page.
4. **Programmatic navigation** (after a form submits, on a redirect) stays in the code that decides it; it is not how a person's click on a visible destination is wired.

Gate: none yet as a shared check. The fact it would read: in a real-browser story, the control a person uses to go to a route is found by `getByRole('link', { name })`, its `href` resolves to a route the router knows and does not start with `#`; a story that finds that control only as `getByRole('button')` fails.

Evidence: `evidence/reference-app.md` (navigation rows).
