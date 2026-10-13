---
"@systemfsoftware/effect-microsandbox": patch
"@systemfsoftware/effect-daemon-microvm": patch
---

`ClassifyProbeObservation` (effect-microsandbox) and `ClassifyWorkloadExit` (effect-daemon-microvm) now declare an empty `InstrumentationBrand`, so `SpanAttributes` of either is `{}`. effect-daemon-microvm no longer declares `microvm.workload.exit.code`. Neither workflow runs through a `Sandwich`, so neither declaration ever put an attribute on a span, and no emitted span attribute changes.
