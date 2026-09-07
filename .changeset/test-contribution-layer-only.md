---
"@systemfsoftware/stryker-test-contribution": major
---

The evaluator factory, contribution-judging helpers, and default suffix constants are no longer exported. Build the evaluator from the exported `testContributionEvaluatorLayer` and read the verdict from its `evaluate` result; the human-readable blame report is emitted through the run log.
