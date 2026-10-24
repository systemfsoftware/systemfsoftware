---
title: A Stryker speed filter is turned off only for a named dropped killer, and stacked filters never drop a covering test
applies_when:
  - setting or changing `coverageAnalysis` or `vitest.related` in a Stryker configuration
  - a mutant reports `Survived` or `NoCoverage` although a test should kill it
  - an agent proposes turning a filter off to save wall-clock, or keeping `perTest` and `related` both on
tags: [mutation, stryker, vitest, coverage, speed-filters, survivors]
---

`vitest.related` and `coverageAnalysis` are speed filters. `related: true` runs the tests whose module graph includes the mutated file. `perTest` runs only the tests that hit the mutant in the dry run. Both cut work, and both can cut the one test that kills a mutant. When that happens nothing turns red: the mutant is reported `Survived` or `NoCoverage`, the score is advisory, and the killing test never ran.

## Rule

A filter stays on, at `coverageAnalysis: "perTest"` and `vitest.related: true`, unless the change names a test that the filter would not schedule and that can kill the mutant. Wall-clock is never the reason to turn a filter off: a slow run has a predictable cost and a loud timeout, and a silent score lie has neither. Where `perTest` is trusted and `related` may miss, `vitest.related` is set to `false` rather than keeping both on.

- **Off for a dropped killer only.** The change names the killing test and the filter that would omit it, or it leaves the defaults. `off` suits tests that are not independent or whose hits land in another process. `all` suits a suite whose hit or no-hit answer is trusted but not its which-test answer.
- **Stacked filters intersect.** A mutant run applies the coverage test filter and `related=[mutated file]` together. The covering test is scheduled by `perTest` and then dropped by `related`, so the mutant survives with no error. A run with both on includes the named covering test's id, or `related` is `false`.

Evidence. Stryker documents `perTest` as the default since v5 and `related` as the vitest-runner default (https://stryker-mutator.io/docs/stryker-js/configuration/#coverageanalysis-string, https://stryker-mutator.io/docs/stryker-js/vitest-runner/); Vitest documents `--related` as running tests whose module graph includes the changed file (https://vitest.dev/guide/cli.html#vitest-related).

Gate: `review` and `fact`. Does the diff turn a filter off without naming the test it would drop and the filter that drops it, or keep `perTest` and `related` both on while a covering test is only reachable through one of them? `fact` — Does a mutant run with the configuration as written still include the named covering test's id?
