---
"@systemfsoftware/stryker-js-platform-node": major
---

The console log threshold is now scoped to the run that set it. Two runs in one
process no longer share it, so a run that lowers its own level can no longer
quieten another run happening alongside it.

`setEngineLogLevel` is removed. The level travels with the run.
