---
"@systemfsoftware/stryker-js-engine": patch
---

Incremental mode (`incremental: true`) reuses previous results instead of re-running every mutant.

A run with an incremental file now remembers the outcome of every mutant whose source file and covering tests are unchanged, re-runs only what changed, and finishes in seconds instead of minutes. The incremental file is written on failed runs too, so a score under the threshold no longer discards the results just computed. Editing a test file re-runs exactly the mutants its tests cover.
