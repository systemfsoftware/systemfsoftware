---
"@systemfsoftware/effect-sim-kernel": major
---

The depth option of Kernel.pick and Kernel.pct is now a Kernel.PctDepth: a whole number of at least 1, branded, built with `Kernel.PctDepth.make(4)` or decoded with its schema. Kernel.pctDepth is a Kernel.PctDepth, so code that passes it keeps compiling. CONFORMANCE_PROFILE selects the local profile only when it is exactly `local`; any other value, including a name like `constructor`, selects per-change.
