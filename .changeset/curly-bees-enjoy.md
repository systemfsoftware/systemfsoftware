---
"@systemfsoftware/vitest": minor
---

New `captureRunBinding`: an Effect that captures the running test's binding, so a testing library can run an effect elsewhere (e.g. inside a simulation kernel) and still have its `expect` calls counted as that test's assertions.
