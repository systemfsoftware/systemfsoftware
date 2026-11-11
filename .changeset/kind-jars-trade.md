---
"@systemfsoftware/vitest": minor
---

Adds @systemfsoftware/vitest/property-defaults, a setup file that sets the default run count of direct Arbitrary.checkEffect and Arbitrary.sampleEffect calls: 30 under STRYKER_MUTATOR_WORKER, 1000 when CI is set to any value other than false or 0 (and no AGENT), otherwise 100. A runs option passed explicitly still wins. Property tests (it.prop) take the same counts when a run provides no budget.
