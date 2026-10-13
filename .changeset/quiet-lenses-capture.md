---
"@systemfsoftware/oxlint-config-recommended": major
---

A new error-level ban: `no-restricted-properties` reports `page.screenshot` in every Storybook story file, TypeScript or TSX, naming the storybook-testing rule `visual-evidence-comes-from-the-runner`. Capture each story from one hook the Storybook preview's `beforeEach` registers through `onTestFinished` from `@systemfsoftware/vitest`, and set `browser.screenshotFailures: true`, which the Storybook Vitest addon turns off when it is unset.

TSX story files keep the fetch ban beside the new one. A config that sets its own `no-restricted-properties` on all TSX files drops the new ban on TSX stories silently; add a TSX-story override after it that spreads `fetchAndStoryScreenshotProperties`. `storyScreenshotProperties` carries the capture ban alone.
