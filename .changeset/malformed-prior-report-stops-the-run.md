---
'@systemfsoftware/stryker-js-cli': major
---

A `--survivors` run given a prior report that exists but is not a readable report now stops with a parse failure instead of reporting a source mismatch. The old message claimed your sources had moved when the report itself was the problem. A genuinely mismatched report still reports a mismatch, and a missing one still reports that none was found.

`AdmitSurvivorsRunInput` and `structuralHash` are removed. The admission command is now the `AdmitSurvivorsRunCommand` class, carrying only data: no hashing function, no path resolver, and instead the prior report's per-file source hashes and its already-converted survivors. `decodePriorReport`, `PriorReportFacts` and `PriorReportDocument` are new exports for building it.

Every report admitted or rejected before is admitted or rejected the same way.
