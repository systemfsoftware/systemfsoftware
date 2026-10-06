---
"@systemfsoftware/upstream-manifest": minor
---

An in-place suite run from one feature file may now prove an upstream file executed through its assertion's meta.upstreamFile: a passed or failed scenario that names the repository-relative <subtree>/<file> counts as showing it run, while a skipped or pending claim does not. A claim naming no in-place file of any declared family is refused as a stray, and the Vitest report schema reads assertion metadata.
