---
"@systemfsoftware/stryker-js-vitest-runner": minor
---

The Vitest runner accepts `setupFilePath`, naming the setup file it copies into
the sandbox. It defaults to the file shipped beside the runner's own module,
which is the right answer for an installed package; supply it only when you are
running the runner from sources rather than from an install.
