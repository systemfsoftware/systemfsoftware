---
"@systemfsoftware/oxlint-config-recommended": major
---

A new error-level ban: `no-restricted-properties` reports `page.screenshot` in every Storybook story file, TypeScript or TSX, with a message naming the storybook-testing compound pack rule `visual-evidence-comes-from-the-runner`. Capture each story from one `afterEach` in a Vitest setup file the Storybook project lists in `test.setupFiles`, and failures through Vitest's `browser.screenshotFailures`.

TSX story files keep the fetch ban beside the new one. A config that sets its own `no-restricted-properties` on all TSX files, as the fetch-ban recipe does, drops the new ban on TSX story files without any error. Add an override for TSX story files after it that spreads the new export `fetchAndStoryScreenshotProperties`; `storyScreenshotProperties` carries the capture ban alone.
