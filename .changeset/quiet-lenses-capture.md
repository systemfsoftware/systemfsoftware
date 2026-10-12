---
"@systemfsoftware/oxlint-config-recommended": major
---

A new error-level ban: `no-restricted-properties` reports `page.screenshot` in every Storybook story file, TypeScript or TSX, with a message naming the storybook-testing compound pack rule `visual-evidence-comes-from-the-runner`. Capture each story from one `afterEach` in a Vitest setup file the Storybook project lists in `test.setupFiles`, and failures through Vitest's `browser.screenshotFailures`.

TSX story files keep the fetch ban beside the new one. A config that sets its own `no-restricted-properties` on TSX story files replaces both, so spread the new export `fetchAndStoryScreenshotProperties` into it; `storyScreenshotProperties` carries the capture ban alone.
