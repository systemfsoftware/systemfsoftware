---
'@systemfsoftware/stryker-js-typescript-checker': patch
---

A type error inside an installed dependency's declaration files no longer fails the run.

The checker exists to decide whether your source still compiles once a mutant is
applied. It was also reporting errors from `.d.ts` files inside installed packages —
most often a package whose optional peer dependency is not installed. No mutant
causes those, every mutant reports the same ones, and the checker cannot act on
them, so their only effect was to end the run before a single mutant was tested.

Library declaration files are now skipped, alongside the code-quality options the
checker already relaxes while mutating.
