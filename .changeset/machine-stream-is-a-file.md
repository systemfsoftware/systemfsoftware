---
"@systemfsoftware/stryker-js-cli": minor
"@systemfsoftware/stryker-js-vitest-runner": minor
---

Machine-readable mutation progress is a newline-delimited JSON file next to the HTML and JSON reports, not the console.

The console prints bounded progress prose: phase names, a count line, at most twenty surviving mutants, and a verdict. Killed mutants now advance that count. Child test runs during mutation no longer print per-test output or GitHub workflow commands.

If you parsed the console as JSON lines, read the stream file instead. A hard kill can leave that file without a closing verdict line.
