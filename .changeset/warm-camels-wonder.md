---
"@systemfsoftware/effect-microsandbox": patch
"@systemfsoftware/effect-daemon-microvm": patch
---

The `InstrumentationBrand` maps of `ClassifyProbeObservation` (effect-microsandbox) and `ClassifyWorkloadExit` (effect-daemon-microvm) are now empty, so `SpanAttributes` of either is `{}`. Neither workflow runs through a `Sandwich`, so neither map ever put an attribute on a span; the attributes the cells write themselves (`microsandbox.virtualization.platform`, `microsandbox.job.exit.code`) are unchanged.
