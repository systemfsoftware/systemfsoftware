---
"@systemfsoftware/effect-microsandbox": patch
---

Starting a microVM on a platform without virtualization support now records the `probe_virtualization` run as `result_class=success`, not `infrastructure`. The start still fails with `VirtualizationUnsupportedError` and acquires no sandbox.
