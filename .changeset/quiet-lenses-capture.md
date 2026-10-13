---
"@systemfsoftware/oxlint-config-recommended": major
---

A new error-level ban: `no-restricted-properties` reports `page.screenshot` in every Storybook story file, TypeScript or TSX, naming the storybook-testing rule `visual-evidence-comes-from-the-runner`. Capture each story from one hook run for every story; with `@systemfsoftware/vitest`, register `onTestFinished` from the Storybook preview's `beforeEach`. Set `browser.screenshotFailures: true`; the Storybook Vitest addon turns it off when unset.

A config of yours that sets `no-restricted-properties` on a glob matching story files replaces the preset's story value there. Add a story override after it: spread `fetchAndStoryScreenshotProperties` for TSX stories or `storyScreenshotProperties` for TypeScript stories, then repeat your own entries.
