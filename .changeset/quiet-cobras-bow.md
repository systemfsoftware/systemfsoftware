---
"@systemfsoftware/vitest": minor
---

Add the `@systemfsoftware/vitest/vite` entry with the `propertyTests()` Vite plugin: it provides the property budget under `test.provide` (the tier's runs, and off the local tier a seed derived from the checked-out commit), and reprints a refuted property's rerun line with the config file of the project that ran the test, written relative to the package directory the line runs from.
