---
"@systemfsoftware/stryker-js-cli": patch
---

Mutants are tested against your real test runner.

The command line interface supplied placeholder checker, reporter and test
runner implementations to its own run: the placeholder runner answered
`Survived` with zero tests for every mutant, so a run reported a mutation score
that had nothing to do with your tests, and no reporter output was produced. It
now supplies only the capabilities a host owns, and your configured plugins
provide the rest.

If you have a recorded score from an earlier release, discard it and measure
again.
