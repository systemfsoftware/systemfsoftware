---
"@systemfsoftware/effect-playwright": minor
---

Initial release of an Effect-based Playwright integration, forked from Jobflow-io/effect-playwright.

The package provides Effect services and layers for browser automation: `Playwright` exposes scoped browser, context, page, frame, and locator wrappers whose fallible operations fail with a typed `PlaywrightError` (`reason: "Timeout" | "Unknown"`); `PlaywrightSpawner` provisions a browser for an effect's lifetime and closes it with the scope; `@systemfsoftware/effect-playwright/test` adds Effect test and shared-layer registration to the Playwright Test runner; `@systemfsoftware/effect-playwright/experimental` adds page and frame traversal utilities.

Requires Effect 4 and Node 24 or newer. Browsers install through the bundled `effect-playwright` CLI; none are needed when connecting over CDP or to an already-running browser.
