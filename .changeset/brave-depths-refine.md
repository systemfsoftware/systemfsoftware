---
"@systemfsoftware/effect-sim-kernel": major
---

Kernel.pick and Kernel.pct take branded whole numbers. `depth` is a Kernel.PctDepth (at least 1), `steps` a Kernel.PctStepCount and `seeds` a Kernel.PctSeedCount (each at least 0). Build them with `make`, e.g. `Kernel.PctStepCount.make(baseline.decisions.length)`, or decode with the schema. Kernel.pctDepth is a Kernel.PctDepth, so code passing it keeps compiling. A fractional or negative seed count used to misreport the runs made, and NaN never finished; NaN or Infinity steps silently dropped the change points. CONFORMANCE_PROFILE selects local only when it is exactly `local`; any other value, including `constructor`, selects per-change.
